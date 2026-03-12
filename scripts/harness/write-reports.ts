/**
 * Report generator — produces JSON + Markdown reports from harness results.
 *
 * Output:
 *   scripts/harness/reports/harness_{timestamp}.json  — full checkpoint data
 *   scripts/harness/reports/harness_{timestamp}.md    — summary with learning curve
 *
 * Phase 28: HARN-03
 */

import fs from 'node:fs';
import path from 'node:path';
import type { GraphScore } from './score-graph.js';
import type { ExperimentResult, PersonaAdversarialResult } from './harness-types.js';
import { computeAggregateScore, computeLearningCurve } from './score-graph.js';
import type { AblationSuiteResult } from './ablation-engine.js';
import { formatEVSReport } from './enrichment-value-score.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CheckpointResult {
  score: GraphScore;
  atomsProcessed: number;
}

// ---------------------------------------------------------------------------
// ASCII bar chart helper
// ---------------------------------------------------------------------------

function asciiBar(value: number, width = 20): string {
  const filled = Math.round(value * width);
  const empty = width - filled;
  return `|${'█'.repeat(filled)}${'░'.repeat(empty)}| ${(value * 100).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Markdown report
// ---------------------------------------------------------------------------

function buildMarkdown(results: CheckpointResult[], runTimestamp: string): string {
  const lines: string[] = [];

  lines.push(`# Cognitive Harness Report`);
  lines.push(`**Generated:** ${runTimestamp}`);
  lines.push(`**Checkpoints:** ${results.length}`);
  lines.push('');

  // Summary table
  lines.push('## Checkpoint Summary');
  lines.push('');
  lines.push(
    '| Atoms | Ent P | Ent R | Ent F1 | Rel P | Rel R | Rel F1 | Privacy |',
  );
  lines.push(
    '|-------|-------|-------|--------|-------|-------|--------|---------|',
  );

  for (const { score } of results) {
    const fmt = (n: number) => (n * 100).toFixed(1) + '%';
    lines.push(
      `| ${score.checkpoint} | ${fmt(score.entityPrecision)} | ${fmt(score.entityRecall)} | ${fmt(score.entityF1)} | ${fmt(score.relationshipPrecision)} | ${fmt(score.relationshipRecall)} | ${fmt(score.relationshipF1)} | ${fmt(score.privacyScore)} |`,
    );
  }

  lines.push('');

  // Learning curve ASCII chart
  lines.push('## Learning Curve');
  lines.push('');
  lines.push('### Entity Recall');
  for (const { score } of results) {
    lines.push(`  ${String(score.checkpoint).padStart(3)} atoms: ${asciiBar(score.entityRecall)}`);
  }

  lines.push('');
  lines.push('### Relationship Recall');
  for (const { score } of results) {
    lines.push(`  ${String(score.checkpoint).padStart(3)} atoms: ${asciiBar(score.relationshipRecall)}`);
  }

  lines.push('');
  lines.push('### Privacy Score (Semantic Sanitization Coverage)');
  for (const { score } of results) {
    lines.push(`  ${String(score.checkpoint).padStart(3)} atoms: ${asciiBar(score.privacyScore)}`);
  }

  lines.push('');

  // Final checkpoint detail
  if (results.length > 0) {
    const final = results[results.length - 1].score;

    lines.push('## Final Checkpoint Detail');
    lines.push(`**Atoms processed:** ${final.checkpoint}`);
    lines.push('');

    lines.push('### Entities Found');
    if (final.foundEntities.length > 0) {
      for (const e of final.foundEntities) {
        lines.push(`  - ${e}`);
      }
    } else {
      lines.push('  *(none)*');
    }

    lines.push('');
    lines.push('### Entities Missed');
    if (final.missedEntities.length > 0) {
      for (const e of final.missedEntities) {
        lines.push(`  - ${e}`);
      }
    } else {
      lines.push('  *(all found)*');
    }

    lines.push('');
    lines.push('### Relationships Inferred');
    if (final.foundRelations.length > 0) {
      for (const r of final.foundRelations) {
        lines.push(`  - ${r.entity}: ${r.type}`);
      }
    } else {
      lines.push('  *(none)*');
    }

    lines.push('');
    lines.push('### Relationships Missed');
    if (final.missedRelations.length > 0) {
      for (const r of final.missedRelations) {
        lines.push(`  - ${r.entity}: ${r.type}`);
      }
    } else {
      lines.push('  *(all inferred)*');
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Experiment-level report
// ---------------------------------------------------------------------------

function buildExperimentMarkdown(result: ExperimentResult, ablation?: AblationSuiteResult): string {
  const lines: string[] = [];

  lines.push(`# Adversarial Training Experiment: ${result.experimentName}`);
  lines.push(`**Started:** ${result.startedAt}`);
  lines.push(`**Completed:** ${result.completedAt}`);
  lines.push(`**Personas:** ${result.personas.length}`);
  lines.push('');

  // Cross-persona comparison table
  lines.push('## Cross-Persona Summary');
  lines.push('');
  lines.push('| Persona | Cycles | Ent F1 | Rel F1 | Privacy | Status |');
  lines.push('|---------|--------|--------|--------|---------|--------|');

  const PASS_THRESHOLD = 0.80;

  for (const persona of result.personas) {
    const s = persona.finalScore;
    const passed = s.relationshipF1 >= PASS_THRESHOLD ? 'PASS' : 'FAIL';
    const cycleCount = persona.cycles.length;
    lines.push(
      `| ${persona.personaName} | ${cycleCount} | ${(s.entityF1 * 100).toFixed(1)}% | ${(s.relationshipF1 * 100).toFixed(1)}% | ${(s.privacyScore * 100).toFixed(1)}% | ${passed} |`,
    );
  }
  lines.push('');

  // Aggregate metrics
  const agg = result.aggregateScore;
  lines.push('## Aggregate Metrics');
  lines.push('');
  lines.push('| Metric | Mean | Median | Min | Max | StdDev |');
  lines.push('|--------|------|--------|-----|-----|--------|');
  const fmt = (n: number) => `${(n * 100).toFixed(1)}%`;
  lines.push(`| Entity F1 | ${fmt(agg.entityF1.mean)} | ${fmt(agg.entityF1.median)} | ${fmt(agg.entityF1.min)} | ${fmt(agg.entityF1.max)} | ${fmt(agg.entityF1.stdDev)} |`);
  lines.push(`| Relationship F1 | ${fmt(agg.relationshipF1.mean)} | ${fmt(agg.relationshipF1.median)} | ${fmt(agg.relationshipF1.min)} | ${fmt(agg.relationshipF1.max)} | ${fmt(agg.relationshipF1.stdDev)} |`);
  lines.push(`| Privacy Score | ${fmt(agg.privacyScore.mean)} | ${fmt(agg.privacyScore.median)} | ${fmt(agg.privacyScore.min)} | ${fmt(agg.privacyScore.max)} | ${fmt(agg.privacyScore.stdDev)} |`);
  lines.push('');

  // Per-persona learning curves with classification
  lines.push('## Learning Curves (Relationship F1 by Cycle)');
  lines.push('');
  for (const [personaName, curve] of Object.entries(result.learningCurves)) {
    const f1Values = curve.map((p) => p.relationshipF1);
    const curveType = classifyLearningCurve(f1Values);
    const curveLabel = curveType === 'healthy-logarithmic' ? '✓ healthy' :
      curveType === 'early-saturation' ? '⚠ early saturation' : '✗ degradation';
    lines.push(`### ${personaName} [${curveLabel}]`);
    for (const point of curve) {
      lines.push(`  Cycle ${point.cycle}: ${asciiBar(point.relationshipF1)} RelF1  ${asciiBar(point.entityF1)} EntF1`);
    }
    lines.push('');
  }

  // Component attribution summary
  lines.push('## Component Attribution');
  lines.push('');
  lines.push('Breakdown of how relationships were discovered across all personas:');
  lines.push('');

  const totalCounts: Record<string, number> = {
    'keyword-pattern': 0,
    'co-occurrence': 0,
    'enrichment-mining': 0,
    'user-correction': 0,
  };
  let totalRelations = 0;

  for (const persona of result.personas) {
    for (const cycle of persona.cycles) {
      for (const [, count] of Object.entries(cycle.attribution.counts)) {
        void count; // satisfy unused var
      }
      for (const source of Object.keys(totalCounts)) {
        totalCounts[source] += cycle.attribution.counts[source as keyof typeof totalCounts] ?? 0;
        totalRelations += cycle.attribution.counts[source as keyof typeof totalCounts] ?? 0;
      }
    }
  }
  // Deduplicate by persona final counts
  if (totalRelations > 0) {
    for (const [source, count] of Object.entries(totalCounts)) {
      const pct = count / totalRelations;
      lines.push(`  ${source.padEnd(22)}: ${asciiBar(pct)} (${count} relations)`);
    }
  }
  lines.push('');

  // Enrichment Value Score section
  const personasWithEVS = result.personas.filter(
    (p) => p.cycles.some((c) => c.enrichmentValueScore),
  );
  if (personasWithEVS.length > 0) {
    lines.push('## Enrichment Value Score (EVS)');
    lines.push('');
    lines.push('Measures how much smarter the local stack got from enrichment across five dimensions.');
    lines.push('');

    for (const persona of personasWithEVS) {
      lines.push(`### ${persona.personaName}`);
      lines.push('');
      for (const cycle of persona.cycles) {
        if (cycle.enrichmentValueScore) {
          lines.push(`**Cycle ${cycle.cycleNumber}:**`);
          lines.push('```');
          lines.push(formatEVSReport(cycle.enrichmentValueScore));
          lines.push('```');
          lines.push('');
        }
      }
    }
  }

  // Ablation section (if provided)
  if (ablation) {
    lines.push(buildAblationSection(ablation));
  }

  // Worst-performing personas
  const sortedByRelF1 = [...result.personas].sort(
    (a, b) => a.finalScore.relationshipF1 - b.finalScore.relationshipF1,
  );
  const worst = sortedByRelF1.slice(0, Math.min(3, sortedByRelF1.length));
  if (worst.some((p) => p.finalScore.relationshipF1 < PASS_THRESHOLD)) {
    lines.push('## Personas Needing Attention');
    lines.push('');
    for (const persona of worst) {
      if (persona.finalScore.relationshipF1 >= PASS_THRESHOLD) continue;
      const lastCycle = persona.cycles[persona.cycles.length - 1];
      lines.push(`### ${persona.personaName} (RelF1: ${(persona.finalScore.relationshipF1 * 100).toFixed(1)}%)`);
      if (lastCycle?.gaps.length > 0) {
        lines.push(`**Remaining gaps after ${persona.cycles.length} cycles:**`);
        for (const gap of lastCycle.gaps.slice(0, 5)) {
          lines.push(`  - ${gap.groundTruthRelationship.entity}: "${gap.groundTruthRelationship.type}" — ${gap.gapReason}`);
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Learning curve classification
// ---------------------------------------------------------------------------

export function classifyLearningCurve(
  f1Values: number[],
): 'healthy-logarithmic' | 'early-saturation' | 'degradation' {
  if (f1Values.length < 2) return 'healthy-logarithmic';
  const last = f1Values[f1Values.length - 1];
  const first = f1Values[0];
  if (last < first - 0.05) return 'degradation';
  const midIdx = Math.floor(f1Values.length / 2);
  const midVal = f1Values[midIdx];
  const laterGain = last - midVal;
  if (laterGain < 0.02 && last < 0.80) return 'early-saturation';
  return 'healthy-logarithmic';
}

// ---------------------------------------------------------------------------
// Ablation section builder
// ---------------------------------------------------------------------------

function buildAblationSection(ablation: AblationSuiteResult): string {
  const lines: string[] = [];

  lines.push('## Ablation Results');
  lines.push('');
  lines.push('Component contribution measured by disabling each component and re-scoring.');
  lines.push('');

  if (ablation.componentRanking.length === 0) {
    lines.push('*No ablation data available.*');
    return lines.join('\n');
  }

  // Component ranking table
  lines.push('### Component Importance Ranking');
  lines.push('');
  lines.push('| Rank | Component | RelF1 Impact | EntF1 Impact | Overall Impact |');
  lines.push('|------|-----------|-------------|-------------|----------------|');

  for (let i = 0; i < ablation.componentRanking.length; i++) {
    const comp = ablation.componentRanking[i];
    const relDelta = comp.relationshipF1Delta < 0
      ? `${(comp.relationshipF1Delta * 100).toFixed(1)}%`
      : `+${(comp.relationshipF1Delta * 100).toFixed(1)}%`;
    const entDelta = comp.entityF1Delta < 0
      ? `${(comp.entityF1Delta * 100).toFixed(1)}%`
      : `+${(comp.entityF1Delta * 100).toFixed(1)}%`;
    lines.push(`| ${i + 1} | ${comp.componentName} | ${relDelta} | ${entDelta} | ${comp.impactScore.toFixed(3)} |`);
  }
  lines.push('');
  lines.push('*Negative delta = removing this component hurt the score (it was contributing positively)*');
  lines.push('');

  // ASCII delta chart for relationship F1
  lines.push('### RelF1 Impact (ASCII chart)');
  lines.push('');
  for (const comp of ablation.componentRanking) {
    const absImpact = Math.abs(comp.relationshipF1Delta);
    const bars = Math.round(absImpact * 40); // scale to 40 chars
    const direction = comp.relationshipF1Delta <= 0 ? '-' : '+';
    const bar = `${direction}${'█'.repeat(bars)}`;
    lines.push(`  ${comp.componentName.padEnd(22)} ${bar.padEnd(45)} ${(comp.relationshipF1Delta * 100).toFixed(1)}%`);
  }
  lines.push('');

  return lines.join('\n');
}

export function writeExperimentReport(
  result: ExperimentResult,
  outputDir: string,
  ablation?: AblationSuiteResult,
): { jsonPath: string; mdPath: string } {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const jsonPath = path.join(outputDir, 'experiment-report.json');
  const mdPath = path.join(outputDir, 'experiment-report.md');

  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2), 'utf-8');

  const mdContent = buildExperimentMarkdown(result, ablation);
  fs.writeFileSync(mdPath, mdContent, 'utf-8');

  return { jsonPath, mdPath };
}

// ---------------------------------------------------------------------------
// Single-persona reports (backward compatible)
// ---------------------------------------------------------------------------

export function writeReports(results: CheckpointResult[], outputDir: string): {
  jsonPath: string;
  mdPath: string;
} {
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '_')
    .slice(0, 15); // YYYYMMDDHHmmss format → 15 chars

  const runTimestamp = now.toISOString();

  const jsonPath = path.join(outputDir, `harness_${timestamp}.json`);
  const mdPath = path.join(outputDir, `harness_${timestamp}.md`);

  // Write JSON report
  const jsonReport = {
    generatedAt: runTimestamp,
    totalCheckpoints: results.length,
    checkpoints: results,
  };
  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2), 'utf-8');

  // Write Markdown report
  const mdContent = buildMarkdown(results, runTimestamp);
  fs.writeFileSync(mdPath, mdContent, 'utf-8');

  return { jsonPath, mdPath };
}
