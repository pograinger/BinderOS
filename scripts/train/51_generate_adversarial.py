"""
51_generate_adversarial.py -- Adversarial edge case generation via Anthropic API.

Generates deliberately hard/ambiguous examples near decision boundaries for each
classifier, targeting the weakest classes identified by the benchmark (from Plan 01
JSON output). Uses indirect prompts to avoid label leakage.

Usage:
    python -u scripts/train/51_generate_adversarial.py --classifier actionability --count 200
    python -u scripts/train/51_generate_adversarial.py --classifier all --model haiku --count 200
    python -u scripts/train/51_generate_adversarial.py --classifier type --count 10 --dry-run
    python -u scripts/train/51_generate_adversarial.py --classifier type --count 50 --benchmark-file scripts/train/reports/benchmark_*.json

Output:
    Appends generated examples to scripts/training-data/{classifier}.jsonl
    (augments existing data, never replaces)

Prerequisites:
    - ANTHROPIC_API_KEY in .env.local at the repo root
    - pip install -r scripts/train/requirements.txt
    - Optionally: benchmark JSON from 50_benchmark_models.py for targeted generation
"""

import argparse
import json
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from tqdm import tqdm

# ---------------------------------------------------------------------------
# Import classifier registry
# ---------------------------------------------------------------------------
sys.path.insert(0, str(Path(__file__).parent.resolve()))
from classifier_registry import (
    CLASSIFIER_REGISTRY,
    MODEL_MAP,
    REPO_ROOT,
    REPORTS_DIR,
    TRAINING_DATA_DIR,
    get_classifier,
)

# ---------------------------------------------------------------------------
# Environment setup
# ---------------------------------------------------------------------------
load_dotenv(dotenv_path=REPO_ROOT / ".env.local")

import anthropic  # noqa: E402 -- import after dotenv

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SLEEP_BETWEEN_CALLS = 0.05
MAX_RETRIES = 3
BATCH_SIZE = 10  # Examples per API call (batched for efficiency)

# Difficulty tiers for generation
DIFFICULTY_TIERS = ["easy", "medium", "hard", "adversarial"]

# ---------------------------------------------------------------------------
# Type classifier augmentation scenarios (from CONTEXT.md / memory notes)
# These use INDIRECT descriptions to avoid label leakage (Pitfall 2)
# ---------------------------------------------------------------------------

TYPE_AUGMENTATION_SCENARIOS = {
    "task": [
        "someone listing multiple things they need to do in one sentence, connected by 'and then' or commas",
        "a person writing a compound action item that involves two sequential steps",
        "someone reminding themselves about a multi-step process they need to complete",
    ],
    "fact": [
        "someone noting that something is broken or not working, stated as an observation rather than a request to fix it",
        "a person recording a status update about something in their environment without indicating they will do anything about it",
        "someone observing a situation that COULD imply action but is purely stating what is, not what to do",
    ],
    "event": [
        "someone vaguely mentioning an upcoming appointment without specifying an exact date or time",
        "a person noting something happening at an approximate time like 'sometime next week' or 'Thursday afternoon'",
        "someone referencing a future occurrence with incomplete temporal information",
    ],
    "decision": [
        "someone stating a conclusion they have reached, phrased as a simple statement of fact rather than using the word 'decided'",
        "a person expressing a choice they have already made using language like 'going with' or 'switching to'",
        "someone communicating a resolution using indirect language that sounds like a prediction or observation",
    ],
    "insight": [
        "someone expressing frustration about a recurring personal pattern or habit in a self-reflective way",
        "a person noticing a meta-pattern about their own behavior, possibly with a negative or self-critical tone",
        "someone making a generalization about how things tend to work based on their experience, stated as a complaint or realization",
    ],
}

# ---------------------------------------------------------------------------
# GTD methodology context blocks (for rich prompts)
# ---------------------------------------------------------------------------

GTD_METHODOLOGY_CONTEXT = """GTD Methodology Reference:
- 2-MINUTE RULE: If an action takes less than 2 minutes, do it immediately during processing, don't defer it
- HORIZONS OF FOCUS: Ground level (current actions) through 50,000ft (life purpose/principles); items at different horizons look very different
- NATURAL PLANNING MODEL: Purpose/principles -> Vision -> Brainstorming -> Organizing -> Next actions; captures can come from any stage
- SOMEDAY/MAYBE: Incubated items that are NOT commitments; they might be done eventually but there is no current intention to act
- WAITING-FOR: Delegated items being tracked; the person is waiting for someone else to complete something
- WEEKLY REVIEW: The critical habit where you review all lists, process inbox to zero, update projects, review someday/maybe
- CONTEXT-DEPENDENT ACTIONS: Next actions tagged by the tool, location, or person needed (@computer, @phone, @office, @home, @errands, @agenda)
- PROJECTS: Any desired outcome requiring more than one action step; "organize garage" is a project, not a single action
- REFERENCE: Pure information to file and retrieve later; supports future actions but requires no action itself"""


# ---------------------------------------------------------------------------
# Benchmark loading
# ---------------------------------------------------------------------------


def find_latest_benchmark(reports_dir: Path) -> Path | None:
    """Find the most recent benchmark JSON in the reports directory."""
    json_files = sorted(reports_dir.glob("benchmark_*.json"))
    return json_files[-1] if json_files else None


def load_benchmark(path: Path | None) -> dict | None:
    """Load benchmark results from JSON file."""
    if path is None or not path.exists():
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def get_classifier_benchmark(benchmark: dict | None, classifier_name: str) -> dict | None:
    """Extract per-classifier benchmark data."""
    if benchmark is None:
        return None
    classifiers = benchmark.get("classifiers", {})
    return classifiers.get(classifier_name)


# ---------------------------------------------------------------------------
# Budget allocation
# ---------------------------------------------------------------------------


def allocate_budget(
    class_names: list[str],
    total_count: int,
    benchmark_data: dict | None,
    is_decomposition: bool = False,
) -> dict[str, int]:
    """
    Allocate generation budget per class based on weakness from benchmark.

    Classes with F1 < 0.90: get 40% of budget
    Classes with F1 0.90-0.95: get 35%
    Classes with F1 > 0.95: get 25%

    For decomposition (35 classes): focus only on bottom-10 F1 classes.
    """
    if benchmark_data is None:
        # No benchmark -- distribute evenly
        per_class = max(1, total_count // len(class_names))
        return {cls: per_class for cls in class_names}

    report = benchmark_data.get("classification_report", {})

    # Get per-class F1 scores
    class_f1s = {}
    for cls in class_names:
        if cls in report:
            class_f1s[cls] = report[cls].get("f1-score", 1.0)
        else:
            class_f1s[cls] = 1.0  # Assume perfect if not in report

    # For decomposition, focus on bottom-10 F1 classes only
    if is_decomposition and len(class_names) > 10:
        sorted_classes = sorted(class_f1s.items(), key=lambda x: x[1])
        focus_classes = [cls for cls, _ in sorted_classes[:10]]
        per_class = max(1, total_count // len(focus_classes))
        allocation = {cls: 0 for cls in class_names}
        for cls in focus_classes:
            allocation[cls] = per_class
        return allocation

    # Bucket classes by weakness
    weak = [cls for cls, f1 in class_f1s.items() if f1 < 0.90]
    medium = [cls for cls, f1 in class_f1s.items() if 0.90 <= f1 < 0.95]
    strong = [cls for cls, f1 in class_f1s.items() if f1 >= 0.95]

    # Allocate proportional budget
    if not weak and not medium:
        # All strong -- distribute evenly
        per_class = max(1, total_count // len(class_names))
        return {cls: per_class for cls in class_names}

    weak_budget = int(total_count * 0.40) if weak else 0
    medium_budget = int(total_count * 0.35) if medium else 0
    strong_budget = total_count - weak_budget - medium_budget

    # Redistribute unused budget
    if not weak:
        medium_budget += weak_budget
        weak_budget = 0
    if not medium:
        strong_budget += medium_budget
        medium_budget = 0

    allocation = {}
    for cls in weak:
        allocation[cls] = max(1, weak_budget // len(weak))
    for cls in medium:
        allocation[cls] = max(1, medium_budget // len(medium))
    for cls in strong:
        allocation[cls] = max(1, strong_budget // len(strong)) if strong else 0

    return allocation


# ---------------------------------------------------------------------------
# Confused pairs extraction
# ---------------------------------------------------------------------------


def get_confused_pairs(benchmark_data: dict | None, class_names: list[str]) -> list[tuple[str, str]]:
    """
    Extract the most confused class pairs from the confusion matrix.

    Returns top-3 pairs sorted by off-diagonal confusion count.
    """
    if benchmark_data is None:
        return []

    cm = benchmark_data.get("confusion_matrix")
    cm_labels = benchmark_data.get("confusion_labels")
    if cm is None or cm_labels is None:
        return []

    # Find off-diagonal entries
    pairs = []
    for i, row in enumerate(cm):
        for j, val in enumerate(row):
            if i != j and val > 0:
                pairs.append((cm_labels[i], cm_labels[j], val))

    # Sort by confusion count descending, return top 3
    pairs.sort(key=lambda x: x[2], reverse=True)
    return [(a, b) for a, b, _ in pairs[:3]]


# ---------------------------------------------------------------------------
# Prompt construction (CRITICAL: indirect prompts to avoid label leakage)
# ---------------------------------------------------------------------------


def build_class_prompt(
    classifier_name: str,
    target_class: str,
    class_names: list[str],
    gtd_definitions: str,
    difficulty: str,
    count: int,
) -> str:
    """
    Build an indirect prompt for generating examples of a target class.

    CRITICAL: Does NOT mention the label name directly in the scenario description.
    Instead, describes the SCENARIO that produces examples of that class.
    """
    # Get indirect scenario descriptions for the type classifier
    scenarios = TYPE_AUGMENTATION_SCENARIOS.get(target_class, []) if classifier_name == "type" else []

    scenario_block = ""
    if scenarios:
        scenario_block = (
            "\n\nScenario patterns to draw from (vary and combine creatively):\n"
            + "\n".join(f"- {s}" for s in scenarios)
        )

    prompt = (
        f"You are an expert in David Allen's Getting Things Done methodology with decades "
        f"of coaching experience.\n\n"
        f"Generate exactly {count} realistic GTD inbox captures. These should be things real "
        f"people would actually type into their inbox -- messy, abbreviated, with typos, "
        f"incomplete sentences, varied length (some 3 words, some 2 sentences).\n\n"
        f"**Classifier context:** {classifier_name}\n"
        f"**Category definitions:**\n{gtd_definitions}\n\n"
        f"**Target category:** {target_class}\n"
        f"**Difficulty level:** {difficulty}\n\n"
        f"Difficulty guide:\n"
        f"- easy: clearly belongs to '{target_class}' but uses natural, messy language\n"
        f"- medium: requires understanding GTD methodology to classify correctly\n"
        f"- hard: sits near the boundary between '{target_class}' and another category; "
        f"a naive classifier would get it wrong\n"
        f"- adversarial: deliberately looks like it belongs to a DIFFERENT category but is "
        f"actually '{target_class}' upon careful GTD analysis\n\n"
        f"{GTD_METHODOLOGY_CONTEXT}\n"
        f"{scenario_block}\n\n"
        f"IMPORTANT RULES:\n"
        f"1. Do NOT include the category name or classification terms in the generated text\n"
        f"2. Write like a REAL person -- messy, informal, abbreviated\n"
        f"3. Each example must be UNIQUE and different from the others\n"
        f"4. For hard/adversarial difficulty, explain in 'reasoning' WHY this is {target_class} "
        f"despite appearing to be something else\n"
        f"5. Vary the topics widely (work, personal, health, home, technology, finance, relationships)"
    )
    return prompt


def build_boundary_prompt(
    classifier_name: str,
    class_a: str,
    class_b: str,
    correct_class: str,
    gtd_definitions: str,
    count: int,
) -> str:
    """
    Build a prompt for boundary pair generation -- examples that sit between two classes.
    """
    prompt = (
        f"You are an expert in David Allen's Getting Things Done methodology.\n\n"
        f"Generate exactly {count} GTD inbox captures that sit RIGHT ON THE BOUNDARY between "
        f"'{class_a}' and '{class_b}'. Each example should be GENUINELY TRICKY -- it could "
        f"plausibly be either category, but upon careful GTD analysis, the correct classification "
        f"is '{correct_class}'.\n\n"
        f"**Classifier:** {classifier_name}\n"
        f"**Definitions:**\n{gtd_definitions}\n\n"
        f"{GTD_METHODOLOGY_CONTEXT}\n\n"
        f"In your reasoning, explain the SPECIFIC GTD principle that distinguishes these as "
        f"'{correct_class}' rather than '{class_a if correct_class == class_b else class_b}'.\n\n"
        f"Write like real people type -- messy, abbreviated, informal.\n"
        f"Do NOT include classification terms in the text."
    )
    return prompt


# ---------------------------------------------------------------------------
# API call with structured output
# ---------------------------------------------------------------------------


def generate_batch(
    client: anthropic.Anthropic,
    model_id: str,
    prompt: str,
    class_names: list[str],
) -> list[dict]:
    """
    Call the Anthropic API with structured output to generate a batch of examples.

    Returns list of dicts with text, label, reasoning, difficulty fields.
    """
    schema = {
        "type": "object",
        "properties": {
            "examples": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "text": {
                            "type": "string",
                            "description": "A realistic GTD inbox item text",
                        },
                        "label": {"type": "string", "enum": class_names},
                        "reasoning": {
                            "type": "string",
                            "description": "Why this label is correct per GTD methodology",
                        },
                        "difficulty": {
                            "type": "string",
                            "enum": DIFFICULTY_TIERS,
                        },
                    },
                    "required": ["text", "label", "reasoning", "difficulty"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["examples"],
        "additionalProperties": False,
    }

    for attempt in range(MAX_RETRIES):
        try:
            response = client.messages.create(
                model=model_id,
                max_tokens=4096,
                messages=[{"role": "user", "content": prompt}],
                output_config={
                    "format": {
                        "type": "json_schema",
                        "schema": schema,
                    }
                },
            )
            result = json.loads(response.content[0].text)
            return result.get("examples", [])
        except anthropic.RateLimitError:
            wait = 2**attempt * 5
            print(f"\n  [Rate limit] Waiting {wait}s...", flush=True)
            time.sleep(wait)
        except anthropic.APIError as e:
            wait = 2**attempt
            print(f"\n  [API error] {e} -- retry {attempt + 1}/{MAX_RETRIES}", flush=True)
            time.sleep(wait)
        except json.JSONDecodeError as e:
            print(f"\n  [JSON parse error] {e} -- skipping batch", flush=True)
            return []
        except Exception as e:
            print(f"\n  [Unexpected error] {e} -- skipping batch", flush=True)
            return []

    return []


# ---------------------------------------------------------------------------
# Dedup helpers
# ---------------------------------------------------------------------------


def load_existing_texts(jsonl_path: Path) -> set[str]:
    """Load all existing text entries from a JSONL file (case-insensitive)."""
    texts = set()
    if not jsonl_path.exists():
        return texts
    with open(jsonl_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                text = obj.get("text", "").strip().lower()
                if text:
                    texts.add(text)
            except json.JSONDecodeError:
                continue
    return texts


def append_to_jsonl(path: Path, new_examples: list[dict], existing_texts: set[str]) -> int:
    """
    Append new examples to JSONL file, skipping duplicates.

    Only writes 'text' and 'label' fields (reasoning/difficulty are for quality verification only).

    Returns count of examples appended.
    """
    added = 0
    with open(path, "a", encoding="utf-8") as f:
        for ex in new_examples:
            text = ex.get("text", "").strip()
            if not text:
                continue
            if text.lower() in existing_texts:
                continue
            f.write(json.dumps({"text": text, "label": ex["label"]}, ensure_ascii=False) + "\n")
            existing_texts.add(text.lower())
            added += 1
    return added


# ---------------------------------------------------------------------------
# Core generation logic
# ---------------------------------------------------------------------------


def generate_for_classifier(
    client: anthropic.Anthropic,
    classifier_name: str,
    model_id: str,
    total_count: int,
    benchmark_data: dict | None,
    dry_run: bool = False,
) -> dict:
    """
    Generate adversarial examples for a single classifier.

    Returns stats dict with generation/dedup/append counts.
    """
    config = get_classifier(classifier_name)
    class_names = config["class_names"]
    gtd_defs = config["gtd_definitions"]
    jsonl_path = TRAINING_DATA_DIR / config["jsonl"]
    is_decomposition = classifier_name == "decomposition"

    print(f"\n{'='*60}", flush=True)
    print(f"Generating adversarial data for: {classifier_name}", flush=True)
    print(f"{'='*60}", flush=True)

    # Check if classifier should be skipped (>99% accuracy)
    if benchmark_data is not None:
        accuracy = benchmark_data.get("accuracy", 0.0)
        if accuracy > 0.99:
            print(f"  Skipping -- accuracy {accuracy:.4f} > 0.99 (diminishing returns)", flush=True)
            return {
                "classifier": classifier_name,
                "skipped": True,
                "reason": f"accuracy {accuracy:.4f} > 0.99",
                "generated": 0,
                "deduped": 0,
                "appended": 0,
            }

    # Allocate budget per class
    allocation = allocate_budget(class_names, total_count, benchmark_data, is_decomposition)

    # Get confused pairs for boundary generation
    confused_pairs = get_confused_pairs(benchmark_data, class_names)

    # Load existing texts for dedup
    existing_texts = load_existing_texts(jsonl_path)
    print(f"  Existing training examples: {len(existing_texts)}", flush=True)

    # Reserve 20% of budget for boundary pair generation (if we have confused pairs)
    boundary_budget = int(total_count * 0.20) if confused_pairs else 0
    class_budget_total = total_count - boundary_budget

    # Rescale class allocation to match reduced budget
    alloc_sum = sum(allocation.values())
    if alloc_sum > 0:
        scale = class_budget_total / alloc_sum
        allocation = {cls: max(1, int(n * scale)) for cls, n in allocation.items() if n > 0}

    all_generated = []
    total_generated = 0
    total_deduped = 0

    # --- Phase 1: Per-class generation ---
    active_classes = {cls: n for cls, n in allocation.items() if n > 0}
    print(f"  Generating for {len(active_classes)} classes", flush=True)

    for cls_name, cls_count in tqdm(active_classes.items(), desc="  Classes", unit="class"):
        # Split across difficulty tiers
        per_difficulty = max(1, cls_count // len(DIFFICULTY_TIERS))

        for difficulty in DIFFICULTY_TIERS:
            batch_count = min(per_difficulty, BATCH_SIZE)
            remaining = per_difficulty

            while remaining > 0:
                request_count = min(remaining, BATCH_SIZE)
                prompt = build_class_prompt(
                    classifier_name, cls_name, class_names,
                    gtd_defs, difficulty, request_count,
                )

                examples = generate_batch(client, model_id, prompt, class_names)

                # Filter: only keep examples with correct label
                valid = [ex for ex in examples if ex.get("label") == cls_name and ex.get("text", "").strip()]
                all_generated.extend(valid)
                total_generated += len(valid)

                remaining -= request_count
                time.sleep(SLEEP_BETWEEN_CALLS)

    # --- Phase 2: Boundary pair generation ---
    if confused_pairs and boundary_budget > 0:
        per_pair = max(1, boundary_budget // len(confused_pairs))
        print(f"\n  Generating boundary pairs: {len(confused_pairs)} pairs, {per_pair} each", flush=True)

        for class_a, class_b in confused_pairs:
            # Generate for both directions
            for correct_class in [class_a, class_b]:
                count = per_pair // 2
                if count < 1:
                    count = 1

                prompt = build_boundary_prompt(
                    classifier_name, class_a, class_b,
                    correct_class, gtd_defs, count,
                )

                examples = generate_batch(client, model_id, prompt, class_names)
                valid = [
                    ex for ex in examples
                    if ex.get("label") == correct_class and ex.get("text", "").strip()
                ]
                all_generated.extend(valid)
                total_generated += len(valid)
                time.sleep(SLEEP_BETWEEN_CALLS)

    # --- Dedup against existing data ---
    unique_examples = []
    seen_in_batch = set()
    for ex in all_generated:
        text_lower = ex["text"].strip().lower()
        if text_lower not in existing_texts and text_lower not in seen_in_batch:
            unique_examples.append(ex)
            seen_in_batch.add(text_lower)
        else:
            total_deduped += 1

    # --- Write or print ---
    if dry_run:
        print(f"\n  [DRY RUN] Generated {len(unique_examples)} unique examples:", flush=True)
        for ex in unique_examples[:20]:  # Show up to 20 in dry run
            print(f"    [{ex.get('difficulty', '?')}] {ex['label']}: {ex['text']}", flush=True)
            if ex.get("reasoning"):
                print(f"      -> {ex['reasoning'][:100]}", flush=True)
        if len(unique_examples) > 20:
            print(f"    ... and {len(unique_examples) - 20} more", flush=True)
        appended = 0
    else:
        appended = append_to_jsonl(jsonl_path, unique_examples, existing_texts)

    stats = {
        "classifier": classifier_name,
        "skipped": False,
        "generated": total_generated,
        "deduped": total_deduped,
        "appended": appended if not dry_run else 0,
        "dry_run_count": len(unique_examples) if dry_run else 0,
        "classes_targeted": len(active_classes),
        "boundary_pairs": len(confused_pairs),
    }

    print(f"\n  Stats: {total_generated} generated, {total_deduped} deduped, "
          f"{appended if not dry_run else len(unique_examples)} {'would append' if dry_run else 'appended'}",
          flush=True)

    return stats


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate adversarial edge cases for ONNX classifiers via Anthropic API",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--classifier",
        type=str,
        default="all",
        help="Classifier name or 'all' (default: all)",
    )
    parser.add_argument(
        "--model",
        choices=["haiku", "sonnet"],
        default="haiku",
        help="Claude model for generation (default: haiku)",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=200,
        help="Total examples to generate per classifier (default: 200)",
    )
    parser.add_argument(
        "--benchmark-file",
        type=str,
        default=None,
        help="Path to benchmark JSON from Plan 01 (default: auto-detect latest in reports/)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Generate 5 examples per classifier and print to stdout without writing to JSONL",
    )
    args = parser.parse_args()

    # Override count for dry-run
    if args.dry_run:
        args.count = min(args.count, 5)

    # Determine classifiers
    if args.classifier == "all":
        classifier_names = list(CLASSIFIER_REGISTRY.keys())
    else:
        get_classifier(args.classifier)
        classifier_names = [args.classifier]

    # Load benchmark
    if args.benchmark_file:
        benchmark_path = Path(args.benchmark_file)
    else:
        benchmark_path = find_latest_benchmark(REPORTS_DIR)

    benchmark = load_benchmark(benchmark_path)

    if benchmark:
        print(f"Loaded benchmark: {benchmark_path}", flush=True)
    else:
        print("No benchmark file found -- generating with even budget allocation", flush=True)

    # Check API key
    import os
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print(
            "\nERROR: ANTHROPIC_API_KEY not found. Set it in .env.local",
            file=sys.stderr,
        )
        sys.exit(1)

    model_id = MODEL_MAP[args.model]
    print(f"\nAdversarial Generator", flush=True)
    print(f"  Model: {model_id}", flush=True)
    print(f"  Classifiers: {len(classifier_names)}", flush=True)
    print(f"  Count per classifier: {args.count}", flush=True)
    print(f"  Dry run: {args.dry_run}", flush=True)

    client = anthropic.Anthropic()

    # Generate for each classifier
    all_stats = []
    for name in classifier_names:
        bench_data = get_classifier_benchmark(benchmark, name)
        stats = generate_for_classifier(
            client, name, model_id, args.count, bench_data, dry_run=args.dry_run
        )
        all_stats.append(stats)

    # --- Output summary ---
    print(f"\n{'='*60}", flush=True)
    print("ADVERSARIAL GENERATION COMPLETE", flush=True)
    print(f"{'='*60}", flush=True)
    print(f"\n{'Classifier':<22} {'Generated':>10} {'Deduped':>8} {'Appended':>9} {'Status'}", flush=True)
    print("-" * 65, flush=True)

    total_gen = 0
    total_dup = 0
    total_app = 0
    for s in all_stats:
        name = s["classifier"]
        if s.get("skipped"):
            print(f"{name:<22} {'--':>10} {'--':>8} {'--':>9} SKIPPED ({s.get('reason', '')})", flush=True)
        else:
            gen = s["generated"]
            dup = s["deduped"]
            app = s["appended"] if not args.dry_run else s.get("dry_run_count", 0)
            total_gen += gen
            total_dup += dup
            total_app += app
            status = "DRY RUN" if args.dry_run else "OK"
            print(f"{name:<22} {gen:>10} {dup:>8} {app:>9} {status}", flush=True)

    print(f"\nTotals: {total_gen} generated, {total_dup} deduped, {total_app} appended/shown", flush=True)

    # Rough cost estimate (Haiku: ~$0.25/M input, ~$1.25/M output)
    # Rough estimate: ~500 tokens per call, ~200 tokens output per call
    est_calls = sum(1 for s in all_stats if not s.get("skipped"))
    if args.model == "haiku":
        est_cost = est_calls * 0.0005  # Very rough
    else:
        est_cost = est_calls * 0.005
    print(f"  Estimated API cost: ~${est_cost:.2f}", flush=True)


if __name__ == "__main__":
    main()
