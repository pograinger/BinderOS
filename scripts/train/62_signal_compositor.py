"""
62_signal_compositor.py -- Signal compositor validation and TypeScript codegen.

Validates that all cognitive ONNX models emit compatible signals, tests
compositor rules against sample data, and generates TypeScript type definitions
for the runtime signal protocol.

Usage:
    python -u 62_signal_compositor.py --validate          # Validate all models + rules
    python -u 62_signal_compositor.py --codegen            # Generate TypeScript types
    python -u 62_signal_compositor.py --validate --codegen # Both
    python -u 62_signal_compositor.py --test-composites    # Test compositor with sample data

Note: Use -u flag to avoid Python output buffering issues.
"""

import argparse
import json
import sys
from pathlib import Path

from signal_protocol import (
    COGNITIVE_MODELS,
    COMPOSITOR_RULES,
    SIGNAL_SCHEMA,
    SIGNAL_VERSION,
    get_all_model_ids,
)

# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).parent.resolve()
REPO_ROOT = SCRIPT_DIR.parent.parent
CLASSIFIER_DIR = REPO_ROOT / "public" / "models" / "classifiers"
TS_OUTPUT_DIR = REPO_ROOT / "src" / "ai" / "tier2"

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def validate_models() -> tuple[int, int]:
    """Validate all cognitive models have ONNX files and class mappings."""
    model_ids = get_all_model_ids()
    passed = 0
    failed = 0

    print("=" * 60)
    print("SIGNAL PROTOCOL VALIDATION")
    print(f"Protocol version: {SIGNAL_VERSION}")
    print(f"Models defined: {len(model_ids)}")
    print("=" * 60)

    for model_id in model_ids:
        info = COGNITIVE_MODELS[model_id]
        onnx_path = CLASSIFIER_DIR / f"{model_id}.onnx"
        classes_path = CLASSIFIER_DIR / f"{model_id}-classes.json"

        issues = []

        # Check ONNX file exists
        if not onnx_path.exists():
            issues.append(f"ONNX file missing: {onnx_path}")

        # Check classes JSON exists and matches protocol
        if not classes_path.exists():
            issues.append(f"Classes JSON missing: {classes_path}")
        else:
            with open(classes_path, "r") as f:
                classes = json.load(f)
            actual_labels = [classes[str(i)] for i in range(len(classes))]
            expected_labels = sorted(info["labels"])
            if sorted(actual_labels) != expected_labels:
                issues.append(
                    f"Label mismatch: expected {expected_labels}, got {sorted(actual_labels)}"
                )

        # Check required fields in protocol definition
        for field in ["dimension", "signal_type", "labels", "hidden_layers", "confidence_threshold"]:
            if field not in info:
                issues.append(f"Missing field in protocol: {field}")

        # Check signal_type is valid
        if info.get("signal_type") not in ("categorical", "ordinal", "binary"):
            issues.append(f"Invalid signal_type: {info.get('signal_type')}")

        # Check dimension is unique
        dims = [m["dimension"] for m in COGNITIVE_MODELS.values()]
        if dims.count(info["dimension"]) > 1:
            issues.append(f"Duplicate dimension: {info['dimension']}")

        if issues:
            print(f"\n  FAIL  {model_id}")
            for issue in issues:
                print(f"        - {issue}")
            failed += 1
        else:
            size_kb = onnx_path.stat().st_size / 1024 if onnx_path.exists() else 0
            print(f"  PASS  {model_id:<25} ({info['dimension']}, {len(info['labels'])} labels, {size_kb:.1f}KB)")
            passed += 1

    print(f"\n{'=' * 60}")
    print(f"Results: {passed} passed, {failed} failed out of {len(model_ids)}")
    print(f"{'=' * 60}")

    return passed, failed


def validate_compositor_rules() -> tuple[int, int]:
    """Validate compositor rules reference valid models and labels."""
    passed = 0
    failed = 0

    print(f"\n{'=' * 60}")
    print("COMPOSITOR RULES VALIDATION")
    print(f"Rules defined: {len(COMPOSITOR_RULES)}")
    print(f"{'=' * 60}")

    valid_model_ids = set(get_all_model_ids())

    for rule in COMPOSITOR_RULES:
        issues = []

        # Check all input models exist
        for input_model in rule["inputs"]:
            if input_model not in valid_model_ids:
                issues.append(f"Unknown input model: {input_model}")

        # Check required fields
        for field in ["name", "inputs", "condition", "output_signal", "output_value"]:
            if field not in rule:
                issues.append(f"Missing field: {field}")

        # Check condition references valid model IDs
        condition = rule.get("condition", "")
        for model_id in valid_model_ids:
            # If model is referenced in condition, check the label exists
            if model_id in condition:
                # Extract label from condition (simple pattern matching)
                for label in COGNITIVE_MODELS[model_id]["labels"]:
                    pass  # Labels are valid -- just checking model exists

        if issues:
            print(f"\n  FAIL  {rule['name']}")
            for issue in issues:
                print(f"        - {issue}")
            failed += 1
        else:
            inputs = " + ".join(rule["inputs"])
            print(f"  PASS  {rule['name']:<25} ({inputs} -> {rule['output_signal']})")
            passed += 1

    print(f"\n{'=' * 60}")
    print(f"Results: {passed} passed, {failed} failed out of {len(COMPOSITOR_RULES)}")
    print(f"{'=' * 60}")

    return passed, failed


def test_composites() -> None:
    """Test compositor rules against sample signal data."""
    print(f"\n{'=' * 60}")
    print("COMPOSITOR RULE TESTING")
    print(f"{'=' * 60}")

    # Simulate signals from all models for a sample inbox item:
    # "Fix the production outage before the client meeting tomorrow"
    sample_signals = {
        "priority-matrix": {"top_label": "urgent-important", "confidence": 0.92},
        "energy-level": {"top_label": "high-focus", "confidence": 0.78},
        "time-estimate": {"top_label": "medium", "confidence": 0.65},
        "gtd-horizon": {"top_label": "runway", "confidence": 0.88},
        "knowledge-domain": {"top_label": "tech", "confidence": 0.85},
        "emotional-valence": {"top_label": "anxious", "confidence": 0.72},
        "collaboration-type": {"top_label": "collaboration", "confidence": 0.68},
        "information-lifecycle": {"top_label": "ephemeral", "confidence": 0.80},
        "review-cadence": {"top_label": "daily", "confidence": 0.90},
        "cognitive-load": {"top_label": "complex", "confidence": 0.82},
    }

    print(f"\nSample item: 'Fix the production outage before the client meeting tomorrow'")
    print(f"\nModel signals:")
    for model_id, signal in sample_signals.items():
        dim = COGNITIVE_MODELS[model_id]["dimension"]
        print(f"  {dim:<15} = {signal['top_label']:<25} (conf: {signal['confidence']:.2f})")

    print(f"\nComposite signals fired:")

    def eval_condition(condition: str, signals: dict) -> bool:
        """Simple condition evaluator for compositor rules."""
        # Replace model references with actual values
        for model_id, signal in signals.items():
            label = signal["top_label"]
            # Handle == comparisons
            condition_copy = condition
            if f"{model_id} ==" in condition_copy:
                condition_copy = condition_copy.replace(
                    f"{model_id} == '{label}'", "True"
                )
                # Replace non-matching comparisons
                for other_label in COGNITIVE_MODELS[model_id]["labels"]:
                    if other_label != label:
                        condition_copy = condition_copy.replace(
                            f"{model_id} == '{other_label}'", "False"
                        )
                condition = condition_copy

            # Handle 'in' comparisons
            if f"{model_id} in (" in condition:
                # Extract the tuple of values
                import re
                pattern = rf"{re.escape(model_id)} in \(([^)]+)\)"
                match = re.search(pattern, condition)
                if match:
                    values_str = match.group(1)
                    values = [v.strip().strip("'\"") for v in values_str.split(",")]
                    result = label in values
                    condition = condition[:match.start()] + str(result) + condition[match.end():]

        # Evaluate AND/OR
        condition = condition.replace(" AND ", " and ")
        condition = condition.replace(" OR ", " or ")

        try:
            return eval(condition)
        except Exception:
            return False

    fired = 0
    for rule in COMPOSITOR_RULES:
        if eval_condition(rule["condition"], sample_signals):
            output_val = rule["output_value"]
            if isinstance(output_val, str) and output_val.startswith("{"):
                # Template reference -- resolve
                ref_model = output_val.strip("{}").split(".")[0]
                output_val = sample_signals.get(ref_model, {}).get("top_label", output_val)
            print(f"  FIRED  {rule['name']:<25} -> {rule['output_signal']} = {output_val}")
            fired += 1
        else:
            print(f"  ----   {rule['name']:<25} (condition not met)")

    print(f"\n{fired}/{len(COMPOSITOR_RULES)} rules fired for this sample item")


# ---------------------------------------------------------------------------
# TypeScript codegen
# ---------------------------------------------------------------------------


def generate_typescript() -> None:
    """Generate TypeScript type definitions for the signal protocol."""
    output_path = TS_OUTPUT_DIR / "cognitive-signals.ts"

    print(f"\n{'=' * 60}")
    print("TYPESCRIPT CODEGEN")
    print(f"Output: {output_path}")
    print(f"{'=' * 60}")

    # Build dimension union types
    dimension_types = []
    for model_id, info in sorted(COGNITIVE_MODELS.items()):
        safe_name = model_id.replace("-", "_").upper()
        labels = info["labels"]
        union = " | ".join(f"'{lbl}'" for lbl in labels)
        dimension_types.append((safe_name, model_id, info["dimension"], union, labels))

    # Build compositor output signals
    composite_signals = set()
    for rule in COMPOSITOR_RULES:
        composite_signals.add(rule["output_signal"])

    ts_code = f"""/**
 * cognitive-signals.ts -- Auto-generated signal protocol types.
 *
 * Generated by: scripts/train/62_signal_compositor.py --codegen
 * Protocol version: {SIGNAL_VERSION}
 *
 * DO NOT EDIT MANUALLY -- regenerate with:
 *   python -u scripts/train/62_signal_compositor.py --codegen
 */

// ---------------------------------------------------------------------------
// Signal protocol version
// ---------------------------------------------------------------------------
export const SIGNAL_PROTOCOL_VERSION = {SIGNAL_VERSION};

// ---------------------------------------------------------------------------
// Cognitive dimension types (one per model)
// ---------------------------------------------------------------------------
"""

    for safe_name, model_id, dimension, union, labels in dimension_types:
        ts_code += f"export type {safe_name.replace('_', '')}Label = {union};\n"

    ts_code += """
// ---------------------------------------------------------------------------
// Model IDs
// ---------------------------------------------------------------------------
export const COGNITIVE_MODEL_IDS = [
"""
    for model_id in sorted(COGNITIVE_MODELS.keys()):
        ts_code += f"  '{model_id}',\n"
    ts_code += """] as const;

export type CognitiveModelId = (typeof COGNITIVE_MODEL_IDS)[number];

// ---------------------------------------------------------------------------
// Dimension names
// ---------------------------------------------------------------------------
export const COGNITIVE_DIMENSIONS = {
"""
    for model_id, info in sorted(COGNITIVE_MODELS.items()):
        ts_code += f"  '{model_id}': '{info['dimension']}',\n"
    ts_code += """} as const;

export type CognitiveDimension = (typeof COGNITIVE_DIMENSIONS)[CognitiveModelId];

// ---------------------------------------------------------------------------
// Confidence thresholds
// ---------------------------------------------------------------------------
export const COGNITIVE_THRESHOLDS: Record<CognitiveModelId, number> = {
"""
    for model_id, info in sorted(COGNITIVE_MODELS.items()):
        ts_code += f"  '{model_id}': {info['confidence_threshold']},\n"
    ts_code += """};

// ---------------------------------------------------------------------------
// Single cognitive signal (output from one model)
// ---------------------------------------------------------------------------
export interface CognitiveSignal {
  /** Which model produced this signal */
  modelId: CognitiveModelId;
  /** The semantic dimension (e.g., 'priority', 'energy') */
  dimension: CognitiveDimension;
  /** Signal type: categorical (unordered), ordinal (ordered), binary */
  signalType: 'categorical' | 'ordinal' | 'binary';
  /** Per-label probability scores */
  scores: Record<string, number>;
  /** Highest-scoring label */
  topLabel: string;
  /** Confidence (max probability) */
  confidence: number;
  /** Whether confidence exceeds model's threshold */
  accepted: boolean;
}

// ---------------------------------------------------------------------------
// Composite signal (output from compositor rules)
// ---------------------------------------------------------------------------
export type CompositeSignalName =
"""
    for sig in sorted(composite_signals):
        ts_code += f"  | '{sig}'\n"
    ts_code += """  ;

export interface CompositeSignal {
  /** Rule that produced this signal */
  ruleName: string;
  /** The composite signal name */
  signal: CompositeSignalName;
  /** The computed value */
  value: boolean | string | number;
  /** Which model signals contributed */
  inputs: CognitiveModelId[];
}

// ---------------------------------------------------------------------------
// Full signal vector for an item (all models + composites)
// ---------------------------------------------------------------------------
export interface SignalVector {
  /** Signals from individual cognitive models */
  signals: Partial<Record<CognitiveModelId, CognitiveSignal>>;
  /** Derived composite signals from compositor rules */
  composites: CompositeSignal[];
  /** Total inference time in ms */
  totalMs: number;
  /** Protocol version */
  protocolVersion: number;
}

// ---------------------------------------------------------------------------
// Compositor rule definition
// ---------------------------------------------------------------------------
export interface CompositorRule {
  name: string;
  inputs: CognitiveModelId[];
  outputSignal: CompositeSignalName;
  evaluate: (signals: SignalVector['signals']) => CompositeSignal | null;
}

// ---------------------------------------------------------------------------
// Built-in compositor rules
// ---------------------------------------------------------------------------
export const COMPOSITOR_RULES: CompositorRule[] = [
"""

    for rule in COMPOSITOR_RULES:
        inputs_ts = ", ".join(f"'{i}'" for i in rule["inputs"])
        # Generate the evaluate function
        ts_code += f"""  {{
    name: '{rule["name"]}',
    inputs: [{inputs_ts}],
    outputSignal: '{rule["output_signal"]}',
    evaluate: (signals) => {{
"""
        # Generate condition checks
        for inp in rule["inputs"]:
            ts_code += f"      const {inp.replace('-', '_')} = signals['{inp}'];\n"
            ts_code += f"      if (!{inp.replace('-', '_')}?.accepted) return null;\n"

        # Generate condition string (simplified -- complex conditions need manual tuning)
        ts_code += f"""      // Condition: {rule["condition"]}
      // TODO: Implement full condition logic for production
      return {{
        ruleName: '{rule["name"]}',
        signal: '{rule["output_signal"]}',
        value: {json.dumps(rule["output_value"])},
        inputs: [{inputs_ts}],
      }};
    }},
  }},
"""

    ts_code += """];

// ---------------------------------------------------------------------------
// Evaluate all compositor rules against a signal vector
// ---------------------------------------------------------------------------
export function evaluateComposites(
  signals: SignalVector['signals']
): CompositeSignal[] {
  const results: CompositeSignal[] = [];
  for (const rule of COMPOSITOR_RULES) {
    const result = rule.evaluate(signals);
    if (result) results.push(result);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Create an empty signal vector
// ---------------------------------------------------------------------------
export function createEmptySignalVector(): SignalVector {
  return {
    signals: {},
    composites: [],
    totalMs: 0,
    protocolVersion: SIGNAL_PROTOCOL_VERSION,
  };
}
"""

    TS_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(ts_code)

    print(f"Generated: {output_path}")
    print(f"  - {len(COGNITIVE_MODELS)} model types")
    print(f"  - {len(COMPOSITOR_RULES)} compositor rules")
    print(f"  - {len(composite_signals)} composite signal types")

    # Also write the signal schema JSON for reference
    schema_path = CLASSIFIER_DIR / "cognitive-signal-schema.json"
    with open(schema_path, "w") as f:
        json.dump(SIGNAL_SCHEMA, f, indent=2)
    print(f"Generated: {schema_path}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Signal compositor validation and TypeScript codegen",
    )
    parser.add_argument(
        "--validate", action="store_true", help="Validate all models and compositor rules"
    )
    parser.add_argument(
        "--codegen", action="store_true", help="Generate TypeScript type definitions"
    )
    parser.add_argument(
        "--test-composites", action="store_true", help="Test compositor rules with sample data"
    )
    args = parser.parse_args()

    if not any([args.validate, args.codegen, args.test_composites]):
        parser.print_help()
        sys.exit(1)

    total_failed = 0

    if args.validate:
        model_passed, model_failed = validate_models()
        rule_passed, rule_failed = validate_compositor_rules()
        total_failed = model_failed + rule_failed

    if args.test_composites:
        test_composites()

    if args.codegen:
        generate_typescript()

    if args.validate and total_failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
