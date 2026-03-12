/**
 * Single adversarial cycle orchestrator.
 *
 * Runs one full cycle:
 * 1. Generate corpus (natural for cycle 1, gap-targeted for cycles 2-5)
 * 2. Process each atom through the pipeline
 * 3. Emulate enrichment Q&A session per atom (Haiku)
 * 4. Flush co-occurrence + clean suppressed relations
 * 5. Generate + apply corrections with ripple
 * 6. Score graph, take snapshot, compute diff vs previous cycle
 * 7. Extract gaps for next cycle
 * 8. Save checkpoint
 *
 * Phase 29: TVAL-01
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HarnessEntityStore } from './harness-entity-store.js';
import { runHarnessAtom, mergeRoleWordEntities, mergeDescriptorEntities } from './harness-pipeline.js';
import {
  resetHarnessCooccurrence,
  flushHarnessCooccurrence,
  cleanSuppressedRelations,
  enforceRelationUniqueness,
  runHarnessKeywordPatterns,
} from './harness-inference.js';
import { scoreEntityGraph } from './score-graph.js';
import type { GroundTruth, GraphScore } from './score-graph.js';
import type { CorpusItem } from './generate-corpus.js';
import {
  emulateEnrichmentSession,
  buildEntitySummary,
  compareEnrichmentQuality,
  emulateBaselineEnrichmentSession,
} from './enrichment-emulator.js';
import {
  generateCorrections,
  applyCorrection,
  purgeSpuriousRelations,
} from './correction-emulator.js';
import { saveCheckpoint } from './checkpoint-store.js';
import {
  computeAtomEVS,
  aggregateCycleEVS,
  formatEVSReport,
} from './enrichment-value-score.js';
import type { AtomEVS, CycleEVS } from './enrichment-value-score.js';
import type {
  CycleState,
  GraphSnapshot,
  GraphDiff,
  RelationshipGap,
  AblationConfig,
  EnrichmentEmulation,
  UserCorrection,
  ComponentAttribution,
  RelationshipSource,
} from './harness-types.js';
import { emptyAttribution } from './harness-types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PERSONAS_DIR = path.join(__dirname, 'personas');

// ---------------------------------------------------------------------------
// Corpus generation for cycle 1
// ---------------------------------------------------------------------------

async function generateNaturalCorpus(
  persona: { personaName: string; bio: string; groundTruth: GroundTruth },
  client: Anthropic,
): Promise<CorpusItem[]> {
  const patternsPath = path.join(__dirname, '../../src/config/relationship-patterns.json');
  const patterns = JSON.parse(fs.readFileSync(patternsPath, 'utf-8')) as {
    patterns: Array<{ id: string; keywords: string[]; relationshipType: string }>;
  };
  const patternSummary = patterns.patterns
    .map((p) => `  - ${p.relationshipType}: ${p.keywords.slice(0, 8).join(', ')}`)
    .join('\n');

  const gtJson = JSON.stringify(persona.groundTruth, null, 2);

  const prompt = `Generate 35 realistic GTD inbox items for ${persona.personaName}.

**Persona bio:** ${persona.bio}

**Ground truth (ALL relationships must be covered):**
${gtJson}

**Keyword pattern engine (REQUIRED: use these keywords near entity names):**
${patternSummary}

Rules:
- Each ground truth relationship needs at least 2 items with keyword evidence
- Use natural, first-person GTD capture style (thoughts, tasks, reminders, notes)
- Vary length (some terse like "Pick up son from school", some detailed)
- Use realistic aliases from the ground truth aliases list
- Include 5 items with multiple entities (for co-occurrence)
- entityType MUST match the entity: "ORG" for companies/organizations/schools, "LOC" for cities/places, "PER" for people ONLY
- Do NOT annotate standalone role words (wife, boss, mom, dentist, neighbor) as entities — annotate the person's actual name instead. If ONLY a role word appears without a name, annotate the role word as PER.

Return JSON only:
{
  "items": [
    {
      "id": "item-c1-001",
      "content": "<inbox text>",
      "expectedEntities": ["<canonical name>"],
      "expectedRelationships": ["<relationship type>"],
      "entityMentions": [
        { "entityText": "<name>", "entityType": "PER", "spanStart": N, "spanEnd": N, "confidence": 0.95 }
      ]
    }
  ]
}`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16384,
    messages: [{ role: 'user', content: prompt }],
  });

  const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
  const cleaned = responseText
    .replace(/^```json\s*/m, '')
    .replace(/^```\s*/m, '')
    .replace(/```\s*$/m, '')
    .trim();

  const parsed = JSON.parse(cleaned) as { items: CorpusItem[] };
  return parsed.items ?? [];
}

// ---------------------------------------------------------------------------
// Gap-targeted corpus generation (cycles 2-5)
// ---------------------------------------------------------------------------

async function generateGapTargetedCorpus(
  persona: { personaName: string; bio: string; groundTruth: GroundTruth },
  gaps: RelationshipGap[],
  cycleNumber: number,
  client: Anthropic,
): Promise<CorpusItem[]> {
  const patternsPath = path.join(__dirname, '../../src/config/relationship-patterns.json');
  const patterns = JSON.parse(fs.readFileSync(patternsPath, 'utf-8')) as {
    patterns: Array<{ id: string; keywords: string[]; relationshipType: string }>;
  };

  const gapSummary = gaps
    .map((g) => {
      const current = g.bestAttempt ? ` (currently wrong: "${g.bestAttempt}")` : ' (not detected)';
      return `  - ${g.groundTruthRelationship.entity}: "${g.groundTruthRelationship.type}"${current} — ${g.gapReason}`;
    })
    .join('\n');

  const relevantPatterns = patterns.patterns
    .filter((p) => gaps.some((g) => g.groundTruthRelationship.type === p.relationshipType))
    .map((p) => `  - ${p.relationshipType}: ${p.keywords.slice(0, 10).join(', ')}`)
    .join('\n');

  const prompt = `Generate 35 adversarial GTD inbox items targeting SPECIFIC relationship blind spots for ${persona.personaName}.

**Persona bio:** ${persona.bio}

**MISSED RELATIONSHIPS (cycle ${cycleNumber} targets — focus 70% of items here):**
${gapSummary}

**Pattern keywords for missed relationships:**
${relevantPatterns}

**Adversarial requirements:**
- Use VARIED phrasing — avoid repeating exact keywords from previous cycles
- Use indirect references and cultural naming variations from the persona's background
- Include implicit relationship evidence (context, not keywords)
- For each missed relationship: at least 3 items with different approaches
- Also include 10 items covering already-found relationships (for reinforcement)
- Be adversarial: test the LIMITS of pattern matching with subtle signals

**Don't use:**
- Obvious role labels like "my husband" or "my boss"
- Direct statements like "Pam is my wife"

**Entity annotation rules:**
- entityType MUST match: "ORG" for companies/organizations/schools, "LOC" for cities/places, "PER" for people ONLY
- Do NOT annotate standalone role words (wife, boss, mom, dentist) as entities — use the person's actual name

Return JSON only:
{
  "items": [
    {
      "id": "item-c${cycleNumber}-001",
      "content": "<adversarial inbox text>",
      "expectedEntities": ["<canonical name>"],
      "expectedRelationships": ["<relationship type>"],
      "entityMentions": [
        { "entityText": "<name>", "entityType": "PER", "spanStart": N, "spanEnd": N, "confidence": 0.95 }
      ]
    }
  ]
}`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16384,
    messages: [{ role: 'user', content: prompt }],
  });

  const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
  const cleaned = responseText
    .replace(/^```json\s*/m, '')
    .replace(/^```\s*/m, '')
    .replace(/```\s*$/m, '')
    .trim();

  const parsed = JSON.parse(cleaned) as { items: CorpusItem[] };
  return parsed.items ?? [];
}

// ---------------------------------------------------------------------------
// Graph snapshot + diff
// ---------------------------------------------------------------------------

function takeSnapshot(store: HarnessEntityStore, syntheticTimestamp: string): GraphSnapshot {
  const storeSnap = store.snapshot();
  return {
    entities: storeSnap.entities,
    relations: storeSnap.relations,
    atomIntelligenceRecords: storeSnap.atomIntelligence.map((intel) => ({
      atomId: intel.atomId,
      entityMentions: intel.entityMentions,
      enrichmentCount: intel.enrichment.length,
    })),
    takenAt: syntheticTimestamp,
  };
}

function computeDiff(
  previousSnapshot: GraphSnapshot | null,
  currentSnapshot: GraphSnapshot,
  store: HarnessEntityStore,
): GraphDiff {
  if (!previousSnapshot) {
    return {
      newEntities: currentSnapshot.entities.map((e) => e.canonicalName),
      newRelations: currentSnapshot.relations.map((r) => {
        const target = store.getEntity(r.targetEntityId);
        return { entity: target?.canonicalName ?? r.targetEntityId, type: r.relationshipType };
      }),
      confidenceChanges: [],
    };
  }

  const prevEntityIds = new Set(previousSnapshot.entities.map((e) => e.id));
  const newEntities = currentSnapshot.entities
    .filter((e) => !prevEntityIds.has(e.id))
    .map((e) => e.canonicalName);

  const prevRelationIds = new Set(previousSnapshot.relations.map((r) => r.id));
  const newRelations = currentSnapshot.relations
    .filter((r) => !prevRelationIds.has(r.id))
    .map((r) => {
      const target = store.getEntity(r.targetEntityId);
      return { entity: target?.canonicalName ?? r.targetEntityId, type: r.relationshipType };
    });

  // Confidence changes for existing relations
  const prevRelMap = new Map(previousSnapshot.relations.map((r) => [r.id, r.confidence]));
  const confidenceChanges: GraphDiff['confidenceChanges'] = [];
  for (const rel of currentSnapshot.relations) {
    const prevConf = prevRelMap.get(rel.id);
    if (prevConf !== undefined) {
      const delta = rel.confidence - prevConf;
      if (Math.abs(delta) >= 0.1) {
        const target = store.getEntity(rel.targetEntityId);
        confidenceChanges.push({
          entity: target?.canonicalName ?? rel.targetEntityId,
          type: rel.relationshipType,
          delta,
        });
      }
    }
  }

  return { newEntities, newRelations, confidenceChanges };
}

// ---------------------------------------------------------------------------
// Gap extraction
// ---------------------------------------------------------------------------

function extractGaps(
  score: GraphScore,
  store: HarnessEntityStore,
): RelationshipGap[] {
  const gaps: RelationshipGap[] = [];

  for (const missed of score.missedRelations) {
    // Find any wrong inferred relation for this entity
    const detectedEntities = store.getEntities();
    const normMissed = missed.entity.toLowerCase().replace(/^(dr\.|mr\.|mrs\.|ms\.|prof\.)\s+/i, '').trim();
    const matchedEntity = detectedEntities.find((e) => {
      const norm = e.canonicalName.toLowerCase().replace(/^(dr\.|mr\.|mrs\.|ms\.|prof\.)\s+/i, '').trim();
      return norm === normMissed || norm.includes(normMissed) || normMissed.includes(norm);
    });

    const allRelations = store.getRelations();
    const currentRelation = matchedEntity
      ? allRelations.find(
          (r) => r.targetEntityId === matchedEntity.id || r.sourceEntityId === matchedEntity.id,
        )
      : undefined;

    gaps.push({
      groundTruthRelationship: { entity: missed.entity, type: missed.type },
      bestAttempt: currentRelation?.relationshipType ?? null,
      gapReason: currentRelation
        ? `Inferred "${currentRelation.relationshipType}" instead of "${missed.type}"`
        : 'No relationship inferred for this entity',
    });
  }

  return gaps;
}

// ---------------------------------------------------------------------------
// Component attribution tracking
// ---------------------------------------------------------------------------

function trackAttribution(
  prevScore: GraphScore | null,
  currentScore: GraphScore,
  store: HarnessEntityStore,
  enrichmentEmulations: EnrichmentEmulation[],
  corrections: UserCorrection[],
  attribution: ComponentAttribution,
): void {
  // New relationships compared to previous cycle
  const prevFound = new Set(
    (prevScore?.foundRelations ?? []).map((r) => `${r.entity}:${r.type}`),
  );

  const allRelations = store.getRelations();

  for (const found of currentScore.foundRelations) {
    const key = `${found.entity}:${found.type}`;
    if (attribution.byRelation.has(key)) continue; // already attributed

    // Check if there's a user-correction for this entity+type
    const isCorrection = corrections.some(
      (c) => c.correctRelationshipType === found.type &&
        c.entityName.toLowerCase().includes(found.entity.toLowerCase().replace(/^(dr\.|mr\.|mrs\.|ms\.|prof\.)\s+/i, '').trim()),
    );

    if (isCorrection) {
      attribution.byRelation.set(key, 'user-correction');
      attribution.counts['user-correction']++;
      continue;
    }

    // Check enrichment mining (new entity mention from enrichment answers)
    const isEnrichmentMined = enrichmentEmulations.some(
      (e) => e.newEntityMentions.some(
        (m) => m.entityText.toLowerCase().includes(
          found.entity.toLowerCase().replace(/^(dr\.|mr\.|mrs\.|ms\.|prof\.)\s+/i, '').trim(),
        ),
      ),
    );

    if (isEnrichmentMined && !prevFound.has(key)) {
      attribution.byRelation.set(key, 'enrichment-mining');
      attribution.counts['enrichment-mining']++;
      continue;
    }

    // Find the relation in store to check its attribution
    const storeRel = allRelations.find((r) => {
      const target = store.getEntity(r.targetEntityId);
      const normTarget = (target?.canonicalName ?? '').toLowerCase().replace(/^(dr\.|mr\.|mrs\.|ms\.|prof\.)\s+/i, '').trim();
      const normFound = found.entity.toLowerCase().replace(/^(dr\.|mr\.|mrs\.|ms\.|prof\.)\s+/i, '').trim();
      return (normTarget === normFound || normTarget.includes(normFound)) &&
        r.relationshipType === found.type;
    });

    const source: RelationshipSource = storeRel?.sourceAttribution === 'co-occurrence'
      ? 'co-occurrence'
      : 'keyword-pattern';

    attribution.byRelation.set(key, source);
    attribution.counts[source]++;
  }
}

// ---------------------------------------------------------------------------
// Synthetic timestamp helpers
// ---------------------------------------------------------------------------

/**
 * Compute synthetic timestamps for a corpus cycle.
 * Cycle 1 items get timestamps from ~4 weeks ago, cycle 5 from ~now.
 * Linear interpolation across 5 cycles.
 */
function computeCycleSyntheticStart(cycleNumber: number, totalCycles: number): Date {
  const now = new Date();
  const weeksAgo = (totalCycles - cycleNumber) * 1; // 1 week per cycle back
  const cycleDate = new Date(now.getTime() - weeksAgo * 7 * 24 * 60 * 60 * 1000);
  return cycleDate;
}

function getItemSyntheticTimestamp(
  cycleStart: Date,
  itemIndex: number,
  totalItems: number,
): number {
  // Spread items across ~5 days within the cycle
  const cycleDurationMs = 5 * 24 * 60 * 60 * 1000;
  const fraction = totalItems > 1 ? itemIndex / (totalItems - 1) : 0;
  return cycleStart.getTime() + Math.floor(fraction * cycleDurationMs);
}

// ---------------------------------------------------------------------------
// Main cycle runner
// ---------------------------------------------------------------------------

export interface PersonaConfig {
  personaName: string;
  personaDirName: string;
  bio: string;
  groundTruth: GroundTruth;
}

export async function runAdversarialCycle(
  persona: PersonaConfig,
  cycleNumber: number,
  previousGaps: RelationshipGap[],
  previousSnapshot: GraphSnapshot | null,
  previousScore: GraphScore | null,
  store: HarnessEntityStore,
  client: Anthropic,
  ablation?: AblationConfig,
  delayMs = 100,
): Promise<CycleState> {
  const cycleStart = Date.now();
  const attribution = emptyAttribution();
  const enrichmentQualityScores: number[] = [];

  // Sample quality comparison on first 3 atoms of cycle 1 only (cost control)
  const QUALITY_COMPARISON_CYCLE = 1;
  const QUALITY_COMPARISON_SAMPLE = 3;

  // Reset co-occurrence state so each cycle scores independently
  // (prevents cross-cycle noise from creating false "associated" relations)
  resetHarnessCooccurrence();

  console.log(`  [cycle ${cycleNumber}] Generating corpus...`);

  // Step 1: Generate corpus
  let corpus: CorpusItem[];
  try {
    if (cycleNumber === 1 || previousGaps.length === 0) {
      corpus = await generateNaturalCorpus(persona, client);
    } else {
      corpus = await generateGapTargetedCorpus(persona, previousGaps, cycleNumber, client);
    }
  } catch (err) {
    console.error(`  [cycle ${cycleNumber}] Corpus generation failed: ${err}`);
    corpus = [];
  }

  console.log(`  [cycle ${cycleNumber}] Processing ${corpus.length} atoms...`);

  // Compute synthetic timestamps for this cycle
  const cycleStartDate = computeCycleSyntheticStart(cycleNumber, 5);
  const enrichmentEmulations: EnrichmentEmulation[] = [];
  const atomEVSScores: AtomEVS[] = [];

  // Step 2-3: Process each atom
  for (let i = 0; i < corpus.length; i++) {
    const item = corpus[i];
    const syntheticTs = getItemSyntheticTimestamp(cycleStartDate, i, corpus.length);

    // 2a: Run atom through pipeline
    await runHarnessAtom(item, store, syntheticTs);

    // Throttle API calls
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    // 2b: Emulate enrichment session (skip if ablation disables it)
    if (!ablation?.disableEnrichmentMining) {
      const intel = store.getAtomIntelligence(item.id);
      const mentionedEntityIds = (intel?.entityMentions ?? [])
        .filter((m) => m.entityId)
        .map((m) => m.entityId!);
      const entitySummary = buildEntitySummary(store, mentionedEntityIds);

      // Capture pre-enrichment counts for EVS delta measurement
      const preEnrichmentRelCount = store.getRelations().length;
      const preEnrichmentEntityCount = store.getEntities().length;

      try {
        const { emulation } = await emulateEnrichmentSession(
          {
            atomId: item.id,
            atomContent: item.content,
            atomType: item.expectedRelationships[0] ?? 'general',
            entitySummary,
            priorQA: [],
          },
          persona.bio,
          store,
          client,
          syntheticTs,
        );
        enrichmentEmulations.push(emulation);

        // Compute per-atom EVS
        const atomEvs = computeAtomEVS(
          emulation,
          store,
          preEnrichmentRelCount,
          preEnrichmentEntityCount,
          persona.groundTruth,
        );
        atomEVSScores.push(atomEvs);

        // Enrichment quality comparison: sample first N atoms of cycle 1 only (cost control)
        if (
          cycleNumber === QUALITY_COMPARISON_CYCLE &&
          enrichmentQualityScores.length < QUALITY_COMPARISON_SAMPLE &&
          mentionedEntityIds.length > 0 &&
          entitySummary !== 'No entities detected yet.' &&
          entitySummary !== 'No entity relationships known yet.'
        ) {
          try {
            const baselineQA = await emulateBaselineEnrichmentSession(
              {
                atomId: item.id,
                atomContent: item.content,
                atomType: item.expectedRelationships[0] ?? 'general',
                priorQA: [],
              },
              persona.bio,
              client,
            );
            const qualityScore = await compareEnrichmentQuality(
              item.content,
              item.expectedRelationships[0] ?? 'general',
              emulation.simulatedQA,
              baselineQA,
              client,
            );
            enrichmentQualityScores.push(qualityScore);
          } catch {
            // Non-fatal: quality comparison failure doesn't stop the cycle
          }
        }
      } catch {
        // Non-fatal: enrichment emulation failures don't stop the cycle
      }
    }
  }

  // Step 3.5: Merge role-word entities into proper-name entities
  // E.g., "Boss" → "Marcus", "dentist" → "Dr. Chen" when both share a relation type.
  // This eliminates duplicate relations that hurt precision without affecting recall.
  const roleMerges = mergeRoleWordEntities(store);
  if (roleMerges > 0) {
    console.log(`  [cycle ${cycleNumber}] Merged ${roleMerges} role-word entities`);
  }

  // Step 3.6: Merge descriptor entities into proper-name entities for non-singular types.
  // E.g., "little one" → "Zara" when both have child, "pediatrician" → "Dr. Park" when both have healthcare-provider.
  const descriptorMerges = mergeDescriptorEntities(store);
  if (descriptorMerges > 0) {
    console.log(`  [cycle ${cycleNumber}] Merged ${descriptorMerges} descriptor entities`);
  }

  // Step 3.7: Enforce uniqueness for singular relation types (spouse, reports-to, lives-at).
  // Keeps only the highest-confidence relation per type, eliminating duplicates from
  // entity fragmentation (e.g., "wife" entity + "Pam" entity both having spouse).
  const uniquenessRemoved = enforceRelationUniqueness(store);
  if (uniquenessRemoved > 0) {
    console.log(`  [cycle ${cycleNumber}] Enforced uniqueness: removed ${uniquenessRemoved} duplicate singular relations`);
  }

  // Step 4: Flush co-occurrence and clean suppressed
  if (!ablation?.disableCooccurrence) {
    flushHarnessCooccurrence(store);
  }
  cleanSuppressedRelations(store);

  // Step 5: Generate and apply corrections
  const corrections: UserCorrection[] = [];
  if (!ablation?.disableUserCorrections) {
    try {
      console.log(`  [cycle ${cycleNumber}] Generating corrections...`);
      const generated = await generateCorrections(store, persona.groundTruth, client, persona.personaName);
      for (const correction of generated) {
        applyCorrection(store, correction);
        corrections.push(correction);
      }
      console.log(`  [cycle ${cycleNumber}] Applied ${corrections.length} corrections`);
    } catch (err) {
      console.warn(`  [cycle ${cycleNumber}] Correction generation failed: ${err}`);
    }
  }

  // Step 5b: Purge spurious relations for GT entities
  // After corrections, remove any inferred relation whose type doesn't match
  // any GT relationship for that entity (e.g., Pam→friend when GT says spouse)
  if (!ablation?.disableUserCorrections) {
    const purged = purgeSpuriousRelations(store, persona.groundTruth);
    if (purged > 0) {
      console.log(`  [cycle ${cycleNumber}] Purged ${purged} spurious relations`);
    }
  }

  // Step 6: Score graph
  const atomCount = Array.from(store.atomIntelligence.keys()).length;
  const score = scoreEntityGraph(store, persona.groundTruth, atomCount);

  // Step 7: Snapshot + diff
  const syntheticTimestampStr = cycleStartDate.toISOString();
  const currentSnapshot = takeSnapshot(store, syntheticTimestampStr);
  const graphDiff = computeDiff(previousSnapshot, currentSnapshot, store);

  // Step 8: Extract gaps for next cycle
  const gaps = extractGaps(score, store);

  // Track attribution
  trackAttribution(previousScore, score, store, enrichmentEmulations, corrections, attribution);

  console.log(`  [cycle ${cycleNumber}] Score: Ent F1=${(score.entityF1 * 100).toFixed(1)}% Rel F1=${(score.relationshipF1 * 100).toFixed(1)}% Privacy=${(score.privacyScore * 100).toFixed(1)}%`);
  console.log(`  [cycle ${cycleNumber}] Gaps: ${gaps.length} relationships still missing`);

  const durationMs = Date.now() - cycleStart;

  const avgEnrichmentQuality = enrichmentQualityScores.length > 0
    ? enrichmentQualityScores.reduce((a, b) => a + b, 0) / enrichmentQualityScores.length
    : undefined;

  if (avgEnrichmentQuality !== undefined) {
    console.log(`  [cycle ${cycleNumber}] Enrichment quality (entity context vs baseline): ${avgEnrichmentQuality.toFixed(2)}/5`);
  }

  // Aggregate EVS across all atoms in this cycle
  const cycleEVS = aggregateCycleEVS(atomEVSScores);
  if (cycleEVS.totalAtoms > 0) {
    console.log(`  [cycle ${cycleNumber}] Enrichment Value Score:`);
    console.log(formatEVSReport(cycleEVS));
  }

  const cycleState: CycleState = {
    personaName: persona.personaName,
    cycleNumber,
    corpus,
    graphSnapshot: currentSnapshot,
    graphDiff,
    score,
    gaps,
    enrichmentEmulations,
    corrections,
    attribution,
    durationMs,
    syntheticStartTimestamp: syntheticTimestampStr,
    enrichmentQualityScore: avgEnrichmentQuality,
    enrichmentValueScore: cycleEVS.totalAtoms > 0 ? cycleEVS : undefined,
  };

  // Save checkpoint
  const storeSnapshot = store.snapshot();
  saveCheckpoint(persona.personaDirName, cycleNumber, storeSnapshot, cycleState);

  return cycleState;
}
