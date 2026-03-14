"""
75_train_all_specialists.py — Unified training for ALL 12 specialist models.

Replaces 71_ (4 original) and 74_ (8 orthogonal) with a single script that:
  1. Builds full 164-dim canonical vectors for ALL corpus items
  2. Derives risk labels for original 4 specialists (from riskFactors metadata)
  3. Derives risk labels for orthogonal 8 specialists (from cognitiveLabels metadata)
  4. Trains all 12 models on the same vector representation
  5. Exports as ONNX to public/models/specialists/

All feature slices match SPECIALIST_FEATURE_SLICES in src/ai/consensus/types.ts.

Usage:
    python -u scripts/train/75_train_all_specialists.py
"""

import json
import math
import os
import sys
import warnings
import numpy as np

from datetime import datetime
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, roc_auc_score

warnings.filterwarnings('ignore')
np.random.seed(42)

# ============================================================
# STEP 1: Load vectors.json — full 164-dim layout (single source of truth)
# ============================================================

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.join(SCRIPT_DIR, '..', '..')
VECTORS_PATH = os.path.join(REPO_ROOT, 'src', 'config', 'binder-types', 'gtd-personal', 'vectors.json')
OUTPUT_DIR = os.path.join(REPO_ROOT, 'public', 'models', 'specialists')
PERSONAS_DIR = os.path.join(REPO_ROOT, 'scripts', 'harness', 'personas')

os.makedirs(OUTPUT_DIR, exist_ok=True)

with open(VECTORS_PATH) as f:
    vschema = json.load(f)['vectorSchema']

SEG_ORDER = ['task', 'person', 'calendar', 'cognitive', 'composite',
             'enrichment', 'temporal', 'social', 'portfolio', 'content']
SEGMENTS = {}
base = 0
for seg_name in SEG_ORDER:
    dims = vschema[seg_name]
    SEGMENTS[seg_name] = {'dims': dims, 'base': base, 'count': len(dims)}
    base += len(dims)

ALL_DIMS = []
for seg_name in SEG_ORDER:
    ALL_DIMS.extend(SEGMENTS[seg_name]['dims'])

N_ALL = len(ALL_DIMS)

# Segment accessors
TASK_DIMS = SEGMENTS['task']['dims']
PERSON_DIMS = SEGMENTS['person']['dims']
CAL_DIMS = SEGMENTS['calendar']['dims']
COG_DIMS = SEGMENTS['cognitive']['dims']
COMP_DIMS = SEGMENTS['composite']['dims']
ENR_DIMS = SEGMENTS['enrichment']['dims']
TEMP_DIMS = SEGMENTS['temporal']['dims']
SOC_DIMS = SEGMENTS['social']['dims']
PORT_DIMS = SEGMENTS['portfolio']['dims']
CONT_DIMS = SEGMENTS['content']['dims']

TASK_BASE = SEGMENTS['task']['base']
PERSON_BASE = SEGMENTS['person']['base']
CAL_BASE = SEGMENTS['calendar']['base']
COG_BASE = SEGMENTS['cognitive']['base']
COMP_BASE = SEGMENTS['composite']['base']
ENR_BASE = SEGMENTS['enrichment']['base']
TEMP_BASE = SEGMENTS['temporal']['base']
SOC_BASE = SEGMENTS['social']['base']
PORT_BASE = SEGMENTS['portfolio']['base']
CONT_BASE = SEGMENTS['content']['base']

print(f"Loaded vectors.json: {N_ALL} total dims")
for name, seg in SEGMENTS.items():
    print(f"  {name}: {seg['count']} dims (base={seg['base']})")


def idx(name):
    """Return the flat-vector index of a named dimension."""
    return ALL_DIMS.index(name)


def seg_range(segment_name):
    """Return all indices for a segment."""
    seg = SEGMENTS[segment_name]
    return list(range(seg['base'], seg['base'] + seg['count']))


# ============================================================
# STEP 2: Feature slices — matching SPECIALIST_FEATURE_SLICES in types.ts
# ============================================================

MODEL_SPECS = {
    # --- Original 4 learned specialists ---
    'time-pressure-risk': {
        'features': [
            idx('has_deadline'), idx('days_to_deadline_norm'), idx('time_pressure_score'),
        ] + seg_range('calendar'),
        'hidden_layer_sizes': (16, 8),
        'label_source': 'risk',
        'desc': 'TimePressure: deadline + time_pressure + full calendar',
    },
    'dependency-risk': {
        'features': [
            idx('is_waiting_for'), idx('has_person_dep'), idx('entity_reliability'),
            idx('entity_resp_fast'), idx('entity_resp_slow'), idx('entity_resp_unknown'),
        ] + seg_range('person'),
        'hidden_layer_sizes': (16, 8),
        'label_source': 'risk',
        'desc': 'Dependency: waiting/dependency/entity_resp + full person',
    },
    'staleness-risk': {
        'features': [
            idx('age_norm'), idx('staleness_norm'), idx('has_deadline'),
            idx('days_to_deadline_norm'), idx('prev_staleness_score'),
        ] + seg_range('temporal'),
        'hidden_layer_sizes': (12, 6),
        'label_source': 'risk',
        'desc': 'Staleness: age/staleness/deadline + full temporal (drift, postponed, urgency)',
    },
    'energy-context-risk': {
        'features': [
            idx('ctx_home'), idx('ctx_office'), idx('ctx_phone'),
            idx('ctx_computer'), idx('ctx_errands'), idx('ctx_anywhere'),
            idx('energy_low'), idx('energy_medium'), idx('energy_high'),
            idx('time_pressure_score'), idx('prev_energy_fit'),
            CAL_BASE + CAL_DIMS.index('energy_low'),
            CAL_BASE + CAL_DIMS.index('energy_medium'),
            CAL_BASE + CAL_DIMS.index('energy_high'),
            CAL_BASE + CAL_DIMS.index('time_pressure_score'),
            CAL_BASE + CAL_DIMS.index('overrun_risk'),
        ],
        'hidden_layer_sizes': (12, 6),
        'label_source': 'risk',
        'desc': 'EnergyContext: energy/context + calendar energy/pressure',
    },

    # --- 8 orthogonal specialists ---
    'ambiguity-risk': {
        'features': seg_range('content') + seg_range('enrichment') + [idx('enrichment_depth_norm')],
        'hidden_layer_sizes': (32, 16),
        'label_source': 'cognitive',
        'desc': 'Ambiguity: content clarity + enrichment completeness',
    },
    'cognitive-complexity-risk': {
        'features': [
            idx('cog_load_trivial'), idx('cog_load_routine'), idx('cog_load_complex'), idx('cog_load_deep'),
            idx('time_est_quick'), idx('time_est_short'), idx('time_est_medium'), idx('time_est_long'),
            idx('content_length_norm'), idx('tag_count_norm'), idx('backlink_count_norm'),
            idx('coordination_complexity_norm'),
        ],
        'hidden_layer_sizes': (32, 16),
        'label_source': 'cognitive',
        'desc': 'CognitiveComplexity: load signals + structural metadata',
    },
    'emotional-tone-risk': {
        'features': [
            idx('emotion_positive'), idx('emotion_neutral'), idx('emotion_negative'), idx('emotion_anxious'),
            idx('stress_risk'),
            idx('motivation_alignment'),
        ],
        'hidden_layer_sizes': (32, 16),
        'label_source': 'cognitive',
        'desc': 'EmotionalTone: valence + stress + motivation',
    },
    'temporal-drift-risk': {
        'features': seg_range('temporal') + [idx('age_norm'), idx('staleness_norm'), idx('prev_staleness_score')],
        'hidden_layer_sizes': (32, 16),
        'label_source': 'cognitive',
        'desc': 'TemporalDrift: drift + postponement + urgency trajectory',
    },
    'context-switch-risk': {
        'features': [
            idx('context_switch_cost'), idx('deep_work_block'),
            idx('domain_work'), idx('domain_personal'), idx('domain_health'), idx('domain_finance'),
            idx('domain_creative'), idx('domain_tech'), idx('domain_social'), idx('domain_admin'),
            idx('cog_load_complex'), idx('cog_load_deep'),
            idx('context_saturation'),
        ],
        'hidden_layer_sizes': (32, 16),
        'label_source': 'cognitive',
        'desc': 'ContextSwitch: domain switching + cognitive load + saturation',
    },
    'social-blocking-risk': {
        'features': seg_range('social') + [
            idx('collab_solo'), idx('collab_delegation'), idx('collab_collaboration'),
            idx('delegate_candidate'),
            idx('is_waiting_for'), idx('has_person_dep'), idx('entity_reliability'),
        ],
        'hidden_layer_sizes': (32, 16),
        'label_source': 'cognitive',
        'desc': 'SocialBlocking: people blocking + coordination + waiting',
    },
    'motivation-risk': {
        'features': [
            idx('motivation_alignment'),
            idx('gtd_horizon_runway'), idx('gtd_horizon_10k'), idx('gtd_horizon_20k'),
            idx('gtd_horizon_30k'), idx('gtd_horizon_40k'),
            idx('priority_urgent_important'), idx('priority_urgent_not'),
            idx('priority_not_urgent_important'), idx('priority_not_urgent_not'),
            idx('promote_to_project'),
            idx('is_pinned_someday'),
        ],
        'hidden_layer_sizes': (32, 16),
        'label_source': 'cognitive',
        'desc': 'Motivation: horizon + priority + intrinsic drive',
    },
    'portfolio-risk-risk': {
        'features': seg_range('portfolio') + [
            idx('has_project'), idx('has_deadline'), idx('time_pressure_score'),
            idx('stale_risk'), idx('review_cadence_mismatch'),
        ],
        'hidden_layer_sizes': (32, 16),
        'label_source': 'cognitive',
        'desc': 'PortfolioRisk: cross-item context + deadline clustering',
    },
}

print(f"\nFeature slice summary ({len(MODEL_SPECS)} specialists):")
for name, spec in MODEL_SPECS.items():
    src = spec['label_source']
    print(f"  {name}: {len(spec['features'])} features ({src} labels)")


# ============================================================
# STEP 3: Load corpus data from all personas
# ============================================================

print("\n--- Loading corpus data from personas ---")

REL_TYPE_MAP = {
    'spouse': 0, 'parent': 1, 'child': 2, 'colleague': 3,
    'reports-to': 4, 'reports_to': 4,
    'healthcare-provider': 5, 'healthcare': 5,
    'friend': 6, 'org-member': 7, 'org_member': 7,
    'neighbor': 8, 'lawyer': 8, 'veterinarian': 8, 'client': 8,
    'works-at': 8, 'lives-at': 8, 'unknown': 8,
}

RESP_SPEED_MAP = {
    'fast': PERSON_DIMS.index('resp_fast'),
    'normal': PERSON_DIMS.index('resp_normal'),
    'slow': PERSON_DIMS.index('resp_slow'),
    'unpredictable': PERSON_DIMS.index('resp_unknown'),
    'unknown': PERSON_DIMS.index('resp_unknown'),
}


def load_all_personas():
    personas = []
    for persona_name in sorted(os.listdir(PERSONAS_DIR)):
        persona_dir = os.path.join(PERSONAS_DIR, persona_name)
        corpus_path = os.path.join(persona_dir, 'corpus.json')
        user_path = os.path.join(persona_dir, 'synthetic-user.json')
        if not os.path.isfile(corpus_path):
            continue
        with open(corpus_path) as f:
            corpus = json.load(f)
        synthetic_user = None
        if os.path.isfile(user_path):
            with open(user_path) as f:
                synthetic_user = json.load(f)
        items = corpus.get('items', [])
        has_cog = sum(1 for i in items if i.get('metadata', {}).get('cognitiveLabels'))
        persona_display = corpus.get('personaName', persona_name)
        personas.append({
            'name': persona_name,
            'display_name': persona_display,
            'items': items,
            'synthetic_user': synthetic_user,
        })
        print(f"  {persona_display}: {len(items)} items ({has_cog} with cognitiveLabels)")
    return personas


personas = load_all_personas()
total_items = sum(len(p['items']) for p in personas)
print(f"  TOTAL: {total_items} items from {len(personas)} personas")

if total_items == 0:
    print("\nERROR: No corpus items found. Run generate-corpus.ts first.")
    sys.exit(1)


# ============================================================
# STEP 4: Entity lookup helpers
# ============================================================

def build_entity_lookup(synthetic_user):
    if not synthetic_user:
        return {}, {}, {}
    gt = synthetic_user.get('groundTruth', {})
    name_to_canonical = {}
    for entity in gt.get('entities', []):
        canonical = entity['canonicalName']
        name_to_canonical[canonical] = canonical
        name_to_canonical[canonical.lower()] = canonical
        for alias in entity.get('aliases', []):
            name_to_canonical[alias] = canonical
            name_to_canonical[alias.lower()] = canonical
    canonical_to_rel = {}
    for rel in gt.get('relationships', []):
        canonical_to_rel[rel['entity']] = rel['type']
    entity_behaviors = gt.get('entityBehaviors', {})
    return name_to_canonical, canonical_to_rel, entity_behaviors


def count_entity_mentions(items, name_to_canonical):
    counts = {}
    for item in items:
        seen = set()
        for mention in item.get('entityMentions', []):
            if mention.get('entityType') == 'PER':
                entity_text = mention.get('entityText', '')
                canonical = name_to_canonical.get(entity_text,
                            name_to_canonical.get(entity_text.lower()))
                if canonical and canonical not in seen:
                    counts[canonical] = counts.get(canonical, 0) + 1
                    seen.add(canonical)
    return counts


def compute_portfolio_context(items):
    """Compute binder-level cross-item portfolio context."""
    ctx_counts = {}
    deadline_days = {}
    projects = {}
    max_dep_depth = 0
    for item in items:
        meta = item.get('metadata', {})
        rf = meta.get('riskFactors', {})
        ctx = meta.get('context')
        if ctx:
            ctx_counts[ctx] = ctx_counts.get(ctx, 0) + 1
        dl = meta.get('deadline')
        if dl:
            day = dl[:10]
            deadline_days[day] = deadline_days.get(day, 0) + 1
        proj = rf.get('project')
        if proj:
            if proj not in projects:
                projects[proj] = {'total': 0, 'done': 0, 'recent': 0}
            projects[proj]['total'] += 1
            if meta.get('status') == 'done':
                projects[proj]['done'] += 1
            if (rf.get('driftRisk') or 0) <= 3:
                projects[proj]['recent'] += 1
        if rf.get('dependencyBlocked') and meta.get('status') == 'waiting':
            depth = sum(1 for i in items if i.get('metadata', {}).get('status') == 'waiting'
                        and i.get('metadata', {}).get('riskFactors', {}).get('project') == proj)
            max_dep_depth = max(max_dep_depth, depth)
    return {'ctx_counts': ctx_counts, 'total': len(items), 'projects': projects,
            'deadline_days': deadline_days, 'max_dep_depth': max_dep_depth}


# ============================================================
# STEP 5: Build full N_ALL-dim vector from a corpus item
# ============================================================

def build_full_vector(item, name_to_canonical, canonical_to_rel,
                      entity_behaviors, entity_mention_counts,
                      reference_time_ms, portfolio_ctx):
    """Build full N_ALL-dim vector from a single corpus item.

    Populates ALL 10 segments with available signal from corpus metadata,
    riskFactors, and cognitiveLabels.
    """
    vector = np.zeros(N_ALL, dtype=np.float32)
    meta = item.get('metadata', {})
    rf = meta.get('riskFactors', {})
    cl = meta.get('cognitiveLabels', {}) or {}
    content = item.get('content', '')

    # --- Helper setters ---
    def set_task(name, value):
        i = TASK_DIMS.index(name) if name in TASK_DIMS else -1
        if i >= 0: vector[TASK_BASE + i] = value

    def set_cal(name, value):
        i = CAL_DIMS.index(name) if name in CAL_DIMS else -1
        if i >= 0: vector[CAL_BASE + i] = value

    def set_cog(name, value):
        i = COG_DIMS.index(name) if name in COG_DIMS else -1
        if i >= 0: vector[COG_BASE + i] = value

    def set_comp(name, value):
        i = COMP_DIMS.index(name) if name in COMP_DIMS else -1
        if i >= 0: vector[COMP_BASE + i] = value

    def set_enr(name, value):
        i = ENR_DIMS.index(name) if name in ENR_DIMS else -1
        if i >= 0: vector[ENR_BASE + i] = value

    def set_temp(name, value):
        i = TEMP_DIMS.index(name) if name in TEMP_DIMS else -1
        if i >= 0: vector[TEMP_BASE + i] = value

    def set_soc(name, value):
        i = SOC_DIMS.index(name) if name in SOC_DIMS else -1
        if i >= 0: vector[SOC_BASE + i] = value

    def set_port(name, value):
        i = PORT_DIMS.index(name) if name in PORT_DIMS else -1
        if i >= 0: vector[PORT_BASE + i] = value

    def set_cont(name, value):
        i = CONT_DIMS.index(name) if name in CONT_DIMS else -1
        if i >= 0: vector[CONT_BASE + i] = value

    # ===== TASK segment =====
    set_task('status_open', 1.0)

    if item.get('expectedRelationships') and len(item['expectedRelationships']) > 0:
        set_task('has_person_dep', 1.0)

    deadline_str = meta.get('deadline')
    days_to_deadline = 999.0
    has_deadline = False
    if deadline_str:
        try:
            deadline_ms = datetime.fromisoformat(deadline_str.replace('Z', '+00:00')).timestamp() * 1000
            has_deadline = True
            days_to_deadline = (deadline_ms - reference_time_ms) / (24 * 60 * 60 * 1000)
            set_task('has_deadline', 1.0)
            set_task('days_to_deadline_norm', max(0, min(1, days_to_deadline / 30)))
            set_task('time_pressure_score', 1.0 / (1.0 + math.exp(0.3 * (days_to_deadline - 7))))
        except (ValueError, TypeError):
            pass

    status = meta.get('status', 'open')
    if status == 'done':
        set_task('status_open', 0.0); set_task('status_done', 1.0)
    elif status == 'dropped':
        set_task('status_open', 0.0); set_task('status_dropped', 1.0)
    elif status == 'waiting':
        set_task('is_waiting_for', 1.0)
    if meta.get('waitingFor'):
        set_task('is_waiting_for', 1.0)

    energy = meta.get('energy', 'medium')
    for e, d in [('low', 'energy_low'), ('medium', 'energy_medium'), ('high', 'energy_high')]:
        if energy == e: set_task(d, 1.0)

    context = meta.get('context', '@anywhere')
    ctx_map = {'@home': 'ctx_home', '@office': 'ctx_office', '@phone': 'ctx_phone',
               '@computer': 'ctx_computer', '@errands': 'ctx_errands', '@anywhere': 'ctx_anywhere'}
    if context in ctx_map:
        set_task(ctx_map[context], 1.0)

    created_at = meta.get('createdAt')
    if created_at:
        try:
            created_ms = datetime.fromisoformat(created_at.replace('Z', '+00:00')).timestamp() * 1000
            age_norm = min(1.0, max(0, (reference_time_ms - created_ms) / (90 * 24 * 60 * 60 * 1000)))
            set_task('age_norm', age_norm)
            set_task('staleness_norm', age_norm)
        except (ValueError, TypeError):
            pass

    if rf:
        drift = rf.get('driftRisk', 0) or 0
        if drift > 0:
            set_task('staleness_norm', min(1.0, drift / 30))
            set_task('prev_staleness_score', min(1.0, drift / 45))
        set_task('prev_energy_fit', 0.15 if rf.get('energyMismatch') else 0.7)
        if rf.get('project'):
            set_task('has_project', 1.0)
        stage_depth = {'inbox': 0.0, 'clarified': 0.2, 'organized': 0.4,
                       'actionable': 0.6, 'waiting': 0.5, 'someday': 0.1}
        set_task('enrichment_depth_norm', stage_depth.get(rf.get('gtdStage', 'inbox'), 0.0))

    # Extended task dims
    words = len(content.split())
    set_task('content_length_norm', min(1, words / 100))
    if deadline_str and created_at:
        set_task('has_scheduled_date', 1.0)
    if meta.get('priority') == 'high' and rf.get('fragility'):
        set_task('is_pinned_critical', 1.0)
    if rf.get('gtdStage') == 'someday':
        set_task('is_pinned_someday', 1.0)

    # ===== PERSON segment =====
    per_mentions = [m for m in item.get('entityMentions', []) if m.get('entityType') == 'PER']
    if per_mentions:
        best = per_mentions[0].get('entityText', '')
        canonical = name_to_canonical.get(best, name_to_canonical.get(best.lower()))
        if canonical:
            rel_type = canonical_to_rel.get(canonical, 'unknown')
            rel_idx = REL_TYPE_MAP.get(rel_type, 8)
            vector[PERSON_BASE + rel_idx] = 1.0

            behavior = entity_behaviors.get(canonical, {})
            reliability = behavior.get('reliability', 0.5)
            resp_speed = behavior.get('responseSpeed', 'unknown')

            vector[PERSON_BASE + PERSON_DIMS.index('reliability_score')] = reliability
            resp_idx = RESP_SPEED_MAP.get(resp_speed, PERSON_DIMS.index('resp_unknown'))
            vector[PERSON_BASE + resp_idx] = 1.0

            mc = entity_mention_counts.get(canonical, 1)
            mc_norm = min(mc / 50.0, 1.0)
            vector[PERSON_BASE + PERSON_DIMS.index('mention_count_norm')] = mc_norm
            recency_norm = 0.3 + 0.5 * mc_norm
            vector[PERSON_BASE + PERSON_DIMS.index('recency_norm')] = min(recency_norm, 1.0)
            vector[PERSON_BASE + PERSON_DIMS.index('days_since_seen_norm')] = max(0, 1.0 - recency_norm)
            vector[PERSON_BASE + PERSON_DIMS.index('confidence_norm')] = min(reliability * 0.7 + 0.15, 1.0)

            if mc < 5:
                vector[PERSON_BASE + PERSON_DIMS.index('collab_low')] = 1.0
            elif mc <= 20:
                vector[PERSON_BASE + PERSON_DIMS.index('collab_medium')] = 1.0
            else:
                vector[PERSON_BASE + PERSON_DIMS.index('collab_high')] = 1.0

            # Cross-vector: task entity_* dims from person data
            set_task('entity_reliability', reliability)
            if resp_speed == 'fast':
                set_task('entity_resp_fast', 1.0)
            elif resp_speed == 'slow':
                set_task('entity_resp_slow', 1.0)
            else:
                set_task('entity_resp_unknown', 1.0)
        else:
            vector[PERSON_BASE + PERSON_DIMS.index('rel_unknown')] = 1.0
            set_task('entity_reliability', 0.5)
            set_task('entity_resp_unknown', 1.0)
    else:
        vector[PERSON_BASE + PERSON_DIMS.index('rel_unknown')] = 1.0
        set_task('entity_reliability', 0.5)
        set_task('entity_resp_unknown', 1.0)

    # ===== CALENDAR segment (rich — from 71_) =====
    tod_map = {'@office': 0.35, '@computer': 0.4, '@phone': 0.45,
               '@errands': 0.5, '@home': 0.7, '@anywhere': 0.5}
    set_cal('start_tod_norm', tod_map.get(context, 0.45))

    if has_deadline and deadline_str:
        try:
            d = datetime.fromisoformat(deadline_str.replace('Z', '+00:00'))
            dow = d.weekday()
            dow_names = ['dow_mon', 'dow_tue', 'dow_wed', 'dow_thu', 'dow_fri', 'dow_sat', 'dow_sun']
            set_cal(dow_names[dow], 1.0)
            set_cal('has_deadline', 1.0)
            set_cal('days_to_event_norm', max(0, min(1, days_to_deadline / 30)))
            set_cal('time_pressure_score', 1.0 / (1.0 + math.exp(0.3 * (days_to_deadline - 7))))
            if days_to_deadline < 3: set_cal('overrun_risk', 0.8)
            elif days_to_deadline < 7: set_cal('overrun_risk', 0.4)
            else: set_cal('overrun_risk', 0.1)
            if days_to_deadline < 2: set_cal('slack_before_none', 1.0)
            elif days_to_deadline < 5: set_cal('slack_before_short', 1.0)
            elif days_to_deadline < 14: set_cal('slack_before_medium', 1.0)
            else: set_cal('slack_before_long', 1.0)
        except (ValueError, TypeError):
            set_cal('dow_wed', 1.0); set_cal('slack_before_medium', 1.0)
    else:
        set_cal('dow_wed', 1.0); set_cal('slack_before_medium', 1.0)

    dur_map = {'high': 'dur_60_120', 'medium': 'dur_30_60', 'low': 'dur_lt30'}
    set_cal(dur_map.get(energy, 'dur_30_60'), 1.0)

    cal_energy_map = {'low': 'energy_low', 'medium': 'energy_medium', 'high': 'energy_high'}
    if energy in cal_energy_map:
        set_cal(cal_energy_map[energy], 1.0)

    if energy == 'high': set_cal('prep_medium', 1.0)
    else: set_cal('prep_none', 1.0)

    if meta.get('priority') == 'high':
        set_cal('entity_is_high_priority', 1.0)
    if context == '@errands':
        set_cal('mobility_required', 1.0)

    mentions = item.get('entityMentions', [])
    if any(m.get('entityType') == 'PER' for m in mentions):
        set_cal('has_person_entity', 1.0)
    if any(m.get('entityType') == 'ORG' for m in mentions):
        set_cal('has_org_entity', 1.0)
    if any(m.get('entityType') == 'LOC' for m in mentions):
        set_cal('has_loc_entity', 1.0)

    # ===== COGNITIVE segment (from cognitiveLabels ground truth) =====
    if cl:
        load_map = {1: 'cog_load_trivial', 2: 'cog_load_routine', 3: 'cog_load_complex', 4: 'cog_load_deep'}
        if cl.get('cognitiveLoad') in load_map:
            set_cog(load_map[cl['cognitiveLoad']], 1.0)
        collab = cl.get('collaborationType')
        if collab: set_cog(f'collab_{collab}', 1.0)
        tone = cl.get('emotionalTone')
        if tone: set_cog(f'emotion_{tone}', 1.0)
        horizon = cl.get('gtdHorizon')
        if horizon: set_cog(f'gtd_horizon_{horizon}', 1.0)
        lifecycle_map = {'ephemeral': 'info_lifecycle_ephemeral', 'short-lived': 'info_lifecycle_short_lived',
                         'stable': 'info_lifecycle_stable', 'permanent': 'info_lifecycle_permanent'}
        if cl.get('infoLifecycle') in lifecycle_map:
            set_cog(lifecycle_map[cl['infoLifecycle']], 1.0)
        domain = cl.get('domain')
        if domain: set_cog(f'domain_{domain}', 1.0)
        pq_map = {'urgent-important': 'priority_urgent_important', 'urgent-not': 'priority_urgent_not',
                   'not-urgent-important': 'priority_not_urgent_important', 'not-urgent-not': 'priority_not_urgent_not'}
        if cl.get('priorityQuadrant') in pq_map:
            set_cog(pq_map[cl['priorityQuadrant']], 1.0)
        cadence = cl.get('reviewCadence')
        if cadence: set_cog(f'review_cadence_{cadence}', 1.0)
        te = cl.get('timeEstimate')
        if te: set_cog(f'time_est_{te}', 1.0)

    # ===== COMPOSITE segment =====
    if meta.get('priority') == 'high' and energy == 'low':
        set_comp('quick_win', 1.0)
    if cl.get('collaborationType') == 'delegation':
        set_comp('delegate_candidate', 1.0)
    if cl.get('cognitiveLoad', 0) >= 3:
        set_comp('deep_work_block', 1.0)
    if cl.get('stressLevel') is not None:
        set_comp('stress_risk', cl['stressLevel'])
    if rf.get('driftRisk', 0) > 7:
        set_comp('stale_risk', min(1, rf['driftRisk'] / 30))
    if cl.get('contextSwitchCost') is not None:
        set_comp('context_switch_cost', cl['contextSwitchCost'])
    if energy == 'high' and not rf.get('project'):
        set_comp('promote_to_project', 1.0)
    if cl.get('reviewCadence') and rf.get('driftRisk', 0) > 14:
        set_comp('review_cadence_mismatch', 1.0)

    # ===== ENRICHMENT segment =====
    stage = rf.get('gtdStage', 'inbox')
    if stage in ('actionable', 'organized', 'waiting'):
        set_enr('enrichment_outcome_done', 1.0)
        set_enr('enrichment_next_action_done', 1.0)
        set_enr('enrichment_context_done', 1.0 if meta.get('context') else 0.0)
        set_enr('enrichment_timeframe_done', 1.0 if deadline_str else 0.0)
        set_enr('maturity_score', 0.8)
    elif stage == 'clarified':
        set_enr('enrichment_outcome_done', 1.0)
        set_enr('maturity_score', 0.4)
    elif stage == 'someday':
        set_enr('enrichment_outcome_done', 1.0)
        set_enr('maturity_score', 0.3)

    # ===== TEMPORAL segment =====
    drift = rf.get('driftRisk', 0) or 0
    if drift > 0:
        set_temp('drift_velocity', min(1, drift / 30))
    if cl.get('timesPostponed', 0) > 0:
        set_temp('times_postponed_norm', min(1, cl['timesPostponed'] / 5))
    elif rf.get('renegotiationNeeded'):
        set_temp('times_postponed_norm', 0.6)
    if has_deadline and days_to_deadline < 999:
        if days_to_deadline < 3: set_temp('urgency_trajectory', 0.9)
        elif days_to_deadline < 7: set_temp('urgency_trajectory', 0.5)
        else: set_temp('urgency_trajectory', 0.1)
    if rf.get('gtdStage') == 'someday':
        set_temp('someday_bounce_norm', 0.4)

    # ===== SOCIAL segment =====
    unique_people = set(m.get('entityText') for m in per_mentions)
    set_soc('coordination_complexity_norm', min(1, len(unique_people) / 5))
    if meta.get('waitingFor') or status == 'waiting':
        set_soc('social_blocking_score', 0.7)
        if created_at:
            try:
                wait_ms = reference_time_ms - datetime.fromisoformat(created_at.replace('Z', '+00:00')).timestamp() * 1000
                set_soc('waiting_duration_norm', min(1, max(0, wait_ms / (30 * 24 * 60 * 60 * 1000))))
            except (ValueError, TypeError):
                pass

    # ===== PORTFOLIO segment =====
    if portfolio_ctx and portfolio_ctx['total'] >= 5:
        if context and context in portfolio_ctx['ctx_counts']:
            set_port('context_saturation', min(1, portfolio_ctx['ctx_counts'][context] / 10))
        if deadline_str:
            day = deadline_str[:10]
            cluster = portfolio_ctx['deadline_days'].get(day, 0)
            set_port('deadline_cluster_density', min(1, cluster / 5))
        proj = rf.get('project')
        if proj and proj in portfolio_ctx['projects']:
            ps = portfolio_ctx['projects'][proj]
            momentum = ps['recent'] / ps['total'] if ps['total'] > 0 else 0
            set_port('project_momentum', momentum)
        set_port('dependency_chain_depth_norm', min(1, portfolio_ctx['max_dep_depth'] / 5))

    # ===== CONTENT segment (from cognitiveLabels ground truth) =====
    if cl.get('ambiguityScore') is not None:
        set_cont('ambiguity_score', cl['ambiguityScore'])
    if cl.get('outcomeClarity') is not None:
        set_cont('outcome_clarity', cl['outcomeClarity'])
    if cl.get('ambiguityScore') is not None:
        set_cont('next_action_clarity', 1.0 - cl['ambiguityScore'])
    if cl.get('decisionRequired') is not None:
        set_cont('decision_required', cl['decisionRequired'])
    if cl.get('motivationAlignment') is not None:
        set_cont('motivation_alignment', cl['motivationAlignment'])
    completeness = (0.25 if meta.get('context') else 0) + (0.25 if deadline_str else 0) + \
                   (0.25 if energy else 0) + (0.25 if cl.get('outcomeClarity', 0) > 0.5 else 0)
    set_cont('information_completeness', completeness)

    return vector


# ============================================================
# STEP 6: Risk label derivation (both original + orthogonal)
# ============================================================

RISK_DOMAINS = ['time-pressure', 'dependency', 'staleness', 'energy-context']
COGNITIVE_DOMAINS = ['ambiguity', 'cognitive-complexity', 'emotional-tone', 'temporal-drift',
                     'context-switch', 'social-blocking', 'motivation', 'portfolio-risk']
ALL_DOMAINS = RISK_DOMAINS + COGNITIVE_DOMAINS


def derive_risk_labels(item, reference_time_ms):
    """Derive per-domain risk labels from corpus riskFactors metadata."""
    meta = item.get('metadata', {})
    rf = meta.get('riskFactors', {})

    has_deadline = meta.get('deadline') is not None
    days_to_deadline = 999.0
    time_pressure_score = 0.0
    if has_deadline:
        try:
            deadline_ms = datetime.fromisoformat(
                meta['deadline'].replace('Z', '+00:00')
            ).timestamp() * 1000
            days_to_deadline = (deadline_ms - reference_time_ms) / (24 * 60 * 60 * 1000)
            time_pressure_score = 1.0 / (1.0 + math.exp(0.3 * (days_to_deadline - 7)))
        except (ValueError, TypeError):
            has_deadline = False

    tp_label = 1.0 if (has_deadline and days_to_deadline < 7) or time_pressure_score > 0.6 else 0.0
    dep_blocked = rf.get('dependencyBlocked', False)
    dep_label = 1.0 if dep_blocked else 0.0
    drift_risk = rf.get('driftRisk', 0) or 0
    has_project = rf.get('project') is not None
    stale_label = 1.0 if drift_risk > 7 and has_project and not dep_blocked else 0.0
    energy_mismatch = rf.get('energyMismatch', False)
    ec_label = 1.0 if energy_mismatch else 0.0

    return {
        'time-pressure': tp_label,
        'dependency': dep_label,
        'staleness': stale_label,
        'energy-context': ec_label,
    }


def derive_cognitive_labels(item):
    """Derive risk labels for orthogonal specialists from cognitiveLabels."""
    cl = item.get('metadata', {}).get('cognitiveLabels', {}) or {}
    rf = item.get('metadata', {}).get('riskFactors', {})

    ambiguity_label = 1.0 if cl.get('ambiguityScore', 0) > 0.5 else 0.0
    cog_label = 1.0 if cl.get('cognitiveLoad', 1) >= 3 else 0.0
    tone = cl.get('emotionalTone', 'neutral')
    emotion_label = 1.0 if tone in ('negative', 'anxious') else 0.0
    postponed = cl.get('timesPostponed', 0)
    drift = rf.get('driftRisk', 0) or 0
    temporal_label = 1.0 if postponed >= 2 or drift > 10 else 0.0
    switch_label = 1.0 if cl.get('contextSwitchCost', 0) > 0.5 else 0.0
    collab = cl.get('collaborationType', 'solo')
    is_waiting = item.get('metadata', {}).get('status') == 'waiting'
    social_label = 1.0 if (collab == 'delegation' and is_waiting) or rf.get('dependencyBlocked') else 0.0
    motivation_label = 1.0 if cl.get('motivationAlignment', 0.5) < 0.3 else 0.0
    stress = cl.get('stressLevel', 0)
    has_multiple_risks = sum([
        rf.get('driftRisk', 0) > 7,
        rf.get('dependencyBlocked', False),
        rf.get('fragility', False),
        rf.get('renegotiationNeeded', False),
    ]) >= 2
    portfolio_label = 1.0 if stress > 0.6 or has_multiple_risks else 0.0

    return {
        'ambiguity': ambiguity_label,
        'cognitive-complexity': cog_label,
        'emotional-tone': emotion_label,
        'temporal-drift': temporal_label,
        'context-switch': switch_label,
        'social-blocking': social_label,
        'motivation': motivation_label,
        'portfolio-risk': portfolio_label,
    }


# ============================================================
# STEP 7: Build full dataset
# ============================================================

print("\n--- Building full-dim vectors from corpus items ---")

REFERENCE_TIME_MS = datetime(2026, 3, 13).timestamp() * 1000

all_vectors = []
all_labels = {d: [] for d in ALL_DOMAINS}
per_persona_stats = []

for persona in personas:
    items = persona['items']
    synthetic_user = persona['synthetic_user']
    name_to_canonical, canonical_to_rel, entity_behaviors = build_entity_lookup(synthetic_user)
    entity_mention_counts = count_entity_mentions(items, name_to_canonical)
    portfolio_ctx = compute_portfolio_context(items)

    persona_labels = {d: [] for d in ALL_DOMAINS}
    persona_count = 0

    for item in items:
        vector = build_full_vector(
            item, name_to_canonical, canonical_to_rel,
            entity_behaviors, entity_mention_counts,
            REFERENCE_TIME_MS, portfolio_ctx
        )

        risk_labels = derive_risk_labels(item, REFERENCE_TIME_MS)
        cog_labels = derive_cognitive_labels(item)
        labels = {**risk_labels, **cog_labels}

        all_vectors.append(vector)
        for d in ALL_DOMAINS:
            all_labels[d].append(labels[d])
            persona_labels[d].append(labels[d])
        persona_count += 1

    n = persona_count
    if n > 0:
        stats = {'name': persona['display_name'], 'count': n}
        for d in ALL_DOMAINS:
            pos = sum(1 for l in persona_labels[d] if l > 0)
            stats[d] = f"{pos}/{n} ({100*pos/n:.0f}%)"
        per_persona_stats.append(stats)

# Print distribution table
print(f"\nPer-persona risk label distribution:")
# Split into two tables for readability
print(f"\n  Original 4 specialists:")
print(f"  {'Persona':<20} {'N':>4}  {'time-press':>12} {'staleness':>12} {'dependency':>12} {'energy-ctx':>12}")
for s in per_persona_stats:
    print(f"    {s['name']:<18} {s['count']:>4}  {s.get('time-pressure',''):>12} {s.get('staleness',''):>12} "
          f"{s.get('dependency',''):>12} {s.get('energy-context',''):>12}")

print(f"\n  Orthogonal 8 specialists:")
print(f"  {'Persona':<20} {'N':>4}  {'ambiguity':>10} {'cog-compl':>10} {'emotion':>10} {'temp-drift':>10} "
      f"{'ctx-switch':>10} {'soc-block':>10} {'motivatn':>10} {'portfolio':>10}")
for s in per_persona_stats:
    print(f"    {s['name']:<18} {s['count']:>4}  {s.get('ambiguity',''):>10} {s.get('cognitive-complexity',''):>10} "
          f"{s.get('emotional-tone',''):>10} {s.get('temporal-drift',''):>10} {s.get('context-switch',''):>10} "
          f"{s.get('social-blocking',''):>10} {s.get('motivation',''):>10} {s.get('portfolio-risk',''):>10}")

X_raw = np.array(all_vectors, dtype=np.float32)
y_raw = {d: np.array(labels, dtype=np.float32) for d, labels in all_labels.items()}

print(f"\nDataset: {X_raw.shape[0]} samples x {X_raw.shape[1]} features")
for d in ALL_DOMAINS:
    pos = y_raw[d].sum()
    print(f"  {d}: {pos:.0f}/{len(y_raw[d])} positive ({100*y_raw[d].mean():.1f}%)")

assert X_raw.shape[1] == N_ALL, f"Expected {N_ALL} feature dims, got {X_raw.shape[1]}"


# ============================================================
# STEP 8: Data augmentation
# ============================================================

print("\n--- Augmenting dataset ---")

N_AUG = 8
AUG_NOISE = 0.05

augmented_X = [X_raw.copy()]
augmented_y = {d: [y_raw[d].copy()] for d in ALL_DOMAINS}

for _ in range(N_AUG):
    noisy = X_raw.copy()
    for j in range(noisy.shape[1]):
        col = noisy[:, j]
        is_continuous = np.any((col > 0) & (col < 1))
        if is_continuous:
            noisy[:, j] = np.clip(col + np.random.normal(0, AUG_NOISE, col.shape), 0, 1)
    augmented_X.append(noisy)
    for d in ALL_DOMAINS:
        augmented_y[d].append(y_raw[d].copy())

X = np.vstack(augmented_X)
y = {d: np.concatenate(augmented_y[d]) for d in ALL_DOMAINS}

print(f"Augmented: {X.shape[0]} samples ({X_raw.shape[0]} raw + {X.shape[0] - X_raw.shape[0]} augmented)")
for d in ALL_DOMAINS:
    pos = y[d].sum()
    print(f"  {d}: {pos:.0f}/{len(y[d])} positive ({100*y[d].mean():.1f}%)")


# ============================================================
# STEP 9: Train and export ALL specialists
# ============================================================

print("\n--- Training and exporting ALL specialist models ---")

try:
    from skl2onnx import convert_sklearn
    from skl2onnx.common.data_types import FloatTensorType
    import onnxruntime as ort
except ImportError as e:
    print(f"ERROR: {e}\nInstall: pip install skl2onnx onnxruntime")
    sys.exit(1)

# Model name -> domain key mapping
MODEL_TO_DOMAIN = {
    'time-pressure-risk': 'time-pressure',
    'dependency-risk': 'dependency',
    'staleness-risk': 'staleness',
    'energy-context-risk': 'energy-context',
    'ambiguity-risk': 'ambiguity',
    'cognitive-complexity-risk': 'cognitive-complexity',
    'emotional-tone-risk': 'emotional-tone',
    'temporal-drift-risk': 'temporal-drift',
    'context-switch-risk': 'context-switch',
    'social-blocking-risk': 'social-blocking',
    'motivation-risk': 'motivation',
    'portfolio-risk-risk': 'portfolio-risk',
}

results = []

for model_name, spec in MODEL_SPECS.items():
    domain_key = MODEL_TO_DOMAIN[model_name]
    features = spec['features']
    hidden = spec['hidden_layer_sizes']
    desc = spec['desc']
    label_src = spec['label_source']

    print(f"\n[{model_name}] domain: {domain_key} (labels: {label_src})")
    print(f"  {desc}")
    print(f"  Features: {len(features)}")

    X_slice = X[:, features]
    y_domain = y[domain_key]
    pos_rate = y_domain.mean()
    print(f"  Prevalence: {100*pos_rate:.1f}% positive ({y_domain.sum():.0f}/{len(y_domain)})")

    if pos_rate == 0 or pos_rate == 1:
        print(f"  SKIPPED: no variance in labels")
        continue

    X_train, X_test, y_train, y_test = train_test_split(
        X_slice, y_domain, test_size=0.2, random_state=42, stratify=y_domain
    )

    pipe = Pipeline([
        ('scaler', StandardScaler()),
        ('clf', MLPClassifier(
            hidden_layer_sizes=hidden,
            activation='relu',
            max_iter=500,
            early_stopping=True,
            validation_fraction=0.15,
            random_state=42,
        )),
    ])

    pipe.fit(X_train, y_train)

    y_pred = pipe.predict(X_test)
    y_prob = pipe.predict_proba(X_test)[:, 1]
    acc = accuracy_score(y_test, y_pred)
    try:
        auc = roc_auc_score(y_test, y_prob)
    except ValueError:
        auc = 0.5

    print(f"  Accuracy: {acc:.4f}  |  ROC-AUC: {auc:.4f}")

    # Export ONNX
    initial_type = [('X', FloatTensorType([None, len(features)]))]
    options = {id(pipe): {'zipmap': False}}
    onnx_model = convert_sklearn(pipe, initial_types=initial_type, options=options, target_opset=15)

    out_path = os.path.join(OUTPUT_DIR, f'{model_name}.onnx')
    with open(out_path, 'wb') as f:
        f.write(onnx_model.SerializeToString())

    size_kb = os.path.getsize(out_path) / 1024
    print(f"  Exported: {out_path}")
    print(f"  Size: {size_kb:.1f} KB")

    if size_kb > 20:
        print(f"  WARNING: exceeds 20KB limit!")

    # Validate
    sess = ort.InferenceSession(out_path)
    test_input = np.zeros((1, len(features)), dtype=np.float32)
    outputs = sess.run(None, {'X': test_input})
    prob_shape = outputs[1].shape if len(outputs) > 1 else outputs[0].shape
    print(f"  Validated: shape {prob_shape}")

    results.append({
        'name': model_name,
        'features': len(features),
        'prevalence': f'{100*pos_rate:.1f}%',
        'accuracy': acc,
        'auc': auc,
        'size_kb': size_kb,
        'label_source': label_src,
    })


# ============================================================
# Summary
# ============================================================

print("\n" + "=" * 80)
print(" UNIFIED SPECIALIST TRAINING SUMMARY")
print("=" * 80)
print(f"\n  Data source: {len(personas)} persona corpora ({X_raw.shape[0]} items)")
print(f"  Vector dims: {N_ALL} (full canonical vector)")
print(f"  Augmented to: {X.shape[0]} training samples")

print(f"\n  Original 4 (risk labels from riskFactors metadata):")
print(f"  {'Model':<28} {'Features':>8} {'Prevalence':>10} {'Accuracy':>10} {'ROC-AUC':>10} {'Size':>8}")
for r in results:
    if r['label_source'] == 'risk':
        print(f"    {r['name']:<26} {r['features']:>8} {r['prevalence']:>10} {r['accuracy']:>10.4f} {r['auc']:>10.4f} {r['size_kb']:>7.1f}KB")

print(f"\n  Orthogonal 8 (cognitive labels from cognitiveLabels metadata):")
print(f"  {'Model':<28} {'Features':>8} {'Prevalence':>10} {'Accuracy':>10} {'ROC-AUC':>10} {'Size':>8}")
for r in results:
    if r['label_source'] == 'cognitive':
        print(f"    {r['name']:<26} {r['features']:>8} {r['prevalence']:>10} {r['accuracy']:>10.4f} {r['auc']:>10.4f} {r['size_kb']:>7.1f}KB")

print(f"\n  Models written to: {OUTPUT_DIR}")
print(f"  All {len(results)} specialist models exported and validated.")
