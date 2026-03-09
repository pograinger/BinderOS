"""
50_benchmark_models.py -- Baseline benchmarking + cloud expert exam generation and scoring.

Measures baseline accuracy for all 12 ONNX classifiers using stratified train/test split,
and optionally generates a cloud "expert exam" test set via the Anthropic API that
stress-tests GTD boundaries the Faker data may not cover.

Usage:
    python -u scripts/train/50_benchmark_models.py --classifier type
    python -u scripts/train/50_benchmark_models.py --classifier all
    python -u scripts/train/50_benchmark_models.py --classifier actionability --expert-exam --exam-count 20 --model haiku

Output:
    scripts/train/reports/benchmark_{YYYYMMDD_HHMMSS}.md   (Markdown report)
    scripts/train/reports/benchmark_{YYYYMMDD_HHMMSS}.json (machine-readable results)
    scripts/training-data/expert-exam/{classifier}.jsonl    (expert exam data, if --expert-exam)

Prerequisites:
    - ONNX models at public/models/classifiers/*.onnx
    - Training data at scripts/training-data/*.jsonl
    - For --expert-exam: ANTHROPIC_API_KEY in .env.local at the repo root
    - pip install -r scripts/train/requirements.txt
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
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from tqdm import tqdm

# ---------------------------------------------------------------------------
# Import classifier registry (shared module)
# ---------------------------------------------------------------------------
sys.path.insert(0, str(Path(__file__).parent.resolve()))
from classifier_registry import (
    CLASSIFIER_DIR,
    CLASSIFIER_REGISTRY,
    EXPERT_EXAM_DIR,
    MODEL_MAP,
    REPO_ROOT,
    REPORTS_DIR,
    TRAINING_DATA_DIR,
    get_classifier,
)

# ---------------------------------------------------------------------------
# Environment setup (for --expert-exam mode)
# ---------------------------------------------------------------------------
from dotenv import load_dotenv

load_dotenv(dotenv_path=REPO_ROOT / ".env.local")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

RANDOM_STATE = 42
TEST_SIZE = 0.20
SLEEP_BETWEEN_CALLS = 0.05
MAX_RETRIES = 3

# Type classifier augmentation categories (from memory notes)
TYPE_AUGMENTATION_HINTS = {
    "task": [
        "Multi-step/compound tasks: 'Call dentist and then update insurance info', 'Fix the link, then notify Sarah'",
        "Tasks disguised as observations or complaints",
    ],
    "fact": [
        "Ambiguous borderline cases that look like tasks: 'The faucet is leaking', 'The homepage link is broken'",
        "Facts that imply urgency but require no action from the user",
    ],
    "event": [
        "Vague/incomplete events: 'Dentist next week', 'Meeting sometime Thursday afternoon'",
        "Events without explicit time markers but with temporal implication",
    ],
    "decision": [
        "Implicit decisions: 'We're going with the new vendor', 'Looks like we'll switch to AWS'",
        "Decisions phrased as statements of fact or observations",
    ],
    "insight": [
        "Negative/frustrated tone: 'I always underestimate how long things take', 'I keep forgetting to check the budget'",
        "Insights disguised as complaints or observations about patterns",
    ],
}

# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------


def load_jsonl(path: Path) -> list[dict]:
    """Load examples from a JSONL file."""
    examples = []
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


def load_training_data(classifier_name: str) -> tuple[list[str], list[str]]:
    """Load text and labels from classifier's JSONL training data."""
    config = get_classifier(classifier_name)
    path = TRAINING_DATA_DIR / config["jsonl"]
    if not path.exists():
        print(f"ERROR: Training data not found: {path}", flush=True)
        return [], []
    examples = load_jsonl(path)
    texts = [ex["text"] for ex in examples if "text" in ex and "label" in ex]
    labels = [ex["label"] for ex in examples if "text" in ex and "label" in ex]
    return texts, labels


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

    Returns (predicted_indices, probabilities) where:
    - predicted_indices: shape (N,) of predicted class indices
    - probabilities: shape (N, num_classes) of raw output probabilities
    """
    config = get_classifier(classifier_name)
    onnx_path = CLASSIFIER_DIR / config["onnx_model"]

    if not onnx_path.exists():
        raise FileNotFoundError(f"ONNX model not found: {onnx_path}")

    session = ort.InferenceSession(str(onnx_path))
    input_name = session.get_inputs()[0].name

    outputs = session.run(None, {input_name: embeddings})
    # MLP classifiers output probabilities as the first (or second) output
    # The sklearn MLP exported via skl2onnx produces [labels, probabilities]
    if len(outputs) == 2:
        # outputs[0] = predicted labels, outputs[1] = probabilities
        probs = outputs[1]
        if isinstance(probs, list):
            # Some skl2onnx versions return list of dicts for probabilities
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
# Benchmark a single classifier
# ---------------------------------------------------------------------------


def benchmark_classifier(
    classifier_name: str,
) -> dict:
    """
    Benchmark a single classifier on its own training data (80/20 stratified split).

    Returns a results dict with metrics, low-confidence examples, etc.
    """
    config = get_classifier(classifier_name)
    class_names = config["class_names"]

    print(f"\n{'='*60}", flush=True)
    print(f"Benchmarking: {classifier_name}", flush=True)
    print(f"{'='*60}", flush=True)

    # Load data
    texts, labels = load_training_data(classifier_name)
    if not texts:
        return {"error": f"No training data found for {classifier_name}"}

    print(f"  Loaded {len(texts)} examples", flush=True)

    # Build label-to-index mapping from classes JSON
    classes_path = CLASSIFIER_DIR / config["classes_json"]
    if classes_path.exists():
        with open(classes_path, encoding="utf-8") as f:
            classes_map = json.load(f)
        # classes_map: {"0": "class-a", "1": "class-b", ...}
        index_to_label = {int(k): v for k, v in classes_map.items()}
        label_to_index = {v: k for k, v in index_to_label.items()}
    else:
        # Fallback: build from class_names
        label_to_index = {name: i for i, name in enumerate(class_names)}
        index_to_label = {i: name for i, name in enumerate(class_names)}

    # Filter to valid labels only
    valid_labels = set(label_to_index.keys())
    valid_pairs = [(t, l) for t, l in zip(texts, labels) if l in valid_labels]
    if len(valid_pairs) < len(texts):
        print(
            f"  Filtered {len(texts) - len(valid_pairs)} examples with unknown labels",
            flush=True,
        )
    texts = [t for t, _ in valid_pairs]
    labels = [l for _, l in valid_pairs]

    # Check minimum class sizes for stratification
    label_counts = defaultdict(int)
    for l in labels:
        label_counts[l] += 1

    min_count = min(label_counts.values())
    if min_count < 2:
        print(f"  WARNING: Some classes have <2 examples, cannot stratify", flush=True)
        return {"error": f"Insufficient data for stratification in {classifier_name}"}

    # Stratified split
    texts_train, texts_test, labels_train, labels_test = train_test_split(
        texts, labels, test_size=TEST_SIZE, random_state=RANDOM_STATE, stratify=labels
    )

    print(f"  Train: {len(texts_train)}, Test: {len(texts_test)}", flush=True)

    # Embed test set
    print(f"  Embedding test set...", flush=True)
    test_embeddings = embed_texts(texts_test, desc=f"{classifier_name} test")

    # ONNX inference
    print(f"  Running ONNX inference...", flush=True)
    predicted_indices, probs = run_onnx_inference(classifier_name, test_embeddings)

    # Convert labels to indices
    true_indices = np.array([label_to_index[l] for l in labels_test], dtype=np.int64)

    # Classification report
    target_names_ordered = [index_to_label[i] for i in sorted(index_to_label.keys())]
    report_dict = classification_report(
        true_indices,
        predicted_indices,
        target_names=target_names_ordered,
        output_dict=True,
        zero_division=0,
    )
    report_text = classification_report(
        true_indices,
        predicted_indices,
        target_names=target_names_ordered,
        zero_division=0,
    )

    # Confusion matrix
    cm = confusion_matrix(true_indices, predicted_indices)

    # Find weakest class (lowest F1 among actual classes)
    class_f1s = {}
    for cls_name in target_names_ordered:
        if cls_name in report_dict:
            class_f1s[cls_name] = report_dict[cls_name].get("f1-score", 0.0)

    weakest_class = min(class_f1s, key=class_f1s.get) if class_f1s else "N/A"
    weakest_f1 = class_f1s.get(weakest_class, 0.0)

    # Overall accuracy
    accuracy = report_dict.get("accuracy", 0.0)

    # Low-confidence examples
    max_probs = probs.max(axis=1)
    low_conf_threshold = 0.70
    low_conf_mask = max_probs < low_conf_threshold
    low_conf_examples = []
    low_conf_indices = np.where(low_conf_mask)[0]

    for idx in low_conf_indices[:10]:  # Cap at 10
        low_conf_examples.append(
            {
                "text": texts_test[idx],
                "true_label": labels_test[idx],
                "predicted_label": index_to_label.get(int(predicted_indices[idx]), "?"),
                "confidence": float(max_probs[idx]),
            }
        )

    print(f"  Accuracy: {accuracy:.4f}", flush=True)
    print(f"  Weakest class: {weakest_class} (F1={weakest_f1:.4f})", flush=True)
    print(f"  Low-confidence examples: {int(low_conf_mask.sum())}", flush=True)

    return {
        "classifier": classifier_name,
        "num_examples": len(texts),
        "num_test": len(texts_test),
        "accuracy": float(accuracy),
        "weakest_class": weakest_class,
        "weakest_f1": float(weakest_f1),
        "classification_report": report_dict,
        "classification_report_text": report_text,
        "confusion_matrix": cm.tolist(),
        "confusion_labels": target_names_ordered,
        "low_confidence_examples": low_conf_examples,
        "low_confidence_count": int(low_conf_mask.sum()),
    }


# ---------------------------------------------------------------------------
# Expert exam generation
# ---------------------------------------------------------------------------


def generate_expert_exam(
    classifier_name: str,
    model_key: str = "haiku",
    exam_count: int = 50,
) -> list[dict]:
    """
    Generate an expert exam test set for a classifier using the Anthropic API.

    Returns list of generated examples with text, label, reasoning, difficulty fields.
    """
    import anthropic

    config = get_classifier(classifier_name)
    class_names = config["class_names"]
    gtd_defs = config["gtd_definitions"]
    model_id = MODEL_MAP[model_key]

    client = anthropic.Anthropic()

    # For binary classifiers, use exam_count per class (so 2x total)
    # For multi-class, use exam_count per class
    per_class = exam_count

    # Difficulty tiers: 25% each
    difficulties = ["easy", "medium", "hard", "adversarial"]

    # Schema for structured output
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
                            "description": "Why this example belongs to this class per GTD methodology",
                        },
                        "difficulty": {
                            "type": "string",
                            "enum": difficulties,
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

    all_examples = []

    # Load existing training texts for dedup
    existing_texts = set()
    jsonl_path = TRAINING_DATA_DIR / config["jsonl"]
    if jsonl_path.exists():
        for ex in load_jsonl(jsonl_path):
            if "text" in ex:
                existing_texts.add(ex["text"].strip().lower())

    # Also load any existing expert exam
    exam_path = EXPERT_EXAM_DIR / f"{classifier_name}.jsonl"
    if exam_path.exists():
        for ex in load_jsonl(exam_path):
            if "text" in ex:
                existing_texts.add(ex["text"].strip().lower())

    print(f"\n  Generating expert exam for: {classifier_name}", flush=True)
    print(
        f"  Model: {model_id}, {per_class} per class, {len(class_names)} classes",
        flush=True,
    )

    for cls_name in class_names:
        per_difficulty = max(1, per_class // len(difficulties))
        remainder = per_class - (per_difficulty * len(difficulties))

        for diff_idx, difficulty in enumerate(difficulties):
            count = per_difficulty + (1 if diff_idx < remainder else 0)
            if count <= 0:
                continue

            # Build prompt with deep GTD methodology
            aug_hints = ""
            if classifier_name == "type" and cls_name in TYPE_AUGMENTATION_HINTS:
                hints = TYPE_AUGMENTATION_HINTS[cls_name]
                aug_hints = (
                    "\n\nSpecific patterns to include:\n"
                    + "\n".join(f"- {h}" for h in hints)
                )

            prompt = (
                f"You are David Allen, the creator of Getting Things Done (GTD). "
                f"You have decades of experience coaching people on GTD methodology.\n\n"
                f"Generate exactly {count} realistic GTD inbox captures that should be "
                f"classified as '{cls_name}' by this classifier:\n\n"
                f"**Classifier:** {classifier_name}\n"
                f"**Definition:**\n{gtd_defs}\n\n"
                f"**Difficulty level:** {difficulty}\n"
                f"- easy: clear, unambiguous examples\n"
                f"- medium: realistic but with some ambiguity\n"
                f"- hard: deliberately tricky, near decision boundaries\n"
                f"- adversarial: designed to fool a classifier -- looks like another class "
                f"but is actually '{cls_name}'\n\n"
                f"**GTD methodology depth:**\n"
                f"- Reference the 2-minute rule where relevant\n"
                f"- Consider horizons of focus (ground level to 50,000ft)\n"
                f"- Apply the natural planning model (purpose, vision, brainstorming, "
                f"organizing, next actions)\n"
                f"- Understand someday/maybe boundaries\n"
                f"- Consider weekly review criteria\n"
                f"- Think about context-dependent next actions\n\n"
                f"**Style:** Write like real people type -- messy, abbreviated, with typos, "
                f"incomplete sentences, varied length (some 3 words, some 2 sentences). "
                f"Do NOT write formal or polished text. Do NOT include the label or "
                f"classification term in the text.{aug_hints}\n\n"
                f"Each example must have:\n"
                f"- text: the inbox item (natural, messy language)\n"
                f"- label: must be '{cls_name}'\n"
                f"- reasoning: brief GTD methodology explanation of why this is '{cls_name}'\n"
                f"- difficulty: '{difficulty}'"
            )

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
                    examples = result.get("examples", [])

                    # Dedup and validate
                    for ex in examples:
                        text = ex.get("text", "").strip()
                        if not text:
                            continue
                        if text.lower() in existing_texts:
                            continue
                        if ex.get("label") != cls_name:
                            continue
                        all_examples.append(ex)
                        existing_texts.add(text.lower())

                    break  # Success
                except Exception as e:
                    if "RateLimitError" in type(e).__name__ or "rate" in str(e).lower():
                        wait = 2**attempt * 5
                        print(
                            f"\n  [Rate limit] Waiting {wait}s...", flush=True
                        )
                        time.sleep(wait)
                    elif attempt < MAX_RETRIES - 1:
                        wait = 2**attempt
                        print(
                            f"\n  [API error] {e} -- retry {attempt+1}/{MAX_RETRIES}",
                            flush=True,
                        )
                        time.sleep(wait)
                    else:
                        print(f"\n  [ERROR] Failed after {MAX_RETRIES} retries: {e}", flush=True)

            time.sleep(SLEEP_BETWEEN_CALLS)

        print(
            f"    {cls_name}: {sum(1 for e in all_examples if e.get('label') == cls_name)} examples",
            flush=True,
        )

    # Write expert exam JSONL
    EXPERT_EXAM_DIR.mkdir(parents=True, exist_ok=True)
    exam_path = EXPERT_EXAM_DIR / f"{classifier_name}.jsonl"
    with open(exam_path, "w", encoding="utf-8") as f:
        for ex in all_examples:
            f.write(json.dumps(ex, ensure_ascii=False) + "\n")

    print(
        f"  Expert exam written: {exam_path} ({len(all_examples)} examples)",
        flush=True,
    )
    return all_examples


def score_expert_exam(
    classifier_name: str, exam_examples: list[dict]
) -> dict:
    """Score a classifier against its expert exam examples."""
    if not exam_examples:
        return {"error": "No expert exam examples"}

    config = get_classifier(classifier_name)
    class_names = config["class_names"]

    # Build label mapping
    classes_path = CLASSIFIER_DIR / config["classes_json"]
    if classes_path.exists():
        with open(classes_path, encoding="utf-8") as f:
            classes_map = json.load(f)
        index_to_label = {int(k): v for k, v in classes_map.items()}
        label_to_index = {v: k for k, v in index_to_label.items()}
    else:
        label_to_index = {name: i for i, name in enumerate(class_names)}
        index_to_label = {i: name for i, name in enumerate(class_names)}

    # Filter valid examples
    valid_examples = [
        ex for ex in exam_examples if ex.get("label") in label_to_index
    ]
    if not valid_examples:
        return {"error": "No valid exam examples after filtering"}

    texts = [ex["text"] for ex in valid_examples]
    true_labels = [ex["label"] for ex in valid_examples]

    print(f"  Scoring expert exam ({len(texts)} examples)...", flush=True)

    # Embed
    embeddings = embed_texts(texts, desc=f"{classifier_name} exam")

    # Inference
    predicted_indices, probs = run_onnx_inference(classifier_name, embeddings)
    true_indices = np.array(
        [label_to_index[l] for l in true_labels], dtype=np.int64
    )

    # Metrics
    target_names_ordered = [index_to_label[i] for i in sorted(index_to_label.keys())]
    report_dict = classification_report(
        true_indices,
        predicted_indices,
        target_names=target_names_ordered,
        output_dict=True,
        zero_division=0,
    )
    report_text = classification_report(
        true_indices,
        predicted_indices,
        target_names=target_names_ordered,
        zero_division=0,
    )

    accuracy = report_dict.get("accuracy", 0.0)
    print(f"  Expert exam accuracy: {accuracy:.4f}", flush=True)

    # Per-difficulty breakdown
    difficulty_results = defaultdict(lambda: {"correct": 0, "total": 0})
    for i, ex in enumerate(valid_examples):
        diff = ex.get("difficulty", "unknown")
        difficulty_results[diff]["total"] += 1
        if predicted_indices[i] == true_indices[i]:
            difficulty_results[diff]["correct"] += 1

    return {
        "num_examples": len(texts),
        "accuracy": float(accuracy),
        "classification_report": report_dict,
        "classification_report_text": report_text,
        "difficulty_breakdown": {
            k: {
                "accuracy": v["correct"] / v["total"] if v["total"] > 0 else 0.0,
                "total": v["total"],
            }
            for k, v in difficulty_results.items()
        },
    }


# ---------------------------------------------------------------------------
# Report generation
# ---------------------------------------------------------------------------


def generate_markdown_report(
    results: dict[str, dict],
    exam_results: dict[str, dict] | None = None,
    timestamp: str = "",
) -> str:
    """Generate a Markdown benchmark report."""
    lines = []
    lines.append("# Classifier Benchmark Report")
    lines.append(f"**Date:** {timestamp}")
    lines.append(f"**Classifiers:** {len(results)}")
    lines.append("")

    # Summary table
    lines.append("## Summary")
    lines.append("")
    lines.append(
        "| Classifier | Examples | Test | Accuracy | Weakest Class | Weakest F1 |"
    )
    lines.append(
        "|------------|---------|------|----------|---------------|------------|"
    )

    for name, res in sorted(results.items()):
        if "error" in res:
            lines.append(f"| {name} | - | - | ERROR | {res['error']} | - |")
            continue
        lines.append(
            f"| {name} | {res['num_examples']} | {res['num_test']} | "
            f"{res['accuracy']:.4f} | {res['weakest_class']} | "
            f"{res['weakest_f1']:.4f} |"
        )

    lines.append("")

    # Expert exam summary (if present)
    if exam_results:
        lines.append("## Expert Exam Summary")
        lines.append("")
        lines.append("| Classifier | Exam Examples | Exam Accuracy |")
        lines.append("|------------|--------------|---------------|")
        for name, eres in sorted(exam_results.items()):
            if "error" in eres:
                lines.append(f"| {name} | - | ERROR: {eres['error']} |")
            else:
                lines.append(
                    f"| {name} | {eres['num_examples']} | {eres['accuracy']:.4f} |"
                )
        lines.append("")

    # Per-classifier details
    lines.append("## Per-Classifier Details")
    lines.append("")

    for name, res in sorted(results.items()):
        if "error" in res:
            lines.append(f"### {name}")
            lines.append(f"**Error:** {res['error']}")
            lines.append("")
            continue

        lines.append(f"### {name}")
        lines.append(f"**Test set size:** {res['num_test']}")
        lines.append(f"**Accuracy:** {res['accuracy']:.4f}")
        lines.append("")
        lines.append("**Classification Report:**")
        lines.append("```")
        lines.append(res["classification_report_text"])
        lines.append("```")
        lines.append("")

        # Confusion matrix
        cm = res["confusion_matrix"]
        cm_labels = res["confusion_labels"]
        lines.append("**Confusion Matrix:**")
        lines.append("```")
        header = "         " + "  ".join(f"{l[:8]:>8}" for l in cm_labels)
        lines.append(header)
        for i, row in enumerate(cm):
            row_str = f"{cm_labels[i][:8]:>8} " + "  ".join(f"{v:>8}" for v in row)
            lines.append(row_str)
        lines.append("```")
        lines.append("")

        # Low-confidence examples
        if res["low_confidence_examples"]:
            lines.append(
                f"**Low-confidence examples** ({res['low_confidence_count']} total, showing up to 10):"
            )
            lines.append("")
            for ex in res["low_confidence_examples"]:
                lines.append(
                    f"- `{ex['text'][:80]}` "
                    f"(true: {ex['true_label']}, pred: {ex['predicted_label']}, "
                    f"conf: {ex['confidence']:.3f})"
                )
            lines.append("")

        # Expert exam details
        if exam_results and name in exam_results:
            eres = exam_results[name]
            if "error" not in eres:
                lines.append(f"**Expert Exam Results:**")
                lines.append(f"- Examples: {eres['num_examples']}")
                lines.append(f"- Accuracy: {eres['accuracy']:.4f}")
                lines.append("")
                lines.append("```")
                lines.append(eres["classification_report_text"])
                lines.append("```")
                lines.append("")
                if eres.get("difficulty_breakdown"):
                    lines.append("**By Difficulty:**")
                    lines.append("")
                    lines.append("| Difficulty | Accuracy | Count |")
                    lines.append("|-----------|----------|-------|")
                    for diff, dres in sorted(eres["difficulty_breakdown"].items()):
                        lines.append(
                            f"| {diff} | {dres['accuracy']:.4f} | {dres['total']} |"
                        )
                    lines.append("")

        lines.append("---")
        lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Benchmark ONNX classifiers and optionally generate cloud expert exams",
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
        "--expert-exam",
        action="store_true",
        help="Generate and score a cloud expert exam test set",
    )
    parser.add_argument(
        "--model",
        choices=["haiku", "sonnet"],
        default="haiku",
        help="Claude model for expert exam generation (default: haiku)",
    )
    parser.add_argument(
        "--exam-count",
        type=int,
        default=50,
        help="Examples per class for expert exam (default: 50)",
    )
    args = parser.parse_args()

    # Determine classifiers to benchmark
    if args.classifier == "all":
        classifier_names = list(CLASSIFIER_REGISTRY.keys())
    else:
        # Validate
        get_classifier(args.classifier)
        classifier_names = [args.classifier]

    print(f"Benchmarking {len(classifier_names)} classifier(s)", flush=True)
    print(f"Classifiers: {', '.join(classifier_names)}", flush=True)

    if args.expert_exam:
        import os

        if not os.environ.get("ANTHROPIC_API_KEY"):
            print(
                "\nERROR: ANTHROPIC_API_KEY not found. Set it in .env.local",
                file=sys.stderr,
            )
            sys.exit(1)
        print(f"Expert exam: ON (model={args.model}, count={args.exam_count})", flush=True)

    # Timestamp for report filenames
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

    # Run benchmarks
    results: dict[str, dict] = {}
    for name in classifier_names:
        try:
            results[name] = benchmark_classifier(name)
        except Exception as e:
            print(f"\nERROR benchmarking {name}: {e}", flush=True)
            results[name] = {"error": str(e)}

    # Expert exam (if requested)
    exam_results: dict[str, dict] | None = None
    if args.expert_exam:
        exam_results = {}
        for name in classifier_names:
            try:
                exam_examples = generate_expert_exam(
                    name,
                    model_key=args.model,
                    exam_count=args.exam_count,
                )
                exam_results[name] = score_expert_exam(name, exam_examples)
            except Exception as e:
                print(f"\nERROR generating expert exam for {name}: {e}", flush=True)
                exam_results[name] = {"error": str(e)}

    # Generate reports
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    md_report = generate_markdown_report(results, exam_results, timestamp)
    md_path = REPORTS_DIR / f"benchmark_{timestamp}.md"
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_report)

    # JSON results (machine-readable)
    json_results = {
        "timestamp": timestamp,
        "classifiers": results,
    }
    if exam_results:
        json_results["expert_exam"] = exam_results

    # Remove non-serializable items from results
    def make_serializable(obj):
        if isinstance(obj, dict):
            return {k: make_serializable(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [make_serializable(v) for v in obj]
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, (np.floating,)):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return obj

    json_path = REPORTS_DIR / f"benchmark_{timestamp}.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(make_serializable(json_results), f, indent=2, ensure_ascii=False)

    print(f"\n{'='*60}", flush=True)
    print(f"BENCHMARK COMPLETE", flush=True)
    print(f"{'='*60}", flush=True)
    print(f"Markdown report: {md_path}", flush=True)
    print(f"JSON results:    {json_path}", flush=True)

    # Print summary
    print(f"\nSummary:", flush=True)
    print(f"{'Classifier':<22} {'Accuracy':>8} {'Weakest':>16} {'Weakest F1':>10}", flush=True)
    print("-" * 60, flush=True)
    for name, res in sorted(results.items()):
        if "error" in res:
            print(f"{name:<22} {'ERROR':>8}", flush=True)
        else:
            print(
                f"{name:<22} {res['accuracy']:>8.4f} {res['weakest_class']:>16} {res['weakest_f1']:>10.4f}",
                flush=True,
            )


if __name__ == "__main__":
    main()
