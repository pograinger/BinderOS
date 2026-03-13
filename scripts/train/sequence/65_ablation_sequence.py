"""
65_ablation_sequence.py -- Ablation comparison: 384-dim baseline vs 512-dim sequence classifiers.

Measures F1 improvement from adding sequence context across window sizes N=3, N=5, N=7.
This is the SEQ-04 decision gate for whether 512-dim classifiers replace 384-dim production.

Methodology:
  1. Load same training data as 63_retrain_classifiers_512.py
  2. Use identical train_test_split(random_state=42, test_size=0.2) for valid comparison
  3. For each classifier:
     a. Baseline: embed test texts -> run through 384-backup.onnx -> compute F1
     b. Sequence: for each N in [3,5,7]:
        - For each test sample, build synthetic window of N-1 prior embeddings
        - Run through frozen LSTM -> 128-dim context
        - Concatenate [384-dim, 128-dim] -> 512-dim
        - Run through 512-dim ONNX -> compute F1
  4. Compute deltas, recommend replacement or keep

Usage:
    python -u scripts/train/sequence/65_ablation_sequence.py
"""

import json
import sys
import time
from datetime import datetime, timezone
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
REPORT_JSON_PATH = SCRIPT_DIR / "ablation_report.json"
REPORT_MD_PATH = SCRIPT_DIR / "ablation_report.md"

INPUT_DIM = 384
CONTEXT_DIM = 128
TOTAL_DIM = INPUT_DIM + CONTEXT_DIM  # 512
WINDOW_SIZES = [3, 5, 7]

# Same classifier defs as 63_retrain_classifiers_512.py (same random_state for identical splits)
CLASSIFIER_DEFS = [
    # (classifier_id, jsonl_filename)
    ("triage-type",           "type-classification.jsonl"),
    ("gtd-routing",           "gtd-routing.jsonl"),
    ("actionability",         "actionability.jsonl"),
    ("project-detection",     "project-detection.jsonl"),
    ("context-tagging",       "context-tagging.jsonl"),
    ("decomposition",         "decomposition.jsonl"),
    ("completeness-gate",     "clarification-completeness.jsonl"),
    ("missing-outcome",       "clarification-missing-outcome.jsonl"),
    ("missing-next-action",   "clarification-missing-next-action.jsonl"),
    ("missing-timeframe",     "clarification-missing-timeframe.jsonl"),
    ("missing-context",       "clarification-missing-context.jsonl"),
    ("missing-reference",     "clarification-missing-reference.jsonl"),
    ("priority-matrix",       "priority-matrix.jsonl"),
    ("energy-level",          "energy-level.jsonl"),
    ("time-estimate",         "time-estimate.jsonl"),
    ("gtd-horizon",           "gtd-horizon.jsonl"),
    ("knowledge-domain",      "knowledge-domain.jsonl"),
    ("emotional-valence",     "emotional-valence.jsonl"),
    ("collaboration-type",    "collaboration-type.jsonl"),
    ("information-lifecycle", "information-lifecycle.jsonl"),
    ("review-cadence",        "review-cadence.jsonl"),
    ("cognitive-load",        "cognitive-load.jsonl"),
]


# ---------------------------------------------------------------------------
# Data loading (identical to 63_retrain_classifiers_512.py)
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


def encode_labels(labels: list[str]) -> tuple[np.ndarray, list[str]]:
    unique_labels = sorted(set(labels))
    label_to_idx = {lbl: idx for idx, lbl in enumerate(unique_labels)}
    y = np.array([label_to_idx[lbl] for lbl in labels])
    return y, unique_labels


# ---------------------------------------------------------------------------
# Frozen LSTM loading
# ---------------------------------------------------------------------------
def load_frozen_lstm():
    """Load frozen LSTM for 128-dim context generation."""
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
    return model


# ---------------------------------------------------------------------------
# Context vector generation
# ---------------------------------------------------------------------------
def generate_context_for_test(
    test_embeddings: np.ndarray,
    train_embeddings: np.ndarray,
    lstm_model,
    window_size: int,
    rng: np.random.Generator,
) -> np.ndarray:
    """
    Generate 128-dim context vectors for test samples.

    For each test sample, build a synthetic sequence context:
    - Sample window_size-1 random embeddings from the TRAINING set as prior context
    - Prepend them to the test embedding to form a sequence of length window_size
    - Run through frozen LSTM to get 128-dim context
    - This matches 63_retrain's approach: synthetic window from training pool

    Returns:
        context_vectors: (N_test, 128) float32
    """
    import torch

    N = len(test_embeddings)
    context_vectors = np.zeros((N, CONTEXT_DIM), dtype=np.float32)

    with torch.no_grad():
        for i in range(N):
            prior_count = window_size - 1
            if prior_count > 0 and len(train_embeddings) > 0:
                prior_indices = rng.choice(len(train_embeddings), size=prior_count, replace=True)
                prior_embs = train_embeddings[prior_indices]  # (window_size-1, 384)
                # sequence = [prior..., current_test] shape (window_size, 384)
                sequence = np.concatenate([prior_embs, test_embeddings[i:i+1]], axis=0)
            else:
                # window_size=1: only the test embedding itself
                sequence = test_embeddings[i:i+1]

            # LSTM input: (seq_len, 1, 384)
            x = torch.from_numpy(sequence.astype(np.float32)).unsqueeze(1)
            ctx = lstm_model(x)  # (1, 128)
            context_vectors[i] = ctx.squeeze(0).numpy()

    return context_vectors


# ---------------------------------------------------------------------------
# ONNX inference
# ---------------------------------------------------------------------------
def load_onnx_session(onnx_path: Path):
    import onnxruntime as ort
    opts = ort.SessionOptions()
    opts.log_severity_level = 3  # suppress warnings
    return ort.InferenceSession(str(onnx_path), opts)


def run_onnx_inference(session, X: np.ndarray) -> np.ndarray:
    """Run batch inference, return predicted class indices."""
    input_name = session.get_inputs()[0].name
    output_names = [o.name for o in session.get_outputs()]

    # Find the label output (not probabilities)
    # skl2onnx exports: output_label (int) and output_probability (float[])
    label_output = None
    for name in output_names:
        if "label" in name.lower():
            label_output = name
            break
    if label_output is None:
        label_output = output_names[0]

    results = session.run([label_output], {input_name: X.astype(np.float32)})
    return np.array(results[0])


def compute_f1(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """Compute macro F1 score."""
    from sklearn.metrics import f1_score
    return f1_score(y_true, y_pred, average="macro", zero_division=0)


# ---------------------------------------------------------------------------
# Per-classifier ablation
# ---------------------------------------------------------------------------
def ablate_classifier(
    classifier_id: str,
    jsonl_filename: str,
    embedder,
    lstm_model,
    rng: np.random.Generator,
) -> dict | None:
    """
    Run ablation for one classifier. Returns result dict or None if skipped.
    """
    jsonl_path = TRAINING_DATA_DIR / jsonl_filename
    if not jsonl_path.exists():
        print(f"  SKIP: {jsonl_path} not found")
        return None

    baseline_path = CLASSIFIER_DIR / f"{classifier_id}-384-backup.onnx"
    seq_path = CLASSIFIER_DIR / f"{classifier_id}.onnx"

    if not baseline_path.exists():
        print(f"  SKIP: no 384-backup found: {baseline_path.name}")
        return None
    if not seq_path.exists():
        print(f"  SKIP: no 512-dim model found: {seq_path.name}")
        return None

    # Load data
    texts, labels = load_jsonl(jsonl_path)
    y, unique_labels = encode_labels(labels)
    print(f"  Samples: {len(texts)}, Classes: {len(unique_labels)}")

    # Embed (384-dim)
    print(f"  Embedding {len(texts)} texts...")
    embeddings = embedder.encode(
        texts,
        normalize_embeddings=True,
        show_progress_bar=False,
        batch_size=64,
    )
    embeddings = np.array(embeddings, dtype=np.float32)

    # Identical train/test split as 63_retrain_classifiers_512.py
    from sklearn.model_selection import train_test_split
    X_train, X_test, y_train, y_test = train_test_split(
        embeddings, y, test_size=0.2, random_state=42, stratify=y
    )
    print(f"  Test set: {len(X_test)} samples")

    # -----------------------------------------------------------------------
    # Baseline: 384-dim backup model
    # -----------------------------------------------------------------------
    baseline_session = load_onnx_session(baseline_path)
    baseline_preds = run_onnx_inference(baseline_session, X_test)
    baseline_f1 = compute_f1(y_test, baseline_preds)
    print(f"  Baseline F1 (384-dim): {baseline_f1:.4f}")

    # -----------------------------------------------------------------------
    # Sequence context: 512-dim model across window sizes
    # -----------------------------------------------------------------------
    seq_session = load_onnx_session(seq_path)
    seq_f1_by_n = {}

    for N in WINDOW_SIZES:
        ctx_vectors = generate_context_for_test(
            X_test, X_train, lstm_model, N, rng
        )
        X_seq = np.concatenate([X_test, ctx_vectors], axis=1)  # (n_test, 512)
        seq_preds = run_onnx_inference(seq_session, X_seq)
        f1 = compute_f1(y_test, seq_preds)
        seq_f1_by_n[N] = float(f1)
        delta = f1 - baseline_f1
        sign = "+" if delta >= 0 else ""
        print(f"  Sequence N={N}: F1={f1:.4f}  (delta: {sign}{delta:.4f})")

    best_n = max(WINDOW_SIZES, key=lambda n: seq_f1_by_n[n])
    best_delta = seq_f1_by_n[best_n] - baseline_f1
    recommend_replace = all(seq_f1_by_n[n] >= baseline_f1 for n in WINDOW_SIZES)

    print(f"  Best N={best_n} (delta: {'+' if best_delta>=0 else ''}{best_delta:.4f}) "
          f"{'REPLACE' if recommend_replace else 'CAUTION'}")

    return {
        "baseline_f1": float(baseline_f1),
        "seq_f1": {str(n): seq_f1_by_n[n] for n in WINDOW_SIZES},
        "best_n": best_n,
        "best_delta": float(best_delta),
        "recommend_replace": recommend_replace,
        "n_test_samples": int(len(X_test)),
    }


# ---------------------------------------------------------------------------
# Report generation
# ---------------------------------------------------------------------------
def write_json_report(report: dict) -> None:
    with open(REPORT_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"\nJSON report: {REPORT_JSON_PATH}")


def write_md_report(report: dict) -> None:
    lines = []
    lines.append("# Ablation Report: 384-dim vs 512-dim Sequence Classifiers")
    lines.append(f"\n**Generated:** {report['timestamp']}")
    lines.append(f"**Window sizes tested:** N = {', '.join(str(n) for n in report['window_sizes_tested'])}")
    lines.append(f"**Baseline dimension:** {report['baseline_dim']}")
    lines.append(f"**Sequence dimension:** {report['sequence_dim']}")

    agg = report["aggregate"]
    lines.append(f"\n## Recommendation")
    lines.append(f"\n**{report['aggregate']['overall_recommendation'].upper()}** — "
                 f"Recommended N={agg['recommended_n']}")

    delta_strs = ", ".join(
        f"N={n}: {'+' if agg['mean_delta'][str(n)]>=0 else ''}{agg['mean_delta'][str(n)]:.4f}"
        for n in report["window_sizes_tested"]
    )
    lines.append(f"Mean F1 delta across all classifiers: {delta_strs}")

    lines.append(f"\n## Per-Classifier Results")
    lines.append(f"\n| Classifier | Baseline F1 | N=3 F1 | N=5 F1 | N=7 F1 | Best N | Best Delta | Replace? |")
    lines.append(f"|------------|------------|--------|--------|--------|--------|------------|---------|")

    classifiers = report["classifiers"]
    for clf_id, data in sorted(classifiers.items()):
        s3 = data["seq_f1"].get("3", 0)
        s5 = data["seq_f1"].get("5", 0)
        s7 = data["seq_f1"].get("7", 0)
        delta = data["best_delta"]
        sign = "+" if delta >= 0 else ""
        replace_str = "YES" if data["recommend_replace"] else "caution"
        lines.append(
            f"| {clf_id} | {data['baseline_f1']:.4f} | {s3:.4f} | {s5:.4f} | {s7:.4f} "
            f"| N={data['best_n']} | {sign}{delta:.4f} | {replace_str} |"
        )

    lines.append(f"\n## Aggregate Summary")
    lines.append(f"\n| Window Size | Mean F1 Delta |")
    lines.append(f"|-------------|--------------|")
    for n in report["window_sizes_tested"]:
        d = agg["mean_delta"][str(n)]
        lines.append(f"| N={n} | {'+' if d>=0 else ''}{d:.4f} |")

    lines.append(f"\n**Recommended N:** {agg['recommended_n']}")
    replace_count = sum(1 for d in classifiers.values() if d.get("recommend_replace"))
    total = len(classifiers)
    lines.append(f"**Classifiers recommending replacement:** {replace_count}/{total}")

    with open(REPORT_MD_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"Markdown report: {REPORT_MD_PATH}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    print("=" * 70)
    print("65_ablation_sequence.py -- Ablation: 384-dim vs 512-dim Sequence")
    print(f"Window sizes: {WINDOW_SIZES}")
    print(f"Baseline models: *-384-backup.onnx")
    print(f"Sequence models: *.onnx (512-dim)")
    print("=" * 70)

    total_start = time.time()
    rng = np.random.default_rng(42)  # fixed seed for reproducibility

    # Load frozen LSTM
    print("\nLoading frozen LSTM...")
    lstm_model = load_frozen_lstm()
    print("LSTM loaded.")

    # Load shared embedder
    print("\nLoading MiniLM embedder...")
    from sentence_transformers import SentenceTransformer
    embedder = SentenceTransformer("all-MiniLM-L6-v2")
    print("Embedder ready.")

    # Run ablation for each classifier
    classifier_results = {}
    skipped = []

    for classifier_id, jsonl_filename in CLASSIFIER_DEFS:
        print(f"\n{'=' * 60}")
        print(f"ABLATING: {classifier_id}")
        print(f"{'=' * 60}")

        result = ablate_classifier(
            classifier_id, jsonl_filename, embedder, lstm_model, rng
        )
        if result is None:
            skipped.append(classifier_id)
        else:
            classifier_results[classifier_id] = result

    if not classifier_results:
        print("\nERROR: No classifiers could be ablated. Check backup models exist.")
        sys.exit(1)

    # -----------------------------------------------------------------------
    # Aggregate metrics
    # -----------------------------------------------------------------------
    mean_delta_by_n = {}
    for n in WINDOW_SIZES:
        deltas = [
            data["seq_f1"][str(n)] - data["baseline_f1"]
            for data in classifier_results.values()
        ]
        mean_delta_by_n[str(n)] = float(np.mean(deltas)) if deltas else 0.0

    recommended_n = max(WINDOW_SIZES, key=lambda n: mean_delta_by_n[str(n)])
    best_mean_delta = mean_delta_by_n[str(recommended_n)]

    replace_count = sum(1 for d in classifier_results.values() if d["recommend_replace"])
    total_count = len(classifier_results)

    # Overall recommendation: replace if mean delta for best N is positive
    overall_recommendation = "replace" if best_mean_delta > 0 else "keep_384"

    # -----------------------------------------------------------------------
    # Build report
    # -----------------------------------------------------------------------
    report = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "window_sizes_tested": WINDOW_SIZES,
        "baseline_dim": INPUT_DIM,
        "sequence_dim": TOTAL_DIM,
        "classifiers": classifier_results,
        "skipped": skipped,
        "aggregate": {
            "mean_delta": mean_delta_by_n,
            "recommended_n": recommended_n,
            "overall_recommendation": overall_recommendation,
        },
    }

    # -----------------------------------------------------------------------
    # Print summary table
    # -----------------------------------------------------------------------
    total_elapsed = time.time() - total_start

    print(f"\n{'=' * 80}")
    print(f"ABLATION SUMMARY")
    print(f"{'=' * 80}")
    print(f"{'Classifier':<25} {'Baseline':>9} {'N=3':>8} {'N=5':>8} {'N=7':>8} {'BestN':>6} {'Delta':>8} {'Replace':>8}")
    print(f"{'-'*25} {'-'*9} {'-'*8} {'-'*8} {'-'*8} {'-'*6} {'-'*8} {'-'*8}")

    for clf_id, data in sorted(classifier_results.items()):
        s3 = data["seq_f1"].get("3", 0)
        s5 = data["seq_f1"].get("5", 0)
        s7 = data["seq_f1"].get("7", 0)
        delta = data["best_delta"]
        sign = "+" if delta >= 0 else ""
        print(
            f"{clf_id:<25} {data['baseline_f1']:>9.4f} {s3:>8.4f} {s5:>8.4f} {s7:>8.4f} "
            f"N={data['best_n']:>3} {sign}{delta:>7.4f} {'YES' if data['recommend_replace'] else 'NO':>8}"
        )

    print(f"{'-'*25} {'-'*9} {'-'*8} {'-'*8} {'-'*8} {'-'*6} {'-'*8} {'-'*8}")
    for n in WINDOW_SIZES:
        d = mean_delta_by_n[str(n)]
        print(f"{'MEAN DELTA N='+str(n):<25} {'':>9} {'':>8} {'':>8} {'':>8} {'':>6} {'+' if d>=0 else ''}{d:>7.4f}")

    print(f"\nClassifiers recommending replacement: {replace_count}/{total_count}")
    print(f"Best aggregate window: N={recommended_n} (mean delta: {'+' if best_mean_delta>=0 else ''}{best_mean_delta:.4f})")

    if skipped:
        print(f"Skipped: {', '.join(skipped)}")

    print(f"\nTotal time: {total_elapsed:.1f}s ({total_elapsed/60:.1f} min)")

    # -----------------------------------------------------------------------
    # Write reports
    # -----------------------------------------------------------------------
    write_json_report(report)
    write_md_report(report)

    # -----------------------------------------------------------------------
    # Final decision output
    # -----------------------------------------------------------------------
    print(f"\n{'=' * 70}")
    if overall_recommendation == "replace":
        print(
            f"RECOMMEND: Replace production classifiers with 512-dim models "
            f"(N={recommended_n}, mean F1 delta: {'+' if best_mean_delta>=0 else ''}{best_mean_delta:.4f})"
        )
    else:
        print(
            f"KEEP: 384-dim classifiers — sequence context did not improve F1 "
            f"(mean delta: {'+' if best_mean_delta>=0 else ''}{best_mean_delta:.4f})"
        )
    print("=" * 70)


if __name__ == "__main__":
    main()
