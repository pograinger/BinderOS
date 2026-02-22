use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

// ============================================================
// Constants
// ============================================================

/// 14 days in milliseconds (half-life for staleness decay)
const HALF_LIFE_MS: f64 = 14.0 * 24.0 * 60.0 * 60.0 * 1000.0;

/// 30 days in milliseconds (onboarding forgiveness window)
const ONBOARDING_WINDOW_MS: f64 = 30.0 * 24.0 * 60.0 * 60.0 * 1000.0;

/// 7 days in milliseconds (minimum age for zero-link orphan detection)
const ORPHAN_MIN_AGE_MS: f64 = 7.0 * 24.0 * 60.0 * 60.0 * 1000.0;

/// 14 days in milliseconds (minimum age for compression candidates)
const COMPRESSION_MIN_AGE_MS: f64 = 14.0 * 24.0 * 60.0 * 60.0 * 1000.0;

// ============================================================
// Input types (deserialized from JavaScript)
// ============================================================

#[derive(Deserialize, Clone)]
struct AtomInput {
    id: String,
    #[serde(rename = "type")]
    atom_type: String,
    updated_at: f64,
    created_at: f64,
    status: String,
    #[serde(default)]
    links: Vec<String>,
    due_date: Option<f64>,
    pinned_tier: Option<String>,
    #[serde(default)]
    pinned_staleness: bool,
    importance: Option<f64>,
    energy: Option<String>,
    #[serde(default)]
    content: String,
}

// ============================================================
// Output types (serialized to JavaScript)
// ============================================================

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
enum PriorityTier {
    Critical,
    High,
    Medium,
    Low,
    Someday,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
enum EnergyLevel {
    Quick,
    Medium,
    Deep,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AtomScore {
    id: String,
    staleness: f64,
    priority_tier: Option<PriorityTier>,
    priority_score: f64,
    energy: EnergyLevel,
    opacity: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EntropyScore {
    score: f64,
    level: String,
    open_tasks: u32,
    stale_count: u32,
    zero_link_count: u32,
    inbox_count: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompressionCandidate {
    id: String,
    reason: String,
    staleness: f64,
}

// ============================================================
// Internal computation helpers
// ============================================================

/// Compute staleness for an atom using exponential decay with link freshness
/// boost and onboarding forgiveness.
///
/// S(t) = 1 - 2^(-age_ms / effective_half_life)
/// - If pinned_staleness=true, returns 0.0 immediately.
/// - If atom is younger than 30 days, multiply half_life by 2.0 (onboarding).
/// - If atom is linked to at least one non-stale (staleness < 0.5) atom,
///   multiply half_life by 1.5 (link freshness boost).
fn compute_staleness(atom: &AtomInput, all_atoms: &[AtomInput], now_ms: f64) -> f64 {
    if atom.pinned_staleness {
        return 0.0;
    }

    let age_ms = (now_ms - atom.updated_at).max(0.0);
    let created_age_ms = (now_ms - atom.created_at).max(0.0);

    let mut effective_half_life = HALF_LIFE_MS;

    // Onboarding forgiveness: atoms created < 30 days ago decay at half speed
    if created_age_ms < ONBOARDING_WINDOW_MS {
        effective_half_life *= 2.0;
    }

    // Link freshness boost: if any linked atom is non-stale, decay slower
    // We use a simplified check: look up linked atoms and compute their raw staleness
    // using only their own updated_at (no recursive linking to avoid cycles)
    let has_fresh_link = atom.links.iter().any(|link_id| {
        all_atoms.iter().any(|a| {
            if &a.id == link_id {
                let link_age_ms = (now_ms - a.updated_at).max(0.0);
                let link_staleness = 1.0 - 2.0_f64.powf(-link_age_ms / HALF_LIFE_MS);
                link_staleness < 0.5
            } else {
                false
            }
        })
    });

    if has_fresh_link {
        effective_half_life *= 1.5;
    }

    let staleness = 1.0 - 2.0_f64.powf(-age_ms / effective_half_life);
    staleness.clamp(0.0, 1.0)
}

/// Infer energy level from atom content when no user override is provided.
fn infer_energy(atom: &AtomInput) -> EnergyLevel {
    let content_lower = atom.content.to_lowercase();
    let len = atom.content.len();

    // Quick: short content or quick-keyword
    if len < 50
        || content_lower.contains("quick")
        || content_lower.contains("5 min")
        || content_lower.contains("brief")
    {
        return EnergyLevel::Quick;
    }

    // Deep: long content or deep-work keywords
    if len > 200
        || content_lower.contains("research")
        || content_lower.contains("write")
        || content_lower.contains("design")
        || content_lower.contains("plan")
        || content_lower.contains("review all")
    {
        return EnergyLevel::Deep;
    }

    EnergyLevel::Medium
}

/// Parse energy level from user-provided string override.
fn parse_energy(s: &str) -> EnergyLevel {
    match s.to_lowercase().as_str() {
        "quick" => EnergyLevel::Quick,
        "deep" => EnergyLevel::Deep,
        _ => EnergyLevel::Medium,
    }
}

/// Parse priority tier from pinned tier string.
fn parse_tier(s: &str) -> PriorityTier {
    match s.to_lowercase().as_str() {
        "critical" => PriorityTier::Critical,
        "high" => PriorityTier::High,
        "medium" => PriorityTier::Medium,
        "low" => PriorityTier::Low,
        _ => PriorityTier::Someday,
    }
}

/// Map priority tier to a fixed numeric score for the pinned case.
fn tier_to_score(tier: &PriorityTier) -> f64 {
    match tier {
        PriorityTier::Critical => 0.90,
        PriorityTier::High => 0.70,
        PriorityTier::Medium => 0.50,
        PriorityTier::Low => 0.30,
        PriorityTier::Someday => 0.10,
    }
}

/// Map priority score to tier bucket.
fn score_to_tier(score: f64) -> PriorityTier {
    if score >= 0.80 {
        PriorityTier::Critical
    } else if score >= 0.60 {
        PriorityTier::High
    } else if score >= 0.40 {
        PriorityTier::Medium
    } else if score >= 0.20 {
        PriorityTier::Low
    } else {
        PriorityTier::Someday
    }
}

/// Compute priority score for a task or event atom using the 5-weight formula.
///
/// P = 0.40*deadline_urgency + 0.25*importance + 0.15*recency + 0.15*dependency_urgency + 0.05*energy_boost
fn compute_priority_score(
    atom: &AtomInput,
    all_atoms: &[AtomInput],
    atom_staleness: &HashMap<String, f64>,
    now_ms: f64,
) -> f64 {
    let now_days = now_ms / (24.0 * 60.0 * 60.0 * 1000.0);

    // --- Deadline urgency ---
    let deadline_urgency = if let Some(due_date) = atom.due_date {
        let due_days = due_date / (24.0 * 60.0 * 60.0 * 1000.0);
        let days_remaining = due_days - now_days;
        if days_remaining <= 0.0 {
            1.0 // Overdue
        } else if days_remaining > 30.0 {
            0.0 // Far future
        } else {
            1.0 - (days_remaining / 30.0).powf(0.5)
        }
    } else {
        0.0
    };

    // --- Importance ---
    let importance = atom.importance.unwrap_or(0.5).clamp(0.0, 1.0);

    // --- Recency ---
    let age_days = (now_ms - atom.updated_at).max(0.0) / (24.0 * 60.0 * 60.0 * 1000.0);
    let recency = (1.0 - (age_days / 30.0)).max(0.0);

    // --- Dependency urgency ---
    // If any linked atom is a task with high priority score (staleness < 0.3 as proxy for active), boost
    let dependency_urgency = {
        let has_urgent_dep = atom.links.iter().any(|link_id| {
            all_atoms.iter().any(|a| {
                if &a.id == link_id && (a.atom_type == "task") {
                    // Use staleness as proxy: low staleness = recently active = likely urgent
                    let dep_staleness = atom_staleness.get(&a.id).copied().unwrap_or(1.0);
                    dep_staleness < 0.3
                } else {
                    false
                }
            })
        });
        if has_urgent_dep { 0.7 } else { 0.0 }
    };

    // --- Energy boost ---
    let energy_boost = match atom.energy.as_deref() {
        Some(e) => match parse_energy(e) {
            EnergyLevel::Quick => 0.1,
            EnergyLevel::Medium => 0.0,
            EnergyLevel::Deep => -0.05,
        },
        None => match infer_energy(atom) {
            EnergyLevel::Quick => 0.1,
            EnergyLevel::Medium => 0.0,
            EnergyLevel::Deep => -0.05,
        },
    };

    // --- Weighted sum ---
    let score = 0.40 * deadline_urgency
        + 0.25 * importance
        + 0.15 * recency
        + 0.15 * dependency_urgency
        + 0.05 * energy_boost;

    score.clamp(0.0, 1.0)
}

// ============================================================
// BinderCore WASM struct
// ============================================================

/// BinderCore: WASM module for scoring, staleness, entropy, and compression.
#[wasm_bindgen]
pub struct BinderCore {
    version: String,
}

#[wasm_bindgen]
impl BinderCore {
    /// Create a new BinderCore instance.
    #[wasm_bindgen(constructor)]
    pub fn new() -> BinderCore {
        BinderCore {
            version: env!("CARGO_PKG_VERSION").to_string(),
        }
    }

    /// Smoke test for Worker communication: returns "pong".
    pub fn ping(&self) -> String {
        "pong".to_string()
    }

    /// Returns the crate version string.
    pub fn version(&self) -> String {
        self.version.clone()
    }

    /// Compute priority scores, staleness, and energy for all atoms.
    ///
    /// Input: atoms_js — array of AtomInput objects
    /// Input: now_ms — current Unix timestamp in milliseconds
    /// Output: Record<string, AtomScore> (keyed by atom id)
    pub fn compute_scores(
        &self,
        atoms_js: JsValue,
        now_ms: f64,
    ) -> Result<JsValue, JsValue> {
        let atoms: Vec<AtomInput> = serde_wasm_bindgen::from_value(atoms_js)
            .map_err(|e| JsValue::from_str(&format!("compute_scores: deserialize error: {e}")))?;

        // First pass: compute raw staleness for all atoms (for link freshness lookup)
        let staleness_map: HashMap<String, f64> = atoms
            .iter()
            .map(|a| {
                let s = compute_staleness(a, &atoms, now_ms);
                (a.id.clone(), s)
            })
            .collect();

        // Second pass: build full AtomScore for each atom
        let mut scores: HashMap<String, AtomScore> = HashMap::new();

        for atom in &atoms {
            let staleness = staleness_map.get(&atom.id).copied().unwrap_or(0.0);
            let opacity = (1.0 - staleness * 0.4).clamp(0.6, 1.0);

            // Energy: user override takes precedence
            let energy = match atom.energy.as_deref() {
                Some(e) => parse_energy(e),
                None => infer_energy(atom),
            };

            // Priority: tasks and events only
            let (priority_score, priority_tier) = if atom.atom_type == "task"
                || atom.atom_type == "event"
            {
                // Check for pinned tier override
                if let Some(ref tier_str) = atom.pinned_tier {
                    let tier = parse_tier(tier_str);
                    let score = tier_to_score(&tier);
                    (score, Some(tier))
                } else {
                    let score = compute_priority_score(atom, &atoms, &staleness_map, now_ms);
                    let tier = score_to_tier(score);
                    (score, Some(tier))
                }
            } else {
                (0.0, None)
            };

            scores.insert(
                atom.id.clone(),
                AtomScore {
                    id: atom.id.clone(),
                    staleness,
                    priority_tier,
                    priority_score,
                    energy,
                    opacity,
                },
            );
        }

        serde_wasm_bindgen::to_value(&scores)
            .map_err(|e| JsValue::from_str(&format!("compute_scores: serialize error: {e}")))
    }

    /// Compute the entropy health score for the current state.
    ///
    /// Input: atoms_js — array of AtomInput objects
    /// Input: inbox_count — current number of inbox items
    /// Input: inbox_cap — configured inbox cap
    /// Input: task_cap — configured open task cap
    /// Input: now_ms — current Unix timestamp in milliseconds
    /// Output: EntropyScore
    pub fn compute_entropy(
        &self,
        atoms_js: JsValue,
        inbox_count: u32,
        inbox_cap: u32,
        task_cap: u32,
        now_ms: f64,
    ) -> Result<JsValue, JsValue> {
        let atoms: Vec<AtomInput> = serde_wasm_bindgen::from_value(atoms_js)
            .map_err(|e| JsValue::from_str(&format!("compute_entropy: deserialize error: {e}")))?;

        let total_atoms = atoms.len() as f64;

        let mut open_tasks: u32 = 0;
        let mut stale_count: u32 = 0;
        let mut zero_link_count: u32 = 0;

        for atom in &atoms {
            // Open tasks: type=task and status in [open, in-progress]
            if atom.atom_type == "task"
                && (atom.status == "open" || atom.status == "in-progress")
            {
                open_tasks += 1;
            }

            // Stale atoms: staleness > 0.7
            let staleness = compute_staleness(atom, &atoms, now_ms);
            if staleness > 0.7 {
                stale_count += 1;
            }

            // Zero-link atoms: no links AND age > 7 days
            let age_ms = (now_ms - atom.created_at).max(0.0);
            if atom.links.is_empty() && age_ms > ORPHAN_MIN_AGE_MS {
                zero_link_count += 1;
            }
        }

        // Guard against division by zero
        let inbox_cap_f = inbox_cap.max(1) as f64;
        let task_cap_f = task_cap.max(1) as f64;
        let total_atoms_safe = total_atoms.max(1.0);

        let score = 0.35 * (open_tasks as f64 / task_cap_f)
            + 0.35 * (inbox_count as f64 / inbox_cap_f)
            + 0.20 * (stale_count as f64 / total_atoms_safe)
            + 0.10 * (zero_link_count as f64 / total_atoms_safe);

        let score = score.clamp(0.0, 1.0);

        let level = if score < 0.5 {
            "green".to_string()
        } else if score < 0.75 {
            "yellow".to_string()
        } else {
            "red".to_string()
        };

        let result = EntropyScore {
            score,
            level,
            open_tasks,
            stale_count,
            zero_link_count,
            inbox_count,
        };

        serde_wasm_bindgen::to_value(&result)
            .map_err(|e| JsValue::from_str(&format!("compute_entropy: serialize error: {e}")))
    }

    /// Filter atoms that are candidates for compression (stale or orphaned).
    ///
    /// Input: atoms_js — array of AtomInput objects
    /// Input: now_ms — current Unix timestamp in milliseconds
    /// Output: Vec<CompressionCandidate>
    pub fn filter_compression_candidates(
        &self,
        atoms_js: JsValue,
        now_ms: f64,
    ) -> Result<JsValue, JsValue> {
        let atoms: Vec<AtomInput> = serde_wasm_bindgen::from_value(atoms_js)
            .map_err(|e| {
                JsValue::from_str(&format!(
                    "filter_compression_candidates: deserialize error: {e}"
                ))
            })?;

        let mut candidates: Vec<CompressionCandidate> = Vec::new();

        for atom in &atoms {
            // Skip pinned-staleness atoms
            if atom.pinned_staleness {
                continue;
            }

            let staleness = compute_staleness(atom, &atoms, now_ms);
            let age_ms = (now_ms - atom.created_at).max(0.0);
            let age_days = age_ms / (24.0 * 60.0 * 60.0 * 1000.0);

            let is_stale = staleness > 0.8;
            let is_orphan = atom.links.is_empty() && age_ms > COMPRESSION_MIN_AGE_MS;

            if is_stale {
                let age_since_edit_ms = (now_ms - atom.updated_at).max(0.0);
                let age_since_edit_days = (age_since_edit_ms / (24.0 * 60.0 * 60.0 * 1000.0)) as u32;
                candidates.push(CompressionCandidate {
                    id: atom.id.clone(),
                    reason: format!("Stale: {} days since last edit", age_since_edit_days),
                    staleness,
                });
            } else if is_orphan {
                candidates.push(CompressionCandidate {
                    id: atom.id.clone(),
                    reason: format!(
                        "Orphan: no links to active items ({} days old)",
                        age_days as u32
                    ),
                    staleness,
                });
            }
        }

        serde_wasm_bindgen::to_value(&candidates)
            .map_err(|e| {
                JsValue::from_str(&format!(
                    "filter_compression_candidates: serialize error: {e}"
                ))
            })
    }
}
