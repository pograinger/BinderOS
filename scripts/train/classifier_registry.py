"""
classifier_registry.py -- Central registry of all 12 ONNX classifiers with metadata.

Shared module imported by all 50-53 phase scripts. Provides classifier metadata,
path constants, and the two-model strategy mapping for Anthropic API calls.

Usage:
    from classifier_registry import CLASSIFIER_REGISTRY, get_classifier, MODEL_MAP
"""

import json
from pathlib import Path

# ---------------------------------------------------------------------------
# Path constants
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).parent.resolve()
REPO_ROOT = SCRIPT_DIR.parent.parent
TRAINING_DATA_DIR = REPO_ROOT / "scripts" / "training-data"
CLASSIFIER_DIR = REPO_ROOT / "public" / "models" / "classifiers"
EXPERT_EXAM_DIR = TRAINING_DATA_DIR / "expert-exam"
REPORTS_DIR = SCRIPT_DIR / "reports"

# ---------------------------------------------------------------------------
# Model map for two-model Anthropic strategy
# ---------------------------------------------------------------------------

MODEL_MAP = {
    "haiku": "claude-haiku-4-5",
    "sonnet": "claude-sonnet-4-6",
}

# ---------------------------------------------------------------------------
# Helper: load class names from classes JSON file
# ---------------------------------------------------------------------------


def _load_classes_from_json(classes_json_filename: str) -> list[str]:
    """Load class names from a classes JSON file, returning list ordered by index."""
    path = CLASSIFIER_DIR / classes_json_filename
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    # Classes JSON maps string index to class name: {"0": "class-a", "1": "class-b"}
    return [data[str(i)] for i in range(len(data))]


# ---------------------------------------------------------------------------
# GTD definitions for expert exam prompts
# ---------------------------------------------------------------------------

GTD_DEFINITIONS = {
    "type": (
        "Classifies raw inbox captures into GTD item types:\n"
        "- task: requires a concrete next action; has a clear completion state\n"
        "- fact: reference information; no action required; states something true\n"
        "- event: time-anchored; describes something that will or did happen at a specific time\n"
        "- decision: records a choice already made; may include rationale\n"
        "- insight: generalizable principle or learning; abstracted from a specific situation"
    ),
    "gtd-routing": (
        "Routes actionable items to GTD lists based on David Allen's methodology:\n"
        "- next-action: the very next physical, visible action to move something forward\n"
        "- waiting-for: delegated to someone else; tracking for follow-up\n"
        "- someday-maybe: incubated items not committed to yet; might do eventually\n"
        "- reference: pure information to file and retrieve later; no action needed"
    ),
    "actionability": (
        "Determines whether an inbox item is actionable per GTD:\n"
        "- actionable: has a clear next physical action that can be done\n"
        "- non-actionable: no clear action; might be reference, trash, or someday/maybe\n"
        "Apply the 2-minute rule: if actionable AND takes <2 minutes, do it now."
    ),
    "project-detection": (
        "Identifies whether an item is a multi-step project or single action:\n"
        "- project: requires more than one action step to complete (GTD project = any desired outcome requiring >1 action)\n"
        "- single-action: can be completed in one discrete action step"
    ),
    "context-tagging": (
        "Assigns GTD contexts (the tool, location, or situation needed to do the action):\n"
        "- @agenda: requires discussing with a specific person or in a meeting\n"
        "- @computer: needs a computer or laptop\n"
        "- @errands: requires going out to a physical location (store, office, etc.)\n"
        "- @home: can only be done at home\n"
        "- @office: requires being at the workplace\n"
        "- @phone: requires making a phone call"
    ),
    "decomposition": (
        "Categorizes tasks into one of 35 life/work domains for the natural planning model:\n"
        "Categories span administrative, career, childcare, communication, content creation, "
        "various decision types (career, education, financial, health, living, priority, purchase, "
        "relationship, service, technology), digital cleanup, errands, finance, fitness, gifts, "
        "home improvement, learning, maintenance, meal prep, medical, moving, organizing, "
        "pet care, event planning, trip planning, repairs, research, social plans, and volunteering."
    ),
    "completeness-gate": (
        "Determines whether a GTD item capture is complete enough to process:\n"
        "- complete: has enough information to determine the next action\n"
        "- incomplete: missing critical information needed for GTD processing\n"
        "A complete capture should answer: What is the desired outcome? What is the next action?"
    ),
    "missing-outcome": (
        "Detects whether a GTD item is missing a clear desired outcome:\n"
        "- missing: no clear statement of what 'done' looks like\n"
        "- not-missing: the desired outcome is stated or clearly implied\n"
        "In GTD, every project needs a clear outcome to define success."
    ),
    "missing-next-action": (
        "Detects whether a GTD item is missing a clear next physical action:\n"
        "- missing: no concrete next step identified\n"
        "- not-missing: the next physical, visible action is clear\n"
        "The next action must be a physical, visible activity — not a vague intention."
    ),
    "missing-timeframe": (
        "Detects whether a time-sensitive GTD item is missing a timeframe:\n"
        "- missing: no deadline, due date, or time reference\n"
        "- not-missing: has a clear timeframe or deadline\n"
        "Not all items need timeframes — only those with real deadlines or calendar constraints."
    ),
    "missing-context": (
        "Detects whether a GTD item is missing context information:\n"
        "- missing: no indication of where/when/with-what the action should be done\n"
        "- not-missing: context is stated or clearly implied\n"
        "GTD contexts help batch similar actions (all @phone calls together, all @errands in one trip)."
    ),
    "missing-reference": (
        "Detects whether a GTD item is missing reference material it needs:\n"
        "- missing: references a document, link, person, or resource not included\n"
        "- not-missing: all needed references are present or the item is self-contained\n"
        "Reference material supports action — without it, the action may stall."
    ),
}

# Merge cognitive model descriptions into GTD_DEFINITIONS for consistency
try:
    from signal_protocol import COGNITIVE_MODELS as _CM

    for _mid, _minfo in _CM.items():
        GTD_DEFINITIONS[_mid] = _minfo["description"]
except ImportError:
    pass

# ---------------------------------------------------------------------------
# Classifier registry
# ---------------------------------------------------------------------------

CLASSIFIER_REGISTRY: dict[str, dict] = {
    "type": {
        "jsonl": "type-classification.jsonl",
        "train_script": "03_train_classifier.py",
        "validate_script": "04_validate_model.mjs",
        "onnx_model": "triage-type.onnx",
        "classes_json": "triage-type-classes.json",
        "label_field": "label",
        "hidden_layers": (256, 128),
        "is_multi_class": True,
        "class_names": ["decision", "event", "fact", "insight", "task"],
    },
    "gtd-routing": {
        "jsonl": "gtd-routing.jsonl",
        "train_script": "21_train_gtd_classifier.py --classifier gtd-routing",
        "validate_script": "22_validate_gtd_models.mjs",
        "onnx_model": "gtd-routing.onnx",
        "classes_json": "gtd-routing-classes.json",
        "label_field": "label",
        "hidden_layers": (256, 128),
        "is_multi_class": True,
        "class_names": ["next-action", "reference", "someday-maybe", "waiting-for"],
    },
    "actionability": {
        "jsonl": "actionability.jsonl",
        "train_script": "21_train_gtd_classifier.py --classifier actionability",
        "validate_script": "22_validate_gtd_models.mjs",
        "onnx_model": "actionability.onnx",
        "classes_json": "actionability-classes.json",
        "label_field": "label",
        "hidden_layers": (128, 64),
        "is_multi_class": False,
        "class_names": ["actionable", "non-actionable"],
    },
    "project-detection": {
        "jsonl": "project-detection.jsonl",
        "train_script": "21_train_gtd_classifier.py --classifier project-detection",
        "validate_script": "22_validate_gtd_models.mjs",
        "onnx_model": "project-detection.onnx",
        "classes_json": "project-detection-classes.json",
        "label_field": "label",
        "hidden_layers": (128, 64),
        "is_multi_class": False,
        "class_names": ["project", "single-action"],
    },
    "context-tagging": {
        "jsonl": "context-tagging.jsonl",
        "train_script": "21_train_gtd_classifier.py --classifier context-tagging",
        "validate_script": "22_validate_gtd_models.mjs",
        "onnx_model": "context-tagging.onnx",
        "classes_json": "context-tagging-classes.json",
        "label_field": "label",
        "hidden_layers": (256, 128),
        "is_multi_class": True,
        "class_names": None,  # Loaded lazily from classes JSON (6 classes)
    },
    "decomposition": {
        "jsonl": "decomposition.jsonl",
        "train_script": "31_train_decomposition_classifier.py",
        "validate_script": "32_validate_decomposition_model.mjs",
        "onnx_model": "decomposition.onnx",
        "classes_json": "decomposition-classes.json",
        "label_field": "label",
        "hidden_layers": (256, 128),
        "is_multi_class": True,
        "class_names": None,  # Loaded lazily from classes JSON (35 classes)
    },
    "completeness-gate": {
        "jsonl": "clarification-completeness.jsonl",
        "train_script": "41_train_clarification_classifier.py --classifier completeness-gate",
        "validate_script": "42_validate_clarification_models.mjs",
        "onnx_model": "completeness-gate.onnx",
        "classes_json": "completeness-gate-classes.json",
        "label_field": "label",
        "hidden_layers": (128, 64),
        "is_multi_class": False,
        "class_names": ["complete", "incomplete"],
    },
    "missing-outcome": {
        "jsonl": "clarification-missing-outcome.jsonl",
        "train_script": "41_train_clarification_classifier.py --classifier missing-outcome",
        "validate_script": "42_validate_clarification_models.mjs",
        "onnx_model": "missing-outcome.onnx",
        "classes_json": "missing-outcome-classes.json",
        "label_field": "label",
        "hidden_layers": (128, 64),
        "is_multi_class": False,
        "class_names": ["missing", "not-missing"],
    },
    "missing-next-action": {
        "jsonl": "clarification-missing-next-action.jsonl",
        "train_script": "41_train_clarification_classifier.py --classifier missing-next-action",
        "validate_script": "42_validate_clarification_models.mjs",
        "onnx_model": "missing-next-action.onnx",
        "classes_json": "missing-next-action-classes.json",
        "label_field": "label",
        "hidden_layers": (128, 64),
        "is_multi_class": False,
        "class_names": ["missing", "not-missing"],
    },
    "missing-timeframe": {
        "jsonl": "clarification-missing-timeframe.jsonl",
        "train_script": "41_train_clarification_classifier.py --classifier missing-timeframe",
        "validate_script": "42_validate_clarification_models.mjs",
        "onnx_model": "missing-timeframe.onnx",
        "classes_json": "missing-timeframe-classes.json",
        "label_field": "label",
        "hidden_layers": (128, 64),
        "is_multi_class": False,
        "class_names": ["missing", "not-missing"],
    },
    "missing-context": {
        "jsonl": "clarification-missing-context.jsonl",
        "train_script": "41_train_clarification_classifier.py --classifier missing-context",
        "validate_script": "42_validate_clarification_models.mjs",
        "onnx_model": "missing-context.onnx",
        "classes_json": "missing-context-classes.json",
        "label_field": "label",
        "hidden_layers": (128, 64),
        "is_multi_class": False,
        "class_names": ["missing", "not-missing"],
    },
    "missing-reference": {
        "jsonl": "clarification-missing-reference.jsonl",
        "train_script": "41_train_clarification_classifier.py --classifier missing-reference",
        "validate_script": "42_validate_clarification_models.mjs",
        "onnx_model": "missing-reference.onnx",
        "classes_json": "missing-reference-classes.json",
        "label_field": "label",
        "hidden_layers": (128, 64),
        "is_multi_class": False,
        "class_names": ["missing", "not-missing"],
    },
}

# ---------------------------------------------------------------------------
# Cognitive dimension classifiers (signal army)
# See signal_protocol.py for full definitions.
# ---------------------------------------------------------------------------

try:
    from signal_protocol import COGNITIVE_MODELS

    for _model_id, _model_info in COGNITIVE_MODELS.items():
        CLASSIFIER_REGISTRY[_model_id] = {
            "jsonl": f"{_model_id}.jsonl",
            "train_script": f"61_train_cognitive_models.py --model {_model_id}",
            "validate_script": "62_signal_compositor.py --validate",
            "onnx_model": f"{_model_id}.onnx",
            "classes_json": f"{_model_id}-classes.json",
            "label_field": "label",
            "hidden_layers": _model_info["hidden_layers"],
            "is_multi_class": len(_model_info["labels"]) > 2,
            "class_names": sorted(_model_info["labels"]),
            "signal_dimension": _model_info["dimension"],
            "signal_type": _model_info["signal_type"],
        }
except ImportError:
    pass  # signal_protocol not available outside scripts/train/

# ---------------------------------------------------------------------------
# Lazy-load class names for high-class-count classifiers
# ---------------------------------------------------------------------------

for _name, _entry in CLASSIFIER_REGISTRY.items():
    if _entry["class_names"] is None:
        _entry["class_names"] = _load_classes_from_json(_entry["classes_json"])

# Attach GTD definitions
for _name, _entry in CLASSIFIER_REGISTRY.items():
    _entry["gtd_definitions"] = GTD_DEFINITIONS.get(_name, "")

# ---------------------------------------------------------------------------
# Accessor
# ---------------------------------------------------------------------------


def get_classifier(name: str) -> dict:
    """
    Get classifier registry entry by name.

    Raises KeyError with a helpful message if the name is not found.
    """
    if name not in CLASSIFIER_REGISTRY:
        valid = ", ".join(sorted(CLASSIFIER_REGISTRY.keys()))
        raise KeyError(f"Unknown classifier '{name}'. Valid classifiers: {valid}")
    return CLASSIFIER_REGISTRY[name]
