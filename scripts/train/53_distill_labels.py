"""
53_distill_labels.py -- Teacher-student distillation via Claude Sonnet.

Feeds low-confidence predictions to Claude Sonnet and gets expert labels with
detailed GTD reasoning. Only corrections (where Claude disagrees with the model)
are appended to training JSONL -- these are the highest-value training signals.

Usage:
    python -u scripts/train/53_distill_labels.py --classifier actionability --count 5 --model haiku
    python -u scripts/train/53_distill_labels.py --classifier all --model sonnet --count 50
    python -u scripts/train/53_distill_labels.py --classifier type --confidence-threshold 0.70

Output:
    Appends corrections to scripts/training-data/{classifier}.jsonl
    scripts/train/reports/distillation_{YYYYMMDD_HHMMSS}.md  (distillation report)

Prerequisites:
    - ANTHROPIC_API_KEY in .env.local at the repo root
    - pip install -r scripts/train/requirements.txt
    - Benchmark JSON from 50_benchmark_models.py (for low-confidence examples)
    - ONNX models at public/models/classifiers/*.onnx
"""

import argparse
import json
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import onnxruntime as ort
from sklearn.model_selection import train_test_split
from tqdm import tqdm

# ---------------------------------------------------------------------------
# Import classifier registry
# ---------------------------------------------------------------------------
sys.path.insert(0, str(Path(__file__).parent.resolve()))
from classifier_registry import (
    CLASSIFIER_DIR,
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
from dotenv import load_dotenv

load_dotenv(dotenv_path=REPO_ROOT / ".env.local")

import anthropic  # noqa: E402

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

RANDOM_STATE = 42
TEST_SIZE = 0.20
SLEEP_BETWEEN_CALLS = 0.05
MAX_RETRIES = 3

SYSTEM_PROMPT = (
    "You are a GTD methodology expert and ML training data curator. Your job is to "
    "provide the CORRECT label for ambiguous GTD inbox items, along with detailed "
    "reasoning that explains the GTD principles behind the classification. Your "
    "reasoning should reference specific GTD concepts: the 5 stages of mastering "
    "workflow, 6 horizons of focus, 2-minute rule, natural planning model, "
    "someday/maybe criteria, waiting-for tracking, context lists, weekly review criteria."
)

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


def load_existing_texts(jsonl_path: Path) -> set[str]:
    """Load all existing text entries from a JSONL file (case-insensitive)."""
    texts = set()
    if not jsonl_path.exists():
        return texts
    for ex in load_jsonl(jsonl_path):
        text = ex.get("text", "").strip().lower()
        if text:
            texts.add(text)
    return texts


# ---------------------------------------------------------------------------
# Embedding
# ---------------------------------------------------------------------------

_EMBED_MODEL = None


def get_embed_model():
    """Lazy-load the sentence-transformers MiniLM model."""
    global _EMBED_MODEL
    if _EMBED_MODEL is None:
        from sentence_transformers import SentenceTransformer

        _EMBED_MODEL = SentenceTransformer("all-MiniLM-L6-v2")
    return _EMBED_MODEL


def embed_texts(texts: list[str], desc: str = "Embedding") -> np.ndarray:
    """Embed texts using MiniLM-L6-v2, returning (N, 384) float32 array."""
    model = get_embed_model()
    embeddings = model.encode(
        texts, show_progress_bar=True, batch_size=256, normalize_embeddings=True
    )
    return np.array(embeddings, dtype=np.float32)


# ---------------------------------------------------------------------------
# ONNX inference
# ---------------------------------------------------------------------------


def run_onnx_inference(
    classifier_name: str, embeddings: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """
    Run ONNX inference on embeddings.

    Returns (predicted_indices, probabilities).
    """
    config = get_classifier(classifier_name)
    onnx_path = CLASSIFIER_DIR / config["onnx_model"]

    if not onnx_path.exists():
        raise FileNotFoundError(f"ONNX model not found: {onnx_path}")

    session = ort.InferenceSession(str(onnx_path))
    input_name = session.get_inputs()[0].name

    outputs = session.run(None, {input_name: embeddings})
    if len(outputs) == 2:
        probs = outputs[1]
        if isinstance(probs, list):
            probs = np.array(
                [[p.get(str(i), 0.0) for i in range(len(p))] for p in probs],
                dtype=np.float32,
            )
        predicted = np.array(outputs[0], dtype=np.int64)
    else:
        probs = outputs[0]
        predicted = probs.argmax(axis=1)

    return predicted, np.array(probs, dtype=np.float32)


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


# ---------------------------------------------------------------------------
# Identify distillation candidates
# ---------------------------------------------------------------------------


def identify_candidates(
    classifier_name: str,
    confidence_threshold: float,
    max_count: int,
    benchmark_path: Path | None,
) -> list[dict]:
    """
    Identify distillation candidates from benchmark data or by running inference.

    Returns list of dicts: {text, true_label, predicted_label, confidence}
    """
    config = get_classifier(classifier_name)
    class_names = config["class_names"]

    # Build label mappings
    classes_path = CLASSIFIER_DIR / config["classes_json"]
    if classes_path.exists():
        with open(classes_path, encoding="utf-8") as f:
            classes_map = json.load(f)
        index_to_label = {int(k): v for k, v in classes_map.items()}
        label_to_index = {v: k for k, v in index_to_label.items()}
    else:
        label_to_index = {name: i for i, name in enumerate(class_names)}
        index_to_label = {i: name for i, name in enumerate(class_names)}

    # Try to load from benchmark JSON first
    benchmark = load_benchmark(benchmark_path)
    if benchmark is None and benchmark_path is None:
        benchmark = load_benchmark(find_latest_benchmark(REPORTS_DIR))

    # If benchmark has low_confidence_examples, use those
    if benchmark is not None:
        bench_data = benchmark.get("classifiers", {}).get(classifier_name, {})
        low_conf = bench_data.get("low_confidence_examples", [])
        if low_conf:
            print(f"  Using {len(low_conf)} low-confidence examples from benchmark", flush=True)
            candidates = []
            for ex in low_conf:
                candidates.append({
                    "text": ex["text"],
                    "true_label": ex.get("true_label", ""),
                    "predicted_label": ex.get("predicted_label", ""),
                    "confidence": ex.get("confidence", 0.0),
                })
            # Benchmark only stores up to 10 low-conf examples, so also run inference
            # to find more candidates if needed

    # Run inference on test split to find more candidates
    jsonl_path = TRAINING_DATA_DIR / config["jsonl"]
    if not jsonl_path.exists():
        print(f"  ERROR: Training data not found: {jsonl_path}", flush=True)
        return []

    examples = load_jsonl(jsonl_path)
    texts = [ex["text"] for ex in examples if "text" in ex and "label" in ex]
    labels = [ex["label"] for ex in examples if "text" in ex and "label" in ex]

    # Filter to valid labels
    valid_labels = set(label_to_index.keys())
    valid_pairs = [(t, l) for t, l in zip(texts, labels) if l in valid_labels]
    texts = [t for t, _ in valid_pairs]
    labels = [l for _, l in valid_pairs]

    if len(texts) < 10:
        print(f"  Not enough data to split for {classifier_name}", flush=True)
        return []

    # Stratified split (same as benchmark)
    _, texts_test, _, labels_test = train_test_split(
        texts, labels, test_size=TEST_SIZE, random_state=RANDOM_STATE, stratify=labels
    )

    print(f"  Embedding {len(texts_test)} test examples...", flush=True)
    test_embeddings = embed_texts(texts_test, desc=f"{classifier_name} test")

    print(f"  Running ONNX inference...", flush=True)
    predicted_indices, probs = run_onnx_inference(classifier_name, test_embeddings)

    # Find candidates: low confidence OR incorrect predictions
    max_probs = probs.max(axis=1)
    candidates = []

    for i in range(len(texts_test)):
        pred_label = index_to_label.get(int(predicted_indices[i]), "?")
        conf = float(max_probs[i])
        is_low_conf = conf < confidence_threshold
        is_incorrect = pred_label != labels_test[i]

        if is_low_conf or is_incorrect:
            candidates.append({
                "text": texts_test[i],
                "true_label": labels_test[i],
                "predicted_label": pred_label,
                "confidence": conf,
                "is_incorrect": is_incorrect,
            })

    # Sort: incorrect first (highest value), then by lowest confidence
    candidates.sort(key=lambda x: (not x.get("is_incorrect", False), x["confidence"]))

    # Cap at max_count
    candidates = candidates[:max_count]

    print(f"  Found {len(candidates)} distillation candidates "
          f"({sum(1 for c in candidates if c.get('is_incorrect'))} incorrect, "
          f"{sum(1 for c in candidates if not c.get('is_incorrect'))} low-conf)", flush=True)

    return candidates


# ---------------------------------------------------------------------------
# Claude distillation
# ---------------------------------------------------------------------------


def build_distillation_prompt(
    classifier_name: str,
    class_names: list[str],
    gtd_definitions: str,
    example_text: str,
    model_prediction: str,
    confidence: float,
) -> str:
    """Build the distillation prompt for a single example."""
    # Build class names with definitions
    class_defs = gtd_definitions

    prompt = (
        f"Classify this GTD inbox item for the {classifier_name} classifier.\n\n"
        f"Text: '{example_text}'\n\n"
        f"Available labels: {', '.join(class_names)}\n\n"
        f"**Classifier definition:**\n{class_defs}\n\n"
        f"The current model predicted '{model_prediction}' with "
        f"{confidence * 100:.1f}% confidence.\n\n"
        f"Provide:\n"
        f"1. The CORRECT label (may agree or disagree with the model)\n"
        f"2. Detailed GTD reasoning explaining WHY this label is correct\n"
        f"3. Which GTD concepts are relevant to this classification\n"
        f"4. A difficulty rating (easy/medium/hard/adversarial)"
    )
    return prompt


def distill_single(
    client: anthropic.Anthropic,
    model_id: str,
    classifier_name: str,
    class_names: list[str],
    gtd_definitions: str,
    candidate: dict,
) -> dict | None:
    """
    Distill a single candidate through Claude.

    Returns structured result or None on failure.
    """
    schema = {
        "type": "object",
        "properties": {
            "label": {
                "type": "string",
                "enum": class_names,
                "description": "The correct label per GTD methodology",
            },
            "reasoning": {
                "type": "string",
                "description": "Detailed GTD reasoning for why this label is correct",
            },
            "gtd_concepts": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of relevant GTD concepts",
            },
            "difficulty": {
                "type": "string",
                "enum": ["easy", "medium", "hard", "adversarial"],
                "description": "How difficult this classification is",
            },
            "agrees_with_model": {
                "type": "boolean",
                "description": "Whether this label agrees with the model's prediction",
            },
        },
        "required": ["label", "reasoning", "gtd_concepts", "difficulty", "agrees_with_model"],
        "additionalProperties": False,
    }

    prompt = build_distillation_prompt(
        classifier_name, class_names, gtd_definitions,
        candidate["text"], candidate["predicted_label"], candidate["confidence"],
    )

    for attempt in range(MAX_RETRIES):
        try:
            response = client.messages.create(
                model=model_id,
                max_tokens=2048,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
                output_config={
                    "format": {
                        "type": "json_schema",
                        "schema": schema,
                    }
                },
            )
            result = json.loads(response.content[0].text)
            return result
        except anthropic.RateLimitError:
            wait = 2 ** attempt * 5
            print(f"\n  [Rate limit] Waiting {wait}s...", flush=True)
            time.sleep(wait)
        except anthropic.APIError as e:
            wait = 2 ** attempt
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
# Core distillation loop
# ---------------------------------------------------------------------------


def distill_classifier(
    client: anthropic.Anthropic,
    classifier_name: str,
    model_id: str,
    candidates: list[dict],
) -> dict:
    """
    Run distillation for all candidates of a single classifier.

    Returns stats dict with agree/disagree counts, corrections, etc.
    """
    config = get_classifier(classifier_name)
    class_names = config["class_names"]
    gtd_defs = config["gtd_definitions"]
    jsonl_path = TRAINING_DATA_DIR / config["jsonl"]

    print(f"\n{'='*60}", flush=True)
    print(f"Distilling: {classifier_name} ({len(candidates)} candidates)", flush=True)
    print(f"{'='*60}", flush=True)

    # Load existing texts for dedup
    existing_texts = load_existing_texts(jsonl_path)

    agreed = 0
    disagreed = 0
    errors = 0
    corrections = []
    all_results = []
    gtd_concepts_counter = defaultdict(int)
    correction_patterns = defaultdict(int)

    for candidate in tqdm(candidates, desc=f"  {classifier_name}", unit="ex"):
        result = distill_single(
            client, model_id, classifier_name, class_names, gtd_defs, candidate
        )

        if result is None:
            errors += 1
            continue

        # Determine agree/disagree
        claude_label = result.get("label", "")
        agrees = result.get("agrees_with_model", claude_label == candidate["predicted_label"])

        # Track GTD concepts
        for concept in result.get("gtd_concepts", []):
            gtd_concepts_counter[concept] += 1

        entry = {
            "text": candidate["text"],
            "true_label": candidate.get("true_label", ""),
            "model_prediction": candidate["predicted_label"],
            "model_confidence": candidate["confidence"],
            "claude_label": claude_label,
            "agrees": agrees,
            "reasoning": result.get("reasoning", ""),
            "gtd_concepts": result.get("gtd_concepts", []),
            "difficulty": result.get("difficulty", ""),
        }
        all_results.append(entry)

        if agrees:
            agreed += 1
        else:
            disagreed += 1
            corrections.append(entry)
            # Track correction patterns
            pattern_key = f"{candidate['predicted_label']} -> {claude_label}"
            correction_patterns[pattern_key] += 1

        time.sleep(SLEEP_BETWEEN_CALLS)

    # Append corrections to JSONL (only disagreements -- these are the teacher's corrections)
    appended = 0
    for corr in corrections:
        text = corr["text"].strip()
        if not text:
            continue
        if text.lower() in existing_texts:
            continue
        with open(jsonl_path, "a", encoding="utf-8") as f:
            f.write(json.dumps({"text": text, "label": corr["claude_label"]}, ensure_ascii=False) + "\n")
        existing_texts.add(text.lower())
        appended += 1

    print(f"\n  Agreed: {agreed}, Disagreed: {disagreed}, Errors: {errors}", flush=True)
    print(f"  Corrections appended: {appended}", flush=True)

    return {
        "classifier": classifier_name,
        "total_candidates": len(candidates),
        "agreed": agreed,
        "disagreed": disagreed,
        "errors": errors,
        "appended": appended,
        "corrections": corrections,
        "all_results": all_results,
        "gtd_concepts_counter": dict(gtd_concepts_counter),
        "correction_patterns": dict(correction_patterns),
    }


# ---------------------------------------------------------------------------
# Report generation
# ---------------------------------------------------------------------------


def generate_distillation_report(
    all_stats: dict[str, dict],
    model_key: str,
    confidence_threshold: float,
    timestamp: str,
) -> str:
    """Generate the Markdown distillation report."""
    lines = []
    lines.append("# Teacher-Student Distillation Report")
    lines.append(f"**Date:** {timestamp}")
    lines.append(f"**Model:** {MODEL_MAP[model_key]}")
    lines.append(f"**Confidence threshold:** {confidence_threshold}")
    lines.append("")

    # Summary table
    lines.append("## Summary")
    lines.append("")
    lines.append("| Classifier | Candidates | Agreed | Corrected | Appended | Agree Rate |")
    lines.append("|------------|-----------|--------|-----------|----------|------------|")

    total_agreed = 0
    total_disagreed = 0
    total_appended = 0
    total_candidates = 0

    for name, stats in sorted(all_stats.items()):
        cand = stats["total_candidates"]
        agr = stats["agreed"]
        dis = stats["disagreed"]
        app = stats["appended"]
        rate = f"{agr / (agr + dis) * 100:.1f}%" if (agr + dis) > 0 else "N/A"
        lines.append(f"| {name} | {cand} | {agr} | {dis} | {app} | {rate} |")
        total_agreed += agr
        total_disagreed += dis
        total_appended += app
        total_candidates += cand

    overall_rate = f"{total_agreed / (total_agreed + total_disagreed) * 100:.1f}%" if (total_agreed + total_disagreed) > 0 else "N/A"
    lines.append(f"| **TOTAL** | **{total_candidates}** | **{total_agreed}** | **{total_disagreed}** | **{total_appended}** | **{overall_rate}** |")
    lines.append("")

    # Per-classifier details
    lines.append("## Per-Classifier Details")
    lines.append("")

    for name, stats in sorted(all_stats.items()):
        lines.append(f"### {name}")
        lines.append("")

        # Correction patterns
        patterns = stats.get("correction_patterns", {})
        if patterns:
            lines.append("**Most common correction patterns:**")
            lines.append("")
            sorted_patterns = sorted(patterns.items(), key=lambda x: x[1], reverse=True)
            for pattern, count in sorted_patterns[:5]:
                lines.append(f"- {pattern}: {count} corrections")
            lines.append("")

        # GTD concepts most cited in corrections
        concepts = stats.get("gtd_concepts_counter", {})
        if concepts:
            lines.append("**GTD concepts most frequently cited:**")
            lines.append("")
            sorted_concepts = sorted(concepts.items(), key=lambda x: x[1], reverse=True)
            for concept, count in sorted_concepts[:8]:
                lines.append(f"- {concept}: {count}")
            lines.append("")

        # Example corrections with reasoning
        corrections = stats.get("corrections", [])
        if corrections:
            lines.append("**Example corrections with reasoning:**")
            lines.append("")
            for corr in corrections[:5]:
                text = corr["text"][:100]
                lines.append(f"- **Text:** \"{text}\"")
                lines.append(f"  - Model: {corr['model_prediction']} ({corr['model_confidence']:.2f})")
                lines.append(f"  - Claude: {corr['claude_label']}")
                lines.append(f"  - Reasoning: {corr['reasoning'][:200]}")
                lines.append("")

        lines.append("---")
        lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Teacher-student distillation via Claude Sonnet",
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
        help="Claude model for distillation (default: sonnet for quality)",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=50,
        help="Max examples to distill per classifier (default: 50)",
    )
    parser.add_argument(
        "--benchmark-file",
        type=str,
        default=None,
        help="Path to benchmark JSON (default: auto-detect latest in reports/)",
    )
    parser.add_argument(
        "--confidence-threshold",
        type=float,
        default=0.80,
        help="Below this confidence, examples are candidates for distillation (default: 0.80)",
    )
    args = parser.parse_args()

    # Determine classifiers
    if args.classifier == "all":
        classifier_names = list(CLASSIFIER_REGISTRY.keys())
    else:
        get_classifier(args.classifier)
        classifier_names = [args.classifier]

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
    benchmark_path = Path(args.benchmark_file) if args.benchmark_file else None

    print(f"Teacher-Student Distillation", flush=True)
    print(f"  Model: {model_id}", flush=True)
    print(f"  Classifiers: {len(classifier_names)}", flush=True)
    print(f"  Max examples per classifier: {args.count}", flush=True)
    print(f"  Confidence threshold: {args.confidence_threshold}", flush=True)

    client = anthropic.Anthropic()

    # Run distillation for each classifier
    all_stats: dict[str, dict] = {}

    for name in classifier_names:
        try:
            # Identify candidates
            candidates = identify_candidates(
                name, args.confidence_threshold, args.count, benchmark_path,
            )

            if not candidates:
                print(f"\n  No candidates for {name} -- skipping", flush=True)
                all_stats[name] = {
                    "classifier": name,
                    "total_candidates": 0,
                    "agreed": 0, "disagreed": 0, "errors": 0, "appended": 0,
                    "corrections": [], "all_results": [],
                    "gtd_concepts_counter": {}, "correction_patterns": {},
                }
                continue

            stats = distill_classifier(client, name, model_id, candidates)
            all_stats[name] = stats

        except Exception as e:
            print(f"\nERROR distilling {name}: {e}", flush=True)
            import traceback
            traceback.print_exc()
            all_stats[name] = {
                "classifier": name,
                "total_candidates": 0,
                "agreed": 0, "disagreed": 0, "errors": 0, "appended": 0,
                "corrections": [], "all_results": [],
                "gtd_concepts_counter": {}, "correction_patterns": {},
                "error": str(e),
            }

    # Generate report
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report = generate_distillation_report(
        all_stats, args.model, args.confidence_threshold, timestamp,
    )

    report_path = REPORTS_DIR / f"distillation_{timestamp}.md"
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report)

    # Print summary
    print(f"\n{'='*60}", flush=True)
    print("DISTILLATION COMPLETE", flush=True)
    print(f"{'='*60}", flush=True)
    print(f"  Report: {report_path}", flush=True)

    total_agreed = sum(s["agreed"] for s in all_stats.values())
    total_disagreed = sum(s["disagreed"] for s in all_stats.values())
    total_appended = sum(s["appended"] for s in all_stats.values())

    print(f"\n{'Classifier':<22} {'Candidates':>10} {'Agreed':>7} {'Corrected':>10} {'Appended':>9}", flush=True)
    print("-" * 62, flush=True)
    for name, stats in sorted(all_stats.items()):
        print(
            f"{name:<22} {stats['total_candidates']:>10} {stats['agreed']:>7} "
            f"{stats['disagreed']:>10} {stats['appended']:>9}",
            flush=True,
        )

    print(f"\nTotals: {total_agreed} agreed, {total_disagreed} corrected, {total_appended} appended", flush=True)


if __name__ == "__main__":
    main()
