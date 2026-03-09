"""
54_retrain_and_report.py -- Automated retrain + re-benchmark + before/after report.

Orchestrates the full retrain cycle: retrain all classifiers on augmented data,
run Node.js validation, re-benchmark, and produce a before/after comparison report.

Usage:
    python -u scripts/train/54_retrain_and_report.py --classifier all
    python -u scripts/train/54_retrain_and_report.py --classifier actionability --skip-retrain
    python -u scripts/train/54_retrain_and_report.py --classifier type --expert-exam

Output:
    scripts/train/reports/improvement_{YYYYMMDD_HHMMSS}.md  (before/after comparison)

Prerequisites:
    - ONNX models at public/models/classifiers/*.onnx
    - Training data at scripts/training-data/*.jsonl
    - Node.js for validation scripts
    - pip install -r scripts/train/requirements.txt
"""

import argparse
import json
import subprocess
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

# ---------------------------------------------------------------------------
# Import classifier registry
# ---------------------------------------------------------------------------
sys.path.insert(0, str(Path(__file__).parent.resolve()))
from classifier_registry import (
    CLASSIFIER_DIR,
    CLASSIFIER_REGISTRY,
    REPO_ROOT,
    REPORTS_DIR,
    TRAINING_DATA_DIR,
    get_classifier,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).parent.resolve()
REGRESSION_THRESHOLD = 0.005  # 0.5% accuracy drop triggers warning

# Map classifiers to their training pipeline type
TRAIN_PIPELINES = {
    "type": "type",
    "gtd-routing": "gtd",
    "actionability": "gtd",
    "project-detection": "gtd",
    "context-tagging": "gtd",
    "decomposition": "decomposition",
    "completeness-gate": "clarification",
    "missing-outcome": "clarification",
    "missing-next-action": "clarification",
    "missing-timeframe": "clarification",
    "missing-context": "clarification",
    "missing-reference": "clarification",
}

# Validation scripts by pipeline type
VALIDATION_SCRIPTS = {
    "type": "node scripts/train/04_validate_model.mjs",
    "gtd": "node scripts/train/22_validate_gtd_models.mjs",
    "decomposition": "node scripts/train/32_validate_decomposition_model.mjs",
    "clarification": "node scripts/train/42_validate_clarification_models.mjs",
}


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


# ---------------------------------------------------------------------------
# Run subprocess with output capture
# ---------------------------------------------------------------------------


def run_command(
    cmd: str,
    label: str,
    cwd: Path | None = None,
    timeout: int = 600,
) -> tuple[bool, str, str]:
    """
    Run a command via subprocess, capturing stdout/stderr.

    Returns (success, stdout, stderr).
    """
    print(f"\n  [{label}] Running: {cmd}", flush=True)
    start = time.time()

    try:
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            cwd=str(cwd or REPO_ROOT),
            timeout=timeout,
        )
        elapsed = time.time() - start
        success = result.returncode == 0

        if success:
            print(f"  [{label}] Completed in {elapsed:.1f}s", flush=True)
        else:
            print(f"  [{label}] FAILED (exit code {result.returncode}) in {elapsed:.1f}s", flush=True)
            if result.stderr:
                # Print last 10 lines of stderr
                stderr_lines = result.stderr.strip().split("\n")
                for line in stderr_lines[-10:]:
                    print(f"    {line}", flush=True)

        return success, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        print(f"  [{label}] TIMEOUT after {timeout}s", flush=True)
        return False, "", f"Timeout after {timeout}s"
    except Exception as e:
        print(f"  [{label}] ERROR: {e}", flush=True)
        return False, "", str(e)


# ---------------------------------------------------------------------------
# Retrain classifiers
# ---------------------------------------------------------------------------


def get_train_command(classifier_name: str) -> str:
    """Get the training command for a classifier."""
    pipeline = TRAIN_PIPELINES.get(classifier_name)

    if pipeline == "type":
        # Type classifier requires re-embedding (Pitfall 4 from RESEARCH.md)
        return "python -u scripts/train/02_embed_data.py && python -u scripts/train/03_train_classifier.py"
    elif pipeline == "gtd":
        return f"python -u scripts/train/21_train_gtd_classifier.py --classifier {classifier_name}"
    elif pipeline == "decomposition":
        return "python -u scripts/train/31_train_decomposition_classifier.py"
    elif pipeline == "clarification":
        return f"python -u scripts/train/41_train_clarification_classifier.py --classifier {classifier_name}"
    else:
        raise ValueError(f"Unknown pipeline for classifier: {classifier_name}")


def get_validation_command(classifier_name: str) -> str:
    """Get the validation command for a classifier."""
    pipeline = TRAIN_PIPELINES.get(classifier_name)
    if pipeline is None:
        raise ValueError(f"Unknown pipeline for classifier: {classifier_name}")
    return VALIDATION_SCRIPTS.get(pipeline, "")


def retrain_classifiers(
    classifier_names: list[str],
) -> dict[str, dict]:
    """
    Retrain classifiers sequentially.

    Returns dict mapping classifier name to result info.
    """
    results = {}

    # Group classifiers by pipeline to avoid redundant retraining
    # e.g., all GTD classifiers can share validation but train individually
    # Decomposition has only one classifier
    # Clarification classifiers each need their own train call

    for name in classifier_names:
        try:
            cmd = get_train_command(name)
            success, stdout, stderr = run_command(cmd, f"Train {name}")
            results[name] = {
                "success": success,
                "stdout": stdout,
                "stderr": stderr,
            }
        except Exception as e:
            print(f"  ERROR training {name}: {e}", flush=True)
            results[name] = {
                "success": False,
                "stdout": "",
                "stderr": str(e),
            }

    return results


def validate_classifiers(
    classifier_names: list[str],
) -> dict[str, dict]:
    """
    Run Node.js validation for retrained classifiers.

    Groups by pipeline type to avoid redundant validation runs.
    """
    results = {}

    # Track which validation scripts we've already run
    validated_pipelines = set()

    for name in classifier_names:
        pipeline = TRAIN_PIPELINES.get(name)
        if pipeline is None:
            continue

        cmd = get_validation_command(name)
        if not cmd:
            continue

        # Only run each validation script once per pipeline type
        if pipeline not in validated_pipelines:
            success, stdout, stderr = run_command(cmd, f"Validate {pipeline}")
            validated_pipelines.add(pipeline)
            results[pipeline] = {
                "success": success,
                "stdout": stdout,
                "stderr": stderr,
            }

    return results


# ---------------------------------------------------------------------------
# Count training data sizes
# ---------------------------------------------------------------------------


def count_training_examples(classifier_names: list[str]) -> dict[str, int]:
    """Count training examples per classifier."""
    counts = {}
    for name in classifier_names:
        config = get_classifier(name)
        jsonl_path = TRAINING_DATA_DIR / config["jsonl"]
        examples = load_jsonl(jsonl_path)
        counts[name] = len(examples)
    return counts


# ---------------------------------------------------------------------------
# Comparison report generation
# ---------------------------------------------------------------------------


def generate_improvement_report(
    before: dict | None,
    after: dict | None,
    before_path: Path | None,
    after_path: Path | None,
    before_counts: dict[str, int],
    after_counts: dict[str, int],
    train_results: dict[str, dict],
    validation_results: dict[str, dict],
    expert_exam: bool,
    timestamp: str,
) -> str:
    """Generate the before/after comparison Markdown report."""
    lines = []
    lines.append("# Classifier Improvement Report")
    lines.append(f"**Date:** {timestamp}")
    lines.append(f"**Before benchmark:** {before_path or 'N/A'}")
    lines.append(f"**After benchmark:** {after_path or 'N/A'}")
    lines.append("")

    before_classifiers = before.get("classifiers", {}) if before else {}
    after_classifiers = after.get("classifiers", {}) if after else {}

    all_names = sorted(set(list(before_classifiers.keys()) + list(after_classifiers.keys())))

    # Summary table
    lines.append("## Summary")
    lines.append("")
    lines.append("| Classifier | Before Acc | After Acc | Delta | Before Weakest F1 | After Weakest F1 | Delta |")
    lines.append("|------------|-----------|-----------|-------|-------------------|------------------|-------|")

    improved = 0
    unchanged = 0
    regressed = 0
    regression_alerts = []

    for name in all_names:
        b = before_classifiers.get(name, {})
        a = after_classifiers.get(name, {})

        b_acc = b.get("accuracy", 0.0) if "error" not in b else None
        a_acc = a.get("accuracy", 0.0) if "error" not in a else None
        b_wf1 = b.get("weakest_f1", 0.0) if "error" not in b else None
        a_wf1 = a.get("weakest_f1", 0.0) if "error" not in a else None

        if b_acc is not None and a_acc is not None:
            delta_acc = a_acc - b_acc
            delta_wf1 = (a_wf1 - b_wf1) if (a_wf1 is not None and b_wf1 is not None) else 0

            if delta_acc > 0.001:
                improved += 1
            elif delta_acc < -0.001:
                regressed += 1
                if abs(delta_acc) > REGRESSION_THRESHOLD:
                    regression_alerts.append((name, delta_acc))
            else:
                unchanged += 1

            b_acc_str = f"{b_acc:.4f}"
            a_acc_str = f"{a_acc:.4f}"
            delta_str = f"{delta_acc:+.4f}"
            b_wf1_str = f"{b_wf1:.4f}" if b_wf1 is not None else "N/A"
            a_wf1_str = f"{a_wf1:.4f}" if a_wf1 is not None else "N/A"
            d_wf1_str = f"{delta_wf1:+.4f}" if b_wf1 is not None and a_wf1 is not None else "N/A"

            lines.append(f"| {name} | {b_acc_str} | {a_acc_str} | {delta_str} | {b_wf1_str} | {a_wf1_str} | {d_wf1_str} |")
        else:
            lines.append(f"| {name} | {'N/A' if b_acc is None else f'{b_acc:.4f}'} | {'N/A' if a_acc is None else f'{a_acc:.4f}'} | N/A | N/A | N/A | N/A |")

    lines.append("")

    # Overall stats
    total_aug = sum(after_counts.get(n, 0) - before_counts.get(n, 0) for n in all_names)

    lines.append("## Overall")
    lines.append("")
    lines.append(f"- Classifiers improved: {improved}/{len(all_names)}")
    lines.append(f"- Classifiers unchanged: {unchanged}/{len(all_names)}")
    lines.append(f"- Classifiers regressed: {regressed}/{len(all_names)}" + (" **ALERT**" if regressed > 0 else ""))
    lines.append(f"- Total augmented examples added: {total_aug}")
    lines.append("")

    # Regression warnings
    if regression_alerts:
        lines.append("### REGRESSION WARNINGS")
        lines.append("")
        for name, delta in regression_alerts:
            lines.append(f"- **WARNING:** {name} accuracy dropped by {abs(delta):.4f} (>{REGRESSION_THRESHOLD:.4f} threshold)")
        lines.append("")

    # Per-classifier details
    lines.append("## Per-Classifier Details")
    lines.append("")

    for name in all_names:
        b = before_classifiers.get(name, {})
        a = after_classifiers.get(name, {})
        b_acc = b.get("accuracy", 0.0) if "error" not in b else None
        a_acc = a.get("accuracy", 0.0) if "error" not in a else None

        if b_acc is not None and a_acc is not None:
            delta = a_acc - b_acc
            if delta > 0.001:
                status = "Improved"
            elif delta < -0.001:
                status = "REGRESSED"
            else:
                status = "Unchanged"
        else:
            status = "Incomplete"

        lines.append(f"### {name}")
        lines.append(f"**Status:** {status}")
        lines.append("")

        # Per-class F1 comparison
        b_report = b.get("classification_report", {})
        a_report = a.get("classification_report", {})

        config = get_classifier(name)
        class_names = config["class_names"] or []

        if b_report and a_report and class_names:
            lines.append("| Class | Before F1 | After F1 | Delta |")
            lines.append("|-------|----------|---------|-------|")
            for cls in class_names:
                b_f1 = b_report.get(cls, {}).get("f1-score", 0.0)
                a_f1 = a_report.get(cls, {}).get("f1-score", 0.0)
                d_f1 = a_f1 - b_f1
                lines.append(f"| {cls} | {b_f1:.4f} | {a_f1:.4f} | {d_f1:+.4f} |")
            lines.append("")

        # Data augmentation info
        b_count = before_counts.get(name, 0)
        a_count = after_counts.get(name, 0)
        lines.append("**Data augmentation:**")
        lines.append(f"- Total training examples: {b_count} -> {a_count} ({a_count - b_count:+d})")
        lines.append("")

        # Confidence distribution shift
        b_low_conf = b.get("low_confidence_count", 0)
        a_low_conf = a.get("low_confidence_count", 0)
        lines.append("**Confidence distribution shift:**")
        lines.append(f"- Before low-confidence examples: {b_low_conf}")
        lines.append(f"- After low-confidence examples: {a_low_conf}")
        lines.append("")

        # Low-confidence examples that are now correctly classified
        b_low_conf_exs = b.get("low_confidence_examples", [])
        a_low_conf_exs = a.get("low_confidence_examples", [])
        if b_low_conf_exs and a_low_conf_exs:
            # Find examples that were low-conf in before but not in after
            a_texts = {ex.get("text", ""): ex for ex in a_low_conf_exs}
            newly_correct = []
            for bex in b_low_conf_exs[:5]:
                text = bex.get("text", "")
                if text and text not in a_texts:
                    newly_correct.append(bex)

            if newly_correct:
                lines.append("**Examples no longer low-confidence:**")
                lines.append("")
                lines.append("| Text | Before Pred (conf) | Status |")
                lines.append("|------|-------------------|--------|")
                for ex in newly_correct[:5]:
                    text = ex.get("text", "")[:60].replace("|", "\\|")
                    pred = ex.get("predicted_label", "?")
                    conf = ex.get("confidence", 0)
                    lines.append(f"| {text} | {pred} ({conf:.3f}) | Resolved |")
                lines.append("")

        # Training status
        train_res = train_results.get(name, {})
        if train_res:
            train_status = "Success" if train_res.get("success") else "FAILED"
            lines.append(f"**Training status:** {train_status}")
            lines.append("")

        lines.append("---")
        lines.append("")

    # Expert exam results (if available)
    before_exam = before.get("expert_exam", {}) if before else {}
    after_exam = after.get("expert_exam", {}) if after else {}

    if expert_exam and (before_exam or after_exam):
        lines.append("## Expert Exam Results")
        lines.append("")
        lines.append("| Classifier | Before Exam Acc | After Exam Acc | Delta |")
        lines.append("|------------|----------------|----------------|-------|")

        for name in all_names:
            b_exam = before_exam.get(name, {})
            a_exam = after_exam.get(name, {})
            b_ea = b_exam.get("accuracy")
            a_ea = a_exam.get("accuracy")

            if b_ea is not None and a_ea is not None:
                delta = a_ea - b_ea
                lines.append(f"| {name} | {b_ea:.4f} | {a_ea:.4f} | {delta:+.4f} |")
            else:
                lines.append(f"| {name} | {'N/A' if b_ea is None else f'{b_ea:.4f}'} | {'N/A' if a_ea is None else f'{a_ea:.4f}'} | N/A |")

        lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Retrain classifiers and produce before/after comparison report",
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
        "--before-benchmark",
        type=str,
        default=None,
        help="Path to BEFORE benchmark JSON (default: auto-detect latest)",
    )
    parser.add_argument(
        "--skip-retrain",
        action="store_true",
        help="Skip retraining, only re-benchmark and compare",
    )
    parser.add_argument(
        "--expert-exam",
        action="store_true",
        help="Also re-score against expert exam after retraining",
    )
    args = parser.parse_args()

    # Determine classifiers
    if args.classifier == "all":
        classifier_names = list(CLASSIFIER_REGISTRY.keys())
    else:
        get_classifier(args.classifier)
        classifier_names = [args.classifier]

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

    print(f"Retrain & Report Orchestrator", flush=True)
    print(f"  Classifiers: {len(classifier_names)}", flush=True)
    print(f"  Skip retrain: {args.skip_retrain}", flush=True)
    print(f"  Expert exam: {args.expert_exam}", flush=True)

    # Step 1: Load "before" benchmark
    if args.before_benchmark:
        before_path = Path(args.before_benchmark)
    else:
        before_path = find_latest_benchmark(REPORTS_DIR)

    before = load_benchmark(before_path)
    if before:
        print(f"\n  Before benchmark: {before_path}", flush=True)
    else:
        print(f"\n  No before benchmark found -- will only have 'after' results", flush=True)

    # Record before training data counts
    before_counts = count_training_examples(classifier_names)
    print(f"  Training data counts (before): {sum(before_counts.values())} total", flush=True)

    # Step 2: Retrain (unless --skip-retrain)
    train_results: dict[str, dict] = {}
    validation_results: dict[str, dict] = {}

    if not args.skip_retrain:
        print(f"\n{'='*60}", flush=True)
        print("PHASE 1: RETRAIN CLASSIFIERS", flush=True)
        print(f"{'='*60}", flush=True)

        train_results = retrain_classifiers(classifier_names)

        # Report training status
        successes = sum(1 for r in train_results.values() if r.get("success"))
        failures = len(train_results) - successes
        print(f"\n  Training: {successes} succeeded, {failures} failed", flush=True)

        # Step 3: Node.js validation
        print(f"\n{'='*60}", flush=True)
        print("PHASE 2: NODE.JS VALIDATION", flush=True)
        print(f"{'='*60}", flush=True)

        validation_results = validate_classifiers(classifier_names)

        val_successes = sum(1 for r in validation_results.values() if r.get("success"))
        val_failures = len(validation_results) - val_successes
        print(f"\n  Validation: {val_successes} succeeded, {val_failures} failed", flush=True)

    # Step 4: Re-benchmark
    print(f"\n{'='*60}", flush=True)
    print("PHASE 3: RE-BENCHMARK", flush=True)
    print(f"{'='*60}", flush=True)

    classifier_arg = args.classifier
    benchmark_cmd = f"python -u scripts/train/50_benchmark_models.py --classifier {classifier_arg}"
    if args.expert_exam:
        benchmark_cmd += " --expert-exam"

    success, stdout, stderr = run_command(benchmark_cmd, "Re-benchmark", timeout=600)

    if not success:
        print(f"\n  WARNING: Re-benchmark failed. Report will have limited 'after' data.", flush=True)

    # Find the new benchmark JSON (should be the latest)
    after_path = find_latest_benchmark(REPORTS_DIR)
    after = load_benchmark(after_path)

    # Make sure after is different from before
    if after_path and before_path and str(after_path) == str(before_path):
        print(f"\n  WARNING: Before and after benchmark are the same file!", flush=True)
        print(f"  This likely means re-benchmark failed to produce a new file.", flush=True)

    # Record after training data counts
    after_counts = count_training_examples(classifier_names)

    # Step 5: Generate comparison report
    print(f"\n{'='*60}", flush=True)
    print("PHASE 4: GENERATE REPORT", flush=True)
    print(f"{'='*60}", flush=True)

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    report = generate_improvement_report(
        before, after, before_path, after_path,
        before_counts, after_counts,
        train_results, validation_results,
        args.expert_exam, timestamp,
    )

    report_path = REPORTS_DIR / f"improvement_{timestamp}.md"
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report)

    print(f"  Report: {report_path}", flush=True)

    # Step 6: Regression check
    if before and after:
        before_classifiers = before.get("classifiers", {})
        after_classifiers = after.get("classifiers", {})

        regressions = []
        for name in classifier_names:
            b = before_classifiers.get(name, {})
            a = after_classifiers.get(name, {})
            b_acc = b.get("accuracy") if "error" not in b else None
            a_acc = a.get("accuracy") if "error" not in a else None

            if b_acc is not None and a_acc is not None:
                delta = a_acc - b_acc
                if delta < -REGRESSION_THRESHOLD:
                    regressions.append((name, b_acc, a_acc, delta))

        if regressions:
            print(f"\n{'!'*60}", flush=True)
            print("WARNING: ACCURACY REGRESSIONS DETECTED", flush=True)
            print(f"{'!'*60}", flush=True)
            for name, b_acc, a_acc, delta in regressions:
                print(f"  {name}: {b_acc:.4f} -> {a_acc:.4f} ({delta:+.4f})", flush=True)
            print(f"\n  Cloud augmentation may have hurt these classifiers.", flush=True)
            print(f"  Review the report for details.", flush=True)

    # Summary
    print(f"\n{'='*60}", flush=True)
    print("RETRAIN & REPORT COMPLETE", flush=True)
    print(f"{'='*60}", flush=True)
    print(f"  Report: {report_path}", flush=True)

    if before and after:
        before_classifiers = before.get("classifiers", {})
        after_classifiers = after.get("classifiers", {})

        improved = 0
        regressed_count = 0
        for name in classifier_names:
            b_acc = before_classifiers.get(name, {}).get("accuracy")
            a_acc = after_classifiers.get(name, {}).get("accuracy")
            if b_acc is not None and a_acc is not None:
                if a_acc > b_acc + 0.001:
                    improved += 1
                elif a_acc < b_acc - 0.001:
                    regressed_count += 1

        print(f"  Improved: {improved}, Regressed: {regressed_count}", flush=True)
    else:
        print(f"  (No before/after comparison possible -- missing benchmark data)", flush=True)


if __name__ == "__main__":
    main()
