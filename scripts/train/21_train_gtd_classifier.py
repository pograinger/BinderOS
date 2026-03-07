"""
21_train_gtd_classifier.py -- Train GTD classifier and export to ONNX.

Self-contained: loads JSONL data, embeds via sentence-transformers MiniLM,
trains MLP with Platt calibration, exports ONNX, generates validation artifacts.

Usage:
    python -u scripts/train/21_train_gtd_classifier.py --classifier gtd-routing
    python -u scripts/train/21_train_gtd_classifier.py --classifier actionability
    python -u scripts/train/21_train_gtd_classifier.py --classifier project-detection
    python -u scripts/train/21_train_gtd_classifier.py --classifier context-tagging

Note: Use -u flag to avoid Python output buffering issues.

Output per classifier:
    public/models/classifiers/{name}.onnx
    public/models/classifiers/{name}-classes.json
    scripts/train/gtd_{name}_test_embeddings.json
    scripts/train/gtd_{name}_python_predictions.json
    scripts/train/gtd_{name}_python_probabilities.json
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np

# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).parent.resolve()
REPO_ROOT = SCRIPT_DIR.parent.parent
TRAINING_DATA_DIR = REPO_ROOT / "scripts" / "training-data"
CLASSIFIER_DIR = REPO_ROOT / "public" / "models" / "classifiers"

# ---------------------------------------------------------------------------
# Per-classifier config (from CONTEXT.md locked decisions)
# ---------------------------------------------------------------------------
CLASSIFIER_CONFIGS = {
    "gtd-routing": {
        "hidden_layers": (256, 128),
        "confidence_threshold": 0.70,
        "input_file": "gtd-routing.jsonl",
        "output_model": "gtd-routing.onnx",
        "output_classes": "gtd-routing-classes.json",
    },
    "actionability": {
        "hidden_layers": (128, 64),
        "confidence_threshold": 0.80,
        "input_file": "actionability.jsonl",
        "output_model": "actionability.onnx",
        "output_classes": "actionability-classes.json",
    },
    "project-detection": {
        "hidden_layers": (128, 64),
        "confidence_threshold": 0.75,
        "input_file": "project-detection.jsonl",
        "output_model": "project-detection.onnx",
        "output_classes": "project-detection-classes.json",
    },
    "context-tagging": {
        "hidden_layers": (256, 128),
        "confidence_threshold": 0.65,
        "input_file": "context-tagging.jsonl",
        "output_model": "context-tagging.onnx",
        "output_classes": "context-tagging-classes.json",
    },
}


def load_data(classifier_name: str) -> tuple[list[str], list[str]]:
    """Load text and labels from JSONL training data."""
    config = CLASSIFIER_CONFIGS[classifier_name]
    input_path = TRAINING_DATA_DIR / config["input_file"]

    if not input_path.exists():
        print(f"ERROR: Training data not found at {input_path}")
        print(f"Run: python -u scripts/train/20_generate_gtd_data.py --classifier {classifier_name}")
        sys.exit(1)

    texts = []
    labels = []
    with open(input_path, "r", encoding="utf-8") as f:
        for line in f:
            obj = json.loads(line.strip())
            texts.append(obj["text"])
            labels.append(obj["label"])

    print(f"\n=== Loading Data ===")
    print(f"Input: {input_path}")
    print(f"Total samples: {len(texts)}")

    # Label distribution
    label_counts = {}
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
    # normalize_embeddings=True for browser parity (RESEARCH.md Pitfall 4)
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
    classifier_name: str,
):
    """Train MLP + Platt calibration."""
    from sklearn.calibration import CalibratedClassifierCV
    from sklearn.neural_network import MLPClassifier

    print(f"\n=== Training {classifier_name} ===")
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
    """Evaluate model on test set, return predictions, probabilities, and accuracy."""
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


def export_onnx(clf, idx_to_label: dict[int, str], classifier_name: str) -> Path:
    """Export calibrated classifier to ONNX with opset=17 and zipmap=False."""
    import onnx
    from skl2onnx import convert_sklearn
    from skl2onnx.common.data_types import FloatTensorType

    config = CLASSIFIER_CONFIGS[classifier_name]
    onnx_path = CLASSIFIER_DIR / config["output_model"]
    classes_path = CLASSIFIER_DIR / config["output_classes"]

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
    classifier_name: str,
    onnx_path: Path,
) -> None:
    """Generate JSON artifacts for 22_validate_gtd_models.mjs."""
    import onnxruntime as ort

    safe_name = classifier_name.replace("-", "_")
    test_emb_path = SCRIPT_DIR / f"gtd_{safe_name}_test_embeddings.json"
    pred_path = SCRIPT_DIR / f"gtd_{safe_name}_python_predictions.json"
    proba_path = SCRIPT_DIR / f"gtd_{safe_name}_python_probabilities.json"

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


def print_summary(
    classifier_name: str,
    overall_acc: float,
    confidence_threshold: float,
    idx_to_label: dict[int, str],
) -> None:
    """Print final summary."""
    config = CLASSIFIER_CONFIGS[classifier_name]
    onnx_path = CLASSIFIER_DIR / config["output_model"]
    onnx_size_kb = onnx_path.stat().st_size / 1024 if onnx_path.exists() else 0

    class_names = [idx_to_label[i] for i in range(len(idx_to_label))]

    print("\n" + "=" * 60)
    print(f"TRAINING COMPLETE -- {classifier_name}")
    print("=" * 60)
    print(f"Architecture: MLP{config['hidden_layers']} + Platt calibration")
    print(f"Classes:      {class_names}")
    print(f"Test accuracy: {overall_acc:.1f}%")
    print(f"Confidence threshold: {confidence_threshold}")
    print(f"ONNX file:    {onnx_path}  ({onnx_size_kb:.1f} KB)")
    print(f"\nNext step: node scripts/train/22_validate_gtd_models.mjs --classifier {classifier_name}")
    print("=" * 60)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Train GTD classifier and export to ONNX",
    )
    parser.add_argument(
        "--classifier",
        choices=list(CLASSIFIER_CONFIGS.keys()),
        required=True,
        help="Which classifier to train",
    )
    args = parser.parse_args()

    config = CLASSIFIER_CONFIGS[args.classifier]

    # Load data
    texts, labels = load_data(args.classifier)

    # Embed
    X = embed_texts(texts)

    # Encode labels
    y, idx_to_label = encode_labels(labels)
    class_names = [idx_to_label[i] for i in range(len(idx_to_label))]
    print(f"Label mapping: {idx_to_label}")

    # Split
    from sklearn.model_selection import train_test_split

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    print(f"\nTrain: {len(X_train)}, Test: {len(X_test)}")

    # Train
    clf = train_model(X_train, y_train, config["hidden_layers"], args.classifier)

    # Evaluate
    y_pred, y_proba, overall_acc = evaluate_model(
        clf, X_test, y_test, idx_to_label, config["confidence_threshold"]
    )

    # Export ONNX
    onnx_path = export_onnx(clf, idx_to_label, args.classifier)

    # Validation artifacts
    generate_validation_artifacts(X_test, args.classifier, onnx_path)

    # Summary
    print_summary(args.classifier, overall_acc, config["confidence_threshold"], idx_to_label)


if __name__ == "__main__":
    main()
