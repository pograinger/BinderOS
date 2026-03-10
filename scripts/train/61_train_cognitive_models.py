"""
61_train_cognitive_models.py -- Train cognitive dimension classifiers and export to ONNX.

Self-contained: loads JSONL data, embeds via sentence-transformers MiniLM,
trains MLP with Platt calibration, exports ONNX, generates validation artifacts.

Follows the exact same pattern as 21_train_gtd_classifier.py but for the
10 cognitive dimension models defined in signal_protocol.py.

Usage:
    python -u 61_train_cognitive_models.py --model priority-matrix
    python -u 61_train_cognitive_models.py --model all
    python -u 61_train_cognitive_models.py --model all --skip-existing

Note: Use -u flag to avoid Python output buffering issues.

Output per model:
    public/models/classifiers/{model-id}.onnx
    public/models/classifiers/{model-id}-classes.json
    scripts/train/cognitive_{safe_name}_test_embeddings.json
    scripts/train/cognitive_{safe_name}_python_predictions.json
    scripts/train/cognitive_{safe_name}_python_probabilities.json
"""

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

from signal_protocol import COGNITIVE_MODELS, get_all_model_ids, get_model

# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).parent.resolve()
REPO_ROOT = SCRIPT_DIR.parent.parent
TRAINING_DATA_DIR = REPO_ROOT / "scripts" / "training-data"
CLASSIFIER_DIR = REPO_ROOT / "public" / "models" / "classifiers"


def load_data(model_id: str) -> tuple[list[str], list[str]]:
    """Load text and labels from JSONL training data."""
    input_path = TRAINING_DATA_DIR / f"{model_id}.jsonl"

    if not input_path.exists():
        print(f"ERROR: Training data not found at {input_path}")
        print(f"Run: python -u scripts/train/60_generate_cognitive_data.py --model {model_id}")
        sys.exit(1)

    texts = []
    labels = []
    with open(input_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            texts.append(obj["text"])
            labels.append(obj["label"])

    print(f"\n=== Loading Data ===")
    print(f"Input: {input_path}")
    print(f"Total samples: {len(texts)}")

    # Label distribution
    label_counts: dict[str, int] = {}
    for lbl in labels:
        label_counts[lbl] = label_counts.get(lbl, 0) + 1
    print(f"Labels ({len(label_counts)}):")
    for lbl, count in sorted(label_counts.items()):
        print(f"  {lbl}: {count} ({count / len(texts) * 100:.1f}%)")

    return texts, labels


def embed_texts(texts: list[str]) -> np.ndarray:
    """Embed all texts using sentence-transformers MiniLM (384-dim, normalized)."""
    from sentence_transformers import SentenceTransformer

    print(f"\n=== Embedding {len(texts)} texts ===")
    model = SentenceTransformer("all-MiniLM-L6-v2")
    # normalize_embeddings=True for browser parity with Xenova/all-MiniLM-L6-v2
    embeddings = model.encode(texts, normalize_embeddings=True, show_progress_bar=True)
    embeddings = np.array(embeddings, dtype=np.float32)
    print(f"Embeddings shape: {embeddings.shape}")
    return embeddings


def encode_labels(labels: list[str]) -> tuple[np.ndarray, dict[int, str]]:
    """Convert string labels to integer indices and return mapping."""
    unique_labels = sorted(set(labels))
    label_to_idx = {lbl: idx for idx, lbl in enumerate(unique_labels)}
    idx_to_label = {idx: lbl for lbl, idx in label_to_idx.items()}

    y = np.array([label_to_idx[lbl] for lbl in labels])
    return y, idx_to_label


def train_model(
    X_train: np.ndarray,
    y_train: np.ndarray,
    hidden_layers: tuple,
    model_id: str,
):
    """Train MLP + Platt calibration."""
    from sklearn.calibration import CalibratedClassifierCV
    from sklearn.neural_network import MLPClassifier

    print(f"\n=== Training {model_id} ===")
    print(f"Architecture: MLP{hidden_layers} + Platt calibration (sigmoid, cv=5)")

    base_clf = MLPClassifier(
        hidden_layer_sizes=hidden_layers,
        activation="relu",
        max_iter=500,
        random_state=42,
        early_stopping=True,
        validation_fraction=0.1,
        verbose=True,
    )
    base_clf.fit(X_train, y_train)
    print(f"Converged after {base_clf.n_iter_} iterations")

    print("\nApplying Platt calibration (CalibratedClassifierCV, sigmoid, cv=5)...")
    calibrated_clf = CalibratedClassifierCV(
        estimator=base_clf, method="sigmoid", cv=5
    )
    calibrated_clf.fit(X_train, y_train)
    print("Calibration complete.")
    return calibrated_clf


def evaluate_model(
    clf,
    X_test: np.ndarray,
    y_test: np.ndarray,
    idx_to_label: dict[int, str],
    confidence_threshold: float,
) -> tuple[np.ndarray, np.ndarray, float]:
    """Evaluate model on test set."""
    from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

    class_names = [idx_to_label[i] for i in range(len(idx_to_label))]

    print(f"\n=== Evaluation ===")
    y_pred = clf.predict(X_test)
    y_proba = clf.predict_proba(X_test)

    report = classification_report(y_test, y_pred, target_names=class_names)
    print(report)

    print("Confusion matrix (rows=actual, cols=predicted):")
    print(f"Classes: {class_names}")
    cm = confusion_matrix(y_test, y_pred)
    print(cm)

    overall_acc = accuracy_score(y_test, y_pred) * 100

    # Calibration stats at threshold
    max_proba = y_proba.max(axis=1)
    above = max_proba >= confidence_threshold
    pct_above = above.mean() * 100
    acc_above = (
        (y_pred[above] == y_test[above]).mean() * 100
        if above.sum() > 0
        else 0.0
    )
    print(
        f"\nCalibration at confidence >= {confidence_threshold}: "
        f"{pct_above:.1f}% of predictions, accuracy={acc_above:.1f}%"
    )

    return y_pred, y_proba, overall_acc


def export_onnx(clf, idx_to_label: dict[int, str], model_id: str) -> Path:
    """Export calibrated classifier to ONNX with opset=17 and zipmap=False."""
    import onnx
    from skl2onnx import convert_sklearn
    from skl2onnx.common.data_types import FloatTensorType

    onnx_path = CLASSIFIER_DIR / f"{model_id}.onnx"
    classes_path = CLASSIFIER_DIR / f"{model_id}-classes.json"

    CLASSIFIER_DIR.mkdir(parents=True, exist_ok=True)

    print(f"\n=== ONNX Export ===")
    initial_types = [("float_input", FloatTensorType([None, 384]))]
    print(f"Converting with opset=17, zipmap=False...")

    onnx_model = convert_sklearn(
        clf,
        initial_types=initial_types,
        target_opset=17,
        options={"zipmap": False},
    )

    print("Validating ONNX model graph...")
    onnx.checker.check_model(onnx_model)
    print("ONNX graph check passed.")

    with open(onnx_path, "wb") as f:
        f.write(onnx_model.SerializeToString())
    size_kb = onnx_path.stat().st_size / 1024
    print(f"Saved: {onnx_path}  ({size_kb:.1f} KB)")

    # Write class mapping JSON
    classes_json = {str(k): v for k, v in idx_to_label.items()}
    with open(classes_path, "w") as f:
        json.dump(classes_json, f, indent=2)
    print(f"Saved: {classes_path}")

    return onnx_path


def generate_validation_artifacts(
    X_test: np.ndarray,
    model_id: str,
    onnx_path: Path,
) -> None:
    """Generate JSON artifacts for cross-validation."""
    import onnxruntime as ort

    safe_name = model_id.replace("-", "_")
    test_emb_path = SCRIPT_DIR / f"cognitive_{safe_name}_test_embeddings.json"
    pred_path = SCRIPT_DIR / f"cognitive_{safe_name}_python_predictions.json"
    proba_path = SCRIPT_DIR / f"cognitive_{safe_name}_python_probabilities.json"

    print(f"\n=== Generating Validation Artifacts ===")

    # Save test embeddings
    test_emb_list = X_test.tolist()
    with open(test_emb_path, "w") as f:
        json.dump(test_emb_list, f)
    print(f"Saved: {test_emb_path}  ({len(test_emb_list)} samples)")

    # Run ONNX inference with Python onnxruntime
    sess = ort.InferenceSession(str(onnx_path))
    input_name = sess.get_inputs()[0].name
    output_names = [o.name for o in sess.get_outputs()]
    print(f"  onnxruntime input name:   {input_name}")
    print(f"  onnxruntime output names: {output_names}")

    outputs = sess.run(None, {input_name: X_test})

    # Locate probability output
    proba_idx = None
    for i, name in enumerate(output_names):
        if "prob" in name.lower():
            proba_idx = i
    if proba_idx is None:
        proba_idx = 1 if len(outputs) > 1 else 0

    ort_probas = outputs[proba_idx]
    top1_preds = ort_probas.argmax(axis=1).tolist()
    proba_list = ort_probas.tolist()

    with open(pred_path, "w") as f:
        json.dump(top1_preds, f)
    print(f"Saved: {pred_path}  ({len(top1_preds)} predictions)")

    with open(proba_path, "w") as f:
        json.dump(proba_list, f)
    print(f"Saved: {proba_path}  ({len(proba_list)} probability arrays)")


def train_single_model(model_id: str) -> dict:
    """Train a single cognitive model end-to-end. Returns summary dict."""
    model_info = get_model(model_id)
    start_time = time.time()

    print(f"\n{'=' * 60}")
    print(f"TRAINING: {model_id}")
    print(f"Dimension: {model_info['dimension']}")
    print(f"Signal type: {model_info['signal_type']}")
    print(f"Labels: {model_info['labels']}")
    print(f"Architecture: MLP{model_info['hidden_layers']}")
    print(f"Confidence threshold: {model_info['confidence_threshold']}")
    print(f"{'=' * 60}")

    # Load data
    texts, labels = load_data(model_id)

    # Embed
    X = embed_texts(texts)

    # Encode labels
    y, idx_to_label = encode_labels(labels)
    print(f"Label mapping: {idx_to_label}")

    # Split
    from sklearn.model_selection import train_test_split

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    print(f"\nTrain: {len(X_train)}, Test: {len(X_test)}")

    # Train
    clf = train_model(X_train, y_train, model_info["hidden_layers"], model_id)

    # Evaluate
    y_pred, y_proba, overall_acc = evaluate_model(
        clf, X_test, y_test, idx_to_label, model_info["confidence_threshold"]
    )

    # Export ONNX
    onnx_path = export_onnx(clf, idx_to_label, model_id)

    # Validation artifacts
    generate_validation_artifacts(X_test, model_id, onnx_path)

    elapsed = time.time() - start_time
    onnx_size_kb = onnx_path.stat().st_size / 1024

    summary = {
        "model_id": model_id,
        "dimension": model_info["dimension"],
        "labels": model_info["labels"],
        "accuracy": overall_acc,
        "onnx_size_kb": onnx_size_kb,
        "elapsed_seconds": elapsed,
        "train_samples": len(X_train),
        "test_samples": len(X_test),
    }

    print(f"\n{'=' * 60}")
    print(f"COMPLETE: {model_id}")
    print(f"Accuracy: {overall_acc:.1f}%")
    print(f"ONNX size: {onnx_size_kb:.1f} KB")
    print(f"Time: {elapsed:.1f}s")
    print(f"{'=' * 60}")

    return summary


def main() -> None:
    all_model_ids = get_all_model_ids()

    parser = argparse.ArgumentParser(
        description="Train cognitive dimension classifiers and export to ONNX",
    )
    parser.add_argument(
        "--model",
        choices=all_model_ids + ["all"],
        required=True,
        help="Which cognitive model to train (or 'all')",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip models that already have an ONNX file",
    )
    args = parser.parse_args()

    models_to_train = all_model_ids if args.model == "all" else [args.model]

    if args.skip_existing:
        filtered = []
        for mid in models_to_train:
            onnx_path = CLASSIFIER_DIR / f"{mid}.onnx"
            if onnx_path.exists():
                print(f"SKIP: {mid} (ONNX already exists at {onnx_path})")
            else:
                filtered.append(mid)
        models_to_train = filtered

    if not models_to_train:
        print("Nothing to train -- all models already exist.")
        return

    total_start = time.time()
    summaries = []

    for model_id in models_to_train:
        summary = train_single_model(model_id)
        summaries.append(summary)

    # Final summary table
    if len(summaries) > 1:
        total_elapsed = time.time() - total_start
        print(f"\n{'=' * 80}")
        print(f"COGNITIVE MODEL ARMY -- TRAINING COMPLETE")
        print(f"{'=' * 80}")
        print(f"{'Model':<25} {'Dimension':<15} {'Accuracy':>8} {'Size':>8} {'Time':>8}")
        print(f"{'-' * 25} {'-' * 15} {'-' * 8} {'-' * 8} {'-' * 8}")
        for s in summaries:
            print(
                f"{s['model_id']:<25} {s['dimension']:<15} "
                f"{s['accuracy']:>7.1f}% {s['onnx_size_kb']:>6.1f}KB "
                f"{s['elapsed_seconds']:>6.1f}s"
            )
        print(f"{'-' * 25} {'-' * 15} {'-' * 8} {'-' * 8} {'-' * 8}")
        avg_acc = sum(s["accuracy"] for s in summaries) / len(summaries)
        total_size = sum(s["onnx_size_kb"] for s in summaries)
        print(
            f"{'TOTAL':<25} {'':<15} "
            f"{avg_acc:>7.1f}% {total_size:>6.1f}KB "
            f"{total_elapsed:>6.1f}s"
        )
        print(f"\nModels trained: {len(summaries)}")
        print(f"Total ONNX size: {total_size:.1f} KB ({total_size / 1024:.2f} MB)")
        print(f"Total time: {total_elapsed:.1f}s ({total_elapsed / 60:.1f} min)")

        # Save summary report
        report_path = SCRIPT_DIR / "reports" / f"cognitive_training_report.json"
        report_path.parent.mkdir(parents=True, exist_ok=True)
        with open(report_path, "w") as f:
            json.dump(
                {
                    "models": summaries,
                    "total_elapsed_seconds": total_elapsed,
                    "average_accuracy": avg_acc,
                    "total_onnx_size_kb": total_size,
                },
                f,
                indent=2,
            )
        print(f"\nReport saved: {report_path}")

        print(f"\nNext steps:")
        print(f"  1. Review accuracy per model -- retrain weak ones with more data")
        print(f"  2. Run: python -u 62_signal_compositor.py --validate")
        print(f"  3. Copy ONNX files to public/models/classifiers/ (already done)")
        print(f"  4. Wire into embedding-worker.ts and tier2-handler.ts")
        print(f"{'=' * 80}")


if __name__ == "__main__":
    main()
