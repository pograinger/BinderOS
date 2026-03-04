"""
01_generate_data.py — Synthetic GTD Training Data Generator

Generates labeled training examples for the BinderOS GTD type classifier via the
Anthropic Claude Haiku API using structured outputs (output_config.format).

Output: scripts/training-data/type-classification.jsonl
        (one JSON object per line: {"text": "...", "label": "..."})

Usage:
    python 01_generate_data.py                 # Generate 400 examples per label
    python 01_generate_data.py --count 300    # Generate 300 examples per label
    python 01_generate_data.py --resume       # Skip labels that already have enough examples

Prerequisites:
    - ANTHROPIC_API_KEY in .env.local at the repo root
    - pip install -r requirements.txt

Estimated cost: ~$0.50-2.00 (2000 total examples at Haiku pricing)
Estimated time: ~15-30 minutes (2000+ API calls with 0.05s rate limiting)
"""

import argparse
import json
import statistics
import sys
import time
from collections import defaultdict
from pathlib import Path

from dotenv import load_dotenv
from tqdm import tqdm

# ---------------------------------------------------------------------------
# Environment setup
# ---------------------------------------------------------------------------

# Load ANTHROPIC_API_KEY from .env.local in the repo root (two levels up from this script)
_REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(dotenv_path=_REPO_ROOT / ".env.local")

import anthropic  # Import after dotenv so the key is available

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

LABELS = ["task", "fact", "event", "decision", "insight"]

DEFAULT_TARGET_PER_LABEL = 400

# GTD type definitions embedded in every API call prompt
GTD_DEFINITIONS = """
- task: requires a concrete next action; has a clear completion state; starts with an action verb
- fact: reference information; no action required; states something true
- event: time-anchored; describes something that will or did happen
- decision: records a choice already made; may include rationale
- insight: generalizable principle or learning; abstracted from a specific situation
"""

# 5 style variants — rotated per label to ensure diversity (per RESEARCH.md pitfall 5)
STYLE_VARIANTS = [
    "a short fragment (1-5 words, no punctuation, the way someone types quickly)",
    "a complete professional sentence",
    "abbreviated like a text message or telegram",
    "with a typo or informal capitalization",
    "genuinely ambiguous (could fit multiple GTD types — force the label but make the text borderline)",
]

# JSON schema for structured output — guarantees schema compliance without retry logic
SCHEMA = {
    "type": "object",
    "properties": {
        "text": {"type": "string", "description": "the GTD inbox item text"},
        "label": {
            "type": "string",
            "enum": LABELS,
        },
    },
    "required": ["text", "label"],
    "additionalProperties": False,
}

MODEL = "claude-haiku-4-5"
MAX_TOKENS = 128
SLEEP_BETWEEN_CALLS = 0.05  # 50ms — avoid rate limits
MAX_RETRIES = 3

OUTPUT_PATH = _REPO_ROOT / "scripts" / "training-data" / "type-classification.jsonl"

# ---------------------------------------------------------------------------
# API call with retry
# ---------------------------------------------------------------------------


def generate_example(
    client: anthropic.Anthropic,
    label: str,
    style: str,
) -> dict | None:
    """
    Generate one labeled GTD inbox item for the given label and style.

    Uses Anthropic structured outputs (output_config.format with json_schema) to
    guarantee schema compliance without retry/parsing logic.

    Returns a dict {"text": "...", "label": "..."} or None on failure.
    """
    prompt = (
        f"Generate one realistic GTD inbox item that is clearly a '{label}'.\n"
        f"Style: {style}.\n\n"
        f"GTD type definitions:\n{GTD_DEFINITIONS}\n"
        f"The label in your response MUST be '{label}'. "
        f"Make the text realistic — something a person might actually write in their inbox."
    )

    for attempt in range(MAX_RETRIES):
        try:
            response = client.messages.create(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                messages=[{"role": "user", "content": prompt}],
                output_config={
                    "format": {
                        "type": "json_schema",
                        "schema": SCHEMA,
                    }
                },
            )
            example = json.loads(response.content[0].text)
            return example
        except anthropic.RateLimitError:
            wait = 2 ** attempt * 5  # exponential backoff: 5s, 10s, 20s
            print(f"\n[Rate limit] Waiting {wait}s before retry {attempt + 1}/{MAX_RETRIES}...")
            time.sleep(wait)
        except anthropic.APIError as e:
            wait = 2 ** attempt  # 1s, 2s, 4s
            print(f"\n[API error] {e} — retry {attempt + 1}/{MAX_RETRIES} in {wait}s")
            time.sleep(wait)
        except json.JSONDecodeError as e:
            print(f"\n[JSON parse error] {e} — skipping this example")
            return None
        except Exception as e:
            print(f"\n[Unexpected error] {e} — skipping this example")
            return None

    return None  # All retries exhausted


# ---------------------------------------------------------------------------
# Counting existing examples
# ---------------------------------------------------------------------------


def count_existing_examples(path: Path) -> dict[str, int]:
    """Count existing examples per label in the JSONL file."""
    counts: dict[str, int] = defaultdict(int)
    if not path.exists():
        return counts
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                label = obj.get("label", "")
                if label in LABELS:
                    counts[label] += 1
            except json.JSONDecodeError:
                continue
    return counts


# ---------------------------------------------------------------------------
# Main generation loop
# ---------------------------------------------------------------------------


def generate(target_per_label: int, resume: bool) -> None:
    """
    Generate synthetic GTD training examples for all 5 labels.

    Args:
        target_per_label: How many examples to generate per label.
        resume: If True, count existing examples and skip labels already at target.
    """
    client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from environment

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    existing = count_existing_examples(OUTPUT_PATH)

    if resume and any(existing[label] > 0 for label in LABELS):
        print("Resume mode — existing counts per label:")
        for label in LABELS:
            print(f"  {label}: {existing[label]}/{target_per_label}")

    # Track all generated examples per label for diversity summary
    generated_per_label: dict[str, list[str]] = defaultdict(list)

    # Stats
    skipped_wrong_label = 0

    with open(OUTPUT_PATH, "a", encoding="utf-8") as out_file:
        for label in LABELS:
            already_have = existing[label]
            still_need = max(0, target_per_label - already_have)

            if still_need == 0:
                print(f"\n[{label}] Already at target ({already_have}/{target_per_label}) — skipping")
                continue

            print(f"\n[{label}] Generating {still_need} examples (have {already_have})")

            # Cycle through style variants repeatedly until we reach the target
            style_cycle = STYLE_VARIANTS * (still_need // len(STYLE_VARIANTS) + 2)

            count = 0
            with tqdm(total=still_need, desc=f"  {label}", unit="ex") as pbar:
                for style in style_cycle:
                    if count >= still_need:
                        break

                    example = generate_example(client, label, style)

                    if example is None:
                        # Generation or parse failure — try next style
                        continue

                    if example.get("label") != label:
                        # LLM returned wrong label despite schema constraint — log and skip
                        skipped_wrong_label += 1
                        continue

                    text = example.get("text", "").strip()
                    if not text:
                        continue

                    # Write to JSONL
                    out_file.write(json.dumps({"text": text, "label": label}) + "\n")
                    out_file.flush()
                    generated_per_label[label].append(text)

                    count += 1
                    pbar.update(1)

                    time.sleep(SLEEP_BETWEEN_CALLS)

    # ---------------------------------------------------------------------------
    # Diversity summary
    # ---------------------------------------------------------------------------
    print("\n" + "=" * 60)
    print("GENERATION COMPLETE — Diversity Summary")
    print("=" * 60)

    if skipped_wrong_label > 0:
        print(f"\nSkipped (wrong label from LLM): {skipped_wrong_label}")

    # Read all examples (existing + new) for full summary
    all_examples: dict[str, list[str]] = defaultdict(list)
    with open(OUTPUT_PATH, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                lbl = obj.get("label", "")
                txt = obj.get("text", "")
                if lbl in LABELS and txt:
                    all_examples[lbl].append(txt)
            except json.JSONDecodeError:
                continue

    print(f"\n{'Label':<12} {'Count':>6} {'Mean len':>10} {'Median len':>11} {'Short (<10)':>12}")
    print("-" * 55)

    for label in LABELS:
        texts = all_examples[label]
        if not texts:
            print(f"{label:<12} {'0':>6}")
            continue

        lengths = [len(t) for t in texts]
        mean_len = statistics.mean(lengths)
        median_len = statistics.median(lengths)
        short_count = sum(1 for length in lengths if length < 10)
        short_pct = short_count / len(texts) * 100

        print(
            f"{label:<12} {len(texts):>6} {mean_len:>10.1f} {median_len:>11.1f} "
            f"{short_count:>6} ({short_pct:.0f}%)"
        )

    total = sum(len(v) for v in all_examples.values())
    print(f"\nTotal examples: {total}")
    print(f"Output: {OUTPUT_PATH}")

    # Warn if short-fragment coverage is below 15% for any label
    for label in LABELS:
        texts = all_examples[label]
        if not texts:
            continue
        short_pct = sum(1 for t in texts if len(t) < 10) / len(texts) * 100
        if short_pct < 15:
            print(
                f"\n[WARNING] {label}: only {short_pct:.0f}% short fragments (<10 chars). "
                f"Target ≥15%. Consider re-running with more 'short fragment' style examples."
            )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate synthetic GTD training data for BinderOS type classifier",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--count",
        type=int,
        default=DEFAULT_TARGET_PER_LABEL,
        help=f"Number of examples to generate per label (default: {DEFAULT_TARGET_PER_LABEL})",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Skip labels that already have enough examples in the JSONL file",
    )
    args = parser.parse_args()

    if args.count < 50:
        print(f"[ERROR] --count must be at least 50, got {args.count}", file=sys.stderr)
        sys.exit(1)

    print(f"Target: {args.count} examples per label ({args.count * len(LABELS)} total)")
    print(f"Model: {MODEL}")
    print(f"Output: {OUTPUT_PATH}")

    if not (anthropic_key_set := bool(__import__("os").environ.get("ANTHROPIC_API_KEY"))):
        print(
            "\n[ERROR] ANTHROPIC_API_KEY not found in environment or .env.local\n"
            "Set it in .env.local at the repo root: ANTHROPIC_API_KEY=sk-ant-...",
            file=sys.stderr,
        )
        sys.exit(1)

    generate(target_per_label=args.count, resume=args.resume)


if __name__ == "__main__":
    main()
