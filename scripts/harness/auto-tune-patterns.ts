/**
 * Cross-persona pattern optimization.
 *
 * Reads relationship-patterns.json, computes per-pattern precision across
 * all personas, adjusts confidence values, and suggests new patterns for
 * common false negatives.
 *
 * Output:
 *   scripts/harness/tuned-patterns.json  — adjusted patterns + _tuning metadata
 *   scripts/harness/pattern-suggestions.json — new patterns from false negative analysis
 *
 * Phase 29: TVAL-02
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PersonaAdversarialResult, RelationshipGap, CycleState } from './harness-types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PATTERNS_PATH = path.join(__dirname, '../../src/config/relationship-patterns.json');
const TUNED_PATTERNS_PATH = path.join(__dirname, 'tuned-patterns.json');
const PATTERN_SUGGESTIONS_PATH = path.join(__dirname, 'pattern-suggestions.json');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RelationshipPattern {
  id: string;
  keywords: string[];
  relationshipType: string;
  targetEntityType: string;
  confidenceBase: number;
  scope: string;
  flags?: string[];
  proximityMaxWords?: number;
  entityTextFilter?: string;
  suppressedByTypes?: string[];
  caseSensitiveKeywords?: boolean;
  skipOnPossessiveGap?: boolean;
}

export interface TuningMetadata {
  timestamp: string;
  personasUsed: string[];
  totalCyclesAnalyzed: number;
  patternsAdjusted: number;
  patternsFlagged: number;
}

export interface TunedPattern extends RelationshipPattern {
  _originalConfidence?: number;
  _precisionEstimate?: number;
  _fireCount?: number;
  _correctCount?: number;
}

export interface TunedPatternsFile {
  version: number;
  patterns: TunedPattern[];
  _tuning: TuningMetadata;
}

export interface PatternSuggestion {
  keyword: string;
  relationshipType: string;
  suggestedConfidence: number;
  evidence: string; // description of missed corpus items that needed this
  derivedFrom: string[]; // persona names that showed this gap
}

export interface TuneResult {
  tunedPatterns: TunedPattern[];
  patternSuggestions: PatternSuggestion[];
  adjustedCount: number;
  flaggedCount: number;
  /** Per-pattern precision stats */
  precisionStats: Record<string, { precision: number; fireCount: number; correctCount: number }>;
}

// ---------------------------------------------------------------------------
// Pattern fire tracking
// ---------------------------------------------------------------------------

/**
 * Estimate how often each pattern "fired" and was correct by analysing
 * ComponentAttribution data and foundRelations across all cycles.
 *
 * Proxy for precision:
 * - "fired" = times pattern contributed to a relationship (attribution 'keyword-pattern')
 * - "correct" = times that relationship also appears in foundRelations (GT confirmed)
 *
 * Since attribution tracks relationship type not pattern ID, we group by
 * relationship type and distribute credit evenly across patterns for that type.
 */
function estimatePatternPrecision(
  results: PersonaAdversarialResult[],
  patterns: RelationshipPattern[],
): Record<string, { precision: number; fireCount: number; correctCount: number }> {
  // Aggregate: for each relationship type, count keyword-pattern firings vs correct
  const typeStats: Record<string, { fired: number; correct: number }> = {};

  for (const result of results) {
    for (const cycle of result.cycles) {
      // Count keyword-pattern attributed relationships in this cycle
      for (const [relationKey, source] of cycle.attribution.byRelation.entries()) {
        if (source !== 'keyword-pattern') continue;
        const [, relType] = relationKey.split(':');
        if (!relType) continue;

        if (!typeStats[relType]) typeStats[relType] = { fired: 0, correct: 0 };
        typeStats[relType].fired++;

        // Check if this relationship was in foundRelations (GT confirmed)
        const isCorrect = cycle.score.foundRelations.some((fr) => {
          const key = `${fr.entity}:${fr.type}`;
          return key === relationKey;
        });
        if (isCorrect) typeStats[relType].correct++;
      }
    }
  }

  // Map back to pattern IDs — distribute stats evenly among patterns for same type
  const patternStats: Record<string, { precision: number; fireCount: number; correctCount: number }> = {};

  for (const pattern of patterns) {
    const stats = typeStats[pattern.relationshipType];
    if (!stats || stats.fired === 0) {
      // Pattern never fired (or no data) — assume neutral precision
      patternStats[pattern.id] = { precision: 0.5, fireCount: 0, correctCount: 0 };
      continue;
    }

    // Count how many patterns share this relationship type
    const siblingCount = patterns.filter((p) => p.relationshipType === pattern.relationshipType).length;

    // Distribute counts evenly among sibling patterns
    const fireCount = Math.round(stats.fired / siblingCount);
    const correctCount = Math.round(stats.correct / siblingCount);
    const precision = fireCount > 0 ? correctCount / fireCount : 0.5;

    patternStats[pattern.id] = { precision, fireCount, correctCount };
  }

  return patternStats;
}

// ---------------------------------------------------------------------------
// Missed relationship analysis for pattern suggestions
// ---------------------------------------------------------------------------

/**
 * Collect all missed relationships across all personas and cycles.
 * Groups by relationship type to find systematic gaps.
 */
function collectMissedRelationships(
  results: PersonaAdversarialResult[],
): Record<string, Array<{ entity: string; personaName: string; gapReason: string }>> {
  const missed: Record<string, Array<{ entity: string; personaName: string; gapReason: string }>> = {};

  for (const result of results) {
    const lastCycle = result.cycles[result.cycles.length - 1];
    if (!lastCycle) continue;

    for (const gap of lastCycle.gaps) {
      const type = gap.groundTruthRelationship.type;
      if (!missed[type]) missed[type] = [];
      missed[type].push({
        entity: gap.groundTruthRelationship.entity,
        personaName: result.personaName,
        gapReason: gap.gapReason,
      });
    }
  }

  return missed;
}

/**
 * Use Sonnet to suggest new keyword patterns for a missed relationship type.
 */
async function suggestPatternsForGap(
  relationshipType: string,
  misses: Array<{ entity: string; personaName: string; gapReason: string }>,
  client: Anthropic,
): Promise<PatternSuggestion[]> {
  const missDescription = misses
    .slice(0, 5)
    .map((m) => `- Entity: ${m.entity} (persona: ${m.personaName}) — ${m.gapReason}`)
    .join('\n');

  const prompt = `You are analyzing gaps in a keyword-based relationship inference system.

**Relationship type that is consistently missed:** "${relationshipType}"

**Examples of missed detections:**
${missDescription}

**Task:** Suggest 3-5 new keyword phrases that would help detect "${relationshipType}" relationships in GTD-style personal notes.
Focus on:
- Natural informal language (how people actually write quick notes)
- Context clues rather than direct labels
- Phrases that appear NEAR the person's name in casual text

Return JSON only:
{
  "suggestions": [
    {
      "keyword": "<keyword or short phrase>",
      "suggestedConfidence": <0.10-0.70>,
      "evidence": "<why this keyword signals ${relationshipType}>"
    }
  ]
}`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    const cleaned = responseText
      .replace(/^```json\s*/m, '')
      .replace(/^```\s*/m, '')
      .replace(/```\s*$/m, '')
      .trim();

    const parsed = JSON.parse(cleaned) as {
      suggestions: Array<{ keyword: string; suggestedConfidence: number; evidence: string }>;
    };

    return (parsed.suggestions ?? []).map((s) => ({
      keyword: s.keyword,
      relationshipType,
      suggestedConfidence: Math.min(0.70, Math.max(0.10, s.suggestedConfidence)),
      evidence: s.evidence,
      derivedFrom: misses.map((m) => m.personaName).filter((v, i, a) => a.indexOf(v) === i),
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main tune function
// ---------------------------------------------------------------------------

export async function autoTunePatterns(
  results: PersonaAdversarialResult[],
  client: Anthropic,
): Promise<TuneResult> {
  console.log('[auto-tune] Loading relationship patterns...');
  const patternsConfig = JSON.parse(fs.readFileSync(PATTERNS_PATH, 'utf-8')) as {
    version: number;
    patterns: RelationshipPattern[];
  };

  const patterns = patternsConfig.patterns;
  console.log(`[auto-tune] Analyzing ${patterns.length} patterns across ${results.length} personas...`);

  // Estimate per-pattern precision from attribution data
  const precisionStats = estimatePatternPrecision(results, patterns);

  // Adjust pattern confidence values
  const tunedPatterns: TunedPattern[] = [];
  let adjustedCount = 0;
  let flaggedCount = 0;

  for (const pattern of patterns) {
    const stats = precisionStats[pattern.id] ?? { precision: 0.5, fireCount: 0, correctCount: 0 };
    const tuned: TunedPattern = {
      ...pattern,
      _originalConfidence: pattern.confidenceBase,
      _precisionEstimate: stats.precision,
      _fireCount: stats.fireCount,
      _correctCount: stats.correctCount,
    };

    if (stats.fireCount >= 3) {
      if (stats.precision > 0.70) {
        // High precision — boost confidence
        tuned.confidenceBase = Math.min(0.95, pattern.confidenceBase + 0.05);
        adjustedCount++;
      } else if (stats.precision < 0.40) {
        // Low precision — halve confidence and flag
        tuned.confidenceBase = pattern.confidenceBase * 0.5;
        tuned.flags = [
          ...(pattern.flags ?? []),
          `low-precision:${(stats.precision * 100).toFixed(0)}%`,
        ];
        adjustedCount++;
        flaggedCount++;
      }
    }

    tunedPatterns.push(tuned);
  }

  // Collect missed relationships and suggest new patterns
  const missedRelationships = collectMissedRelationships(results);
  const patternSuggestions: PatternSuggestion[] = [];

  // Only suggest for relationship types with 2+ misses across personas
  const significantGaps = Object.entries(missedRelationships)
    .filter(([, misses]) => misses.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5); // Top 5 gap types only

  console.log(`[auto-tune] Analyzing ${significantGaps.length} significant gap types for new patterns...`);

  for (const [relType, misses] of significantGaps) {
    console.log(`  Gap: "${relType}" — ${misses.length} misses across personas`);
    const suggestions = await suggestPatternsForGap(relType, misses, client);
    patternSuggestions.push(...suggestions);
  }

  const personaNames = results.map((r) => r.personaName);
  const totalCycles = results.reduce((sum, r) => sum + r.cycles.length, 0);

  // Write tuned-patterns.json
  const tunedPatternsFile: TunedPatternsFile = {
    version: patternsConfig.version + 1,
    patterns: tunedPatterns,
    _tuning: {
      timestamp: new Date().toISOString(),
      personasUsed: personaNames,
      totalCyclesAnalyzed: totalCycles,
      patternsAdjusted: adjustedCount,
      patternsFlagged: flaggedCount,
    },
  };

  fs.writeFileSync(TUNED_PATTERNS_PATH, JSON.stringify(tunedPatternsFile, null, 2), 'utf-8');
  console.log(`[auto-tune] Wrote ${TUNED_PATTERNS_PATH}`);

  // Write pattern-suggestions.json
  fs.writeFileSync(PATTERN_SUGGESTIONS_PATH, JSON.stringify(patternSuggestions, null, 2), 'utf-8');
  console.log(`[auto-tune] Wrote ${PATTERN_SUGGESTIONS_PATH}`);

  console.log(`[auto-tune] Summary: ${adjustedCount} patterns adjusted, ${flaggedCount} flagged, ${patternSuggestions.length} suggestions generated`);

  return {
    tunedPatterns,
    patternSuggestions,
    adjustedCount,
    flaggedCount,
    precisionStats,
  };
}
