#!/usr/bin/env python3
"""
11_train_sanitizer.py — Fine-tune DistilBERT for NER + ONNX export.

Pipeline position: After 10_generate_sanitization_data.py (sanitization-ner.jsonl must exist).
Output:
  - public/models/sanitization/config.json
  - public/models/sanitization/tokenizer.json
  - public/models/sanitization/tokenizer_config.json
  - public/models/sanitization/special_tokens_map.json
  - public/models/sanitization/onnx/model_quantized.onnx (or model.onnx)
  - public/models/sanitization/sanitize-check-classes.json

Usage:
  python scripts/train/11_train_sanitizer.py

Requirements:
  pip install transformers datasets optimum[onnxruntime] seqeval faker
"""

import json
import os
import shutil
import sys
from pathlib import Path

import numpy as np

# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).parent.resolve()
REPO_ROOT = SCRIPT_DIR.parent.parent

DATA_PATH = REPO_ROOT / "scripts" / "training-data" / "sanitization-ner.jsonl"
LABEL_MAP_PATH = SCRIPT_DIR / "sanitization_label_map.json"

OUTPUT_DIR = REPO_ROOT / "public" / "models" / "sanitization"
ONNX_SUBDIR = OUTPUT_DIR / "onnx"
CLASSES_JSON_PATH = OUTPUT_DIR / "sanitize-check-classes.json"

TRAINING_OUTPUT_DIR = SCRIPT_DIR / "sanitizer_training_output"

MODEL_NAME = "distilbert-base-cased"
NUM_LABELS = 11
RECALL_GATE = 0.85

# Label mapping
LABEL_LIST = [
    "O",
    "B-PERSON", "I-PERSON",
    "B-LOCATION", "I-LOCATION",
    "B-FINANCIAL", "I-FINANCIAL",
    "B-CONTACT", "I-CONTACT",
    "B-CREDENTIAL", "I-CREDENTIAL",
]

LABEL2ID = {label: i for i, label in enumerate(LABEL_LIST)}
ID2LABEL = {i: label for i, label in enumerate(LABEL_LIST)}


def check_prerequisites() -> None:
    """Verify training data exists."""
    if not DATA_PATH.exists():
        print(f"ERROR: Training data not found at {DATA_PATH}")
        print("Run: python scripts/train/10_generate_sanitization_data.py")
        sys.exit(1)

    if not LABEL_MAP_PATH.exists():
        print(f"ERROR: Label map not found at {LABEL_MAP_PATH}")
        print("Run: python scripts/train/10_generate_sanitization_data.py")
        sys.exit(1)


def load_data():
    """Load JSONL training data into HuggingFace Dataset."""
    from datasets import Dataset

    print("\n=== Loading Data ===")

    samples = []
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            samples.append(obj)

    print(f"Loaded {len(samples)} samples from {DATA_PATH}")

    # Convert to HuggingFace Dataset
    dataset = Dataset.from_dict({
        "tokens": [s["tokens"] for s in samples],
        "ner_tags": [s["ner_tags"] for s in samples],
    })

    # Split 80/10/10
    train_test = dataset.train_test_split(test_size=0.2, seed=42)
    test_val = train_test["test"].train_test_split(test_size=0.5, seed=42)

    splits = {
        "train": train_test["train"],
        "validation": test_val["train"],
        "test": test_val["test"],
    }

    print(f"Train:      {len(splits['train'])} samples")
    print(f"Validation: {len(splits['validation'])} samples")
    print(f"Test:       {len(splits['test'])} samples")

    # Category distribution
    all_tags = [tag for s in samples for tag in s["ner_tags"]]
    print("\nTag distribution:")
    for label, idx in sorted(LABEL2ID.items(), key=lambda x: x[1]):
        count = all_tags.count(idx)
        print(f"  {label} ({idx}): {count}")

    return splits


def tokenize_and_align_labels(examples, tokenizer):
    """
    Tokenize and align BIO labels to wordpiece tokens.

    CRITICAL: Only assign labels to the first subword token of each word.
    Set other subword tokens to -100 (ignored in loss).
    This prevents BIO tag alignment issues with wordpiece tokenization.
    """
    tokenized = tokenizer(
        examples["tokens"],
        truncation=True,
        is_split_into_words=True,
        max_length=128,
        padding="max_length",
    )

    labels = []
    for i, label_ids in enumerate(examples["ner_tags"]):
        word_ids = tokenized.word_ids(batch_index=i)
        previous_word_idx = None
        label_row = []

        for word_idx in word_ids:
            if word_idx is None:
                # Special tokens ([CLS], [SEP], [PAD])
                label_row.append(-100)
            elif word_idx != previous_word_idx:
                # First subword token of a new word — assign the label
                if word_idx < len(label_ids):
                    label_row.append(label_ids[word_idx])
                else:
                    label_row.append(-100)
            else:
                # Continuation subword token — ignore in loss
                label_row.append(-100)
            previous_word_idx = word_idx

        labels.append(label_row)

    tokenized["labels"] = labels
    return tokenized


def compute_metrics(eval_preds):
    """Compute entity-level metrics using seqeval."""
    from seqeval.metrics import classification_report as seqeval_report
    from seqeval.metrics import precision_score, recall_score, f1_score

    predictions, labels = eval_preds
    predictions = np.argmax(predictions, axis=2)

    # Convert back to label strings, ignoring -100
    true_labels = []
    pred_labels = []

    for pred_row, label_row in zip(predictions, labels):
        true_seq = []
        pred_seq = []
        for p, l in zip(pred_row, label_row):
            if l == -100:
                continue
            true_seq.append(ID2LABEL.get(l, "O"))
            pred_seq.append(ID2LABEL.get(p, "O"))
        true_labels.append(true_seq)
        pred_labels.append(pred_seq)

    precision = precision_score(true_labels, pred_labels)
    recall = recall_score(true_labels, pred_labels)
    f1 = f1_score(true_labels, pred_labels)

    return {
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "overall_recall": recall,  # For metric_for_best_model
    }


def train_model(splits):
    """Fine-tune DistilBERT for token classification."""
    from transformers import (
        AutoTokenizer,
        AutoModelForTokenClassification,
        TrainingArguments,
        Trainer,
        DataCollatorForTokenClassification,
    )

    print(f"\n=== Loading Tokenizer and Model: {MODEL_NAME} ===")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForTokenClassification.from_pretrained(
        MODEL_NAME,
        num_labels=NUM_LABELS,
        id2label=ID2LABEL,
        label2id=LABEL2ID,
    )

    print(f"Model parameters: {model.num_parameters():,}")

    # Tokenize datasets
    print("\n=== Tokenizing Datasets ===")
    tokenized_splits = {}
    for split_name, dataset in splits.items():
        tokenized_splits[split_name] = dataset.map(
            lambda examples: tokenize_and_align_labels(examples, tokenizer),
            batched=True,
            remove_columns=dataset.column_names,
        )
        print(f"  {split_name}: {len(tokenized_splits[split_name])} samples tokenized")

    # Data collator
    data_collator = DataCollatorForTokenClassification(tokenizer=tokenizer)

    # Training arguments
    training_args = TrainingArguments(
        output_dir=str(TRAINING_OUTPUT_DIR),
        num_train_epochs=5,
        per_device_train_batch_size=16,
        per_device_eval_batch_size=32,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="overall_recall",
        greater_is_better=True,
        logging_steps=50,
        seed=42,
        remove_unused_columns=False,
        report_to="none",  # No wandb/tensorboard
    )

    # Trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_splits["train"],
        eval_dataset=tokenized_splits["validation"],
        tokenizer=tokenizer,
        data_collator=data_collator,
        compute_metrics=compute_metrics,
    )

    print("\n=== Training ===")
    trainer.train()

    # Evaluate on test set
    print("\n=== Test Set Evaluation ===")
    test_results = trainer.evaluate(tokenized_splits["test"])
    print(f"\nTest results:")
    for key, value in sorted(test_results.items()):
        if key.startswith("eval_"):
            print(f"  {key}: {value:.4f}" if isinstance(value, float) else f"  {key}: {value}")

    # Detailed per-category report
    print("\n=== Detailed Per-Category Report ===")
    test_predictions = trainer.predict(tokenized_splits["test"])
    predictions = np.argmax(test_predictions.predictions, axis=2)
    labels = test_predictions.label_ids

    from seqeval.metrics import classification_report as seqeval_report

    true_labels = []
    pred_labels = []
    for pred_row, label_row in zip(predictions, labels):
        true_seq = []
        pred_seq = []
        for p, l in zip(pred_row, label_row):
            if l == -100:
                continue
            true_seq.append(ID2LABEL.get(l, "O"))
            pred_seq.append(ID2LABEL.get(p, "O"))
        true_labels.append(true_seq)
        pred_labels.append(pred_seq)

    print(seqeval_report(true_labels, pred_labels))

    # Recall gate check
    overall_recall = test_results.get("eval_recall", test_results.get("eval_overall_recall", 0))
    if overall_recall < RECALL_GATE:
        print(f"\n*** WARNING: Overall recall {overall_recall:.4f} is below {RECALL_GATE} gate ***")
        print("*** Model may need more training data or hyperparameter tuning ***")
        print("*** Continuing with export — user should evaluate ***")
    else:
        print(f"\n*** RECALL GATE PASSED: {overall_recall:.4f} >= {RECALL_GATE} ***")

    return trainer, tokenizer, model


def export_onnx(trainer, tokenizer, model):
    """Export model to ONNX with quantization."""
    from optimum.onnxruntime import ORTModelForTokenClassification
    from optimum.onnxruntime.configuration import AutoQuantizationConfig
    from optimum.onnxruntime import ORTQuantizer

    print("\n=== ONNX Export ===")

    # Save the best model first
    best_model_dir = TRAINING_OUTPUT_DIR / "best_model"
    trainer.save_model(str(best_model_dir))
    tokenizer.save_pretrained(str(best_model_dir))

    print(f"Best model saved to {best_model_dir}")

    # Export to ONNX via Optimum
    print("Converting to ONNX...")
    onnx_model_dir = TRAINING_OUTPUT_DIR / "onnx_export"
    ort_model = ORTModelForTokenClassification.from_pretrained(
        str(best_model_dir),
        export=True,
    )
    ort_model.save_pretrained(str(onnx_model_dir))
    tokenizer.save_pretrained(str(onnx_model_dir))

    print(f"ONNX model exported to {onnx_model_dir}")

    # Apply dynamic quantization (Q8)
    print("Applying Q8 dynamic quantization...")
    quantizer = ORTQuantizer.from_pretrained(ort_model)
    qconfig = AutoQuantizationConfig.avx512_vnni(is_static=False, per_channel=False)

    quantized_dir = TRAINING_OUTPUT_DIR / "onnx_quantized"
    quantized_dir.mkdir(parents=True, exist_ok=True)

    quantizer.quantize(
        save_dir=str(quantized_dir),
        quantization_config=qconfig,
    )

    print(f"Quantized model saved to {quantized_dir}")

    return onnx_model_dir, quantized_dir, best_model_dir


def copy_to_public(onnx_model_dir: Path, quantized_dir: Path, best_model_dir: Path):
    """Copy model files to public/models/sanitization/."""
    print("\n=== Copying to Public Directory ===")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    ONNX_SUBDIR.mkdir(parents=True, exist_ok=True)

    # Copy tokenizer and config files from the best model dir
    for filename in ["config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json"]:
        src = best_model_dir / filename
        if not src.exists():
            # Try onnx export dir
            src = onnx_model_dir / filename
        if src.exists():
            shutil.copy2(str(src), str(OUTPUT_DIR / filename))
            print(f"  Copied {filename}")
        else:
            print(f"  WARNING: {filename} not found")

    # Copy the quantized ONNX model
    # Look for the quantized model file
    quantized_model = None
    for name in ["model_quantized.onnx", "model.onnx"]:
        candidate = quantized_dir / name
        if candidate.exists():
            quantized_model = candidate
            break

    if quantized_model is None:
        # Fall back to unquantized
        for name in ["model.onnx"]:
            candidate = onnx_model_dir / "onnx" / name
            if not candidate.exists():
                candidate = onnx_model_dir / name
            if candidate.exists():
                quantized_model = candidate
                break

    if quantized_model:
        dest = ONNX_SUBDIR / "model_quantized.onnx"
        shutil.copy2(str(quantized_model), str(dest))
        size_mb = dest.stat().st_size / (1024 * 1024)
        print(f"  Copied ONNX model: {dest.name} ({size_mb:.1f} MB)")
    else:
        print("  ERROR: No ONNX model file found!")
        # List what's available
        print(f"  Contents of {quantized_dir}:")
        for f in quantized_dir.rglob("*"):
            print(f"    {f}")
        print(f"  Contents of {onnx_model_dir}:")
        for f in onnx_model_dir.rglob("*"):
            print(f"    {f}")

    # Save label-to-id mapping as classes JSON
    classes = {str(i): label for i, label in ID2LABEL.items()}
    with open(CLASSES_JSON_PATH, "w") as f:
        json.dump(classes, f, indent=2)
    print(f"  Saved classes: {CLASSES_JSON_PATH}")


def print_summary():
    """Print final summary of all generated files."""
    print("\n" + "=" * 60)
    print("TRAINING COMPLETE — SUMMARY")
    print("=" * 60)

    print(f"\nModel architecture: DistilBERT-base-cased (token classification)")
    print(f"Entity categories: PERSON, LOCATION, FINANCIAL, CONTACT, CREDENTIAL")
    print(f"BIO tag count: {NUM_LABELS} (O + 5 categories x 2 B/I)")

    print(f"\nOutput files:")
    for f in OUTPUT_DIR.rglob("*"):
        if f.is_file():
            size = f.stat().st_size
            if size > 1024 * 1024:
                print(f"  {f.relative_to(REPO_ROOT)} ({size / 1024 / 1024:.1f} MB)")
            elif size > 1024:
                print(f"  {f.relative_to(REPO_ROOT)} ({size / 1024:.1f} KB)")
            else:
                print(f"  {f.relative_to(REPO_ROOT)} ({size} B)")

    print(f"\nNext step: node scripts/train/12_validate_sanitizer.mjs")
    print("=" * 60)


def main():
    check_prerequisites()
    splits = load_data()
    trainer, tokenizer, model = train_model(splits)
    onnx_model_dir, quantized_dir, best_model_dir = export_onnx(trainer, tokenizer, model)
    copy_to_public(onnx_model_dir, quantized_dir, best_model_dir)
    print_summary()


if __name__ == "__main__":
    main()
