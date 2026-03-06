# Phase 14: Sanitization Classifier - Research

**Researched:** 2026-03-06
**Domain:** ONNX NER token classification, PII detection, pseudonymization, TypeScript branded types
**Confidence:** MEDIUM-HIGH

## Summary

Phase 14 implements a hybrid PII sanitization pipeline: an ONNX NER token classifier detects soft entities (names, locations, financial references) while regex patterns catch structured entities (emails, phone numbers, API keys, credit card patterns). Detected entities are pseudonymized with stable typed IDs (`<Person 12>`, `<Location 3>`) via a persistent IndexedDB registry, shown to users in the pre-send modal, and de-pseudonymized in cloud responses before display.

The training pipeline follows the established v3.0 pattern (synthetic data generation via Claude API, Python training, ONNX export) but shifts from embedding-based classification (MiniLM + sklearn MLP) to token-level classification (fine-tuned DistilBERT with HuggingFace Trainer). This is a fundamentally different model architecture -- NER requires per-token predictions, not whole-text embeddings. The browser inference path uses the Transformers.js `token-classification` pipeline, which is already supported by the project's `@huggingface/transformers` dependency.

The `SanitizedPrompt` branded type enforces at compile time that no code path can construct a `CloudRequestLogEntry` without first producing a sanitized output, making it impossible to accidentally send unsanitized content to the cloud.

**Primary recommendation:** Fine-tune `distilbert-base-cased` on synthetic PII-labeled atom text with 5 custom entity categories (PERSON, LOCATION, FINANCIAL, CONTACT, CREDENTIAL), export to ONNX via HuggingFace Optimum with FP16 quantization, load in-browser via the Transformers.js `token-classification` pipeline in a dedicated sanitization worker.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Pseudonymized entity references with typed + numbered IDs: `<Person 12>`, `<Location 3>`, `<Financial 1>`
- Each real entity gets a stable ID -- same person always maps to the same pseudonym across requests and sessions
- Pre-send modal shows the pseudonymized text (what the cloud will see)
- Expandable mapping table collapsed by default -- power users can expand to see `<Person 12> = John Smith` for verification
- Cloud responses auto-de-pseudonymized before showing to user -- seamless round-trip
- Persistent entity registry in IndexedDB -- maps real entities to stable pseudonym IDs
- Registry survives across sessions so cloud builds consistent entity awareness over time
- User's per-entity restore preferences (un-redact decisions) are remembered across requests
- Five NER categories for v1: PERSON, LOCATION, FINANCIAL, CONTACT, CREDENTIAL
- Hybrid detection: NER model handles fuzzy entities; regex patterns handle structured formats
- Union of NER + regex -- entity flagged if either detector catches it
- Sanitization is always-on when cloud is active -- no toggle to disable
- Per-entity restore in pre-send modal -- user can click individual entities to toggle them back to real values
- Restore preferences are remembered -- if user always restores a specific entity, it auto-restores in future requests
- NER sanitization applies at 'full' privacy level only
- Default privacy level changes from 'abstract' to 'full'
- Synthetic data generation following v3.0 pattern
- Python pipeline at scripts/train/ produces sanitization ONNX model
- Recall >= 0.85 gate on soft-PII test set
- FP16/Q8 quantization (INT8 collapses recall 30-40%)

### Claude's Discretion
- NER model architecture (token classification vs sequence labeling vs span extraction)
- Worker placement -- embedding worker vs dedicated sanitization worker
- SanitizedPrompt branded type implementation details
- Entity registry IndexedDB schema design
- Regex pattern library for structured entity detection
- De-pseudonymization implementation in response pipeline
- Synthetic corpus size and distribution across entity categories

### Deferred Ideas (OUT OF SCOPE)
- Tier-2 Methodology Module Interface -- full module system where each binder type implements entity models
- Methodology-specific entity types -- GTD (PROJECT, CONTEXT), Research (CITATION, CONCEPT), Writing (CHARACTER, SETTING)
- Entity similarity and merge policy -- entity_similarity() and entity_merge_policy for deduplication
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SNTZ-01 | ONNX NER classifier detects sensitive entities (names, locations, financial, health, credentials) in atom content before cloud dispatch | Fine-tuned DistilBERT token classifier + regex hybrid; Transformers.js `token-classification` pipeline in worker; union of NER + regex results |
| SNTZ-02 | Python training pipeline produces sanitization ONNX model via scripts/train/ | HuggingFace Trainer for token classification fine-tuning; synthetic BIO-tagged data via Claude API + Faker; ONNX export via Optimum with FP16 quantization |
| SNTZ-03 | Pre-send approval modal shows sanitized diff so user sees what was redacted before approving | CloudRequestPreview.tsx extended with entity mapping table, restore toggles, and pseudonymized text display |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @huggingface/transformers | ^3.8.1 | Token classification pipeline in browser | Already in project; handles tokenization, inference, and post-processing for NER |
| onnxruntime-web | ^1.24.2 | WASM ONNX inference backend | Already in project; powers embedding and type classifier |
| transformers (Python) | >=4.40 | Fine-tune DistilBERT for token classification | Standard HF training pipeline for NER |
| optimum (Python) | >=1.19 | Export fine-tuned model to ONNX | Standard HF ONNX conversion with quantization |
| Dexie | (existing) | Entity registry persistence in IndexedDB | Already in project for all persistent storage |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| faker (Python) | >=24.0 | Generate synthetic PII data for training | Producing realistic names, addresses, financial data for training corpus |
| datasets (Python) | >=2.18 | Load/format BIO-tagged training data | Standard format for token classification datasets |
| seqeval (Python) | >=1.2 | Entity-level NER evaluation metrics | Computing precision/recall/F1 at entity level (not token level) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Fine-tuned DistilBERT | Pre-trained Xenova/bert-base-NER | Generic labels (PER/LOC/ORG/MISC) don't cover FINANCIAL/CONTACT/CREDENTIAL; no recall control |
| Fine-tuned DistilBERT | Embedding + sklearn MLP (like triage classifier) | MLP operates on whole-text embeddings; NER requires per-token predictions -- fundamentally different task |
| Dedicated sanitization worker | Extend embedding worker | Separate worker isolates memory; NER model is ~66MB quantized on top of existing ~23MB MiniLM |
| DistilBERT | BERT-base | 2x parameters (110M vs 66M), 2x model size, marginal accuracy gain for short atom text |

**Installation (Python training):**
```bash
pip install transformers datasets optimum[onnxruntime] seqeval faker
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  ai/
    sanitization/
      sanitizer.ts          # Pure module: detectEntities(), pseudonymize(), dePseudonymize()
      entity-registry.ts    # IndexedDB entity<->pseudonym mapping (Dexie table)
      regex-patterns.ts     # Structured PII regex library (email, phone, CC, API key, URL)
      types.ts              # SanitizedPrompt branded type, DetectedEntity, EntityMap
    privacy-proxy.ts        # Wire sanitizer into sanitizeForCloud() at 'full' level
    adapters/
      cloud.ts              # Use SanitizedPrompt type instead of raw string
      cloud-openai.ts       # Use SanitizedPrompt type instead of raw string
  workers/
    sanitization-worker.ts  # Dedicated worker for NER model inference
  ui/
    components/
      CloudRequestPreview.tsx  # Extended with entity map table + restore toggles
scripts/
  train/
    10_generate_sanitization_data.py   # Synthetic BIO-tagged atom text
    11_train_sanitizer.py              # Fine-tune DistilBERT, export ONNX
    12_validate_sanitizer.mjs          # Browser-side ONNX validation
public/
  models/
    sanitization/
      sanitize-check.onnx             # Quantized NER model
      sanitize-check-classes.json      # Entity label map
```

### Pattern 1: Fine-Tuned DistilBERT Token Classification
**What:** Fine-tune `distilbert-base-cased` on BIO-tagged synthetic atom text with custom entity labels (B-PERSON, I-PERSON, B-LOCATION, I-LOCATION, B-FINANCIAL, I-FINANCIAL, B-CONTACT, I-CONTACT, B-CREDENTIAL, I-CREDENTIAL, O).
**When to use:** Custom entity categories not covered by pre-trained NER models.
**Why DistilBERT:** 6 layers vs BERT's 12; ~66M params vs 110M; quantized ONNX ~66MB (q8) or ~33MB (q4); retains 97% of BERT's NER accuracy. Cased variant is important for name detection.
**Example training loop:**
```python
from transformers import AutoTokenizer, AutoModelForTokenClassification, Trainer, TrainingArguments
from optimum.onnxruntime import ORTModelForTokenClassification

model_name = "distilbert-base-cased"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForTokenClassification.from_pretrained(model_name, num_labels=11)

# BIO labels: O, B-PERSON, I-PERSON, B-LOCATION, I-LOCATION, B-FINANCIAL, I-FINANCIAL,
#             B-CONTACT, I-CONTACT, B-CREDENTIAL, I-CREDENTIAL

training_args = TrainingArguments(
    output_dir="./results",
    num_train_epochs=5,
    per_device_train_batch_size=16,
    evaluation_strategy="epoch",
    save_strategy="epoch",
    load_best_model_at_end=True,
    metric_for_best_model="overall_recall",
)

# ... data collator with label alignment for wordpiece tokens ...
trainer = Trainer(model=model, args=training_args, ...)
trainer.train()

# Export to ONNX with quantization
ort_model = ORTModelForTokenClassification.from_pretrained("./results/best")
ort_model.save_pretrained("./onnx_output")
# Then quantize with optimum CLI or onnxruntime.quantization
```

### Pattern 2: SanitizedPrompt Branded Type
**What:** A branded string type that can only be produced by the sanitization pipeline, enforcing sanitization-before-cloud at compile time.
**When to use:** When you need to guarantee at the type level that a string has been through a specific transformation.
**Example:**
```typescript
// types.ts
declare const __sanitized: unique symbol;
export type SanitizedPrompt = string & { readonly [__sanitized]: true };

// sanitizer.ts — the ONLY place that creates SanitizedPrompt
export function sanitize(raw: string, entityMap: EntityMap): SanitizedResult {
  // ... NER + regex detection, pseudonymization ...
  return {
    prompt: pseudonymized as SanitizedPrompt,
    entities: detectedEntities,
    map: entityMap,
  };
}

// key-vault.ts — change type
export interface CloudRequestLogEntry {
  sanitizedPrompt: SanitizedPrompt; // Was: string
  // ...
}

// cloud.ts — compiler REJECTS: logEntry.sanitizedPrompt = request.prompt;
// compiler ACCEPTS: logEntry.sanitizedPrompt = sanitizeResult.prompt;
```

### Pattern 3: Hybrid NER + Regex Detection
**What:** Run NER model inference and regex pattern matching in parallel, then union the results.
**When to use:** Structured patterns (emails, CC numbers) are better caught by regex; fuzzy entities (names, locations) need ML.
**Example:**
```typescript
export interface DetectedEntity {
  text: string;        // Original text span
  category: EntityCategory;  // PERSON | LOCATION | FINANCIAL | CONTACT | CREDENTIAL
  start: number;       // Character offset in original text
  end: number;         // Character offset end
  source: 'ner' | 'regex' | 'both';
  confidence: number;  // NER confidence or 1.0 for regex
}

export type EntityCategory = 'PERSON' | 'LOCATION' | 'FINANCIAL' | 'CONTACT' | 'CREDENTIAL';

async function detectEntities(text: string): Promise<DetectedEntity[]> {
  const [nerEntities, regexEntities] = await Promise.all([
    detectWithNER(text),      // Worker message: SANITIZE -> NER_RESULT
    detectWithRegex(text),    // Synchronous regex matching
  ]);
  return mergeEntities(nerEntities, regexEntities); // Union, dedup overlaps
}
```

### Pattern 4: Entity Registry (Dexie)
**What:** Persistent mapping of real entity text to stable pseudonym IDs. Survives across sessions.
**Example schema:**
```typescript
// New Dexie table: entityRegistry
interface EntityRegistryEntry {
  id: string;              // UUID
  realText: string;        // "John Smith" (normalized: lowercase trimmed)
  category: EntityCategory; // "PERSON"
  pseudonymId: number;     // 12 (the number in <Person 12>)
  restorePreference: boolean; // User's choice: auto-restore this entity?
  createdAt: number;
  lastSeenAt: number;
}

// Dexie schema addition (new version):
// entityRegistry: '&id, realText, category, [category+pseudonymId]'
```

### Pattern 5: De-pseudonymization of Cloud Responses
**What:** After cloud returns a response containing pseudonyms like `<Person 12>`, replace them with real values before displaying to user.
**When to use:** Every cloud response before it reaches the UI.
**Example:**
```typescript
function dePseudonymize(response: string, entityMap: Map<string, string>): string {
  // entityMap: "<Person 12>" -> "John Smith"
  return response.replace(/<(Person|Location|Financial|Contact|Credential)\s+(\d+)>/g,
    (match) => entityMap.get(match) ?? match
  );
}
```

### Anti-Patterns to Avoid
- **Running NER on main thread:** Token classification with DistilBERT takes 20-50ms; must run in a worker to avoid blocking UI.
- **INT8 quantization for NER:** CONTEXT.md explicitly states INT8 collapses recall 30-40%. Use FP16 or Q8 (dynamic quantization) only.
- **Token-level metrics for NER evaluation:** Always use entity-level metrics (seqeval) -- a model that correctly labels 4/5 tokens of "New York City" but misses one still fails the entity.
- **Sanitizing at 'abstract' or 'structured' levels:** These levels already strip content. NER only applies at 'full' privacy level.
- **Importing store in sanitizer modules:** Follow existing pure module pattern. All state passed by caller.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| BIO tag alignment with wordpiece tokens | Custom tokenization logic | HuggingFace `tokenize_and_align_labels` | Subword token -> label alignment is tricky; off-by-one errors cause training collapse |
| NER inference + post-processing | Raw ONNX Runtime token logits -> entity spans | Transformers.js `pipeline('token-classification')` | Handles tokenization, inference, aggregation_strategy, subword merging |
| ONNX model export + quantization | Manual ONNX graph construction | HuggingFace Optimum `ORTModelForTokenClassification` | Handles opset compatibility, graph optimization, quantization |
| Email/phone/CC regex patterns | Custom regex per format | Well-tested regex library patterns | RFC 5322 email regex alone is 300+ chars; Luhn check for CC, international phone formats |
| Entity-level NER metrics | Token-level accuracy | `seqeval` library | Entity-level precision/recall/F1 is the standard NER metric |

**Key insight:** NER is fundamentally a sequence labeling problem with complex post-processing (subword merging, entity span extraction, BIO tag validation). The Transformers.js pipeline abstracts all of this.

## Common Pitfalls

### Pitfall 1: Model Size Bloat
**What goes wrong:** DistilBERT full precision is 261MB, way too large for a browser PWA.
**Why it happens:** Default ONNX export produces FP32 weights.
**How to avoid:** Export with FP16 quantization (~131MB) or dynamic Q8 quantization (~66MB). Test recall at each quantization level against the 0.85 gate. FP16 is the sweet spot per CONTEXT.md research.
**Warning signs:** Model download takes > 5 seconds on broadband; mobile users abandon.

### Pitfall 2: BIO Tag Alignment with Wordpiece
**What goes wrong:** "John Smith" tokenized as ["John", "Sm", "##ith"]. If labels are [B-PERSON, I-PERSON] (2 tokens) but wordpiece produces 3 tokens, training crashes or produces garbage.
**Why it happens:** Wordpiece tokenization splits words into subwords. Label count must match token count.
**How to avoid:** Use `tokenize_and_align_labels` pattern: only assign labels to first subword token of each word, set others to -100 (ignored in loss).
**Warning signs:** Training loss doesn't decrease; entity predictions are shifted by 1-2 characters.

### Pitfall 3: Entity Overlap Between NER and Regex
**What goes wrong:** "john.smith@gmail.com" detected as PERSON by NER ("John Smith") AND as CONTACT by regex (email pattern). Double-pseudonymization corrupts the text.
**Why it happens:** Union of two detection systems without deduplication.
**How to avoid:** Merge step: when NER and regex spans overlap, prefer the longer/more-specific match. Regex CONTACT for structured patterns takes precedence over NER PERSON for substrings within those patterns.
**Warning signs:** Pseudonymized text has nested `<Contact 1>` containing fragments of `<Person 2>`.

### Pitfall 4: Recall vs Precision Tradeoff
**What goes wrong:** High-precision model misses "J. Smith" or "NYC" -- entities leak to cloud.
**Why it happens:** Optimizing for precision (fewer false positives) at the cost of recall (missed entities).
**How to avoid:** The recall >= 0.85 gate is the PRIMARY metric. Accept more false positives (over-redaction) rather than miss real entities. Users can restore false positives via the mapping table.
**Warning signs:** F1 looks good but recall for PERSON or FINANCIAL is below 0.85 on test set.

### Pitfall 5: Worker Memory Budget
**What goes wrong:** Loading DistilBERT NER model (~66-131MB) alongside MiniLM (~23MB) in the same worker causes OOM on mobile.
**Why it happens:** Both models loaded into WASM heap simultaneously.
**How to avoid:** Use a dedicated sanitization worker separate from the embedding worker. Measure memory usage on mid-range mobile. If over 300MB total, consider lazy-loading (only load NER model when cloud is active).
**Warning signs:** Worker crashes silently on mobile; sanitization falls back to regex-only.

### Pitfall 6: Transformers.js Pipeline Configuration
**What goes wrong:** `pipeline('token-classification')` uses `aggregation_strategy='none'` by default, returning per-subword predictions instead of merged entities.
**Why it happens:** Default behavior preserves maximum granularity.
**How to avoid:** Use `aggregation_strategy: 'simple'` or `'first'` to merge subword tokens into entity spans automatically. This is critical for getting clean entity boundaries.
**Warning signs:** Entities are split into subwords: "Jo", "##hn" instead of "John".

### Pitfall 7: Local-Only Model Loading
**What goes wrong:** Model tries to fetch from HuggingFace CDN at runtime, violating zero-network-call constraint.
**Why it happens:** Default Transformers.js behavior fetches from hub.
**How to avoid:** Same pattern as existing embedding worker: `env.allowRemoteModels = false; env.allowLocalModels = true; env.localModelPath = '/models/';`. Pre-download model files to `public/models/sanitization/`.
**Warning signs:** Console shows network requests to huggingface.co.

## Code Examples

### Transformers.js Token Classification in Worker
```typescript
// sanitization-worker.ts
import { pipeline, env } from '@huggingface/transformers';

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = '/models/';

type NERPipeline = (text: string, options?: Record<string, unknown>) => Promise<Array<{
  word: string;
  score: number;
  entity_group: string;
  start: number;
  end: number;
}>>;

let nerPipeline: NERPipeline | null = null;

async function loadNER(): Promise<NERPipeline> {
  if (nerPipeline) return nerPipeline;
  const pipe = await pipeline('token-classification', 'sanitization/sanitize-check', {
    dtype: 'fp16',  // or 'q8' -- matches training quantization
  });
  nerPipeline = pipe as unknown as NERPipeline;
  return nerPipeline;
}

// Worker message handler
self.onmessage = async (event: MessageEvent) => {
  const msg = event.data;
  if (msg.type === 'SANITIZE') {
    try {
      const ner = await loadNER();
      const entities = await ner(msg.text, { aggregation_strategy: 'simple' });
      self.postMessage({
        type: 'SANITIZE_RESULT',
        id: msg.id,
        entities: entities.map(e => ({
          text: msg.text.slice(e.start, e.end),
          category: mapLabelToCategory(e.entity_group), // B-PERSON -> PERSON
          start: e.start,
          end: e.end,
          confidence: e.score,
          source: 'ner' as const,
        })),
      });
    } catch (err) {
      self.postMessage({ type: 'SANITIZE_ERROR', id: msg.id, error: String(err) });
    }
  }
};
```

### Branded Type Enforcement
```typescript
// src/ai/sanitization/types.ts
declare const __sanitized: unique symbol;
export type SanitizedPrompt = string & { readonly [__sanitized]: true };

export interface SanitizedResult {
  prompt: SanitizedPrompt;
  entities: DetectedEntity[];
  entityMap: Map<string, string>; // pseudonym -> real text, for de-pseudonymization
}

// The ONLY function that produces SanitizedPrompt
export function createSanitizedPrompt(text: string): SanitizedPrompt {
  return text as SanitizedPrompt;
}
```

### Regex Pattern Library
```typescript
// src/ai/sanitization/regex-patterns.ts
export const PII_PATTERNS: Array<{ category: EntityCategory; pattern: RegExp; name: string }> = [
  // CONTACT
  { category: 'CONTACT', pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, name: 'email' },
  { category: 'CONTACT', pattern: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, name: 'phone_us' },
  { category: 'CONTACT', pattern: /(?:\+\d{1,3}[-.\s]?)?\d{2,4}[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g, name: 'phone_intl' },

  // FINANCIAL
  { category: 'FINANCIAL', pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, name: 'credit_card' },
  { category: 'FINANCIAL', pattern: /\b[A-Z]{2}\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{0,2}\b/g, name: 'iban' },
  { category: 'FINANCIAL', pattern: /\$[\d,]+(?:\.\d{2})?/g, name: 'dollar_amount' },

  // CREDENTIAL
  { category: 'CREDENTIAL', pattern: /\b(?:sk|pk|api|key|token|secret|bearer)[-_][\w-]{16,}/gi, name: 'api_key' },
  { category: 'CREDENTIAL', pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}\b/g, name: 'github_token' },
  { category: 'CREDENTIAL', pattern: /\bsk-ant-[\w-]{20,}\b/g, name: 'anthropic_key' },
  { category: 'CREDENTIAL', pattern: /\bsk-[\w-]{20,}\b/g, name: 'openai_key' },
];
```

### Synthetic Training Data Generation (BIO format)
```python
# Template-based generation with Faker for PII entities
from faker import Faker
fake = Faker()

TEMPLATES = [
    # PERSON + LOCATION
    ("Meeting with {PERSON} at {LOCATION} tomorrow", ["PERSON", "LOCATION"]),
    ("Call {PERSON} about the project update", ["PERSON"]),
    # FINANCIAL
    ("Invoice #{num} from {PERSON} for {FINANCIAL}", ["PERSON", "FINANCIAL"]),
    ("Budget: {FINANCIAL} allocated for Q3", ["FINANCIAL"]),
    # CONTACT
    ("Reach {PERSON} at {CONTACT}", ["PERSON", "CONTACT"]),
    # CREDENTIAL
    ("API key for production: {CREDENTIAL}", ["CREDENTIAL"]),
]

def generate_entity(category: str) -> str:
    if category == "PERSON": return fake.name()
    if category == "LOCATION": return fake.city()
    if category == "FINANCIAL": return f"${fake.random_int(100, 50000):,}.00"
    if category == "CONTACT": return fake.email()
    if category == "CREDENTIAL": return f"sk-{fake.hexify('?' * 32)}"

def to_bio_tags(text: str, entities: list[tuple[int, int, str]]) -> list[tuple[str, str]]:
    """Convert character-level entity spans to BIO-tagged word tokens."""
    # ... tokenize text, assign B-/I- tags based on span overlap ...
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Rule-based PII (regex only) | Hybrid NER + regex | 2023-2024 | ML catches fuzzy entities (names, locations); regex catches structured (emails, CC) |
| Server-side NER (spaCy) | Client-side ONNX NER (Transformers.js) | 2024-2025 | Zero-network PII detection; privacy-preserving |
| BERT-base NER (110M params) | DistilBERT NER (66M params) | 2024 | 50% smaller, 40% faster, 97% accuracy retained |
| FP32 ONNX models in browser | FP16/Q8 quantized ONNX | 2024-2025 | 2-4x smaller downloads; minimal accuracy loss |
| @xenova/transformers (v2) | @huggingface/transformers (v3) | 2024 | Official package; dtype options; better quantization support |

**Deprecated/outdated:**
- `@xenova/transformers` (v2): Replaced by `@huggingface/transformers` (v3). Project already on v3.
- INT8 quantization for NER: Per project research, collapses recall 30-40%. Use FP16 or Q8 dynamic.

## Open Questions

1. **Worker placement: dedicated vs shared**
   - What we know: Embedding worker currently loads MiniLM (~23MB quantized). NER model adds ~66-131MB.
   - What's unclear: Whether combined memory exceeds mobile WASM heap limits (~512MB-1GB).
   - Recommendation: Start with dedicated sanitization worker. Measure memory. If mobile OOMs, implement lazy-loading (load NER only when cloud adapter is active, unload when not needed).

2. **DistilBERT vs even smaller models**
   - What we know: DistilBERT quantized Q8 is ~66MB. Smaller models (TinyBERT, MobileBERT) exist but may not hit recall >= 0.85 on custom entities.
   - What's unclear: Whether ~66MB download is acceptable for the PWA's UX.
   - Recommendation: Start with DistilBERT Q8. If too large, explore Q4 quantization (~35MB estimated) with recall validation. The existing triage classifier is only ~100KB because it's an MLP on embeddings, not a transformer.

3. **Synthetic corpus size**
   - What we know: The triage classifier used 400 examples per label (2000 total). NER needs more diverse token-level annotations.
   - What's unclear: Minimum corpus size for recall >= 0.85 on 5 entity categories.
   - Recommendation: Generate 2000-5000 synthetic sentences with entities. Each sentence should have 1-3 entities. Aim for balanced category distribution. Evaluate on held-out test set and iterate.

4. **Transformers.js local model structure**
   - What we know: The embedding model loads from `/models/Xenova/all-MiniLM-L6-v2/`. Transformers.js expects specific file structure (config.json, tokenizer.json, tokenizer_config.json, onnx/model.onnx).
   - What's unclear: Exact directory structure needed for a custom fine-tuned model.
   - Recommendation: After ONNX export, verify the model loads with Transformers.js locally before committing to the build. The model directory needs: `config.json`, `tokenizer.json`, `tokenizer_config.json`, `special_tokens_map.json`, and `onnx/model.onnx` (or `onnx/model_quantized.onnx`).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.0.18 |
| Config file | vite.config.ts (inline vitest config assumed) |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SNTZ-01 | NER + regex detect entities in atom text | unit | `pnpm vitest run src/ai/sanitization/sanitizer.test.ts -t "detect"` | Wave 0 |
| SNTZ-01 | SanitizedPrompt type prevents unsanitized cloud dispatch | unit (type-level) | `pnpm tsc --noEmit` (compile check) | Wave 0 |
| SNTZ-02 | Python pipeline runs end-to-end producing ONNX | integration | `python scripts/train/11_train_sanitizer.py` + recall gate | Wave 0 |
| SNTZ-02 | ONNX model validates in browser | integration | `node scripts/train/12_validate_sanitizer.mjs` | Wave 0 |
| SNTZ-03 | Pre-send modal shows pseudonymized text and entity map | unit | `pnpm vitest run src/ui/components/CloudRequestPreview.test.tsx` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test`
- **Per wave merge:** `pnpm test && pnpm tsc --noEmit`
- **Phase gate:** Full suite green + Python pipeline recall >= 0.85

### Wave 0 Gaps
- [ ] `src/ai/sanitization/sanitizer.test.ts` -- covers SNTZ-01 entity detection + pseudonymization
- [ ] `src/ai/sanitization/regex-patterns.test.ts` -- covers regex pattern matching
- [ ] `src/ai/sanitization/types.test.ts` -- covers SanitizedPrompt branded type
- [ ] `src/ui/components/CloudRequestPreview.test.tsx` -- covers SNTZ-03 modal display
- [ ] `scripts/train/11_train_sanitizer.py` -- Python training pipeline (SNTZ-02)
- [ ] `scripts/train/12_validate_sanitizer.mjs` -- Browser ONNX validation (SNTZ-02)

## Sources

### Primary (HIGH confidence)
- [Transformers.js Pipeline API](https://huggingface.co/docs/transformers.js/en/pipelines) -- token-classification pipeline, aggregation_strategy, dtype options
- [HuggingFace Token Classification docs](https://huggingface.co/docs/transformers/en/tasks/token_classification) -- fine-tuning DistilBERT for NER
- [Xenova/bert-base-NER](https://huggingface.co/Xenova/bert-base-NER) -- ONNX model sizes, quantization options
- [onnx-community/distilbert-NER-ONNX](https://huggingface.co/onnx-community/distilbert-NER-ONNX) -- DistilBERT NER model sizes (Q8: 66MB, FP16: 131MB)
- Existing codebase: `embedding-worker.ts`, `privacy-proxy.ts`, `CloudRequestPreview.tsx`, `cloud.ts` -- established patterns

### Secondary (MEDIUM confidence)
- [Rehydra PII Scrubber](https://dev.to/tjruesch/a-local-first-reversible-pii-scrubber-for-ai-workflows-using-onnx-and-regex-53fb) -- hybrid NER + regex architecture, pseudonymization patterns
- [Branded Types in TypeScript](https://www.learningtypescript.com/articles/branded-types) -- SanitizedPrompt implementation pattern
- [PII Detection with Hugging Face](https://medium.com/@naoufal51/supercharge-your-pii-detection-train-a-ner-model-with-hugging-face-transformers-52e1d3464029) -- NER training pipeline

### Tertiary (LOW confidence)
- Model size estimates for custom fine-tuned Q4 quantization -- extrapolated from DistilBERT-NER-ONNX sizes, not validated
- Synthetic corpus size recommendations (2000-5000 sentences) -- based on general NER training guidance, not validated for this specific domain

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- project already has @huggingface/transformers + onnxruntime-web; Transformers.js token-classification is well-documented
- Architecture: MEDIUM-HIGH -- hybrid NER + regex is well-established; branded type pattern is standard; worker placement needs memory measurement
- Training pipeline: MEDIUM -- fine-tuning DistilBERT for custom NER labels is standard HF workflow; synthetic BIO-tagged data generation is less established than the existing triage classifier's approach
- Pitfalls: HIGH -- documented from official sources, existing codebase patterns, and CONTEXT.md constraints

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable domain; Transformers.js v3 and DistilBERT are mature)
