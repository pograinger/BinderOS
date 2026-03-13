"""
70_train_specialist_models.py — Train 4 specialist MLP risk models and export as ONNX.

Each specialist sees a non-overlapping slice of the 84-dim canonical feature vector
derived from vectors.json (27 task + 23 person + 34 calendar).

Specialists:
  - TimePressure: deadline features + full calendar slice
  - Dependency:   waiting/dependency features + full person slice
  - Staleness:    age/staleness/deadline features (task only)
  - EnergyContext: energy/context + calendar energy cost features

Architecture: StandardScaler + MLPClassifier with early_stopping (same as eii-experiment.py)
Export: skl2onnx opset 15, FloatTensorType, zipmap=False

Output:
    public/models/specialists/time-pressure-risk.onnx
    public/models/specialists/dependency-risk.onnx
    public/models/specialists/staleness-risk.onnx
    public/models/specialists/energy-context-risk.onnx

Usage:
    python -u scripts/train/70_train_specialist_models.py
"""

import json
import os
import sys
import warnings
import numpy as np

from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, roc_auc_score

warnings.filterwarnings('ignore')
np.random.seed(42)

# ============================================================
# STEP 1: Load vectors.json — canonical dimension authority
# ============================================================

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.join(SCRIPT_DIR, '..', '..')
VECTORS_PATH = os.path.join(REPO_ROOT, 'src', 'config', 'binder-types', 'gtd-personal', 'vectors.json')
OUTPUT_DIR = os.path.join(REPO_ROOT, 'public', 'models', 'specialists')

os.makedirs(OUTPUT_DIR, exist_ok=True)

with open(VECTORS_PATH) as f:
    vschema = json.load(f)['vectorSchema']

TASK_DIMS = vschema['task']      # 27 names
PERSON_DIMS = vschema['person']  # 23 names
CAL_DIMS = vschema['calendar']   # 34 names
ALL_DIMS = TASK_DIMS + PERSON_DIMS + CAL_DIMS  # 84 names

N_TASK = len(TASK_DIMS)
N_PERSON = len(PERSON_DIMS)
N_CAL = len(CAL_DIMS)
N_ALL = len(ALL_DIMS)

assert N_TASK == 27, f"Expected 27 task dims, got {N_TASK}"
assert N_PERSON == 23, f"Expected 23 person dims, got {N_PERSON}"
assert N_CAL == 34, f"Expected 34 calendar dims, got {N_CAL}"
assert N_ALL == 84, f"Expected 84 total dims, got {N_ALL}"

print(f"Loaded vectors.json: task={N_TASK}, person={N_PERSON}, calendar={N_CAL}, total={N_ALL}")

# ============================================================
# STEP 2: Feature slice helpers — name-based, never hardcoded
# ============================================================

def idx(name: str) -> int:
    """Return the index of a dimension by name in the 84-dim canonical vector."""
    return ALL_DIMS.index(name)


def idx_range(start_name: str, end_name: str) -> list:
    """Return inclusive index range from start_name to end_name."""
    return list(range(ALL_DIMS.index(start_name), ALL_DIMS.index(end_name) + 1))


def task_range() -> list:
    """All task dimension indices (0..26)."""
    return list(range(N_TASK))


def person_range() -> list:
    """All person dimension indices (27..49)."""
    return list(range(N_TASK, N_TASK + N_PERSON))


def cal_range() -> list:
    """All calendar dimension indices (50..83)."""
    return list(range(N_TASK + N_PERSON, N_ALL))


# Define feature slices for each specialist model
# TimePressure: task [has_deadline, days_to_deadline_norm, time_pressure_score] + full calendar
TIME_PRESSURE_FEATURES = (
    [idx('has_deadline'), idx('days_to_deadline_norm'), idx('time_pressure_score')]
    + cal_range()
)

# Dependency: task [is_waiting_for, has_person_dep, entity_reliability, entity_resp_fast,
#             entity_resp_slow, entity_resp_unknown] + full person
DEPENDENCY_FEATURES = (
    [idx('is_waiting_for'), idx('has_person_dep'), idx('entity_reliability'),
     idx('entity_resp_fast'), idx('entity_resp_slow'), idx('entity_resp_unknown')]
    + person_range()
)

# Staleness: task [age_norm, staleness_norm, has_deadline, days_to_deadline_norm, prev_staleness_score]
STALENESS_FEATURES = [
    idx('age_norm'), idx('staleness_norm'), idx('has_deadline'),
    idx('days_to_deadline_norm'), idx('prev_staleness_score')
]

# EnergyContext: task [ctx_home..ctx_anywhere (6), energy_low..energy_high (3),
#                time_pressure_score, prev_energy_fit]
#               + calendar [energy_low, energy_medium, energy_high, time_pressure_score, overrun_risk]
ENERGY_CONTEXT_FEATURES = (
    idx_range('ctx_home', 'ctx_anywhere')      # 6 context dims
    + idx_range('energy_low', 'energy_high')   # 3 energy dims (task)
    + [idx('time_pressure_score'), idx('prev_energy_fit')]  # 2 task scalars
    + [idx('energy_low') + N_TASK + N_PERSON,  # NOTE: cal dims use offset
       idx('energy_medium') + N_TASK + N_PERSON,
       idx('energy_high') + N_TASK + N_PERSON]
    + [N_TASK + N_PERSON + CAL_DIMS.index('time_pressure_score'),
       N_TASK + N_PERSON + CAL_DIMS.index('overrun_risk')]
)

# Fix: calendar energy dims should use cal_range offset, not task idx offset
_CAL_OFFSET = N_TASK + N_PERSON
ENERGY_CONTEXT_FEATURES = (
    idx_range('ctx_home', 'ctx_anywhere')
    + idx_range('energy_low', 'energy_high')
    + [idx('time_pressure_score'), idx('prev_energy_fit')]
    + [_CAL_OFFSET + CAL_DIMS.index('energy_low'),
       _CAL_OFFSET + CAL_DIMS.index('energy_medium'),
       _CAL_OFFSET + CAL_DIMS.index('energy_high'),
       _CAL_OFFSET + CAL_DIMS.index('time_pressure_score'),
       _CAL_OFFSET + CAL_DIMS.index('overrun_risk')]
)

MODEL_SPECS = {
    'time-pressure-risk': {
        'features': TIME_PRESSURE_FEATURES,
        'hidden_layer_sizes': (16, 8),
        'desc': 'TimePressure: deadline + time_pressure + full calendar',
    },
    'dependency-risk': {
        'features': DEPENDENCY_FEATURES,
        'hidden_layer_sizes': (16, 8),
        'desc': 'Dependency: waiting/dependency/entity_resp + full person',
    },
    'staleness-risk': {
        'features': STALENESS_FEATURES,
        'hidden_layer_sizes': (8,),
        'desc': 'Staleness: age + staleness + deadline context (5 features)',
    },
    'energy-context-risk': {
        'features': ENERGY_CONTEXT_FEATURES,
        'hidden_layer_sizes': (12, 6),
        'desc': 'EnergyContext: energy/context + calendar energy/pressure',
    },
}

print("\nFeature slice summary:")
for name, spec in MODEL_SPECS.items():
    print(f"  {name}: {len(spec['features'])} features")

# ============================================================
# STEP 3: Synthetic data generation (vectors.json semantics)
# ============================================================

def one_hot(n: int) -> np.ndarray:
    """Random one-hot vector of length n."""
    v = np.zeros(n)
    v[np.random.randint(n)] = 1.0
    return v


def generate_task_vector() -> np.ndarray:
    """Generate synthetic 27-dim task vector matching vectors.json dimension semantics.

    Dimension order (authoritative from vectors.json):
      age_norm, staleness_norm, has_deadline, days_to_deadline_norm,
      status_open, status_done, status_dropped,
      has_project, is_waiting_for,
      ctx_home..ctx_anywhere (6), energy_low..energy_high (3),
      enrichment_depth_norm, has_person_dep, time_pressure_score,
      prev_staleness_score, prev_energy_fit,
      entity_reliability, entity_resp_fast, entity_resp_slow, entity_resp_unknown
    """
    age_raw = np.random.exponential(30)
    age_norm = np.clip(age_raw / 365.0, 0, 1)

    days_since_touched = min(age_raw, np.random.exponential(7))
    staleness_norm = np.clip(days_since_touched / max(age_raw, 1) * 0.5 + np.random.normal(0, 0.1), 0, 1)

    has_deadline = float(np.random.random() < 0.6)
    days_to_deadline_raw = np.random.normal(14, 20) if has_deadline else 999.0
    # Normalize days_to_deadline: 0=overdue, 0.5=2 weeks, 1=very far
    days_to_deadline_norm = np.clip((days_to_deadline_raw + 60) / 120.0, 0, 1)

    # Status: all generated tasks are open (same as eii-experiment.py)
    status = np.array([1.0, 0.0, 0.0])

    has_project = float(np.random.random() < 0.5)
    is_waiting_for = float(np.random.random() < 0.2)

    context = one_hot(6)   # ctx_home..ctx_anywhere
    energy = one_hot(3)    # energy_low..energy_high

    enrichment_depth_norm = np.clip(np.random.beta(2, 5), 0, 1)

    has_person_dep = float(np.random.random() < 0.3)
    time_pressure_score = np.clip(np.random.beta(2, 5), 0, 1)
    prev_staleness_score = np.clip(staleness_norm + np.random.normal(0, 0.05), 0, 1)
    prev_energy_fit = np.clip(np.random.beta(5, 2), 0, 1)

    # Entity relationship quality features
    entity_reliability = np.clip(np.random.beta(5, 2), 0, 1) if has_person_dep else 0.5
    entity_resp = one_hot(3)  # fast/slow/unknown
    entity_resp_fast = entity_resp[0] if has_person_dep else 0.0
    entity_resp_slow = entity_resp[1] if has_person_dep else 0.0
    entity_resp_unknown = entity_resp[2] if has_person_dep else 1.0

    return np.concatenate([
        [age_norm, staleness_norm, has_deadline, days_to_deadline_norm],
        status,
        [has_project, is_waiting_for],
        context, energy,
        [enrichment_depth_norm, has_person_dep, time_pressure_score,
         prev_staleness_score, prev_energy_fit,
         entity_reliability, entity_resp_fast, entity_resp_slow, entity_resp_unknown],
    ])


def generate_person_vector() -> np.ndarray:
    """Generate synthetic 23-dim person vector matching vectors.json dimension semantics.

    Dimension order:
      rel_spouse..rel_unknown (9 one-hot), mention_count_norm, recency_norm,
      days_since_seen_norm, has_user_correction, confidence_norm,
      collab_low..collab_high (3), reliability_score, alias_count_norm,
      resp_fast..resp_unknown (4 one-hot)
    """
    rel = one_hot(9)  # rel_spouse, rel_parent, rel_child, rel_colleague, rel_reports_to,
                      # rel_healthcare, rel_friend, rel_org_member, rel_unknown

    mention_count_norm = np.clip(np.random.exponential(0.3), 0, 1)
    recency_norm = np.clip(np.random.beta(5, 2), 0, 1)
    days_since_seen_norm = np.clip(np.random.exponential(0.2), 0, 1)
    has_user_correction = float(np.random.random() < 0.1)
    confidence_norm = np.clip(np.random.beta(5, 2), 0, 1)

    collab = one_hot(3)  # collab_low, collab_medium, collab_high
    reliability_score = np.clip(np.random.beta(5, 2), 0, 1)
    alias_count_norm = np.clip(np.random.exponential(0.1), 0, 1)

    resp = one_hot(4)  # resp_fast, resp_normal, resp_slow, resp_unknown

    return np.concatenate([
        rel,
        [mention_count_norm, recency_norm, days_since_seen_norm,
         has_user_correction, confidence_norm],
        collab,
        [reliability_score, alias_count_norm],
        resp,
    ])


def generate_calendar_vector() -> np.ndarray:
    """Generate synthetic 34-dim calendar vector matching vectors.json dimension semantics.

    Dimension order:
      start_tod_norm, dow_mon..dow_sun (7), dur_lt30..dur_gt120 (4),
      energy_low..energy_high (3), has_deadline, days_to_event_norm,
      time_pressure_score, overrun_risk,
      slack_before_none..slack_before_long (4),
      entity_is_high_priority, entity_reliability,
      mobility_required, is_recurring,
      prep_none..prep_long (4),
      has_person_entity, has_org_entity, has_loc_entity
    """
    start_tod_norm = np.random.random()
    dow = one_hot(7)
    dur = one_hot(4)   # dur_lt30, dur_30_60, dur_60_120, dur_gt120
    energy = one_hot(3)  # energy_low, energy_medium, energy_high
    has_deadline = float(np.random.random() < 0.4)
    days_to_event_norm = np.clip(np.random.exponential(0.3), 0, 1)
    time_pressure_score = np.clip(np.random.beta(2, 5), 0, 1)
    overrun_risk = np.clip(np.random.beta(2, 5), 0, 1)
    slack_before = one_hot(4)  # none/short/medium/long

    entity_is_high_priority = float(np.random.random() < 0.2)
    entity_reliability = np.clip(np.random.beta(5, 2), 0, 1)
    mobility_required = float(np.random.random() < 0.2)
    is_recurring = float(np.random.random() < 0.3)

    prep = one_hot(4)  # prep_none, prep_short, prep_medium, prep_long

    has_person_entity = float(np.random.random() < 0.4)
    has_org_entity = float(np.random.random() < 0.3)
    has_loc_entity = float(np.random.random() < 0.2)

    return np.concatenate([
        [start_tod_norm], dow, dur, energy,
        [has_deadline, days_to_event_norm, time_pressure_score, overrun_risk],
        slack_before,
        [entity_is_high_priority, entity_reliability, mobility_required, is_recurring],
        prep,
        [has_person_entity, has_org_entity, has_loc_entity],
    ])


# ============================================================
# STEP 4: Ground truth risk formula
# Source: scripts/eii-experiment.py — do not diverge
# Adapted: uses idx() name-based lookup instead of hardcoded integers
# ============================================================

def compute_ground_truth_risk(task: np.ndarray, person: np.ndarray, cal: np.ndarray) -> float:
    """Noisy ground-truth risk label for a task atom.
    Returns probability, thresholded to binary with noise.

    Source: scripts/eii-experiment.py — do not diverge.
    Adapted from EII feature names to vectors.json dimension names.
    """
    risk_score = 0.0

    # Extract features using vectors.json dimension semantics
    age_norm = task[TASK_DIMS.index('age_norm')]
    staleness_norm = task[TASK_DIMS.index('staleness_norm')]
    has_deadline = task[TASK_DIMS.index('has_deadline')]
    days_to_deadline_norm = task[TASK_DIMS.index('days_to_deadline_norm')]
    is_waiting_for = task[TASK_DIMS.index('is_waiting_for')]
    energy_low = task[TASK_DIMS.index('energy_low')]
    has_person_dep = task[TASK_DIMS.index('has_person_dep')]
    time_pressure_score = task[TASK_DIMS.index('time_pressure_score')]
    prev_staleness_score = task[TASK_DIMS.index('prev_staleness_score')]
    prev_energy_fit = task[TASK_DIMS.index('prev_energy_fit')]
    entity_reliability = task[TASK_DIMS.index('entity_reliability')]
    entity_resp_slow = task[TASK_DIMS.index('entity_resp_slow')]
    entity_resp_unknown = task[TASK_DIMS.index('entity_resp_unknown')]

    dep_reliability = person[PERSON_DIMS.index('reliability_score')]
    resp_slow = person[PERSON_DIMS.index('resp_slow')]
    resp_unknown = person[PERSON_DIMS.index('resp_unknown')]  # maps to EII resp_unpredictable

    cal_time_pressure = cal[CAL_DIMS.index('time_pressure_score')]
    cal_overrun_risk = cal[CAL_DIMS.index('overrun_risk')]
    slack_before_none = cal[CAL_DIMS.index('slack_before_none')]

    # Derive raw day values for deadline checks
    # days_to_deadline_norm = (days_raw + 60) / 120; 0 = -60 days overdue, 0.5 = 0 days, 1 = far out
    days_to_deadline = days_to_deadline_norm * 120.0 - 60.0
    age_days = age_norm * 365.0
    days_since_touched = staleness_norm * max(age_days, 1)

    # --- Rule 1: Deadline pressure (TimePressure domain) ---
    if has_deadline and days_to_deadline < 0:
        risk_score += 0.35  # already late
    elif has_deadline and days_to_deadline < 3:
        risk_score += 0.2   # imminent
    elif has_deadline and days_to_deadline < 7:
        risk_score += 0.08

    # --- Rule 2: Deadline + calendar congestion compound (TimePressure) ---
    if has_deadline and days_to_deadline < 5 and cal_time_pressure > 0.5:
        risk_score += 0.15

    # --- Rule 3: Person dependency + low reliability (Dependency domain) ---
    if has_person_dep and dep_reliability < 0.35:
        risk_score += 0.25
    elif has_person_dep and dep_reliability < 0.55:
        risk_score += 0.1

    # --- Rule 4: Waiting + slow/unpredictable responder (Dependency domain) ---
    if is_waiting_for and (resp_slow or resp_unknown):
        risk_score += 0.15

    # --- Rule 5: Staleness decay (Staleness domain) ---
    if prev_staleness_score > 0.6 and days_since_touched > 14:
        risk_score += 0.2
    elif prev_staleness_score > 0.4 and days_since_touched > 7:
        risk_score += 0.08

    # --- Rule 6: Old task approaching deadline (Staleness x TimePressure interaction) ---
    if age_days > 30 and has_deadline and days_to_deadline < 5:
        risk_score += 0.1

    # --- Rule 7: Calendar congestion + energy mismatch (EnergyContext domain) ---
    if cal_time_pressure > 0.5 and prev_energy_fit < 0.4:
        risk_score += 0.15

    # --- Rule 8: Low energy task in high overrun risk slot (EnergyContext) ---
    if energy_low and cal_overrun_risk > 0.5:
        risk_score += 0.12

    # --- Rule 9: Calendar slack deficit (TimePressure domain) ---
    # NOTE: EII had slack_after_none but vectors.json calendar doesn't have slack_after;
    # use entity_is_high_priority as a proxy for calendar tightness
    if slack_before_none and cal_time_pressure > 0.6:
        risk_score += 0.1

    # --- Rule 10: Entity response risk (Dependency domain) ---
    # Maps to EII blocked_prob (entity_reliability < 0.4 with person dep = risk)
    if has_person_dep and entity_reliability < 0.4:
        risk_score += 0.12

    # Add noise — enough to make learning non-trivial
    risk_score += np.random.normal(0, 0.07)
    risk_prob = np.clip(risk_score, 0, 1)

    # Binary threshold
    threshold = 0.30
    return 1.0 if risk_prob > threshold else 0.0


# ============================================================
# STEP 5: Generate synthetic dataset
# ============================================================

def generate_dataset(n_users: int = 500):
    """Generate full dataset: returns (X, y) where X has 84 dims."""
    all_X = []
    all_y = []

    total_atoms = 0
    for u in range(n_users):
        n_tasks = np.random.randint(500, 2001)
        n_persons = np.random.randint(20, 101)
        n_cals = np.random.randint(200, 801)

        persons = [generate_person_vector() for _ in range(n_persons)]
        cals = [generate_calendar_vector() for _ in range(n_cals)]

        for t in range(n_tasks):
            task_vec = generate_task_vector()
            person_vec = persons[np.random.randint(n_persons)]
            cal_vec = cals[np.random.randint(n_cals)]

            y = compute_ground_truth_risk(task_vec, person_vec, cal_vec)

            combined = np.concatenate([task_vec, person_vec, cal_vec])
            all_X.append(combined)
            all_y.append(y)
            total_atoms += 1

        if (u + 1) % 100 == 0:
            print(f"  Generated {u+1}/{n_users} users ({total_atoms:,} task atoms so far)")

    X = np.array(all_X, dtype=np.float32)
    y = np.array(all_y, dtype=np.float32)
    return X, y


print("\n--- Generating synthetic dataset (500 users x 500-2000 tasks) ---")
X_all, y_all = generate_dataset(n_users=500)
print(f"Dataset: {X_all.shape[0]:,} samples x {X_all.shape[1]} features")
print(f"Risk prevalence: {y_all.mean():.1%} positive")

assert X_all.shape[1] == 84, f"Expected 84 feature dims, got {X_all.shape[1]}"

# ============================================================
# STEP 6: Train and export specialist models
# ============================================================

X_train, X_test, y_train, y_test = train_test_split(
    X_all, y_all, test_size=0.2, random_state=42, stratify=y_all
)

try:
    from skl2onnx import convert_sklearn
    from skl2onnx.common.data_types import FloatTensorType
    import onnxruntime as ort
    ONNX_AVAILABLE = True
except ImportError as e:
    print(f"\nERROR: ONNX export dependencies not available: {e}")
    print("Install: pip install skl2onnx onnxruntime")
    ONNX_AVAILABLE = False

print("\n--- Training and exporting specialist models ---\n")

results = {}
for model_name, spec in MODEL_SPECS.items():
    features = spec['features']
    n_features = len(features)
    hidden_layer_sizes = spec['hidden_layer_sizes']

    print(f"[{model_name}]")
    print(f"  {spec['desc']}")
    print(f"  Features: {n_features}")

    pipeline = Pipeline([
        ('scaler', StandardScaler()),
        ('clf', MLPClassifier(
            hidden_layer_sizes=hidden_layer_sizes,
            max_iter=300,
            random_state=42,
            early_stopping=True,
        ))
    ])

    Xtr = X_train[:, features]
    Xte = X_test[:, features]

    pipeline.fit(Xtr, y_train)

    y_pred = pipeline.predict(Xte)
    y_prob = pipeline.predict_proba(Xte)[:, 1]

    acc = accuracy_score(y_test, y_pred)
    auc = roc_auc_score(y_test, y_prob)

    print(f"  Accuracy: {acc:.4f}  |  ROC-AUC: {auc:.4f}")

    results[model_name] = {
        'pipeline': pipeline,
        'features': features,
        'n_features': n_features,
        'accuracy': acc,
        'roc_auc': auc,
    }

    if not ONNX_AVAILABLE:
        print(f"  [SKIP] ONNX export not available")
        continue

    # Export to ONNX
    initial_types = [('X', FloatTensorType([None, n_features]))]
    onnx_model = convert_sklearn(
        pipeline,
        initial_types=initial_types,
        target_opset=15,
        options={'zipmap': False}
    )

    onnx_path = os.path.join(OUTPUT_DIR, f'{model_name}.onnx')
    with open(onnx_path, 'wb') as f:
        f.write(onnx_model.SerializeToString())

    size_bytes = os.path.getsize(onnx_path)
    size_kb = size_bytes / 1024
    print(f"  Exported: {onnx_path}")
    print(f"  Size: {size_kb:.1f} KB")

    if size_bytes > 20480:
        raise ValueError(f"Model {model_name} is {size_kb:.1f} KB — exceeds 20KB limit!")

    # Validate with onnxruntime
    # Model outputs: [label (N,), probabilities (N, 2)]
    sess = ort.InferenceSession(onnx_path)
    sample_input = X_test[:1, features].astype(np.float32)
    ort_result = sess.run(None, {'X': sample_input})
    # probabilities is the second output (index 1)
    prob_output = ort_result[1]
    assert prob_output.shape == (1, 2), f"Expected probabilities shape (1, 2), got {prob_output.shape}"
    print(f"  Validated: probabilities output shape {prob_output.shape} (2-class probability)")
    print()

# ============================================================
# STEP 7: Summary
# ============================================================

print("\n" + "=" * 64)
print(" SPECIALIST MODEL TRAINING SUMMARY")
print("=" * 64)
print(f"\n{'Model':<24} {'Features':>8} {'Accuracy':>10} {'ROC-AUC':>10}", end="")
if ONNX_AVAILABLE:
    print(f" {'Size (KB)':>10}")
else:
    print()

for model_name, r in results.items():
    onnx_path = os.path.join(OUTPUT_DIR, f'{model_name}.onnx')
    size_str = ""
    if ONNX_AVAILABLE and os.path.exists(onnx_path):
        size_kb = os.path.getsize(onnx_path) / 1024
        size_str = f" {size_kb:>10.1f}"
    print(f"  {model_name:<22} {r['n_features']:>8} {r['accuracy']:>10.4f} {r['roc_auc']:>10.4f}{size_str}")

if ONNX_AVAILABLE:
    print(f"\nModels written to: {OUTPUT_DIR}")
    print("\nAll 4 specialist models exported and validated.")
else:
    print("\nWARNING: ONNX export was skipped — install skl2onnx and onnxruntime.")
    sys.exit(1)
