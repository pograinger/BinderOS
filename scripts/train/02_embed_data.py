"""
02_embed_data.py — MiniLM Embedding Generator with Browser Parity Verification

Embeds the JSONL training corpus using the same MiniLM model the browser uses
(sentence-transformers/all-MiniLM-L6-v2 with mean pooling and L2 normalization).

Input:  scripts/training-data/type-classification.jsonl
Output:
    scripts/train/embeddings_cache.npy  — 384-dim float32 embedding matrix (gitignored)
    scripts/train/labels_cache.npy      — integer label array (gitignored)
    scripts/train/label_map.json        — {index: label_name} mapping (committed)

Usage:
    python 02_embed_data.py

Prerequisites:
    - pip install -r requirements.txt
    - scripts/training-data/type-classification.jsonl must exist (run 01_generate_data.py first)
    - No API key needed — downloads sentence-transformers model on first run (~90MB, cached)

CRITICAL PARITY REQUIREMENT:
    Python: SentenceTransformer.encode(normalize_embeddings=True)
    Browser: pipe(texts, { pooling: 'mean', normalize: true })
    Both must produce identical 384-dim float32 L2-normalized vectors for the
    classifier to work correctly at inference time.
"""

import json
from collections import Counter
from pathlib import Path

import numpy as np
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
from sklearn.preprocessing import LabelEncoder

# ---------------------------------------------------------------------------
# Environment setup (no API key needed for embedding, but load .env.local
# for consistency with the rest of the pipeline)
# ---------------------------------------------------------------------------

_ENV_PATH = Path(__file__).resolve().parents[2] / ".env.local"
load_dotenv(dotenv_path=_ENV_PATH)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

_REPO_ROOT = Path(__file__).resolve().parents[2]
_SCRIPT_DIR = Path(__file__).resolve().parent

JSONL_PATH = _REPO_ROOT / "scripts" / "training-data" / "type-classification.jsonl"
EMBEDDINGS_CACHE = _SCRIPT_DIR / "embeddings_cache.npy"
LABELS_CACHE = _SCRIPT_DIR / "labels_cache.npy"
LABEL_MAP_PATH = _SCRIPT_DIR / "label_map.json"

# CRITICAL: Must match the browser's Xenova/all-MiniLM-L6-v2
# Xenova is an ONNX-converted copy of the same HuggingFace model weights
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
BATCH_SIZE = 64

# ---------------------------------------------------------------------------
# JSONL loading
# ---------------------------------------------------------------------------


def load_jsonl(path: Path) -> tuple[list[str], list[str]]:
    """
    Load the JSONL training corpus and return (texts, labels).

    Skips malformed lines with a warning.
    """
    texts: list[str] = []
    labels: list[str] = []
    skipped = 0

    with open(path, encoding="utf-8") as f:
        for i, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                text = obj.get("text", "").strip()
                label = obj.get("label", "").strip()
                if text and label:
                    texts.append(text)
                    labels.append(label)
                else:
                    print(f"[WARNING] Line {i}: missing text or label — skipping")
                    skipped += 1
            except json.JSONDecodeError as e:
                print(f"[WARNING] Line {i}: JSON parse error ({e}) — skipping")
                skipped += 1

    if skipped > 0:
        print(f"Skipped {skipped} malformed lines out of {i} total")

    return texts, labels


# ---------------------------------------------------------------------------
# Embedding
# ---------------------------------------------------------------------------


def embed_texts(texts: list[str]) -> np.ndarray:
    """
    Embed texts with sentence-transformers/all-MiniLM-L6-v2.

    CRITICAL: normalize_embeddings=True must be set to match browser parity.
    The browser embedding worker calls: pipe(texts, { pooling: 'mean', normalize: true })
    This produces L2-normalized 384-dim float32 vectors.
    Without normalize_embeddings=True, the embedding space differs and accuracy drops silently.
    """
    print(f"\nLoading model: {MODEL_NAME}")
    print("(First run downloads ~90MB — cached in HuggingFace cache dir afterwards)")

    model = SentenceTransformer(MODEL_NAME)

    print(f"Embedding {len(texts)} examples (batch_size={BATCH_SIZE})...")
    embeddings = model.encode(
        texts,
        normalize_embeddings=True,  # CRITICAL: must match browser { normalize: true }
        batch_size=BATCH_SIZE,
        show_progress_bar=True,
    )

    # sentence-transformers 5.x returns float32 by default, but verify
    embeddings = embeddings.astype(np.float32)

    return embeddings


# ---------------------------------------------------------------------------
# Parity verification
# ---------------------------------------------------------------------------


def verify_parity(embeddings: np.ndarray) -> None:
    """
    Verify embedding parity with the browser's Xenova/all-MiniLM-L6-v2.

    Checks:
    1. Output shape is (N, 384) with dtype float32
    2. Every vector has L2 norm within 1e-5 of 1.0 (normalized)

    Raises AssertionError if any check fails — do not proceed to cache writes.
    """
    n = embeddings.shape[0]

    # Check 1: Shape and dtype
    assert len(embeddings.shape) == 2, f"Expected 2D array, got shape {embeddings.shape}"
    assert embeddings.shape[1] == 384, f"Expected 384 dims, got {embeddings.shape[1]}"
    assert embeddings.dtype == np.float32, f"Expected float32, got {embeddings.dtype}"

    # Check 2: L2 normalization — every vector should have norm ≈ 1.0
    norms = np.linalg.norm(embeddings, axis=1)
    max_norm_deviation = np.max(np.abs(norms - 1.0))
    assert max_norm_deviation < 1e-5, (
        f"Normalization check failed: max |norm - 1.0| = {max_norm_deviation:.2e} "
        f"(expected < 1e-5). Did you set normalize_embeddings=True?"
    )

    print(f"\nParity check passed: {n} embeddings, 384-dim, normalized float32")
    print(f"  Max norm deviation from 1.0: {max_norm_deviation:.2e}")


# ---------------------------------------------------------------------------
# Label encoding
# ---------------------------------------------------------------------------


def encode_labels(labels: list[str]) -> tuple[np.ndarray, LabelEncoder]:
    """
    Integer-encode string labels using sklearn LabelEncoder.

    Returns (y_int, encoder) where encoder.classes_ gives the label order.
    The label map is: {index: label_name}
    """
    le = LabelEncoder()
    y_int = le.fit_transform(labels).astype(np.int32)
    return y_int, le


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    print("=" * 60)
    print("02_embed_data.py — MiniLM Embedding Generator")
    print("=" * 60)

    # Validate input
    if not JSONL_PATH.exists():
        raise FileNotFoundError(
            f"Training data not found: {JSONL_PATH}\n"
            "Run 01_generate_data.py first to generate the JSONL corpus."
        )

    # Load JSONL
    print(f"\nLoading: {JSONL_PATH}")
    texts, labels = load_jsonl(JSONL_PATH)
    print(f"Loaded {len(texts)} examples")

    if len(texts) == 0:
        raise ValueError("No valid examples found in JSONL — check the file format")

    # Embed
    embeddings = embed_texts(texts)

    # Parity verification — abort if this fails
    verify_parity(embeddings)

    # Encode labels
    y_int, le = encode_labels(labels)
    label_map = {int(i): str(name) for i, name in enumerate(le.classes_)}

    # Save caches
    print(f"\nSaving embeddings cache: {EMBEDDINGS_CACHE}")
    np.save(str(EMBEDDINGS_CACHE), embeddings)

    print(f"Saving labels cache:     {LABELS_CACHE}")
    np.save(str(LABELS_CACHE), y_int)

    print(f"Saving label map:        {LABEL_MAP_PATH}")
    with open(LABEL_MAP_PATH, "w", encoding="utf-8") as f:
        json.dump(label_map, f, indent=2)

    # ---------------------------------------------------------------------------
    # Summary
    # ---------------------------------------------------------------------------
    print("\n" + "=" * 60)
    print("EMBEDDING COMPLETE — Summary")
    print("=" * 60)

    print(f"\nEmbedding matrix: {embeddings.shape} ({embeddings.dtype})")
    print(f"Label map: {label_map}")

    label_counts = Counter(labels)
    print(f"\n{'Label':<12} {'Count':>6}")
    print("-" * 20)
    for label_name in le.classes_:
        count = label_counts[label_name]
        print(f"{label_name:<12} {count:>6}")
    print(f"{'TOTAL':<12} {len(labels):>6}")

    print(f"\nCached embeddings: {EMBEDDINGS_CACHE} (gitignored — re-generate with this script)")
    print(f"Cached labels:     {LABELS_CACHE} (gitignored — re-generate with this script)")
    print(f"Label map:         {LABEL_MAP_PATH} (committed — needed by script 03 and browser)")
    print("\nReady for: python 03_train_classifier.py")


if __name__ == "__main__":
    main()
