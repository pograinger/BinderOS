#!/usr/bin/env python3
"""
03_train_classifier.py — Train GTD type classifier and export to ONNX.

Pipeline position: After 02_embed_data.py (embeddings_cache.npy must exist).
Output:
  - public/models/classifiers/triage-type.onnx   (calibrated MLP, opset=17)
  - public/models/classifiers/triage-type-classes.json   (class index -> label)
  - scripts/train/test_embeddings.json            (for 04_validate_model.mjs)
  - scripts/train/python_predictions.json         (for 04_validate_model.mjs)
  - scripts/train/python_probabilities.json       (for 04_validate_model.mjs)

Usage:
  python scripts/train/03_train_classifier.py

Requirements:
  pip install -r scripts/train/requirements.txt
"""

import json
import os
import sys
from pathlib import Path

import numpy as np

# ---------------------------------------------------------------------------
# Path setup — script runs from repo root or scripts/train/
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).parent.resolve()
REPO_ROOT = SCRIPT_DIR.parent.parent

EMBEDDINGS_PATH = SCRIPT_DIR / "embeddings_cache.npy"
LABELS_PATH = SCRIPT_DIR / "labels_cache.npy"
LABEL_MAP_PATH = SCRIPT_DIR / "label_map.json"

CLASSIFIER_DIR = REPO_ROOT / "public" / "models" / "classifiers"
ONNX_PATH = CLASSIFIER_DIR / "triage-type.onnx"
CLASSES_JSON_PATH = CLASSIFIER_DIR / "triage-type-classes.json"

TEST_EMBEDDINGS_PATH = SCRIPT_DIR / "test_embeddings.json"
PYTHON_PREDICTIONS_PATH = SCRIPT_DIR / "python_predictions.json"
PYTHON_PROBABILITIES_PATH = SCRIPT_DIR / "python_probabilities.json"

CONFIDENCE_THRESHOLD = 0.78  # STATE.md locked decision
DECISION_INSIGHT_MIN_F1 = 0.65  # STATE.md concern threshold


def check_prerequisites() -> None:
    """Verify Plan 01/02 output files exist before proceeding."""
    missing = []
    for p in [EMBEDDINGS_PATH, LABELS_PATH, LABEL_MAP_PATH]:
        if not p.exists():
            missing.append(str(p))
    if missing:
        print("ERROR: Missing prerequisite files from Plan 01/02:")
        for m in missing:
            print(f"  {m}")
        print("\nRun scripts in order:")
        print("  1. python scripts/train/01_generate_data.py")
        print("  2. python scripts/train/02_embed_data.py")
        print("  3. python scripts/train/03_train_classifier.py")
        sys.exit(1)


def load_data() -> tuple[np.ndarray, np.ndarray, dict]:
    """Load embedding cache and label map from Plan 01/02 output."""
    print("\n=== Loading Data ===")
    X = np.load(EMBEDDINGS_PATH).astype(np.float32)
    y = np.load(LABELS_PATH)
    with open(LABEL_MAP_PATH) as f:
        label_map = json.load(f)  # {"0": "decision", "1": "event", ...}

    class_names = [label_map[str(i)] for i in range(len(label_map))]

    print(f"Embeddings shape: {X.shape}  (expected (N, 384))")
    print(f"Labels shape:     {y.shape}")
    print(f"Classes ({len(class_names)}): {class_names}")
    print("\nSamples per class:")
    for i, name in enumerate(class_names):
        count = int(np.sum(y == i))
        print(f"  [{i}] {name}: {count}")
    print(f"Total: {len(X)}")

    return X, y, label_map


def split_data(
    X: np.ndarray, y: np.ndarray
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Stratified train/test split for reproducibility."""
    from sklearn.model_selection import train_test_split

    print("\n=== Train/Test Split ===")
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    print(f"Training set: {len(X_train)} samples")
    print(f"Test set:     {len(X_test)} samples")
    return X_train, X_test, y_train, y_test


def train_model(X_train: np.ndarray, y_train: np.ndarray):
    """Train base MLP then wrap with Platt calibration (CONF-01)."""
    from sklearn.calibration import CalibratedClassifierCV
    from sklearn.neural_network import MLPClassifier

    print("\n=== Training Base Classifier ===")
    base_clf = MLPClassifier(
        hidden_layer_sizes=(256, 128),
        activation="relu",
        max_iter=500,
        random_state=42,
        early_stopping=True,
        validation_fraction=0.1,
        verbose=True,
    )
    print("Fitting MLPClassifier (256, 128) with early stopping...")
    base_clf.fit(X_train, y_train)
    print(f"Converged after {base_clf.n_iter_} iterations")

    print("\n=== Applying Platt Calibration (CONF-01) ===")
    print("Wrapping MLP with CalibratedClassifierCV(method='sigmoid', cv=5)...")
    print("This maps raw MLP outputs to calibrated probabilities.")
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
    class_names: list[str],
) -> tuple[np.ndarray, np.ndarray]:
    """Evaluate model on test set with full classification report."""
    from sklearn.metrics import classification_report, confusion_matrix

    print("\n=== Evaluation ===")
    y_pred = clf.predict(X_test)
    y_proba = clf.predict_proba(X_test)

    report = classification_report(y_test, y_pred, target_names=class_names)
    print(report)

    print("Confusion matrix (rows=actual, cols=predicted):")
    print("Classes:", class_names)
    cm = confusion_matrix(y_test, y_pred)
    print(cm)

    # --- STATE.md concern: decision/insight boundary check ---
    report_dict = classification_report(
        y_test, y_pred, target_names=class_names, output_dict=True
    )
    for label in ["decision", "insight"]:
        if label in report_dict:
            f1 = report_dict[label]["f1-score"]
            if f1 < DECISION_INSIGHT_MIN_F1:
                print(
                    f"\n*** WARNING: {label} F1={f1:.3f} is below {DECISION_INSIGHT_MIN_F1}. "
                    f"Consider collapsing decision/insight to a single class per STATE.md. ***"
                )

    # --- Calibration analysis at 0.78 threshold ---
    max_proba = y_proba.max(axis=1)
    above_threshold = max_proba >= CONFIDENCE_THRESHOLD
    pct_above = above_threshold.mean() * 100
    if above_threshold.sum() > 0:
        acc_above = (y_pred[above_threshold] == y_test[above_threshold]).mean() * 100
    else:
        acc_above = 0.0
    print(
        f"\nCalibration at confidence >= {CONFIDENCE_THRESHOLD}: "
        f"{pct_above:.1f}% of predictions, accuracy={acc_above:.1f}%"
    )
    if acc_above < 85.0 and above_threshold.sum() > 0:
        print(
            f"  WARNING: Target accuracy at threshold is 85%. "
            f"Current {acc_above:.1f}% suggests threshold adjustment may be needed."
        )

    return y_pred, y_proba


def export_onnx(clf, label_map: dict) -> None:
    """Export calibrated classifier to ONNX with opset=17 and zipmap=False."""
    import onnx
    from skl2onnx import convert_sklearn
    from skl2onnx.common.data_types import FloatTensorType

    print("\n=== ONNX Export ===")
    CLASSIFIER_DIR.mkdir(parents=True, exist_ok=True)

    initial_types = [("float_input", FloatTensorType([None, 384]))]
    print(f"Converting with opset=17, zipmap=False...")
    onnx_model = convert_sklearn(
        clf,
        initial_types=initial_types,
        target_opset=17,          # WASM-compatible — DO NOT increase (RESEARCH.md pitfall 4)
        options={"zipmap": False},  # Plain float32 array — DO NOT remove (RESEARCH.md pitfall 2)
    )

    print("Validating ONNX model graph...")
    onnx.checker.check_model(onnx_model)
    print("ONNX graph check passed.")

    with open(ONNX_PATH, "wb") as f:
        f.write(onnx_model.SerializeToString())
    size_kb = ONNX_PATH.stat().st_size / 1024
    print(f"Saved: {ONNX_PATH}  ({size_kb:.1f} KB)")

    # --- Write class mapping JSON ---
    # Ensure sorted integer order so browser can rely on numeric index
    classes_json = {str(k): v for k, v in label_map.items()}
    with open(CLASSES_JSON_PATH, "w") as f:
        json.dump(classes_json, f, indent=2)
    print(f"Saved: {CLASSES_JSON_PATH}")


def generate_validation_artifacts(
    clf,
    X_test: np.ndarray,
    y_test: np.ndarray,
) -> None:
    """
    Generate JSON artifacts for 04_validate_model.mjs.

    Runs Python onnxruntime inference on the exported ONNX model and saves:
    - test_embeddings.json    — list of 384-dim float arrays
    - python_predictions.json — top-1 class index per sample
    - python_probabilities.json — 5-element probability array per sample
    """
    import onnxruntime as ort

    print("\n=== Generating Validation Artifacts ===")

    # Save test embeddings as JSON (float32 -> Python float for JSON serialization)
    test_emb_list = X_test.tolist()
    with open(TEST_EMBEDDINGS_PATH, "w") as f:
        json.dump(test_emb_list, f)
    print(f"Saved: {TEST_EMBEDDINGS_PATH}  ({len(test_emb_list)} samples)")

    # Load ONNX model with Python onnxruntime for reference predictions
    sess = ort.InferenceSession(str(ONNX_PATH))
    input_name = sess.get_inputs()[0].name
    output_names = [o.name for o in sess.get_outputs()]
    print(f"  onnxruntime input name:   {input_name}")
    print(f"  onnxruntime output names: {output_names}")

    # Run inference on test set (batch)
    outputs = sess.run(None, {input_name: X_test})

    # Locate probability output — typically index 1 named 'output_probability'
    # CalibratedClassifierCV with zipmap=False produces [label_array, proba_array]
    proba_idx = None
    label_idx = None
    for i, name in enumerate(output_names):
        if "prob" in name.lower():
            proba_idx = i
        elif "label" in name.lower():
            label_idx = i

    # Fallback: label at 0, probability at 1 (standard skl2onnx convention)
    if proba_idx is None:
        proba_idx = 1 if len(outputs) > 1 else 0
    if label_idx is None:
        label_idx = 0

    ort_labels = outputs[label_idx]  # int64 array
    ort_probas = outputs[proba_idx]  # float32 (N, 5)

    # Derive top-1 predictions from probabilities (argmax) to be consistent with Node.js
    top1_preds = ort_probas.argmax(axis=1).tolist()
    proba_list = ort_probas.tolist()

    with open(PYTHON_PREDICTIONS_PATH, "w") as f:
        json.dump(top1_preds, f)
    print(f"Saved: {PYTHON_PREDICTIONS_PATH}  ({len(top1_preds)} predictions)")

    with open(PYTHON_PROBABILITIES_PATH, "w") as f:
        json.dump(proba_list, f)
    print(f"Saved: {PYTHON_PROBABILITIES_PATH}  ({len(proba_list)} probability arrays)")


def print_summary(
    clf,
    X_test: np.ndarray,
    y_test: np.ndarray,
    y_pred: np.ndarray,
    y_proba: np.ndarray,
    class_names: list[str],
) -> None:
    """Print final human-readable summary of the training run."""
    from sklearn.metrics import accuracy_score

    overall_acc = accuracy_score(y_test, y_pred) * 100
    max_proba = y_proba.max(axis=1)
    above_threshold = max_proba >= CONFIDENCE_THRESHOLD
    pct_above = above_threshold.mean() * 100
    acc_above = (
        (y_pred[above_threshold] == y_test[above_threshold]).mean() * 100
        if above_threshold.sum() > 0
        else 0.0
    )
    onnx_size_kb = ONNX_PATH.stat().st_size / 1024 if ONNX_PATH.exists() else 0

    print("\n" + "=" * 60)
    print("TRAINING COMPLETE — SUMMARY")
    print("=" * 60)
    print(f"Model architecture: MLP (256, 128) + Platt calibration (sigmoid, cv=5)")
    print(f"Classes:            {class_names}")
    print(f"Test accuracy:      {overall_acc:.1f}%")
    print(f"Calibration ({CONFIDENCE_THRESHOLD}+):  {pct_above:.1f}% of predictions, accuracy={acc_above:.1f}%")
    print(f"ONNX file:          {ONNX_PATH}  ({onnx_size_kb:.1f} KB)")
    print(f"Class mapping:      {CLASSES_JSON_PATH}")
    print(f"Test artifacts:     {TEST_EMBEDDINGS_PATH}")
    print(f"                    {PYTHON_PREDICTIONS_PATH}")
    print(f"                    {PYTHON_PROBABILITIES_PATH}")
    print()
    print("Next step: node scripts/train/04_validate_model.mjs")
    print("=" * 60)


def main() -> None:
    check_prerequisites()

    X, y, label_map = load_data()
    class_names = [label_map[str(i)] for i in range(len(label_map))]

    X_train, X_test, y_train, y_test = split_data(X, y)

    clf = train_model(X_train, y_train)

    y_pred, y_proba = evaluate_model(clf, X_test, y_test, class_names)

    export_onnx(clf, label_map)

    generate_validation_artifacts(clf, X_test, y_test)

    print_summary(clf, X_test, y_test, y_pred, y_proba, class_names)


if __name__ == "__main__":
    main()
