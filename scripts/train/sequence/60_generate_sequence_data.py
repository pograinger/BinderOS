"""
60_generate_sequence_data.py -- Generate sequence training data from persona corpus.

Loads all harness persona corpus.json files, embeds each atom content string
with MiniLM (normalized), then builds self-supervised next-embedding prediction
pairs for window sizes N=3, N=5, N=7.

Output:
    scripts/train/sequence/sequence_training_data.npz
        X_train: (N_samples, max_window, 384)  -- padded embedding sequences
        y_train: (N_samples, 384)              -- target next embedding
        window_sizes: (N_samples,)             -- which window size this sample used
        seq_lengths: (N_samples,)              -- actual (unpadded) sequence length

Usage:
    python -u scripts/train/sequence/60_generate_sequence_data.py
"""

import json
import sys
from pathlib import Path

import numpy as np

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).parent.resolve()
REPO_ROOT = SCRIPT_DIR.parent.parent.parent
PERSONAS_DIR = REPO_ROOT / "scripts" / "harness" / "personas"
OUTPUT_PATH = SCRIPT_DIR / "sequence_training_data.npz"

WINDOW_SIZES = [3, 5, 7]
MAX_WINDOW = max(WINDOW_SIZES)


def load_persona_contents() -> dict[str, list[str]]:
    """Load atom content strings per persona, preserving corpus order."""
    persona_contents: dict[str, list[str]] = {}
    for corpus_path in sorted(PERSONAS_DIR.glob("*/corpus.json")):
        persona_name = corpus_path.parent.name
        with open(corpus_path, encoding="utf-8") as f:
            data = json.load(f)
        items = data.get("items", [])
        texts = [item["content"] for item in items if item.get("content")]
        persona_contents[persona_name] = texts
        print(f"  {persona_name}: {len(texts)} atoms")
    return persona_contents


def embed_texts(all_texts: list[str]) -> np.ndarray:
    """Embed all unique texts with MiniLM (normalized, float32)."""
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer("all-MiniLM-L6-v2")
    print(f"\nEmbedding {len(all_texts)} texts...")
    embeddings = model.encode(
        all_texts,
        normalize_embeddings=True,
        show_progress_bar=True,
        batch_size=64,
    )
    return np.array(embeddings, dtype=np.float32)


def build_sequences(
    persona_contents: dict[str, list[str]],
    text_to_emb: dict[str, np.ndarray],
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Build next-embedding prediction training pairs.

    For each persona sequence of length L and each window size N:
      For i in N..L:
        input = embeddings[i-N:i]  (last N embeddings before target)
        target = embeddings[i]
        actual_len = N (full window always, since we start at i >= N)

    Returns:
        X: (n_samples, MAX_WINDOW, 384)  -- zero-padded sequences
        y: (n_samples, 384)              -- target embeddings
        window_sizes: (n_samples,)
        seq_lengths: (n_samples,)        -- actual (unpadded) length
    """
    X_list = []
    y_list = []
    w_list = []
    l_list = []

    for persona_name, texts in persona_contents.items():
        if len(texts) < 2:
            print(f"  SKIP {persona_name}: only {len(texts)} atoms")
            continue

        embs = np.array([text_to_emb[t] for t in texts], dtype=np.float32)  # (L, 384)

        for N in WINDOW_SIZES:
            for i in range(N, len(embs)):
                window = embs[i - N : i]  # (N, 384)
                target = embs[i]          # (384,)

                # Pad to MAX_WINDOW (zero-pad from the front)
                padded = np.zeros((MAX_WINDOW, 384), dtype=np.float32)
                padded[MAX_WINDOW - N :] = window

                X_list.append(padded)
                y_list.append(target)
                w_list.append(N)
                l_list.append(N)

    X = np.array(X_list, dtype=np.float32)
    y = np.array(y_list, dtype=np.float32)
    window_sizes = np.array(w_list, dtype=np.int32)
    seq_lengths = np.array(l_list, dtype=np.int32)

    return X, y, window_sizes, seq_lengths


def main() -> None:
    print("=" * 60)
    print("60_generate_sequence_data.py")
    print("=" * 60)

    print(f"\nPersona dir: {PERSONAS_DIR}")
    if not PERSONAS_DIR.exists():
        print(f"ERROR: personas dir not found at {PERSONAS_DIR}")
        sys.exit(1)

    # Load contents
    print("\nLoading persona corpora...")
    persona_contents = load_persona_contents()
    total_atoms = sum(len(v) for v in persona_contents.values())
    print(f"Total personas: {len(persona_contents)}")
    print(f"Total atoms:    {total_atoms}")

    # Deduplicate texts for efficient embedding
    all_texts = list({t for texts in persona_contents.values() for t in texts})
    print(f"Unique texts:   {len(all_texts)}")

    # Embed
    embeddings = embed_texts(all_texts)
    text_to_emb = {t: embeddings[i] for i, t in enumerate(all_texts)}

    # Build sequences
    print("\nBuilding next-embedding prediction pairs...")
    X, y, window_sizes, seq_lengths = build_sequences(persona_contents, text_to_emb)

    print(f"\nDataset statistics:")
    print(f"  X shape:         {X.shape}")
    print(f"  y shape:         {y.shape}")
    print(f"  Total samples:   {len(X)}")
    for N in WINDOW_SIZES:
        count = (window_sizes == N).sum()
        print(f"  Window N={N}:     {count} samples")

    # Save
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        str(OUTPUT_PATH),
        X_train=X,
        y_train=y,
        window_sizes=window_sizes,
        seq_lengths=seq_lengths,
    )
    size_mb = OUTPUT_PATH.stat().st_size / (1024 * 1024)
    print(f"\nSaved: {OUTPUT_PATH}  ({size_mb:.2f} MB)")
    print("\nDone.")


if __name__ == "__main__":
    main()
