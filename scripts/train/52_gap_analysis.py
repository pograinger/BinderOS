"""
52_gap_analysis.py -- Systematic GTD knowledge gap identification via Anthropic API.

Has Claude systematically analyze what GTD methodology knowledge each classifier
lacks by examining training data samples, benchmark performance, and confusion
patterns. Produces a Markdown report and extracts suggested examples into JSONL.

Usage:
    python -u scripts/train/52_gap_analysis.py --classifier actionability --model sonnet
    python -u scripts/train/52_gap_analysis.py --classifier all --model haiku
    python -u scripts/train/52_gap_analysis.py --classifier type --model sonnet

Output:
    scripts/train/reports/gap_analysis_{YYYYMMDD_HHMMSS}.md  (Markdown report)
    Appends suggested examples to scripts/training-data/{classifier}.jsonl

Prerequisites:
    - ANTHROPIC_API_KEY in .env.local at the repo root
    - pip install -r scripts/train/requirements.txt
    - Optionally: benchmark JSON from 50_benchmark_models.py for richer analysis
"""

import argparse
import json
import random
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
SAMPLES_PER_CLASS = 40  # 30-50 range per plan spec
RANDOM_SEED = 42

# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------


def load_jsonl(path: Path) -> list[dict]:
    """Load examples from a JSONL file."""
    examples = []
    if not path.exists():
        return examples
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                examples.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return examples


def sample_training_data(
    jsonl_path: Path, class_names: list[str], samples_per_class: int = SAMPLES_PER_CLASS
) -> dict[str, list[str]]:
    """
    Randomly sample training examples per class.

    Returns dict mapping class name to list of example texts.
    """
    rng = random.Random(RANDOM_SEED)
    examples = load_jsonl(jsonl_path)

    # Group by label
    by_class: dict[str, list[str]] = defaultdict(list)
    for ex in examples:
        label = ex.get("label", "")
        text = ex.get("text", "").strip()
        if label in class_names and text:
            by_class[label].append(text)

    # Sample
    sampled = {}
    for cls in class_names:
        texts = by_class.get(cls, [])
        if len(texts) <= samples_per_class:
            sampled[cls] = texts
        else:
            sampled[cls] = rng.sample(texts, samples_per_class)

    return sampled


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
    return benchmark.get("classifiers", {}).get(classifier_name)


def get_confused_pairs_text(benchmark_data: dict | None) -> str:
    """Format top confused pairs from confusion matrix for the prompt."""
    if benchmark_data is None:
        return "No confusion matrix available."

    cm = benchmark_data.get("confusion_matrix")
    cm_labels = benchmark_data.get("confusion_labels")
    if cm is None or cm_labels is None:
        return "No confusion matrix available."

    pairs = []
    for i, row in enumerate(cm):
        for j, val in enumerate(row):
            if i != j and val > 0:
                pairs.append((cm_labels[i], cm_labels[j], val))

    pairs.sort(key=lambda x: x[2], reverse=True)

    if not pairs:
        return "No confused pairs found (perfect confusion matrix)."

    lines = []
    for true_cls, pred_cls, count in pairs[:5]:
        lines.append(f"- {true_cls} misclassified as {pred_cls}: {count} times")
    return "\n".join(lines)


def get_per_class_f1_text(benchmark_data: dict | None, class_names: list[str]) -> str:
    """Format per-class F1 scores for the prompt."""
    if benchmark_data is None:
        return "No benchmark data available."

    report = benchmark_data.get("classification_report", {})
    lines = []
    for cls in class_names:
        if cls in report:
            f1 = report[cls].get("f1-score", 0.0)
            precision = report[cls].get("precision", 0.0)
            recall = report[cls].get("recall", 0.0)
            lines.append(f"- {cls}: F1={f1:.3f} (P={precision:.3f}, R={recall:.3f})")
        else:
            lines.append(f"- {cls}: no data")
    return "\n".join(lines)


def get_low_confidence_text(benchmark_data: dict | None) -> str:
    """Format low-confidence examples for the prompt."""
    if benchmark_data is None:
        return "No low-confidence examples available."

    examples = benchmark_data.get("low_confidence_examples", [])
    if not examples:
        return "No low-confidence examples found."

    lines = []
    for ex in examples[:10]:
        lines.append(
            f"- \"{ex['text'][:80]}\" (true: {ex.get('true_label', '?')}, "
            f"predicted: {ex.get('predicted_label', '?')}, "
            f"confidence: {ex.get('confidence', 0):.3f})"
        )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Gap analysis prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = (
    "You are David Allen, creator of Getting Things Done (GTD). You have decades of "
    "experience coaching individuals and organizations in GTD implementation. You understand "
    "every nuance of the methodology: the 5 stages of mastering workflow (capture, clarify, "
    "organize, reflect, engage), the 6 horizons of focus, the 2-minute rule, the natural "
    "planning model, the someday/maybe distinction, context-based next actions, waiting-for "
    "tracking, weekly review criteria, and reference material organization."
)


def build_gap_analysis_prompt(
    classifier_name: str,
    class_names: list[str],
    gtd_definitions: str,
    per_class_f1: str,
    confused_pairs: str,
    low_confidence: str,
    sampled_data: dict[str, list[str]],
) -> str:
    """Build the gap analysis prompt for a classifier."""
    # Format sampled training data
    data_block = ""
    for cls, texts in sampled_data.items():
        data_block += f"\n**{cls}** ({len(texts)} samples):\n"
        for t in texts[:SAMPLES_PER_CLASS]:
            data_block += f'- "{t}"\n'

    prompt = (
        f"Analyze this GTD classifier's training data and performance. Identify SYSTEMATIC "
        f"blind spots -- categories of GTD knowledge the model has never encountered.\n\n"
        f"**Classifier:** {classifier_name}\n"
        f"**Classes with definitions:**\n{gtd_definitions}\n\n"
        f"**Performance (per-class F1 scores):**\n{per_class_f1}\n\n"
        f"**Most confused class pairs:**\n{confused_pairs}\n\n"
        f"**Low-confidence examples (model was uncertain):**\n{low_confidence}\n\n"
        f"**Sample training data ({SAMPLES_PER_CLASS} per class):**\n{data_block}\n\n"
        f"For each blind spot you identify, provide:\n"
        f"1. **Gap title**: A concise name for this gap\n"
        f"2. **GTD concept**: What specific GTD concept is missing (be specific -- e.g., "
        f"'horizons of focus levels 3-5 items', not just 'advanced GTD')\n"
        f"3. **Why it matters**: Why this gap affects classification accuracy\n"
        f"4. **Missing example types**: What kinds of examples would teach the model this concept\n"
        f"5. **Suggested examples**: Exactly 5 specific text examples with their correct labels "
        f"and difficulty level that would fill this gap. Write like real people -- messy, informal, "
        f"abbreviated. Do NOT include classification terms in the text.\n\n"
        f"Focus on SYSTEMATIC gaps (patterns of missing knowledge), not individual misclassifications.\n"
        f"Identify between 3 and 7 gaps, ordered by severity."
    )
    return prompt


# ---------------------------------------------------------------------------
# Structured output schema for gap analysis
# ---------------------------------------------------------------------------

GAP_ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "gaps": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Concise name for this gap",
                    },
                    "gtd_concept": {
                        "type": "string",
                        "description": "Specific GTD concept that is missing",
                    },
                    "why_it_matters": {
                        "type": "string",
                        "description": "Why this gap affects classification accuracy",
                    },
                    "missing_example_types": {
                        "type": "string",
                        "description": "What kinds of examples would teach the model this concept",
                    },
                    "severity": {
                        "type": "string",
                        "enum": ["high", "medium", "low"],
                        "description": "How severely this gap affects the classifier",
                    },
                    "suggested_examples": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "text": {"type": "string"},
                                "label": {"type": "string"},
                                "difficulty": {
                                    "type": "string",
                                    "enum": ["easy", "medium", "hard", "adversarial"],
                                },
                            },
                            "required": ["text", "label", "difficulty"],
                            "additionalProperties": False,
                        },
                    },
                },
                "required": [
                    "title",
                    "gtd_concept",
                    "why_it_matters",
                    "missing_example_types",
                    "severity",
                    "suggested_examples",
                ],
                "additionalProperties": False,
            },
        },
        "overall_assessment": {
            "type": "string",
            "description": "Brief overall assessment of the classifier's GTD knowledge coverage",
        },
        "priority_recommendation": {
            "type": "string",
            "description": "What the highest priority improvement should be",
        },
    },
    "required": ["gaps", "overall_assessment", "priority_recommendation"],
    "additionalProperties": False,
}


# ---------------------------------------------------------------------------
# API call
# ---------------------------------------------------------------------------


def call_gap_analysis(
    client: anthropic.Anthropic,
    model_id: str,
    prompt: str,
    class_names: list[str],
) -> dict | None:
    """Call the Anthropic API for gap analysis with structured output."""
    # Build schema with valid label enum for this classifier
    schema = json.loads(json.dumps(GAP_ANALYSIS_SCHEMA))
    # Add label enum constraint to suggested examples
    schema["properties"]["gaps"]["items"]["properties"]["suggested_examples"]["items"][
        "properties"
    ]["label"]["enum"] = class_names

    for attempt in range(MAX_RETRIES):
        try:
            response = client.messages.create(
                model=model_id,
                max_tokens=8192,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
                output_config={
                    "format": {
                        "type": "json_schema",
                        "schema": schema,
                    }
                },
            )
            return json.loads(response.content[0].text)
        except anthropic.RateLimitError:
            wait = 2**attempt * 5
            print(f"\n  [Rate limit] Waiting {wait}s...", flush=True)
            time.sleep(wait)
        except anthropic.APIError as e:
            wait = 2**attempt
            print(f"\n  [API error] {e} -- retry {attempt + 1}/{MAX_RETRIES}", flush=True)
            time.sleep(wait)
        except json.JSONDecodeError as e:
            print(f"\n  [JSON parse error] {e}", flush=True)
            return None
        except Exception as e:
            print(f"\n  [Unexpected error] {e}", flush=True)
            return None

    return None


# ---------------------------------------------------------------------------
# Dedup and JSONL append
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
    Append new examples to JSONL, skipping duplicates.

    Only writes text and label fields.
    Returns count appended.
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
# Report generation
# ---------------------------------------------------------------------------


def generate_report(
    all_results: dict[str, dict],
    model_key: str,
    timestamp: str,
) -> str:
    """Generate the Markdown gap analysis report."""
    lines = []
    lines.append("# Gap Analysis Report")
    lines.append(f"**Date:** {timestamp}")
    lines.append(f"**Model:** {MODEL_MAP[model_key]}")
    lines.append("")

    # Summary table
    lines.append("## Summary")
    lines.append("")
    lines.append("| Classifier | Gaps Found | Severity | Priority |")
    lines.append("|------------|-----------|----------|----------|")

    for name, result in sorted(all_results.items()):
        if result is None or "error" in result:
            lines.append(f"| {name} | ERROR | - | - |")
            continue

        gaps = result.get("gaps", [])
        num_gaps = len(gaps)
        high = sum(1 for g in gaps if g.get("severity") == "high")
        med = sum(1 for g in gaps if g.get("severity") == "medium")
        low = sum(1 for g in gaps if g.get("severity") == "low")
        severity = f"{high}H/{med}M/{low}L"
        priority = result.get("priority_recommendation", "N/A")[:60]
        lines.append(f"| {name} | {num_gaps} | {severity} | {priority} |")

    lines.append("")

    # Per-classifier analysis
    lines.append("## Per-Classifier Analysis")
    lines.append("")

    for name, result in sorted(all_results.items()):
        if result is None:
            lines.append(f"### {name}")
            lines.append("**Error:** No response from API")
            lines.append("")
            continue

        if "error" in result:
            lines.append(f"### {name}")
            lines.append(f"**Error:** {result['error']}")
            lines.append("")
            continue

        config = get_classifier(name)
        bench = result.get("_benchmark_data")
        accuracy = bench.get("accuracy", "N/A") if bench else "N/A"
        weakest = bench.get("weakest_class", "N/A") if bench else "N/A"
        weakest_f1 = bench.get("weakest_f1", "N/A") if bench else "N/A"

        lines.append(f"### {name}")
        if isinstance(accuracy, float):
            lines.append(f"**Overall accuracy:** {accuracy:.4f} | **Weakest class:** {weakest} ({weakest_f1:.4f if isinstance(weakest_f1, float) else weakest_f1})")
        else:
            lines.append(f"**Overall accuracy:** {accuracy} | **Weakest class:** {weakest}")
        lines.append("")

        if result.get("overall_assessment"):
            lines.append(f"**Assessment:** {result['overall_assessment']}")
            lines.append("")

        if result.get("priority_recommendation"):
            lines.append(f"**Priority:** {result['priority_recommendation']}")
            lines.append("")

        gaps = result.get("gaps", [])
        for i, gap in enumerate(gaps, 1):
            lines.append(f"#### Gap {i}: {gap.get('title', 'Untitled')}")
            lines.append(f"**GTD concept:** {gap.get('gtd_concept', 'N/A')}")
            lines.append(f"**Severity:** {gap.get('severity', 'N/A')}")
            lines.append(f"**Why it matters:** {gap.get('why_it_matters', 'N/A')}")
            lines.append(f"**Missing examples:** {gap.get('missing_example_types', 'N/A')}")
            lines.append("")

            suggested = gap.get("suggested_examples", [])
            if suggested:
                lines.append("**Suggested training examples:**")
                lines.append("")
                lines.append("| Text | Label | Difficulty |")
                lines.append("|------|-------|------------|")
                for ex in suggested:
                    text = ex.get("text", "").replace("|", "\\|")[:80]
                    lines.append(f"| {text} | {ex.get('label', '?')} | {ex.get('difficulty', '?')} |")
                lines.append("")

        lines.append("---")
        lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Core gap analysis logic
# ---------------------------------------------------------------------------


def analyze_classifier(
    client: anthropic.Anthropic,
    classifier_name: str,
    model_id: str,
    benchmark_data: dict | None,
) -> dict | None:
    """
    Run gap analysis for a single classifier.

    Returns the structured analysis result or None on failure.
    """
    config = get_classifier(classifier_name)
    class_names = config["class_names"]
    gtd_defs = config["gtd_definitions"]
    jsonl_path = TRAINING_DATA_DIR / config["jsonl"]

    print(f"\n{'='*60}", flush=True)
    print(f"Gap analysis for: {classifier_name}", flush=True)
    print(f"{'='*60}", flush=True)

    # Sample training data
    sampled = sample_training_data(jsonl_path, class_names)
    total_sampled = sum(len(v) for v in sampled.values())
    print(f"  Sampled {total_sampled} training examples ({len(sampled)} classes)", flush=True)

    # Format benchmark data for prompt
    per_class_f1 = get_per_class_f1_text(benchmark_data, class_names)
    confused_pairs = get_confused_pairs_text(benchmark_data)
    low_confidence = get_low_confidence_text(benchmark_data)

    # Build prompt
    prompt = build_gap_analysis_prompt(
        classifier_name, class_names, gtd_defs,
        per_class_f1, confused_pairs, low_confidence, sampled,
    )

    print(f"  Calling API ({model_id})...", flush=True)

    result = call_gap_analysis(client, model_id, prompt, class_names)

    if result is None:
        print(f"  ERROR: No response from API", flush=True)
        return None

    gaps = result.get("gaps", [])
    print(f"  Found {len(gaps)} gaps", flush=True)

    # Count suggested examples
    total_suggested = sum(len(g.get("suggested_examples", [])) for g in gaps)
    print(f"  Total suggested examples: {total_suggested}", flush=True)

    # Store benchmark data for report generation
    result["_benchmark_data"] = benchmark_data

    return result


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Systematic GTD knowledge gap identification via Anthropic API",
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
        default="sonnet",
        help="Claude model for analysis (default: sonnet for quality)",
    )
    parser.add_argument(
        "--benchmark-file",
        type=str,
        default=None,
        help="Path to benchmark JSON (default: auto-detect latest in reports/)",
    )
    args = parser.parse_args()

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
        print("No benchmark file found -- analysis will proceed without performance data", flush=True)

    # Check API key
    import os
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print(
            "\nERROR: ANTHROPIC_API_KEY not found. Set it in .env.local",
            file=sys.stderr,
        )
        sys.exit(1)

    model_id = MODEL_MAP[args.model]
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

    print(f"\nGap Analysis", flush=True)
    print(f"  Model: {model_id}", flush=True)
    print(f"  Classifiers: {len(classifier_names)}", flush=True)

    client = anthropic.Anthropic()

    # Run analysis for each classifier
    all_results: dict[str, dict | None] = {}
    all_suggested: dict[str, list[dict]] = {}  # classifier -> suggested examples

    for name in tqdm(classifier_names, desc="Analyzing", unit="classifier"):
        bench_data = get_classifier_benchmark(benchmark, name)

        result = analyze_classifier(client, name, model_id, bench_data)
        all_results[name] = result

        # Collect suggested examples
        if result and "gaps" in result:
            suggested = []
            for gap in result["gaps"]:
                for ex in gap.get("suggested_examples", []):
                    if ex.get("text") and ex.get("label"):
                        suggested.append(ex)
            all_suggested[name] = suggested

        time.sleep(SLEEP_BETWEEN_CALLS)

    # --- Extract and append suggested examples to training JSONL ---
    print(f"\n{'='*60}", flush=True)
    print("Appending suggested examples to training data", flush=True)
    print(f"{'='*60}", flush=True)

    total_appended = 0
    for name, examples in all_suggested.items():
        if not examples:
            continue

        config = get_classifier(name)
        jsonl_path = TRAINING_DATA_DIR / config["jsonl"]
        existing_texts = load_existing_texts(jsonl_path)

        appended = append_to_jsonl(jsonl_path, examples, existing_texts)
        total_appended += appended
        print(f"  {name}: {appended}/{len(examples)} appended (deduped {len(examples) - appended})", flush=True)

    print(f"\n  Total appended: {total_appended}", flush=True)

    # --- Generate and write Markdown report ---
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report = generate_report(all_results, args.model, timestamp)

    report_path = REPORTS_DIR / f"gap_analysis_{timestamp}.md"
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report)

    print(f"\n{'='*60}", flush=True)
    print("GAP ANALYSIS COMPLETE", flush=True)
    print(f"{'='*60}", flush=True)
    print(f"  Report: {report_path}", flush=True)
    print(f"  Examples appended: {total_appended}", flush=True)

    # Summary
    print(f"\n{'Classifier':<22} {'Gaps':>5} {'Suggested':>10} {'Appended':>9}", flush=True)
    print("-" * 50, flush=True)
    for name in sorted(all_results.keys()):
        result = all_results[name]
        if result is None or "error" in result:
            print(f"{name:<22} {'ERR':>5}", flush=True)
            continue
        gaps = len(result.get("gaps", []))
        suggested = len(all_suggested.get(name, []))
        # Count how many were actually appended (we don't track per-classifier, show suggested)
        print(f"{name:<22} {gaps:>5} {suggested:>10}", flush=True)


if __name__ == "__main__":
    main()
