/**
 * EII report section builders for the adversarial harness.
 *
 * Provides ASCII chart builders for the three proof charts:
 *   1. buildEIICurveSection    — EII corpus size curve with slope analysis
 *   2. buildEIISummaryTable    — per-persona EII breakdown with threshold flag
 *   3. buildCorrelationMatrix  — specialist pairwise agreement matrix
 *   4. buildSpecialistAblationSection — ablation table with consensus_lift
 *
 * All functions are pure — no I/O, no state. Callers (write-reports.ts, run-adversarial.ts)
 * decide where and when to include these sections.
 *
 * Phase 37: EII-02
 */

import type { ConsensusResult } from '../../src/ai/consensus/types.js';
import type { EIIResult } from '../../src/ai/eii/types.js';
import type { SpecialistAblationResult } from './ablation-engine.js';

// ---------------------------------------------------------------------------
// asciiBar — |███░░░| XX.X% bar
// ---------------------------------------------------------------------------

/**
 * Build an ASCII bar chart representation of a [0, 1] value.
 *
 * @param value - Value in [0, 1]
 * @param width - Total bar width in chars (default 20)
 */
export function asciiBar(value: number, width = 20): string {
  const clamped = Math.max(0, Math.min(1, value));
  const filled = Math.round(clamped * width);
  const empty = width - filled;
  return `|${'█'.repeat(filled)}${'░'.repeat(empty)}| ${(clamped * 100).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// linearRegressionSlope — simple OLS slope over N data points
// ---------------------------------------------------------------------------

/**
 * Compute the ordinary least-squares slope for a sequence of values.
 *
 * Values are indexed by their position [0, 1, 2, ...].
 * Returns 0 for fewer than 2 data points.
 *
 * @param values - Numeric array (e.g., EII values across corpus levels)
 */
export function linearRegressionSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;

  const meanX = (n - 1) / 2; // mean of [0, 1, ..., n-1]
  const meanY = values.reduce((sum, v) => sum + v, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - meanX;
    num += dx * ((values[i] ?? 0) - meanY);
    den += dx * dx;
  }

  return den === 0 ? 0 : num / den;
}

// ---------------------------------------------------------------------------
// buildEIICurveSection — corpus size curve with slope analysis
// ---------------------------------------------------------------------------

/**
 * Build the EII corpus size curve section for a persona.
 *
 * Shows 5 curve points (10%, 25%, 50%, 75%, 100% of corpus) with ASCII bars
 * for EII, coherence, stability, and impact. Includes linear regression slope
 * analysis and flat-component flagging.
 *
 * @param curvePoints  - Array of 5 data points (or fewer if cold-start guard triggered)
 * @param personaName  - Persona name for section header
 */
export function buildEIICurveSection(
  curvePoints: Array<{
    fraction: number;
    coherence: number;
    stability: number;
    impact: number;
    eii: number;
  }>,
  personaName: string,
): string {
  const lines: string[] = [];

  lines.push(`### ${personaName} — EII Corpus Size Curve`);
  lines.push('');

  if (curvePoints.length === 0) {
    lines.push('*No curve data (insufficient atoms for cold-start guard)*');
    lines.push('');
    return lines.join('\n');
  }

  const fractions = curvePoints.map((p) => p.fraction);
  const eiiValues = curvePoints.map((p) => p.eii);
  const coherenceValues = curvePoints.map((p) => p.coherence);
  const stabilityValues = curvePoints.map((p) => p.stability);
  const impactValues = curvePoints.map((p) => p.impact);

  // ASCII chart
  for (let i = 0; i < curvePoints.length; i++) {
    const pct = Math.round((fractions[i] ?? 0) * 100);
    const pt = curvePoints[i]!;
    lines.push(`  ${String(pct).padStart(3)}% corpus:`);
    lines.push(`    EII        ${asciiBar(pt.eii)}`);
    lines.push(`    Coherence  ${asciiBar(pt.coherence)}`);
    lines.push(`    Stability  ${asciiBar(pt.stability)}`);
    lines.push(`    Impact     ${asciiBar(pt.impact)}`);
    lines.push('');
  }

  // Slope analysis
  const eiiSlope = linearRegressionSlope(eiiValues);
  const coherenceSlope = linearRegressionSlope(coherenceValues);
  const stabilitySlope = linearRegressionSlope(stabilityValues);
  const impactSlope = linearRegressionSlope(impactValues);

  lines.push('**Slope Analysis (linear regression):**');
  lines.push('');

  const formatSlope = (s: number) => (s >= 0 ? `+${s.toFixed(4)}` : s.toFixed(4));
  lines.push(`  EII slope:        ${formatSlope(eiiSlope)}`);
  lines.push(`  Coherence slope:  ${formatSlope(coherenceSlope)}`);
  lines.push(`  Stability slope:  ${formatSlope(stabilitySlope)}`);
  lines.push(`  Impact slope:     ${formatSlope(impactSlope)}`);
  lines.push('');

  // Verdict
  const verdict = eiiSlope > 0
    ? 'POSITIVE slope — EII improves with more data'
    : 'FLAT/NEGATIVE slope -- investigate';
  lines.push(`**Verdict:** ${verdict}`);

  // Flag flat components (|slope| < 0.005 threshold)
  const FLAT_THRESHOLD = 0.005;
  const flatComponents: string[] = [];
  if (Math.abs(coherenceSlope) < FLAT_THRESHOLD) flatComponents.push('coherence');
  if (Math.abs(stabilitySlope) < FLAT_THRESHOLD) flatComponents.push('stability');
  if (Math.abs(impactSlope) < FLAT_THRESHOLD) flatComponents.push('impact');

  if (flatComponents.length > 0) {
    lines.push(`**Flat components:** ${flatComponents.join(', ')} (investigate signal quality)`);
  }

  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// buildEIISummaryTable — per-persona EII breakdown
// ---------------------------------------------------------------------------

/**
 * Build a markdown table of per-persona EII results.
 *
 * Status column: EII > 0.80 is flagged as "DIAG" (diagnostic) — not a hard gate.
 * Flagging is only meaningful for personas with 50+ atoms (per EII-04 requirement).
 *
 * @param personaEIIs - Array of per-persona EII results
 */
export function buildEIISummaryTable(
  personaEIIs: Array<{
    personaName: string;
    atomCount: number;
    finalEII: EIIResult;
    meetsThreshold: boolean;
  }>,
): string {
  const lines: string[] = [];

  lines.push('### EII Summary Table');
  lines.push('');
  lines.push('| Persona | Atoms | Coherence | Stability | Impact | EII | Status |');
  lines.push('|---------|-------|-----------|-----------|--------|-----|--------|');

  for (const { personaName, atomCount, finalEII, meetsThreshold } of personaEIIs) {
    const fmt = (n: number) => n.toFixed(3);
    const status = meetsThreshold
      ? atomCount >= 50 ? 'DIAG (>0.80, 50+ atoms)' : 'DIAG (>0.80)'
      : 'ok';
    lines.push(
      `| ${personaName} | ${atomCount} | ${fmt(finalEII.coherence)} | ${fmt(finalEII.stability)} | ${fmt(finalEII.impact)} | ${fmt(finalEII.eii)} | ${status} |`,
    );
  }

  lines.push('');
  lines.push('*DIAG = diagnostic flag (not a hard gate). Investigate if EII > 0.80 for 50+ atom personas.*');
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// buildCorrelationMatrix — specialist pairwise agreement rates
// ---------------------------------------------------------------------------

/**
 * Build an ASCII specialist correlation matrix from all consensus results.
 *
 * Agreement = both specialists predict >= 0.5 OR both predict < 0.5.
 * This is the binary agreement rate matching the agreementScore logic.
 *
 * @param allConsensusResults - All ConsensusResult records from the experiment
 */
export function buildCorrelationMatrix(allConsensusResults: ConsensusResult[]): string {
  const lines: string[] = [];

  lines.push('### Specialist Correlation Matrix');
  lines.push('');

  if (allConsensusResults.length === 0) {
    lines.push('*No consensus results available*');
    lines.push('');
    return lines.join('\n');
  }

  // Collect all specialist names from the first result with contributions
  const firstWithContribs = allConsensusResults.find(
    (r) => r.specialistContributions && r.specialistContributions.length > 0,
  );
  if (!firstWithContribs) {
    lines.push('*No specialist contributions in consensus results*');
    lines.push('');
    return lines.join('\n');
  }

  const specialistNames = firstWithContribs.specialistContributions.map((s) => s.name);
  const n = specialistNames.length;

  if (n < 2) {
    lines.push('*Need at least 2 specialists for correlation matrix*');
    lines.push('');
    return lines.join('\n');
  }

  // Build agreement matrix: [i][j] = pairwise agreement rate
  const agreementMatrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0) as number[]);
  let sampleCount = 0;

  for (const result of allConsensusResults) {
    if (!result.specialistContributions || result.specialistContributions.length < 2) continue;

    // Build a lookup by name for this result
    const probByName: Record<string, number> = {};
    for (const contrib of result.specialistContributions) {
      probByName[contrib.name] = contrib.probability;
    }

    sampleCount++;

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const piAbove = (probByName[specialistNames[i]!] ?? 0) >= 0.5;
        const pjAbove = (probByName[specialistNames[j]!] ?? 0) >= 0.5;
        (agreementMatrix[i]!)[j] = ((agreementMatrix[i]!)[j] ?? 0) + (piAbove === pjAbove ? 1 : 0);
      }
    }
  }

  if (sampleCount === 0) {
    lines.push('*Insufficient data for correlation matrix*');
    lines.push('');
    return lines.join('\n');
  }

  // Normalize by sample count
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      (agreementMatrix[i]!)[j] = ((agreementMatrix[i]!)[j] ?? 0) / sampleCount;
    }
  }

  lines.push(`*(${sampleCount} atom samples)*`);
  lines.push('');

  // Header row
  const colWidth = 12;
  const nameWidth = 18;
  const header = ''.padEnd(nameWidth) + specialistNames.map((n) => n.slice(0, colWidth - 2).padStart(colWidth)).join('');
  lines.push(header);
  lines.push('-'.repeat(nameWidth + n * colWidth));

  // Data rows
  for (let i = 0; i < n; i++) {
    let row = (specialistNames[i] ?? '').padEnd(nameWidth);
    for (let j = 0; j < n; j++) {
      const val = (agreementMatrix[i]!)[j] ?? 0;
      // Diagonal = 1.00 always
      const display = i === j ? '1.00' : val.toFixed(2);
      row += display.padStart(colWidth);
    }
    lines.push(row);
  }

  lines.push('');
  lines.push('*Values = fraction of atoms where both specialists agree (both >= 0.5 or both < 0.5)*');
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// buildSpecialistAblationSection — ablation table with consensus_lift
// ---------------------------------------------------------------------------

/**
 * Build the specialist ablation report section.
 *
 * Shows per-specialist: full EII, ablated EII, EII delta, consensus_lift.
 * Delta convention: negative = removing this specialist HURT (it was contributing).
 * Sorted by most impactful first (caller's job — SpecialistAblationResult[] comes pre-sorted).
 *
 * consensus_lift = full EII - single-specialist EII (proves ensemble > individual).
 *
 * @param ablationResults - Sorted SpecialistAblationResult[] from runSpecialistAblation()
 */
export function buildSpecialistAblationSection(
  ablationResults: SpecialistAblationResult[],
): string {
  const lines: string[] = [];

  lines.push('### Specialist Ablation (Consensus Lift)');
  lines.push('');
  lines.push('Leave-one-out ablation measures each specialist\'s contribution to EII.');
  lines.push('Zero re-inference cost — post-hoc filtering of stored specialistContributions.');
  lines.push('');

  if (ablationResults.length === 0) {
    lines.push('*No ablation data available*');
    lines.push('');
    return lines.join('\n');
  }

  // Table header
  lines.push('| Specialist Removed | Full EII | Ablated EII | EII Delta | Consensus Lift |');
  lines.push('|--------------------|----------|-------------|-----------|----------------|');

  for (const r of ablationResults) {
    const deltaStr = r.eiiDelta <= 0
      ? r.eiiDelta.toFixed(3)          // negative = was helping (normal)
      : `+${r.eiiDelta.toFixed(3)}`;   // positive = removing helped (unusual)
    const liftStr = r.consensusLift >= 0
      ? `+${r.consensusLift.toFixed(3)}`
      : r.consensusLift.toFixed(3);
    lines.push(
      `| ${r.specialistRemoved.padEnd(18)} | ${r.fullConsensusEII.toFixed(3)} | ${r.ablatedConsensusEII.toFixed(3)} | ${deltaStr} | ${liftStr} |`,
    );
  }

  lines.push('');
  lines.push('*EII Delta: negative = specialist was contributing (removing it hurt EII)*');
  lines.push('*Consensus Lift: full ensemble EII minus single-specialist EII (positive = ensemble wins)*');
  lines.push('');

  // ASCII bar chart of EII deltas
  lines.push('**EII Delta Chart:**');
  lines.push('');

  const maxDelta = Math.max(...ablationResults.map((r) => Math.abs(r.eiiDelta)), 0.001);
  for (const r of ablationResults) {
    const absNorm = Math.abs(r.eiiDelta) / maxDelta;
    const direction = r.eiiDelta <= 0 ? '-' : '+';
    const bars = Math.round(absNorm * 30);
    const bar = `${direction}${'█'.repeat(bars)}`;
    const label = r.specialistRemoved.padEnd(20);
    lines.push(`  ${label} ${bar.padEnd(33)} ${(r.eiiDelta * 100).toFixed(1)}%`);
  }

  lines.push('');

  return lines.join('\n');
}
