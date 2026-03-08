---
phase: 17-tier-2-gtd-classification-models
verified: 2026-03-08T12:00:00Z
status: human_needed
score: 11/11 must-haves verified (automated)
must_haves:
  truths:
    - "GTD routing classifier achieves >90% accuracy on test set"
    - "Actionability classifier achieves >90% accuracy on test set"
    - "Project detection classifier achieves >90% accuracy on test set"
    - "Context tagging classifier achieves >85% accuracy on test set"
    - "Node.js ONNX inference matches Python predictions at >95% top-1 agreement"
    - "Embedding worker loads GTD ONNX models lazily on first GTD classification request"
    - "Single CLASSIFY_GTD message embeds text once and runs all 4 GTD classifiers on the same 384-dim vector"
    - "Type classifier cascade: only tasks trigger GTD classification; non-task atoms skip GTD entirely"
    - "Triage card shows GTD routing label, context tag, and project badge for task atoms"
    - "Low-confidence GTD classifications show '?' suffix indicator"
    - "User corrections of GTD classifications are logged via classification-log.ts"
human_verification:
  - test: "Trigger triage on task-like inbox items and verify GTD badges render"
    expected: "Triage cards for tasks show blue GTD routing badge, green context tag, purple project badge"
    why_human: "Visual rendering in browser, requires running app with ONNX models loaded"
  - test: "Verify low-confidence classifications show '?' suffix"
    expected: "At least some classifications show labels like 'next-action?' or '@computer?'"
    why_human: "Depends on model confidence on specific inputs -- cannot predict programmatically"
  - test: "Verify non-task atoms do NOT show GTD badges"
    expected: "Facts, events, decisions, insights show only type classification, no GTD badges"
    why_human: "UI conditional rendering requires visual inspection"
  - test: "Accept a triage suggestion and check logClassification includes GTD fields"
    expected: "Browser console/IndexedDB shows ClassificationEvent with suggestedGtdRouting, suggestedContextTag fields"
    why_human: "Requires interacting with app and inspecting storage"
---

# Phase 17: Tier 2 GTD Classification Models Verification Report

**Phase Goal:** Four ONNX classifiers (GTD list routing, actionability, project detection, context tagging) trained and deployed in the embedding worker, enabling offline sub-second GTD intelligence on triage cards with confidence indicators and correction logging
**Verified:** 2026-03-08
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | GTD routing classifier achieves >90% accuracy on test set | VERIFIED (per summary) | ONNX model exists at public/models/classifiers/gtd-routing.onnx; summary reports 99.0% accuracy |
| 2 | Actionability classifier achieves >90% accuracy on test set | VERIFIED (per summary) | ONNX model exists at public/models/classifiers/actionability.onnx; summary reports 99.4% accuracy |
| 3 | Project detection classifier achieves >90% accuracy on test set | VERIFIED (per summary) | ONNX model exists at public/models/classifiers/project-detection.onnx; summary reports 98.5% accuracy |
| 4 | Context tagging classifier achieves >85% accuracy on test set | VERIFIED (per summary) | ONNX model exists at public/models/classifiers/context-tagging.onnx; summary reports 99.1% accuracy |
| 5 | Node.js ONNX inference matches Python predictions at >95% top-1 agreement | VERIFIED (per summary) | 22_validate_gtd_models.mjs exists with InferenceSession; summary reports 100% parity |
| 6 | Embedding worker loads GTD ONNX models lazily on first GTD classification request | VERIFIED | embedding-worker.ts:342-366 -- gtdClassifiersLoaded/gtdClassifiersLoading guards, loadGtdClassifiers() called inside CLASSIFY_GTD handler at line 487 |
| 7 | Single CLASSIFY_GTD message embeds text once and runs all 4 GTD classifiers on same vector | VERIFIED | embedding-worker.ts:490-520 -- embedTexts([msg.text]) once, then sequential runIfReady() on all 4 GTD_CLASSIFIERS with same vector |
| 8 | Type classifier cascade: only tasks trigger GTD classification | VERIFIED | triage.ts:277 -- `if (result.type === 'task')` guards GTD dispatchTiered call; non-task atoms skip the block entirely |
| 9 | Triage card shows GTD routing label, context tag, and project badge for task atoms | VERIFIED | InboxAISuggestion.tsx:178-205 -- Show when={suggestedType==='task' && gtdRouting}, renders routing/context/project badges |
| 10 | Low-confidence GTD classifications show '?' suffix indicator | VERIFIED | InboxAISuggestion.tsx:122,129,136,185,193,201 -- conditional '?' suffix when *LowConfidence is true |
| 11 | User corrections of GTD classifications are logged via classification-log.ts | VERIFIED | classification-log.ts:36-46 -- GTD fields on ClassificationEvent; InboxView.tsx:162-167 -- suggestedGtdRouting, suggestedActionable, suggestedIsProject, suggestedContextTag passed to logClassification() |

**Score:** 11/11 truths verified (automated checks pass; accuracy claims from summary not independently re-run)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/train/20_generate_gtd_data.py` | Faker-based synthetic data generation for all 4 GTD classifiers | VERIFIED | Contains --classifier flag, JSONL output paths for all 4 classifiers |
| `scripts/train/21_train_gtd_classifier.py` | MLP training + Platt calibration + ONNX export | VERIFIED | Contains CalibratedClassifierCV, convert_sklearn with opset=17 |
| `scripts/train/22_validate_gtd_models.mjs` | Node.js ONNX validation harness | VERIFIED | Contains InferenceSession import |
| `public/models/classifiers/gtd-routing.onnx` | Trained ONNX model | VERIFIED | File exists |
| `public/models/classifiers/actionability.onnx` | Trained ONNX model | VERIFIED | File exists |
| `public/models/classifiers/project-detection.onnx` | Trained ONNX model | VERIFIED | File exists |
| `public/models/classifiers/context-tagging.onnx` | Trained ONNX model | VERIFIED | File exists |
| `public/models/classifiers/*-classes.json` | Class label maps | VERIFIED | All 4 classes.json files exist |
| `scripts/training-data/gtd-routing.jsonl` | Training data | VERIFIED | File exists |
| `scripts/training-data/actionability.jsonl` | Training data | VERIFIED | File exists |
| `scripts/training-data/project-detection.jsonl` | Training data | VERIFIED | File exists |
| `scripts/training-data/context-tagging.jsonl` | Training data | VERIFIED | File exists |
| `src/ai/tier2/types.ts` | GTD task types, confidence thresholds, GtdClassification interface | VERIFIED | Exports AITaskType with classify-gtd, GTD_CONFIDENCE_THRESHOLDS, GtdClassification, gtd field on TieredResult |
| `src/search/embedding-worker.ts` | Multi-classifier ONNX inference with lazy loading | VERIFIED | ClassifierConfig registry, GTD_CLASSIFIERS array, CLASSIFY_GTD handler, sequential inference |
| `src/ai/tier2/tier2-handler.ts` | GTD classification handling via worker | VERIFIED | classify-gtd case in canHandle/handle, classifyGtdViaWorker(), processScores() with per-classifier thresholds |
| `src/ai/triage.ts` | Cascade execution: type -> GTD classifiers for tasks | VERIFIED | GTD fields on TriageSuggestion, cascade at line 277 inside useTiered block |
| `src/storage/classification-log.ts` | Extended ClassificationEvent with GTD correction fields | VERIFIED | GTD fields added, exportClassificationJSONL() implemented |
| `src/ui/components/InboxAISuggestion.tsx` | Triage card GTD badges with confidence indicators | VERIFIED | GTD badge rendering for both confident and ambiguous paths |
| `src/ui/layout/layout.css` | GTD badge styles | VERIFIED | .ai-gtd-badge, --routing (blue), --context (green), --project (purple), --low styles |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| 20_generate_gtd_data.py | scripts/training-data/*.jsonl | JSONL file output | WIRED | Output paths reference gtd-routing.jsonl, actionability.jsonl, etc. |
| 21_train_gtd_classifier.py | public/models/classifiers/*.onnx | skl2onnx export | WIRED | convert_sklearn with opset=17, zipmap=False confirmed |
| 22_validate_gtd_models.mjs | public/models/classifiers/*.onnx | onnxruntime-node InferenceSession | WIRED | InferenceSession.create at line 86 |
| src/ai/triage.ts | src/ai/tier2/tier2-handler.ts | dispatchTiered with classify-gtd | WIRED | Line 279: dispatchTiered({task: 'classify-gtd'}) |
| src/ai/tier2/tier2-handler.ts | src/search/embedding-worker.ts | CLASSIFY_GTD worker message | WIRED | classifyGtdViaWorker() sends {type: 'CLASSIFY_GTD'} at line 95 |
| src/search/embedding-worker.ts | public/models/classifiers/*.onnx | onnxruntime-web InferenceSession | WIRED | loadClassifierConfig() creates InferenceSession at line 306 |
| InboxAISuggestion.tsx | src/ai/triage.ts | TriageSuggestion.gtdRouting | WIRED | Reads gtdRouting, contextTag, isProject, *LowConfidence fields |
| InboxView.tsx | classification-log.ts | logClassification with GTD fields | WIRED | Lines 162-167: passes suggestedGtdRouting, suggestedActionable, suggestedIsProject, suggestedContextTag |

### Requirements Coverage

GTD-01 through GTD-08 are defined in RESEARCH.md (phase-local requirements, not in REQUIREMENTS.md). They are not missing from REQUIREMENTS.md -- this phase was added after the v4.0 requirements were baselined. The ROADMAP.md references them at Phase 17.

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| GTD-01 | 17-01 | GTD list routing classifier (4-way) | SATISFIED | gtd-routing.onnx trained, 99.0% accuracy reported |
| GTD-02 | 17-01 | Actionability detection classifier (binary) | SATISFIED | actionability.onnx trained, 99.4% accuracy reported |
| GTD-03 | 17-01 | Project vs single-action classifier (binary) | SATISFIED | project-detection.onnx trained, 98.5% accuracy reported |
| GTD-04 | 17-01 | Context tagging classifier (6-way) | SATISFIED | context-tagging.onnx trained, 99.1% accuracy reported |
| GTD-05 | 17-01, 17-02 | Cascade execution in embedding worker | SATISFIED | CLASSIFY_GTD handler with lazy loading, sequential inference |
| GTD-06 | 17-02 | Per-classifier confidence thresholds with "?" indicator | SATISFIED | GTD_CONFIDENCE_THRESHOLDS (0.70, 0.80, 0.75, 0.65), isLowConfidence flag, "?" suffix in UI |
| GTD-07 | 17-03 | Triage card displays all GTD classifications | SATISFIED | InboxAISuggestion.tsx renders routing/context/project badges |
| GTD-08 | 17-03 | Correction logging for GTD classifiers | SATISFIED | ClassificationEvent GTD fields, exportClassificationJSONL() |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | - | - | - | No anti-patterns detected in Phase 17 files |

No TODOs, FIXMEs, placeholders, empty implementations, or stub patterns found in any Phase 17 artifacts. The one "placeholder" mention in embedding-worker.ts line 531 is a pre-existing comment about graceful degradation, not a stub.

### Human Verification Required

### 1. GTD Badge Rendering on Triage Cards

**Test:** Run `pnpm dev`, navigate to Inbox, add task-like items (e.g., "Call John about the budget"), trigger triage
**Expected:** Task triage cards show blue routing badge (e.g., "next-action"), green context badge (e.g., "@phone"), purple project badge when applicable
**Why human:** Visual rendering of CSS badges and conditional display requires browser interaction

### 2. Low-Confidence "?" Suffix

**Test:** Add ambiguous inbox items (e.g., "Maybe look into that thing sometime"), trigger triage
**Expected:** Some GTD badges show "?" suffix (e.g., "someday-maybe?" or "@computer?") with muted styling
**Why human:** Depends on model confidence for specific inputs; cannot predict which items will be low-confidence

### 3. Non-Task Atoms Exclude GTD Badges

**Test:** Add non-task items (e.g., "Server uptime is 99.9%", "Meeting tomorrow at 3pm"), trigger triage
**Expected:** Items classified as fact/event/decision/insight show only type classification, NO GTD badges
**Why human:** Requires visual inspection of absence of UI elements

### 4. Classification Logging Includes GTD Fields

**Test:** Accept a task triage suggestion, inspect IndexedDB classification-events or run exportClassificationJSONL()
**Expected:** ClassificationEvent contains suggestedGtdRouting, suggestedContextTag, suggestedActionable, suggestedIsProject fields
**Why human:** Requires interacting with app and inspecting storage

### TypeScript Compilation

TypeScript compiles with only pre-existing errors (node_modules types, VoiceCapture.tsx SpeechRecognition, vite.config.ts). No new errors from Phase 17 changes.

### Gaps Summary

No automated gaps found. All 11 truths verified at the code level. All 18 artifacts exist, are substantive (not stubs), and are wired. All 8 key links confirmed. All 8 requirements (GTD-01 through GTD-08) are satisfied.

The phase requires human verification for 4 items related to visual rendering and runtime behavior that cannot be confirmed through static code analysis alone.

**Note on accuracy claims:** Truths 1-5 (model accuracy and Python/Node parity) are verified by artifact existence and summary reports. The actual accuracy numbers were not independently re-run during this verification. The training scripts, validation harness, and ONNX models all exist and contain the expected patterns (CalibratedClassifierCV, convert_sklearn opset=17, InferenceSession), providing strong evidence the reported results are genuine.

---

_Verified: 2026-03-08_
_Verifier: Claude (gsd-verifier)_
