"""
63_retrain_classifiers_512.py -- Retrain all T2 classifiers with 512-dim input.

Loads the frozen LSTM (from 61_train_sequence_model.py) to generate 128-dim
context vectors. For each classifier training dataset:
  1. Load JSONL text + labels
  2. Embed texts (MiniLM 384-dim)
  3. Augment with 128-dim context:
     - ~45% of samples: zero-padded context (cold-start robustness)
     - ~55%: run through frozen LSTM with pseudo-context window
  4. Concatenate to 512-dim input
  5. Train MLP + CalibratedClassifierCV
  6. Export ONNX with FloatTensorType([None, 512])
  7. Back up original 384-dim ONNX as *-384-backup.onnx

Usage:
    python -u scripts/train/sequence/63_retrain_classifiers_512.py
    python -u scripts/train/sequence/63_retrain_classifiers_512.py --classifier type
"""

import argparse
import json
import shutil
import sys
import time
from pathlib import Path

import numpy as np

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).parent.resolve()
REPO_ROOT = SCRIPT_DIR.parent.parent.parent
TRAINING_DATA_DIR = REPO_ROOT / "scripts" / "training-data"
CLASSIFIER_DIR = REPO_ROOT / "public" / "models" / "classifiers"
FROZEN_MODEL_PATH = SCRIPT_DIR / "sequence_model_frozen.pt"

INPUT_DIM = 384
CONTEXT_DIM = 128
TOTAL_DIM = INPUT_DIM + CONTEXT_DIM  # 512

ZERO_CONTEXT_FRACTION = 0.45  # fraction of samples that get zero-padded context

# ---------------------------------------------------------------------------
# Classifier definitions: id -> (jsonl_filename, hidden_layers)
# ---------------------------------------------------------------------------
# We load the classifier_registry to get all definitions, but avoid importing
# skl2onnx-heavy deps just for the registry.

CLASSIFIER_DEFS = [
    # (classifier_id, jsonl_filename, hidden_layers)
    ("triage-type",         "type-classification.jsonl",           (256, 128)),
    ("gtd-routing",         "gtd-routing.jsonl",                   (256, 128)),
    ("actionability",       "actionability.jsonl",                 (128, 64)),
    ("project-detection",   "project-detection.jsonl",             (128, 64)),
    ("context-tagging",     "context-tagging.jsonl",               (256, 128)),
    ("decomposition",       "decomposition.jsonl",                 (256, 128)),
    ("completeness-gate",   "clarification-completeness.jsonl",    (128, 64)),
    ("missing-outcome",     "clarification-missing-outcome.jsonl", (128, 64)),
    ("missing-next-action", "clarification-missing-next-action.jsonl", (128, 64)),
    ("missing-timeframe",   "clarification-missing-timeframe.jsonl",   (128, 64)),
    ("missing-context",     "clarification-missing-context.jsonl",     (128, 64)),
    ("missing-reference",   "clarification-missing-reference.jsonl",   (128, 64)),
    # Cognitive models
    ("priority-matrix",     "priority-matrix.jsonl",               (128, 64)),
    ("energy-level",        "energy-level.jsonl",                  (128, 64)),
    ("time-estimate",       "time-estimate.jsonl",                 (128, 64)),
    ("gtd-horizon",         "gtd-horizon.jsonl",                   (128, 64)),
    ("knowledge-domain",    "knowledge-domain.jsonl",              (128, 64)),
    ("emotional-valence",   "emotional-valence.jsonl",             (128, 64)),
    ("collaboration-type",  "collaboration-type.jsonl",            (128, 64)),
    ("information-lifecycle", "information-lifecycle.jsonl",       (128, 64)),
    ("review-cadence",      "review-cadence.jsonl",                (128, 64)),
    ("cognitive-load",      "cognitive-load.jsonl",                (128, 64)),
]


# ---------------------------------------------------------------------------
# Frozen LSTM helpers
# ---------------------------------------------------------------------------
def load_frozen_lstm():
    """Load the frozen LSTM model for feature extraction."""
    import torch
    import torch.nn as nn

    class SequenceContextModel(nn.Module):
        def __init__(self):
            super().__init__()
            self.lstm = nn.LSTM(
                input_size=INPUT_DIM,
                hidden_size=64,
                num_layers=1,
                batch_first=False,
            )
            self.proj = nn.Linear(64, CONTEXT_DIM)

        def forward(self, x):
            _, (h_n, _) = self.lstm(x)
            h = h_n[-1]
            return self.proj(h)

    if not FROZEN_MODEL_PATH.exists():
        print(f"ERROR: Frozen LSTM not found at {FROZEN_MODEL_PATH}")
        print("Run: python -u scripts/train/sequence/61_train_sequence_model.py")
        sys.exit(1)

    model = SequenceContextModel()
    model.load_state_dict(torch.load(str(FROZEN_MODEL_PATH), weights_only=True))
    model.eval()
    print(f"Frozen LSTM loaded from {FROZEN_MODEL_PATH}")
    return model


def generate_context_vectors(
    embeddings: np.ndarray,
    lstm_model,
    zero_fraction: float = ZERO_CONTEXT_FRACTION,
    rng: np.random.Generator = None,
) -> np.ndarray:
    """
    For each embedding, generate a 128-dim sequence context.

    - zero_fraction of samples get all-zeros context (cold-start)
    - Remaining samples get context from frozen LSTM with a pseudo-context
      window of 1-5 embeddings randomly sampled from the training set.

    Returns:
        context_vectors: (N, 128) float32
    """
    import torch

    if rng is None:
        rng = np.random.default_rng(42)

    N = len(embeddings)
    context_vectors = np.zeros((N, CONTEXT_DIM), dtype=np.float32)

    # Determine which samples get zero context
    n_zero = int(N * zero_fraction)
    zero_mask = np.zeros(N, dtype=bool)
    zero_indices = rng.choice(N, size=n_zero, replace=False)
    zero_mask[zero_indices] = True

    # Generate LSTM context for non-zero samples
    non_zero_indices = np.where(~zero_mask)[0]

    if len(non_zero_indices) > 0:
        with torch.no_grad():
            for idx in non_zero_indices:
                # Sample a random window of 1-5 embeddings from the training set
                window_size = int(rng.integers(1, 6))
                window_indices = rng.choice(N, size=window_size, replace=True)
                window_embs = embeddings[window_indices]  # (window_size, 384)

                # Convert to LSTM input format: (seq_len, 1, 384)
                x = torch.from_numpy(window_embs).unsqueeze(1)
                ctx = lstm_model(x)  # (1, 128)
                context_vectors[idx] = ctx.squeeze(0).numpy()

    zero_count = zero_mask.sum()
    actual_zero_pct = zero_count / N * 100
    print(f"  Context augmentation: {zero_count} zero ({actual_zero_pct:.1f}%), "
          f"{N - zero_count} LSTM-generated ({100 - actual_zero_pct:.1f}%)")

    return context_vectors


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------
def load_jsonl(jsonl_path: Path) -> tuple[list[str], list[str]]:
    """Load text and labels from a JSONL file."""
    texts = []
    labels = []
    with open(jsonl_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            texts.append(obj["text"])
            labels.append(obj["label"])
    return texts, labels


def embed_texts(texts: list[str], embedder) -> np.ndarray:
    """Embed texts with the shared MiniLM embedder."""
    embeddings = embedder.encode(
        texts,
        normalize_embeddings=True,
        show_progress_bar=False,
        batch_size=64,
    )
    return np.array(embeddings, dtype=np.float32)


def encode_labels(labels: list[str]) -> tuple[np.ndarray, dict[int, str]]:
    unique_labels = sorted(set(labels))
    label_to_idx = {lbl: idx for idx, lbl in enumerate(unique_labels)}
    idx_to_label = {idx: lbl for lbl, idx in label_to_idx.items()}
    y = np.array([label_to_idx[lbl] for lbl in labels])
    return y, idx_to_label


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------
def train_classifier(
    X_train: np.ndarray,
    y_train: np.ndarray,
    hidden_layers: tuple,
    classifier_id: str,
):
    from sklearn.calibration import CalibratedClassifierCV
    from sklearn.neural_network import MLPClassifier

    print(f"  Training MLP{hidden_layers} + Platt calibration...")
    base_clf = MLPClassifier(
        hidden_layer_sizes=hidden_layers,
        activation="relu",
        max_iter=500,
        random_state=42,
        early_stopping=True,
        validation_fraction=0.1,
        verbose=False,
    )
    base_clf.fit(X_train, y_train)
    print(f"  Converged after {base_clf.n_iter_} iterations")

    calibrated_clf = CalibratedClassifierCV(
        estimator=base_clf, method="sigmoid", cv=5
    )
    calibrated_clf.fit(X_train, y_train)
    return calibrated_clf


def evaluate_classifier(
    clf,
    X_test: np.ndarray,
    y_test: np.ndarray,
    idx_to_label: dict[int, str],
) -> dict:
    from sklearn.metrics import accuracy_score, f1_score

    y_pred = clf.predict(X_test)
    f1 = f1_score(y_test, y_pred, average="macro", zero_division=0)
    acc = accuracy_score(y_test, y_pred)
    class_names = [idx_to_label[i] for i in range(len(idx_to_label))]
    print(f"  Accuracy: {acc*100:.1f}%, Macro F1: {f1:.4f}")
    return {"accuracy": acc, "f1_macro": f1, "n_classes": len(class_names)}


def export_onnx_512(
    clf,
    idx_to_label: dict[int, str],
    classifier_id: str,
    onnx_path: Path,
) -> None:
    """Export 512-dim classifier to ONNX."""
    import onnx
    from skl2onnx import convert_sklearn
    from skl2onnx.common.data_types import FloatTensorType

    initial_types = [("float_input", FloatTensorType([None, TOTAL_DIM]))]
    print(f"  Exporting ONNX: FloatTensorType([None, {TOTAL_DIM}]), opset=17...")

    onnx_model = convert_sklearn(
        clf,
        initial_types=initial_types,
        target_opset=17,
        options={"zipmap": False},
    )

    onnx.checker.check_model(onnx_model)
    with open(onnx_path, "wb") as f:
        f.write(onnx_model.SerializeToString())
    size_kb = onnx_path.stat().st_size / 1024
    print(f"  Saved: {onnx_path.name}  ({size_kb:.1f} KB)")


# ---------------------------------------------------------------------------
# Main per-classifier pipeline
# ---------------------------------------------------------------------------
def retrain_classifier(
    classifier_id: str,
    jsonl_filename: str,
    hidden_layers: tuple,
    lstm_model,
    embedder,
    rng: np.random.Generator,
) -> dict | None:
    """Retrain a single classifier with 512-dim input. Returns summary or None if skipped."""
    print(f"\n{'=' * 60}")
    print(f"RETRAINING: {classifier_id}")
    print(f"{'=' * 60}")

    jsonl_path = TRAINING_DATA_DIR / jsonl_filename
    if not jsonl_path.exists():
        print(f"  SKIP: {jsonl_path} not found")
        return None

    onnx_path = CLASSIFIER_DIR / f"{classifier_id}.onnx"
    backup_path = CLASSIFIER_DIR / f"{classifier_id}-384-backup.onnx"

    # Back up existing 384-dim model
    if onnx_path.exists() and not backup_path.exists():
        shutil.copy2(str(onnx_path), str(backup_path))
        print(f"  Backed up: {onnx_path.name} -> {backup_path.name}")
    elif backup_path.exists():
        print(f"  Backup already exists: {backup_path.name}")

    start_time = time.time()

    # Load data
    texts, labels = load_jsonl(jsonl_path)
    print(f"  Samples: {len(texts)}, Labels: {sorted(set(labels))}")

    # Embed
    print(f"  Embedding {len(texts)} texts...")
    embeddings = embed_texts(texts, embedder)
    print(f"  Embeddings: {embeddings.shape}")

    # Encode labels
    y, idx_to_label = encode_labels(labels)

    # Generate 128-dim context vectors
    context = generate_context_vectors(embeddings, lstm_model, rng=rng)

    # Concatenate to 512-dim
    X = np.concatenate([embeddings, context], axis=1)
    assert X.shape[1] == TOTAL_DIM, f"Expected 512, got {X.shape[1]}"
    print(f"  512-dim features: {X.shape}")

    # Split
    from sklearn.model_selection import train_test_split

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    print(f"  Train: {len(X_train)}, Test: {len(X_test)}")

    # Train
    clf = train_classifier(X_train, y_train, hidden_layers, classifier_id)

    # Evaluate
    metrics = evaluate_classifier(clf, X_test, y_test, idx_to_label)

    # Export ONNX
    CLASSIFIER_DIR.mkdir(parents=True, exist_ok=True)
    export_onnx_512(clf, idx_to_label, classifier_id, onnx_path)

    elapsed = time.time() - start_time
    size_kb = onnx_path.stat().st_size / 1024

    summary = {
        "classifier_id": classifier_id,
        "n_samples": len(texts),
        "n_classes": metrics["n_classes"],
        "accuracy": metrics["accuracy"],
        "f1_macro": metrics["f1_macro"],
        "onnx_size_kb": size_kb,
        "elapsed_seconds": elapsed,
    }

    print(f"  DONE: acc={metrics['accuracy']*100:.1f}%, F1={metrics['f1_macro']:.4f}, "
          f"size={size_kb:.1f}KB, time={elapsed:.1f}s")
    return summary


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Retrain all T2 classifiers with 512-dim input (384 + 128 sequence context)"
    )
    parser.add_argument(
        "--classifier",
        default="all",
        help="Classifier ID to retrain, or 'all' (default: all)",
    )
    args = parser.parse_args()

    print("=" * 70)
    print("63_retrain_classifiers_512.py")
    print(f"Input dimension: {TOTAL_DIM} (MiniLM {INPUT_DIM} + sequence context {CONTEXT_DIM})")
    print(f"Zero-context fraction: {ZERO_CONTEXT_FRACTION:.0%}")
    print("=" * 70)

    total_start = time.time()
    rng = np.random.default_rng(42)

    # Validate frozen LSTM
    lstm_model = load_frozen_lstm()

    # Load shared embedder (loaded once, reused for all classifiers)
    print("\nLoading MiniLM embedder...")
    from sentence_transformers import SentenceTransformer
    embedder = SentenceTransformer("all-MiniLM-L6-v2")
    print("Embedder ready.")

    # Filter classifiers
    if args.classifier == "all":
        to_retrain = CLASSIFIER_DEFS
    else:
        to_retrain = [d for d in CLASSIFIER_DEFS if d[0] == args.classifier]
        if not to_retrain:
            valid = [d[0] for d in CLASSIFIER_DEFS]
            print(f"ERROR: Unknown classifier '{args.classifier}'. Valid: {', '.join(valid)}")
            sys.exit(1)

    print(f"\nClassifiers to retrain: {len(to_retrain)}")

    summaries = []
    skipped = []

    for classifier_id, jsonl_filename, hidden_layers in to_retrain:
        result = retrain_classifier(
            classifier_id, jsonl_filename, hidden_layers,
            lstm_model, embedder, rng,
        )
        if result is None:
            skipped.append(classifier_id)
        else:
            summaries.append(result)

    total_elapsed = time.time() - total_start

    # Summary table
    print(f"\n{'=' * 80}")
    print(f"RETRAIN COMPLETE -- 512-DIM CLASSIFIERS")
    print(f"{'=' * 80}")
    if summaries:
        print(f"{'Classifier':<25} {'Samples':>8} {'Classes':>7} {'Accuracy':>9} {'F1':>8} {'Size':>8}")
        print(f"{'-' * 25} {'-' * 8} {'-' * 7} {'-' * 9} {'-' * 8} {'-' * 8}")
        for s in summaries:
            print(
                f"{s['classifier_id']:<25} {s['n_samples']:>8} {s['n_classes']:>7} "
                f"{s['accuracy']*100:>8.1f}% {s['f1_macro']:>8.4f} {s['onnx_size_kb']:>6.1f}KB"
            )
        avg_acc = sum(s["accuracy"] for s in summaries) / len(summaries)
        avg_f1 = sum(s["f1_macro"] for s in summaries) / len(summaries)
        total_size = sum(s["onnx_size_kb"] for s in summaries)
        print(f"{'-' * 25} {'-' * 8} {'-' * 7} {'-' * 9} {'-' * 8} {'-' * 8}")
        print(
            f"{'AVERAGE':<25} {'':<8} {'':<7} "
            f"{avg_acc*100:>8.1f}% {avg_f1:>8.4f} {total_size:>6.1f}KB"
        )

    if skipped:
        print(f"\nSkipped (no training data): {', '.join(skipped)}")

    print(f"\nTotal time: {total_elapsed:.1f}s ({total_elapsed/60:.1f} min)")
    print(f"Retrained:  {len(summaries)}")
    print(f"Skipped:    {len(skipped)}")
    print(f"\nOriginal 384-dim models backed up as *-384-backup.onnx")
    print(f"New 512-dim models at: {CLASSIFIER_DIR}")

    # Save summary JSON
    summary_path = SCRIPT_DIR / "retrain_512_summary.json"
    with open(summary_path, "w") as f:
        json.dump(
            {
                "classifiers": summaries,
                "skipped": skipped,
                "total_elapsed_seconds": total_elapsed,
                "input_dim": TOTAL_DIM,
                "zero_context_fraction": ZERO_CONTEXT_FRACTION,
            },
            f,
            indent=2,
        )
    print(f"\nSummary saved: {summary_path}")
    print("\nNext step: node scripts/train/sequence/64_validate_classifiers_512.mjs")


if __name__ == "__main__":
    main()
