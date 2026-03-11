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
