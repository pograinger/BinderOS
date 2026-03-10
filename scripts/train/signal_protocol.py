"""
signal_protocol.py -- Shared signal protocol for the cognitive model army.

Defines the standardized signal format that ALL cognitive ONNX models emit.
Every model produces a CognitiveSignal with consistent structure, enabling
cross-model composition, inter-model influence, and unified intelligence vectors.

The 10 cognitive dimensions:
    1. priority-matrix      Eisenhower 4-quadrant (urgent/important)
    2. energy-level         Cognitive load required (high/medium/low)
    3. time-estimate        Duration classification (quick/short/medium/long)
    4. gtd-horizon          David Allen Horizons of Focus (runway → vision)
    5. knowledge-domain     Life area (work/personal/health/finance/creative/tech/social/admin)
    6. emotional-valence    Emotional tone (positive/neutral/negative/anxious)
    7. collaboration-type   Who's involved (solo/delegation/collaboration)
    8. information-lifecycle Decay rate (ephemeral/short-lived/stable/permanent)
    9. review-cadence       Review frequency needed (daily/weekly/monthly/quarterly)
    10. cognitive-load      Mental complexity (trivial/routine/complex/deep)

Usage:
    from signal_protocol import COGNITIVE_MODELS, COMPOSITOR_RULES, SIGNAL_VERSION
"""

# ---------------------------------------------------------------------------
# Protocol version -- bump when signal schema changes
# ---------------------------------------------------------------------------
SIGNAL_VERSION = 1

# ---------------------------------------------------------------------------
# Cognitive model definitions
# ---------------------------------------------------------------------------
COGNITIVE_MODELS: dict[str, dict] = {
    "priority-matrix": {
        "dimension": "priority",
        "signal_type": "categorical",
        "labels": [
            "urgent-important",
            "urgent-not-important",
            "not-urgent-important",
            "not-urgent-not-important",
        ],
        "hidden_layers": (128, 64),
        "confidence_threshold": 0.65,
        "description": (
            "Classifies items into Eisenhower matrix quadrants:\n"
            "- urgent-important: Do first — deadline pressure + high stakes\n"
            "- urgent-not-important: Delegate or batch — time-sensitive but low impact\n"
            "- not-urgent-important: Schedule — high value, no immediate deadline\n"
            "- not-urgent-not-important: Eliminate or someday/maybe — neither pressing nor impactful"
        ),
    },
    "energy-level": {
        "dimension": "energy",
        "signal_type": "ordinal",
        "labels": ["high-focus", "medium-focus", "low-energy"],
        "hidden_layers": (128, 64),
        "confidence_threshold": 0.60,
        "description": (
            "Estimates the cognitive energy required to complete an item:\n"
            "- high-focus: deep work, creative thinking, complex analysis, writing\n"
            "- medium-focus: moderate attention, routine problem-solving, communication\n"
            "- low-energy: mechanical tasks, simple lookups, mindless processing"
        ),
    },
    "time-estimate": {
        "dimension": "duration",
        "signal_type": "ordinal",
        "labels": ["quick", "short", "medium", "long"],
        "hidden_layers": (128, 64),
        "confidence_threshold": 0.55,
        "description": (
            "Estimates how long an item will take to complete:\n"
            "- quick: under 5 minutes (GTD 2-minute rule candidate)\n"
            "- short: 5-30 minutes\n"
            "- medium: 30 minutes to 2 hours\n"
            "- long: more than 2 hours (likely needs breakdown)"
        ),
    },
    "gtd-horizon": {
        "dimension": "horizon",
        "signal_type": "ordinal",
        "labels": [
            "runway",
            "10k-projects",
            "20k-areas",
            "30k-goals",
            "40k-vision",
        ],
        "hidden_layers": (256, 128),
        "confidence_threshold": 0.55,
        "description": (
            "Maps items to David Allen's Horizons of Focus:\n"
            "- runway: next actions, calendar items, immediate tasks\n"
            "- 10k-projects: multi-step outcomes with a finish line (1-12 months)\n"
            "- 20k-areas: ongoing areas of responsibility (health, finance, career)\n"
            "- 30k-goals: 1-2 year objectives and milestones\n"
            "- 40k-vision: 3-5 year vision, long-term life direction"
        ),
    },
    "knowledge-domain": {
        "dimension": "domain",
        "signal_type": "categorical",
        "labels": [
            "work",
            "personal",
            "health",
            "finance",
            "creative",
            "tech",
            "social",
            "admin",
        ],
        "hidden_layers": (256, 128),
        "confidence_threshold": 0.60,
        "description": (
            "Classifies items into life/knowledge domains:\n"
            "- work: professional tasks, career, office, clients, colleagues\n"
            "- personal: self-care, hobbies, home life, family\n"
            "- health: medical, fitness, nutrition, mental health, wellness\n"
            "- finance: budgeting, bills, investments, taxes, insurance\n"
            "- creative: art, writing, music, design, crafts\n"
            "- tech: software, hardware, IT, automation, coding\n"
            "- social: friends, community, events, networking, volunteering\n"
            "- admin: paperwork, filing, bureaucracy, errands, logistics"
        ),
    },
    "emotional-valence": {
        "dimension": "emotion",
        "signal_type": "categorical",
        "labels": ["positive", "neutral", "negative", "anxious"],
        "hidden_layers": (128, 64),
        "confidence_threshold": 0.55,
        "description": (
            "Detects the emotional tone or charge of an item:\n"
            "- positive: excitement, gratitude, anticipation, satisfaction\n"
            "- neutral: factual, informational, no emotional charge\n"
            "- negative: frustration, disappointment, complaint, dread\n"
            "- anxious: worry, uncertainty, stress, overwhelm, fear of missing"
        ),
    },
    "collaboration-type": {
        "dimension": "collaboration",
        "signal_type": "categorical",
        "labels": ["solo", "delegation", "collaboration"],
        "hidden_layers": (128, 64),
        "confidence_threshold": 0.65,
        "description": (
            "Determines the collaboration pattern needed:\n"
            "- solo: can be done alone, no other people involved\n"
            "- delegation: should be handed off to someone else, then tracked\n"
            "- collaboration: requires working together with others"
        ),
    },
    "information-lifecycle": {
        "dimension": "lifecycle",
        "signal_type": "ordinal",
        "labels": ["ephemeral", "short-lived", "stable", "permanent"],
        "hidden_layers": (128, 64),
        "confidence_threshold": 0.55,
        "description": (
            "Predicts how quickly information decays or becomes stale:\n"
            "- ephemeral: valid for hours/a day (today's weather, current status)\n"
            "- short-lived: valid for days/weeks (meeting notes, sprint tasks)\n"
            "- stable: valid for months/years (processes, reference docs)\n"
            "- permanent: always valid (facts, policies, contact info)"
        ),
    },
    "review-cadence": {
        "dimension": "review",
        "signal_type": "ordinal",
        "labels": ["daily", "weekly", "monthly", "quarterly"],
        "hidden_layers": (128, 64),
        "confidence_threshold": 0.50,
        "description": (
            "Suggests how often an item should surface for review:\n"
            "- daily: active items needing daily attention\n"
            "- weekly: items for the GTD weekly review\n"
            "- monthly: longer-horizon items, areas of responsibility\n"
            "- quarterly: strategic goals, vision, annual planning items"
        ),
    },
    "cognitive-load": {
        "dimension": "complexity",
        "signal_type": "ordinal",
        "labels": ["trivial", "routine", "complex", "deep"],
        "hidden_layers": (128, 64),
        "confidence_threshold": 0.55,
        "description": (
            "Measures the mental complexity/weight of an item:\n"
            "- trivial: no thinking required, pure execution\n"
            "- routine: familiar patterns, standard procedures\n"
            "- complex: multiple factors, some ambiguity, needs planning\n"
            "- deep: novel problem, creative solution needed, high uncertainty"
        ),
    },
}

# ---------------------------------------------------------------------------
# Compositor rules -- how signals from different models interact
# ---------------------------------------------------------------------------
COMPOSITOR_RULES: list[dict] = [
    {
        "name": "quick-win-detector",
        "inputs": ["priority-matrix", "time-estimate"],
        "condition": "priority-matrix == 'urgent-important' AND time-estimate == 'quick'",
        "output_signal": "quick-win",
        "output_value": True,
        "description": "Items that are both urgent+important AND quick to do — do these NOW",
    },
    {
        "name": "delegation-candidate",
        "inputs": ["collaboration-type", "priority-matrix"],
        "condition": "collaboration-type == 'delegation' AND priority-matrix == 'urgent-not-important'",
        "output_signal": "delegate-now",
        "output_value": True,
        "description": "Urgent but not important + delegation pattern = hand off immediately",
    },
    {
        "name": "deep-work-batch",
        "inputs": ["energy-level", "cognitive-load", "time-estimate"],
        "condition": "energy-level == 'high-focus' AND cognitive-load == 'deep' AND time-estimate in ('medium', 'long')",
        "output_signal": "deep-work-block",
        "output_value": True,
        "description": "Items needing sustained high-focus deep work — batch into dedicated blocks",
    },
    {
        "name": "stress-flag",
        "inputs": ["emotional-valence", "priority-matrix", "time-estimate"],
        "condition": "emotional-valence == 'anxious' AND priority-matrix in ('urgent-important', 'urgent-not-important')",
        "output_signal": "stress-risk",
        "output_value": True,
        "description": "Anxious + urgent = stress risk — surface for reflection or breakdown",
    },
    {
        "name": "stale-item-alert",
        "inputs": ["information-lifecycle", "review-cadence"],
        "condition": "information-lifecycle == 'ephemeral' AND review-cadence != 'daily'",
        "output_signal": "stale-risk",
        "output_value": True,
        "description": "Ephemeral info not reviewed daily is likely already stale",
    },
    {
        "name": "strategic-review",
        "inputs": ["gtd-horizon", "review-cadence"],
        "condition": "gtd-horizon in ('30k-goals', '40k-vision') AND review-cadence in ('daily', 'weekly')",
        "output_signal": "review-cadence-mismatch",
        "output_value": "suggest-monthly",
        "description": "High-horizon items reviewed too frequently waste attention — suggest monthly/quarterly",
    },
    {
        "name": "low-energy-batch",
        "inputs": ["energy-level", "cognitive-load"],
        "condition": "energy-level == 'low-energy' AND cognitive-load == 'trivial'",
        "output_signal": "low-energy-batch",
        "output_value": True,
        "description": "Trivial low-energy items — batch for end-of-day or low-energy periods",
    },
    {
        "name": "context-switch-cost",
        "inputs": ["knowledge-domain", "cognitive-load"],
        "condition": "cognitive-load in ('complex', 'deep')",
        "output_signal": "context-switch-cost",
        "output_value": "high",
        "description": "Complex/deep items have high context-switch cost — avoid interleaving with other domains",
    },
    {
        "name": "project-promotion",
        "inputs": ["gtd-horizon", "time-estimate", "cognitive-load"],
        "condition": "gtd-horizon == 'runway' AND time-estimate == 'long' AND cognitive-load in ('complex', 'deep')",
        "output_signal": "promote-to-project",
        "output_value": True,
        "description": "Runway items that are long + complex probably should be projects (10k)",
    },
    {
        "name": "meeting-prep",
        "inputs": ["collaboration-type", "knowledge-domain"],
        "condition": "collaboration-type == 'collaboration'",
        "output_signal": "meeting-prep-domain",
        "output_value": "{knowledge-domain.top_label}",
        "description": "Collaborative items tagged with their domain for meeting prep aggregation",
    },
]

# ---------------------------------------------------------------------------
# Signal schema for runtime consumption (TypeScript type generation)
# ---------------------------------------------------------------------------
SIGNAL_SCHEMA = {
    "version": SIGNAL_VERSION,
    "dimensions": {
        model_id: {
            "dimension": info["dimension"],
            "signal_type": info["signal_type"],
            "labels": info["labels"],
            "confidence_threshold": info["confidence_threshold"],
        }
        for model_id, info in COGNITIVE_MODELS.items()
    },
    "compositor_rules": [
        {
            "name": rule["name"],
            "inputs": rule["inputs"],
            "output_signal": rule["output_signal"],
        }
        for rule in COMPOSITOR_RULES
    ],
}


def get_all_model_ids() -> list[str]:
    """Return sorted list of all cognitive model IDs."""
    return sorted(COGNITIVE_MODELS.keys())


def get_model(model_id: str) -> dict:
    """Get model definition by ID. Raises KeyError with helpful message."""
    if model_id not in COGNITIVE_MODELS:
        valid = ", ".join(sorted(COGNITIVE_MODELS.keys()))
        raise KeyError(f"Unknown model '{model_id}'. Valid models: {valid}")
    return COGNITIVE_MODELS[model_id]
