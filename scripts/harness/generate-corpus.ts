/**
 * Corpus generator -- calls Anthropic API to produce inbox items
 * for synthetic user personas.
 *
 * Each item has:
 *   - id: string
 *   - content: inbox text (realistic GTD item)
 *   - expectedEntities: ground truth entity names referenced
 *   - expectedRelationships: relationship types this item provides evidence for
 *   - entityMentions: pre-annotated spans (injected into harness, skips NER)
 *
 * Usage:
 *   ANTHROPIC_API_KEY=<key> npx tsx scripts/harness/generate-corpus.ts [persona-name|--all]
 *   npx tsx scripts/harness/generate-corpus.ts --dry-run
 *   npx tsx scripts/harness/generate-corpus.ts --large --all   # ~500 items per persona
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CorpusEntityMention {
  entityText: string;
  entityType: 'PER' | 'LOC' | 'ORG' | 'MISC' | 'DATE';
  spanStart: number;
  spanEnd: number;
  confidence: number;
  entityId?: string; // resolved at harness runtime
}

export interface CorpusItemRiskFactors {
  /** Days since last action on the project this item belongs to (0 = touched today) */
  driftRisk?: number;
  /** True if this item depends on a slow/unreliable person */
  dependencyBlocked?: boolean;
  /** True if single-point-of-failure: one person, one deadline, no fallback */
  fragility?: boolean;
  /** True if deadline passed or context has changed since capture */
  renegotiationNeeded?: boolean;
  /** True if deep-work task but user is in a low-energy/high-interruption period */
  energyMismatch?: boolean;
  /** Name of the project this item belongs to (if any) */
  project?: string;
  /** GTD stage of this item */
  gtdStage?: 'inbox' | 'clarified' | 'organized' | 'actionable' | 'waiting' | 'someday';
  /** Days since the user's last weekly review */
  daysSinceReview?: number;
}

// ---------------------------------------------------------------------------
// Cognitive ground truth — cloud-generated labels for specialist vectors
// ---------------------------------------------------------------------------

/**
 * Cloud-generated cognitive/behavioral ground truth per corpus item.
 * These provide differentiated signal for orthogonal specialist agents,
 * replacing heuristic derivation from the same 5 metadata fields.
 *
 * The cloud generates these as part of corpus items because it has full
 * persona context — behavioral archetype, project states, entity behaviors,
 * life circumstances — enabling ground truth labels that local heuristics
 * cannot produce.
 */
export interface CorpusItemCognitiveLabels {
  /** Cognitive load: 1=trivial, 2=routine, 3=complex, 4=deep */
  cognitiveLoad?: 1 | 2 | 3 | 4;
  /** Collaboration type: solo, delegation, or collaboration */
  collaborationType?: 'solo' | 'delegation' | 'collaboration';
  /** Emotional tone of the capture */
  emotionalTone?: 'positive' | 'neutral' | 'negative' | 'anxious';
  /** Primary knowledge domain */
  domain?: 'work' | 'personal' | 'health' | 'finance' | 'creative' | 'tech' | 'social' | 'admin';
  /** Time estimate to complete */
  timeEstimate?: 'quick' | 'short' | 'medium' | 'long';
  /** GTD horizon level */
  gtdHorizon?: 'runway' | '10k' | '20k' | '30k' | '40k';
  /** Information lifecycle: how long is this relevant? */
  infoLifecycle?: 'ephemeral' | 'short-lived' | 'stable' | 'permanent';
  /** How often should this be reviewed? */
  reviewCadence?: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  /** Eisenhower priority matrix quadrant */
  priorityQuadrant?: 'urgent-important' | 'urgent-not' | 'not-urgent-important' | 'not-urgent-not';
  /** 0-1: how vague/unclear is the next action? (1 = very ambiguous) */
  ambiguityScore?: number;
  /** 0-1: how clear is the desired outcome? (1 = crystal clear) */
  outcomeClarity?: number;
  /** 0-1: is a decision required before action? (1 = yes) */
  decisionRequired?: number;
  /** 0-1: intrinsic motivation vs obligation (1 = excited, 0 = dread) */
  motivationAlignment?: number;
  /** 0-1: stress/pressure level this item creates (1 = high stress) */
  stressLevel?: number;
  /** 0-1: how disruptive would a context switch to this item be? (1 = very disruptive) */
  contextSwitchCost?: number;
  /** Number of times this item has been postponed (0 = fresh) */
  timesPostponed?: number;
}

export interface CorpusItemMetadata {
  priority?: 'high' | 'medium' | 'low';
  energy?: 'high' | 'medium' | 'low';
  status?: 'open' | 'waiting' | 'done' | 'dropped';
  deadline?: string; // ISO date string or relative like "2026-03-20"
  waitingFor?: string; // person or thing being waited on
  context?: string; // GTD context: @computer, @phone, @errands, @home, @office, @anywhere
  createdAt?: string; // ISO date string for age calculation
  riskFactors?: CorpusItemRiskFactors;
  /** Cloud-generated cognitive/behavioral ground truth labels */
  cognitiveLabels?: CorpusItemCognitiveLabels;
}

export interface CorpusItem {
  id: string;
  content: string;
  expectedEntities: string[]; // canonical names from ground truth
  expectedRelationships: string[]; // relationship types this item evidences
  entityMentions: CorpusEntityMention[];
  metadata?: CorpusItemMetadata; // GTD task metadata for canonical vector construction
}

export interface Corpus {
  generatedAt: string;
  personaName: string;
  totalItems: number;
  items: CorpusItem[];
}

// ---------------------------------------------------------------------------
// Behavioral Archetype Detection
// ---------------------------------------------------------------------------

type BehavioralArchetype =
  | 'time-urgency-maximizer'
  | 'slow-burn-strategist'
  | 'over-committer'
  | 'dependency-heavy-collaborator'
  | 'energy-volatile-creative'
  | 'minimalist-executor';

interface ArchetypeRiskOverrides {
  archetype: BehavioralArchetype;
  description: string;
  riskOverrides: string;
}

function detectArchetype(gtdState: Record<string, unknown>, entityBehaviors: Record<string, unknown> | null): ArchetypeRiskOverrides {
  const projects = (gtdState.projects || []) as Array<Record<string, unknown>>;
  const daysSinceWeeklyReview = (gtdState.daysSinceWeeklyReview as number) ?? 7;

  const activeProjects = projects.filter(p => p.status === 'active');
  const stalledProjects = projects.filter(p => p.status === 'stalled' || (p.daysSinceLastAction as number) > 14);
  const waitingProjects = projects.filter(p => p.status === 'waiting');

  // Count waiting-for dependencies across entity behaviors
  const waitingForCount = entityBehaviors
    ? Object.values(entityBehaviors).filter((b: unknown) => (b as Record<string, unknown>).responseSpeed === 'slow').length
    : 0;

  // Detect based on heuristics (ORDER MATTERS — most specific first)
  const hasLowReviewDays = daysSinceWeeklyReview <= 3;
  const hasHighReviewDays = daysSinceWeeklyReview >= 7;
  const hasManyParallelProjects = projects.length >= 5;
  // Dependency-heavy requires BOTH waiting projects AND slow people (not just one signal)
  const hasManyWaitingFor = waitingProjects.length >= 2 && waitingForCount >= 2;
  const allOnTrack = stalledProjects.length === 0 && waitingProjects.length === 0;

  // Irregular progress: mix of very recent AND very stale projects (burst/crash pattern)
  const recentProjects = projects.filter(p => (p.daysSinceLastAction as number) <= 3);
  const veryStaleProjects = projects.filter(p => (p.daysSinceLastAction as number) >= 20);
  const hasIrregularProgress = recentProjects.length >= 1 && veryStaleProjects.length >= 1 && hasHighReviewDays;

  // 1. Over-committer: many parallel projects + falling behind (volume is the dominant signal)
  if (hasManyParallelProjects && hasHighReviewDays) {
    return {
      archetype: 'over-committer',
      description: 'Too many parallel projects, reviews falling behind. Fragility and renegotiation are the primary risks.',
      riskOverrides: `- 30% fragility (spread too thin)
- 25% renegotiationNeeded (overcommitted)
- 40% should have driftRisk > 7 (can't keep up)
- 20% high priority, 50% medium, 30% low
- 35% have deadlines (many self-imposed)`,
    };
  }
  // 3. Minimalist executor: everything on track + few projects + frequent reviews (before time-urgency)
  if (allOnTrack && hasLowReviewDays && projects.length <= 4) {
    return {
      archetype: 'minimalist-executor',
      description: 'Low review days, all projects on track. Steady, low-risk baseline with minimal drift.',
      riskOverrides: `- Only 5% driftRisk > 7
- 5% fragility
- 5% renegotiationNeeded
- 5% energyMismatch
- Steady low-risk baseline
- Priority: 15% high, 55% medium, 30% low`,
    };
  }
  // 4. Dependency-heavy: many waiting-for items + slow people
  if (hasManyWaitingFor) {
    return {
      archetype: 'dependency-heavy-collaborator',
      description: 'Many items blocked on other people. Workflow depends heavily on external responses.',
      riskOverrides: `- 35% dependencyBlocked
- 30% should have status "waiting"
- 40% should reference a person dependency in waitingFor
- 20% driftRisk > 7
- 15% fragility (single person bottleneck)`,
    };
  }
  // 5. Time-urgency maximizer: many active projects + frequent reviews (but not minimalist)
  if (activeProjects.length >= 3 && hasLowReviewDays) {
    return {
      archetype: 'time-urgency-maximizer',
      description: 'High deadline density, frequent reviews. Items cluster around urgent deadlines with aggressive prioritization.',
      riskOverrides: `- 50% of items should have deadlines within 7 days
- 40% should be high priority
- Only ~5% should have driftRisk > 7 (stays on top of things)
- 15% dependencyBlocked, 10% fragility`,
    };
  }
  // 5. Energy-volatile creative: irregular burst/crash pattern
  if (hasIrregularProgress) {
    return {
      archetype: 'energy-volatile-creative',
      description: 'Irregular project progress -- bursts of activity followed by stalls. Energy mismatch is a key risk.',
      riskOverrides: `- 20% energyMismatch
- Irregular deadline distribution (some tight clusters, some none)
- 25% driftRisk > 7
- 15% renegotiationNeeded
- Energy distribution skews: 40% high, 30% medium, 30% low`,
    };
  }
  // 6. Slow-burn strategist: infrequent reviews + stalled projects
  if (hasHighReviewDays && stalledProjects.length >= 2) {
    return {
      archetype: 'slow-burn-strategist',
      description: 'Infrequent reviews, multiple stalled projects. Items accumulate quietly, drift is the primary risk.',
      riskOverrides: `- Only ~10% of items should have deadlines
- 50% should have driftRisk > 14 (long-neglected projects)
- 5% fragility
- 15% renegotiationNeeded (stale commitments)
- Priority skews low: 10% high, 40% medium, 50% low`,
    };
  }

  // Default fallback
  return {
    archetype: 'energy-volatile-creative',
    description: 'Mixed signals -- treating as creative with variable energy patterns.',
    riskOverrides: `- 20% energyMismatch
- 25% driftRisk > 7
- 15% renegotiationNeeded
- Standard distributions otherwise`,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadSyntheticUser(personaDir?: string): { user: Record<string, unknown>; dir: string } {
  // If a persona directory is specified, load from there
  if (personaDir) {
    const userPath = path.join(personaDir, 'synthetic-user.json');
    if (!fs.existsSync(userPath)) {
      console.error(`ERROR: synthetic-user.json not found in ${personaDir}`);
      process.exit(1);
    }
    return { user: JSON.parse(fs.readFileSync(userPath, 'utf-8')), dir: personaDir };
  }

  // Fallback: load from scripts/harness/ (legacy behavior)
  const userPath = path.join(__dirname, 'synthetic-user.json');
  if (!fs.existsSync(userPath)) {
    console.error('ERROR: synthetic-user.json not found. Run from scripts/harness/ directory.');
    process.exit(1);
  }
  return { user: JSON.parse(fs.readFileSync(userPath, 'utf-8')), dir: __dirname };
}

function validateCorpus(data: unknown): data is Corpus {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.items)) return false;
  if (d.items.length < 10) return false; // sanity check
  const first = d.items[0] as Record<string, unknown>;
  return (
    typeof first.id === 'string' &&
    typeof first.content === 'string' &&
    Array.isArray(first.entityMentions)
  );
}

function loadRelationshipPatterns(): string {
  const patternsPath = path.join(__dirname, '../../src/config/binder-types/gtd-personal/relationships.json');
  const patterns = JSON.parse(fs.readFileSync(patternsPath, 'utf-8'));
  return (patterns.patterns as Array<{ id: string; keywords: string[]; relationshipType: string }>)
    .map((p) => `  - ${p.relationshipType} (${p.id}): ${p.keywords.slice(0, 8).join(', ')}`)
    .join('\n');
}

/** Parse JSON response from API, handling truncation and code fences */
function parseApiResponse(responseText: string, label: string): { items: CorpusItem[] } | null {
  try {
    let cleaned = responseText
      .replace(/^```json\s*/gm, '')
      .replace(/^```\s*/gm, '')
      .replace(/```\s*$/gm, '')
      .trim();

    try {
      return JSON.parse(cleaned);
    } catch {
      // Try to recover truncated JSON
      const lastCompleteItem = cleaned.lastIndexOf('},');
      if (lastCompleteItem > 0) {
        cleaned = cleaned.slice(0, lastCompleteItem + 1) + ']}';
        const recovered = JSON.parse(cleaned);
        console.warn(`  WARNING: Response was truncated for ${label}, recovered ${recovered.items?.length ?? 0} items`);
        return recovered;
      }
      throw new Error('Could not recover truncated JSON');
    }
  } catch {
    console.error(`ERROR: Failed to parse API response as JSON for ${label}`);
    console.error('Response preview:', responseText.slice(0, 500));
    return null;
  }
}

/** De-duplicate items by content similarity (exact match on content field) */
function deduplicateItems(items: CorpusItem[]): CorpusItem[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = item.content.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Re-number item IDs sequentially: item-001, item-002, ... */
function renumberItems(items: CorpusItem[]): CorpusItem[] {
  return items.map((item, idx) => ({
    ...item,
    id: `item-${String(idx + 1).padStart(3, '0')}`,
  }));
}

/** Sleep for ms milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Dry-run mode
// ---------------------------------------------------------------------------

function dryRun(syntheticUser: Record<string, unknown>, isLarge: boolean): void {
  const gt = syntheticUser.groundTruth as Record<string, unknown>;
  const entities = (gt.entities as unknown[]).length;
  const relationships = (gt.relationships as unknown[]).length;

  console.log('[generate-corpus] DRY-RUN MODE');
  console.log(`  Persona: ${syntheticUser.personaName}`);
  console.log(`  Ground truth entities: ${entities}`);
  console.log(`  Ground truth relationships: ${relationships}`);

  if (isLarge) {
    const gtdState = gt.gtdState as Record<string, unknown> | undefined;
    const entityBehaviors = gt.entityBehaviors as Record<string, unknown> | null;
    const archetype = gtdState ? detectArchetype(gtdState, entityBehaviors) : null;
    console.log(`  Mode: LARGE (~500 items, 8 batches of 63)`);
    console.log(`  Temporal depth: 8 weeks (2026-01-15 to 2026-03-13)`);
    if (archetype) {
      console.log(`  Behavioral archetype: ${archetype.archetype} -- ${archetype.description}`);
    }
    console.log('  Distribution per batch: 40 keyword-rich, 10 multi-entity, 5 edge, 5 reinforcing, 3 follow-ups');
  } else {
    console.log('  Would generate: 60 inbox items (67% keyword-rich, 17% multi-entity, 8% edge, 8% reinforcing)');
  }
  console.log('  Output: [persona-dir]/corpus.json');
  console.log('');
  console.log('  To generate corpus, set ANTHROPIC_API_KEY and run without --dry-run');
}

// ---------------------------------------------------------------------------
// Standard prompt (60 items, unchanged)
// ---------------------------------------------------------------------------

function buildPrompt(syntheticUser: Record<string, unknown>): string {
  const gt = syntheticUser.groundTruth as Record<string, unknown>;
  const entities = JSON.stringify(gt.entities, null, 2);
  const relationships = JSON.stringify(gt.relationships, null, 2);
  const facts = JSON.stringify(gt.facts, null, 2);
  const gtdState = gt.gtdState ? JSON.stringify(gt.gtdState, null, 2) : 'null';
  const entityBehaviors = gt.entityBehaviors ? JSON.stringify(gt.entityBehaviors, null, 2) : 'null';
  const personaName = syntheticUser.personaName as string;
  const patternSummary = loadRelationshipPatterns();

  return `You are generating a realistic GTD (Getting Things Done) inbox dataset for a synthetic user named ${personaName}.

## ${personaName}'s Profile

**Bio:** ${syntheticUser.bio}

**Ground Truth Entities:**
${entities}

**Ground Truth Relationships:**
${relationships}

**Key Facts:**
${facts}

## GTD Workflow State

${personaName}'s current GTD system state -- use this to generate items that reflect real workflow dynamics:

**Active Projects, Areas, Someday/Maybe:**
${gtdState}

**Entity Response Behaviors (who is reliable, who is slow):**
${entityBehaviors}

## Keyword Pattern Engine

The system infers relationships by detecting keywords in the SAME SENTENCE as an entity mention. Here are the active patterns and their trigger keywords:

${patternSummary}

**CRITICAL:** For the system to infer a relationship, the inbox item MUST contain at least one keyword from the relevant pattern IN THE SAME SENTENCE as the entity name. Items without keywords will NOT create relationship inferences.

## Task

Generate exactly 60 inbox items that ${personaName} might capture over 2-3 typical weeks. These are raw inbox captures -- thoughts, tasks, reminders, notes -- NOT structured tasks.

**Distribution:**
- 40 items (67%): Natural, realistic phrasing that INCLUDES relationship-evidencing keywords. The keywords should feel organic, not forced. Examples:
  * GOOD: "Grab beers with Jake after work Friday" (contains "beers" -> friend pattern)
  * GOOD: "Pick up my son Ethan from soccer practice" (contains "son" -> child pattern)
  * GOOD: "Pam and I need a date night this weekend" (contains "date night" -> spouse pattern)
  * BAD: "Jake" (no relationship evidence)
  * BAD: "Call Pam about dinner plans" (no spouse keyword -- system can't infer)
- 10 items (17%): Items with multiple entities or repeated entity mentions (for co-occurrence)
- 5 items (8%): Edge cases (alias usage, entity-free items, ambiguous context)
- 5 items (8%): Relationship-reinforcing items (entity appears with DIFFERENT keywords from same relationship pattern, building evidence)

**Requirements:**
1. Cover ALL ground truth relationships -- each relationship must have AT LEAST 3 items with keyword evidence
2. Use natural, first-person GTD inbox capture style
3. Vary length (some very short like "Pick up my son from school", some detailed)
4. For each item, annotate entity mentions with character-level span positions
5. Mark which ground truth relationships this item provides evidence for
6. Ensure keyword presence is natural, not forced
7. Items MUST reference the persona's actual projects, areas, and life context from the GTD state above
8. Items involving "waiting" status should reference people with slow/unpredictable response behaviors

**Output Format (JSON only, no markdown):**
{
  "items": [
    {
      "id": "item-001",
      "content": "Need to call Dr. Chen about my crown appointment",
      "expectedEntities": ["Dr. Chen"],
      "expectedRelationships": ["healthcare-provider"],
      "entityMentions": [
        {
          "entityText": "Dr. Chen",
          "entityType": "PER",
          "spanStart": 14,
          "spanEnd": 22,
          "confidence": 0.95
        }
      ],
      "metadata": {
        "priority": "medium",
        "energy": "low",
        "status": "open",
        "deadline": "2026-03-20",
        "context": "@phone",
        "createdAt": "2026-03-01",
        "riskFactors": {
          "driftRisk": 5,
          "dependencyBlocked": false,
          "fragility": false,
          "renegotiationNeeded": false,
          "energyMismatch": false,
          "project": "Health checkups",
          "gtdStage": "actionable",
          "daysSinceReview": 4
        },
        "cognitiveLabels": {
          "cognitiveLoad": 1,
          "collaborationType": "solo",
          "emotionalTone": "neutral",
          "domain": "health",
          "timeEstimate": "quick",
          "gtdHorizon": "runway",
          "infoLifecycle": "short-lived",
          "reviewCadence": "weekly",
          "priorityQuadrant": "not-urgent-important",
          "ambiguityScore": 0.1,
          "outcomeClarity": 0.9,
          "decisionRequired": 0.0,
          "motivationAlignment": 0.3,
          "stressLevel": 0.2,
          "contextSwitchCost": 0.1,
          "timesPostponed": 0
        }
      }
    }
  ]
}

**Metadata fields (REQUIRED for every item):**
- \`priority\`: "high" | "medium" | "low" -- how urgent/important this item feels
- \`energy\`: "high" | "medium" | "low" -- cognitive effort required (high = plan/write/design, low = quick call/errand)
- \`status\`: "open" | "waiting" -- most items are "open", use "waiting" for items blocked on someone else
- \`deadline\`: ISO date string if the item has a natural deadline (use dates in March-April 2026), or omit if no deadline. About 40% of items should have deadlines.
- \`waitingFor\`: person/thing being waited on (only when status is "waiting")
- \`context\`: GTD context -- one of "@computer", "@phone", "@errands", "@home", "@office", "@anywhere"
- \`createdAt\`: ISO date string when the item was captured (spread across past 3 weeks: 2026-02-20 to 2026-03-13)

**Risk factors (REQUIRED for every item):**
- \`driftRisk\`: integer, days since last action on the related project (0 = touched today, high = drifting). Items not belonging to a project: use 0. Items in stalled projects: use the project's daysSinceLastAction.
- \`dependencyBlocked\`: true if this item is waiting on a person AND that person has slow/unpredictable response behavior (check entityBehaviors)
- \`fragility\`: true if there's a single point of failure -- one specific person must act, tight deadline, no alternative approach
- \`renegotiationNeeded\`: true if the deadline has passed, the context has changed, or the original commitment is no longer realistic
- \`energyMismatch\`: true if the item requires high energy/focus but the user's current context suggests low energy (e.g., quick errand slot for deep work task)
- \`project\`: name of the project from gtdState this item belongs to, or omit if standalone task
- \`gtdStage\`: one of "inbox", "clarified", "organized", "actionable", "waiting", "someday"
- \`daysSinceReview\`: integer from the persona's daysSinceWeeklyReview value

**Risk distribution guidelines (realistic GTD user):**
- ~25% of items should have driftRisk > 7 (untouched projects)
- ~15% should be dependencyBlocked (waiting on slow people)
- ~10% should have fragility (single point of failure)
- ~10% should need renegotiation (stale commitments)
- ~8% should have energyMismatch
- About 60% of items should belong to a named project
- gtdStage distribution: ~15% inbox, ~10% clarified, ~30% actionable, ~15% waiting, ~20% organized, ~10% someday

**Cognitive labels (REQUIRED for every item):**
These are ground truth behavioral/cognitive signals about each item. You know the persona deeply — use that knowledge to label each item accurately. These labels train specialist risk models that must differentiate from each other.

- \`cognitiveLoad\`: 1=trivial (quick lookup/errand), 2=routine (standard task), 3=complex (multi-step planning), 4=deep (creative/strategic thinking)
- \`collaborationType\`: "solo" (no one else involved), "delegation" (waiting on/assigning to someone), "collaboration" (working together with someone)
- \`emotionalTone\`: "positive" (excited/motivated), "neutral" (matter-of-fact), "negative" (frustrated/annoyed), "anxious" (worried/uncertain)
- \`domain\`: primary knowledge domain — "work" | "personal" | "health" | "finance" | "creative" | "tech" | "social" | "admin"
- \`timeEstimate\`: "quick" (<5 min), "short" (5-30 min), "medium" (30-120 min), "long" (2+ hours)
- \`gtdHorizon\`: "runway" (next action), "10k" (current project), "20k" (area of responsibility), "30k" (1-2 year goal), "40k" (life vision)
- \`infoLifecycle\`: "ephemeral" (this week only), "short-lived" (this month), "stable" (this year), "permanent" (indefinitely relevant)
- \`reviewCadence\`: "daily" (needs daily check-in), "weekly" (weekly review), "monthly" (monthly review), "quarterly" (quarterly planning)
- \`priorityQuadrant\`: Eisenhower matrix — "urgent-important", "urgent-not", "not-urgent-important", "not-urgent-not"
- \`ambiguityScore\`: 0.0-1.0 — how vague/unclear is the next physical action? (0 = "call X at 555-1234", 1 = "figure out the thing")
- \`outcomeClarity\`: 0.0-1.0 — how clear is the desired end state? (1 = crystal clear, 0 = undefined)
- \`decisionRequired\`: 0.0-1.0 — does a decision need to happen before action? (1 = yes, big decision; 0 = just do it)
- \`motivationAlignment\`: 0.0-1.0 — intrinsic drive vs obligation (1 = excited about this, 0 = dreading it)
- \`stressLevel\`: 0.0-1.0 — how much pressure/stress does this item create? (1 = high stress, 0 = relaxed)
- \`contextSwitchCost\`: 0.0-1.0 — how disruptive to switch to this task? (1 = deep context required, 0 = can do anywhere anytime)
- \`timesPostponed\`: integer 0-5 — how many times has the user put this off?

**Cognitive label distribution guidelines:**
- cognitiveLoad: ~25% trivial, ~35% routine, ~25% complex, ~15% deep
- emotionalTone: ~15% positive, ~45% neutral, ~25% negative, ~15% anxious
- ambiguityScore: continuous spread, mean ~0.35 (most items are reasonably clear)
- motivationAlignment: full range — some items the persona WANTS to do (0.8+), many are obligations (0.2-0.4)
- stressLevel: correlate with deadline proximity + dependency blocking + persona's archetype
- contextSwitchCost: correlate with cognitiveLoad and energy level (high energy + complex = high switch cost)
- timesPostponed: ~60% at 0, ~20% at 1, ~10% at 2, ~10% at 3+

**Metadata distribution guidelines:**
- Priority: ~20% high, ~50% medium, ~30% low
- Energy: ~30% high, ~40% medium, ~30% low
- Status: ~85% open, ~15% waiting
- Deadlines: ~40% have deadlines (mix of urgent within 3 days, moderate within 1-2 weeks, relaxed 3+ weeks)
- Context: realistic distribution (~30% @computer, ~20% @phone, ~15% @errands, ~15% @home, ~10% @office, ~10% @anywhere)
- createdAt: spread across 2026-02-20 to 2026-03-13 (older items have higher driftRisk)

**Important for entityMentions:**
- spanStart and spanEnd must be accurate character indices into the content string
- confidence should reflect how clearly this text identifies the entity (0.7-0.99)
- entityId should NOT be set (resolved at runtime)
- Only annotate PER, LOC, ORG entities (not DATE or MISC)

Generate all 60 items now. Return ONLY valid JSON.`;
}

// ---------------------------------------------------------------------------
// Large corpus prompt (per-batch, ~63 items each)
// ---------------------------------------------------------------------------

function buildLargeCorpusPrompt(
  syntheticUser: Record<string, unknown>,
  batchIndex: number,
  totalBatches: number,
  existingItems: CorpusItem[],
): string {
  const gt = syntheticUser.groundTruth as Record<string, unknown>;
  const entities = JSON.stringify(gt.entities, null, 2);
  const relationships = JSON.stringify(gt.relationships, null, 2);
  const facts = JSON.stringify(gt.facts, null, 2);
  const gtdState = gt.gtdState ? JSON.stringify(gt.gtdState, null, 2) : 'null';
  const entityBehaviors = gt.entityBehaviors ? JSON.stringify(gt.entityBehaviors, null, 2) : 'null';
  const personaName = syntheticUser.personaName as string;
  const patternSummary = loadRelationshipPatterns();

  // Detect behavioral archetype
  const gtdStateObj = gt.gtdState as Record<string, unknown> | undefined;
  const entityBehaviorsObj = gt.entityBehaviors as Record<string, unknown> | null;
  const archetype = gtdStateObj ? detectArchetype(gtdStateObj, entityBehaviorsObj) : null;

  // Calculate time window for this batch (8 weeks: 2026-01-15 to 2026-03-13)
  const startDate = new Date('2026-01-15');
  const endDate = new Date('2026-03-13');
  const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const daysPerBatch = Math.floor(totalDays / totalBatches);
  const batchStartDate = new Date(startDate.getTime() + batchIndex * daysPerBatch * 24 * 60 * 60 * 1000);
  const batchEndDate = new Date(startDate.getTime() + (batchIndex + 1) * daysPerBatch * 24 * 60 * 60 * 1000);
  const batchStartStr = batchStartDate.toISOString().split('T')[0];
  const batchEndStr = batchEndDate.toISOString().split('T')[0];

  // Calculate lifecycle progression for this batch
  const progressPct = Math.round(((batchIndex + 1) / totalBatches) * 100);
  const completedPct = Math.min(30, Math.round(progressPct * 0.38)); // ~30% complete by final batch
  const droppedPct = Math.min(10, Math.round(progressPct * 0.13));   // ~10% dropped by final batch
  const renegotiatedPct = Math.min(15, Math.round(progressPct * 0.19)); // ~15% renegotiated by final batch

  // Build summary of existing items for follow-up generation (last 20 items max to save tokens)
  let existingItemsSummary = '';
  if (existingItems.length > 0) {
    const recentItems = existingItems.slice(-20);
    const summaryLines = recentItems.map(item => {
      const status = item.metadata?.status || 'open';
      const project = item.metadata?.riskFactors?.project || 'none';
      return `  - [${item.id}] "${item.content.slice(0, 80)}..." (status: ${status}, project: ${project})`;
    });
    existingItemsSummary = `
## Existing Items (for follow-ups and lifecycle progression)

The following items were generated in previous batches. Generate 3 follow-up items that reference or update these:
${summaryLines.join('\n')}

Follow-up examples:
- An earlier "waiting" item now resolved: "Brian finally got back to me about the proposal -- need to review his changes"
- An item that was "open" is now done: "Finished the auth module tests, passed all 47 assertions"
- An item needs renegotiation: "That kitchen remodel quote expired -- need to restart the contractor search"
- A completed item spawns new work: "Now that the will is updated, need to scan and store the signed copy"
`;
  }

  // Archetype section
  const archetypeSection = archetype ? `
## Behavioral Archetype: ${archetype.archetype}

${archetype.description}

**Risk distribution overrides for this persona:**
${archetype.riskOverrides}
` : '';

  return `You are generating batch ${batchIndex + 1} of ${totalBatches} for a large GTD inbox dataset for ${personaName}.

## ${personaName}'s Profile

**Bio:** ${syntheticUser.bio}

**Ground Truth Entities:**
${entities}

**Ground Truth Relationships:**
${relationships}

**Key Facts:**
${facts}

## GTD Workflow State

${gtdState}

**Entity Response Behaviors:**
${entityBehaviors}
${archetypeSection}
## Keyword Pattern Engine

${patternSummary}

**CRITICAL:** For the system to infer a relationship, the inbox item MUST contain at least one keyword from the relevant pattern IN THE SAME SENTENCE as the entity name.

## Temporal Context

**This is batch ${batchIndex + 1} of ${totalBatches}.**
- Time window: ${batchStartStr} to ${batchEndStr} (week ${batchIndex * 2 + 1}-${batchIndex * 2 + 2} of an 8-week period)
- All \`createdAt\` dates MUST fall within this window
- Items from earlier batches have been aging: batch 1 items are now ${Math.round((totalBatches - 1 - batchIndex) * daysPerBatch)} days old by the end
- \`driftRisk\` for items in stalled projects should increase naturally as weeks pass
- \`daysSinceReview\` should vary: some batches simulate post-review cleanup (low values), others simulate drift (high values)

**Lifecycle Progression (${progressPct}% through the 8-week period):**
- ~${completedPct}% of all items so far should be "done" by now
- ~${droppedPct}% should be "dropped" (abandoned)
- ~${renegotiatedPct}% should need renegotiation (stale commitments, changed context)
- Remaining items are still "open" or "waiting"

${existingItemsSummary}

## Task

Generate exactly 63 inbox items for this time window.

**Distribution:**
- 40 items: Natural keyword-rich phrasing with relationship-evidencing keywords (organic, not forced)
- 10 items: Multi-entity co-occurrence (multiple entities in one item)
- 5 items: Edge cases (alias usage, entity-free items, ambiguous context)
- 5 items: Relationship-reinforcing items (entity + DIFFERENT keywords from same pattern)
- 3 items: Follow-ups/updates to items from previous batches (lifecycle progression)${existingItems.length === 0 ? ' -- since this is batch 1, make these items that SET UP future follow-ups (initial captures that will evolve)' : ''}

**Requirements:**
1. Cover ground truth relationships -- spread keyword evidence across all batches
2. Natural, first-person GTD inbox capture style
3. Vary length (short to detailed)
4. Annotate entity mentions with character-level span positions
5. Mark which ground truth relationships each item evidences
6. Reference the persona's actual projects, areas, and life context
7. Items involving "waiting" should reference people with slow/unpredictable behaviors
8. Each item MUST have complete metadata including all riskFactors fields

**Status field for this batch:**
- Use "open" for new active items
- Use "waiting" for items blocked on someone
- Use "done" for follow-ups that close out earlier items (${completedPct}% of follow-ups)
- Use "dropped" for items the user decided not to pursue (${droppedPct}% of follow-ups)

**Output Format (JSON only, no markdown):**
{
  "items": [
    {
      "id": "item-001",
      "content": "...",
      "expectedEntities": ["..."],
      "expectedRelationships": ["..."],
      "entityMentions": [{ "entityText": "...", "entityType": "PER", "spanStart": 0, "spanEnd": 5, "confidence": 0.95 }],
      "metadata": {
        "priority": "medium",
        "energy": "low",
        "status": "open",
        "deadline": "2026-02-10",
        "context": "@phone",
        "createdAt": "${batchStartStr}",
        "riskFactors": {
          "driftRisk": 5,
          "dependencyBlocked": false,
          "fragility": false,
          "renegotiationNeeded": false,
          "energyMismatch": false,
          "project": "Sprint feature work",
          "gtdStage": "actionable",
          "daysSinceReview": 4
        },
        "cognitiveLabels": {
          "cognitiveLoad": 2,
          "collaborationType": "solo",
          "emotionalTone": "neutral",
          "domain": "work",
          "timeEstimate": "short",
          "gtdHorizon": "10k",
          "infoLifecycle": "short-lived",
          "reviewCadence": "weekly",
          "priorityQuadrant": "not-urgent-important",
          "ambiguityScore": 0.2,
          "outcomeClarity": 0.7,
          "decisionRequired": 0.0,
          "motivationAlignment": 0.5,
          "stressLevel": 0.3,
          "contextSwitchCost": 0.2,
          "timesPostponed": 0
        }
      }
    }
  ]
}

**Metadata fields (REQUIRED for every item):**
- \`priority\`: "high" | "medium" | "low"
- \`energy\`: "high" | "medium" | "low"
- \`status\`: "open" | "waiting" | "done" | "dropped"
- \`deadline\`: ISO date within or after this batch's time window, or omit if none. ~40% should have deadlines.
- \`waitingFor\`: person/thing (only when status is "waiting")
- \`context\`: "@computer" | "@phone" | "@errands" | "@home" | "@office" | "@anywhere"
- \`createdAt\`: ISO date within ${batchStartStr} to ${batchEndStr}

**Risk factors (REQUIRED):**
- \`driftRisk\`: integer days since last project action (increases in later batches for stalled projects)
- \`dependencyBlocked\`: boolean
- \`fragility\`: boolean
- \`renegotiationNeeded\`: boolean
- \`energyMismatch\`: boolean
- \`project\`: project name from gtdState or omit
- \`gtdStage\`: "inbox" | "clarified" | "organized" | "actionable" | "waiting" | "someday"
- \`daysSinceReview\`: integer

**Cognitive labels (REQUIRED):**
Ground truth behavioral/cognitive signals. You know the persona — label each item honestly.
- \`cognitiveLoad\`: 1=trivial, 2=routine, 3=complex, 4=deep
- \`collaborationType\`: "solo" | "delegation" | "collaboration"
- \`emotionalTone\`: "positive" | "neutral" | "negative" | "anxious"
- \`domain\`: "work" | "personal" | "health" | "finance" | "creative" | "tech" | "social" | "admin"
- \`timeEstimate\`: "quick" | "short" | "medium" | "long"
- \`gtdHorizon\`: "runway" | "10k" | "20k" | "30k" | "40k"
- \`infoLifecycle\`: "ephemeral" | "short-lived" | "stable" | "permanent"
- \`reviewCadence\`: "daily" | "weekly" | "monthly" | "quarterly"
- \`priorityQuadrant\`: "urgent-important" | "urgent-not" | "not-urgent-important" | "not-urgent-not"
- \`ambiguityScore\`: 0.0-1.0 (how vague is the next action?)
- \`outcomeClarity\`: 0.0-1.0 (how clear is the end state?)
- \`decisionRequired\`: 0.0-1.0 (does a decision need to happen first?)
- \`motivationAlignment\`: 0.0-1.0 (intrinsic drive vs obligation)
- \`stressLevel\`: 0.0-1.0 (pressure/stress this creates)
- \`contextSwitchCost\`: 0.0-1.0 (disruption to switch to this)
- \`timesPostponed\`: integer 0-5 (how many times postponed)

**entityMentions:** spanStart/spanEnd must be accurate character indices. confidence 0.7-0.99. No entityId. Only PER/LOC/ORG types.

Generate all 63 items now. Return ONLY valid JSON.`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const allPersonas = args.includes('--all');
  const isLarge = args.includes('--large');

  // Find persona directory argument (not a flag)
  const personaArg = args.find(a => !a.startsWith('--'));
  let personaDirs: string[] = [];

  if (allPersonas) {
    // Generate for all personas
    const personasRoot = path.join(__dirname, 'personas');
    personaDirs = fs.readdirSync(personasRoot)
      .filter(d => fs.existsSync(path.join(personasRoot, d, 'synthetic-user.json')))
      .map(d => path.join(personasRoot, d));
  } else if (personaArg) {
    // Single persona by name or path
    const byName = path.join(__dirname, 'personas', personaArg);
    personaDirs = [fs.existsSync(byName) ? byName : personaArg];
  } else {
    // Legacy: load from scripts/harness/
    personaDirs = [''];
  }

  for (const pDir of personaDirs) {
    const { user: syntheticUser, dir: outputDir } = loadSyntheticUser(pDir || undefined);

    if (isDryRun) {
      dryRun(syntheticUser, isLarge);
      continue;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('ERROR: ANTHROPIC_API_KEY environment variable not set.');
      console.error('');
      console.error('Usage:');
      console.error('  ANTHROPIC_API_KEY=<your-key> npx tsx scripts/harness/generate-corpus.ts [persona-name|--all]');
      console.error('  ANTHROPIC_API_KEY=<your-key> npx tsx scripts/harness/generate-corpus.ts --large --all');
      console.error('');
      console.error('Examples:');
      console.error('  npx tsx scripts/harness/generate-corpus.ts alex-jordan');
      console.error('  npx tsx scripts/harness/generate-corpus.ts --large alex-jordan');
      console.error('  npx tsx scripts/harness/generate-corpus.ts --large --all');
      console.error('');
      console.error('Dry-run mode (no API call):');
      console.error('  npx tsx scripts/harness/generate-corpus.ts --dry-run');
      console.error('  npx tsx scripts/harness/generate-corpus.ts --large --dry-run');
      process.exit(1);
    }

    const client = new Anthropic({ apiKey });

    if (isLarge) {
      // --- Large mode: 8 batches of ~63 items ---
      const TOTAL_BATCHES = 8;
      let allItems: CorpusItem[] = [];

      console.log(`[generate-corpus] LARGE MODE: generating ~500 items for ${syntheticUser.personaName}`);

      // Detect and log archetype
      const gt = syntheticUser.groundTruth as Record<string, unknown>;
      const gtdState = gt.gtdState as Record<string, unknown> | undefined;
      const entityBehaviors = gt.entityBehaviors as Record<string, unknown> | null;
      if (gtdState) {
        const archetype = detectArchetype(gtdState, entityBehaviors);
        console.log(`  Archetype: ${archetype.archetype}`);
      }

      for (let batch = 0; batch < TOTAL_BATCHES; batch++) {
        console.log(`  Batch ${batch + 1}/${TOTAL_BATCHES}...`);

        const prompt = buildLargeCorpusPrompt(syntheticUser, batch, TOTAL_BATCHES, allItems);

        const stream = client.messages.stream({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 40000,
          messages: [{ role: 'user', content: prompt }],
        });

        const message = await stream.finalMessage();
        const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

        const parsed = parseApiResponse(responseText, `${syntheticUser.personaName} batch ${batch + 1}`);
        if (!parsed || !Array.isArray(parsed.items)) {
          console.error(`  ERROR: Batch ${batch + 1} failed, skipping`);
          continue;
        }

        console.log(`    Got ${parsed.items.length} items`);
        allItems = [...allItems, ...parsed.items];
        console.log(`    Cumulative: ${allItems.length} items`);

        // Rate limit delay between batches (not after the last one)
        if (batch < TOTAL_BATCHES - 1) {
          await sleep(2000);
        }
      }

      // De-duplicate and re-number
      allItems = deduplicateItems(allItems);
      allItems = renumberItems(allItems);

      const corpus: Corpus = {
        generatedAt: new Date().toISOString(),
        personaName: syntheticUser.personaName as string,
        totalItems: allItems.length,
        items: allItems,
      };

      if (!validateCorpus(corpus)) {
        console.error(`ERROR: Large corpus failed validation for ${syntheticUser.personaName}`);
        continue;
      }

      const outputPath = path.join(outputDir, 'corpus.json');
      fs.writeFileSync(outputPath, JSON.stringify(corpus, null, 2), 'utf-8');

      console.log(`[generate-corpus] SUCCESS: ${syntheticUser.personaName} (large)`);
      console.log(`  Generated: ${corpus.totalItems} items (after dedup)`);
      console.log(`  Output: ${outputPath}`);
    } else {
      // --- Standard mode: 60 items ---
      console.log(`[generate-corpus] Calling Anthropic API to generate corpus...`);
      console.log(`  Persona: ${syntheticUser.personaName}`);

      const prompt = buildPrompt(syntheticUser);

      const stream = client.messages.stream({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 40000,
        messages: [{ role: 'user', content: prompt }],
      });

      const message = await stream.finalMessage();
      const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

      const parsedItems = parseApiResponse(responseText, syntheticUser.personaName as string);
      if (!parsedItems || !Array.isArray(parsedItems.items)) {
        console.error(`ERROR: Response missing items array for ${syntheticUser.personaName}`);
        continue;
      }

      const corpus: Corpus = {
        generatedAt: new Date().toISOString(),
        personaName: syntheticUser.personaName as string,
        totalItems: parsedItems.items.length,
        items: parsedItems.items,
      };

      if (!validateCorpus(corpus)) {
        console.error(`ERROR: Corpus failed validation for ${syntheticUser.personaName}`);
        continue;
      }

      const outputPath = path.join(outputDir, 'corpus.json');
      fs.writeFileSync(outputPath, JSON.stringify(corpus, null, 2), 'utf-8');

      console.log(`[generate-corpus] SUCCESS: ${syntheticUser.personaName}`);
      console.log(`  Generated: ${corpus.totalItems} items`);
      console.log(`  Output: ${outputPath}`);
    }
  }
}

main().catch((err) => {
  console.error('[generate-corpus] Fatal error:', err);
  process.exit(1);
});
