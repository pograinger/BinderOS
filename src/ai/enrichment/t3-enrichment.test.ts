/**
 * Wave 0 test stub for entity context injection into T3 enrichment.
 *
 * Validates that when an atom has known entity mentions with relationships,
 * the T3EnrichmentContext includes an entitySummary block describing them.
 * Production wiring is deferred per 29-CONTEXT.md locked decision.
 *
 * Phase 29: ENTC-01 (entity context injection)
 */

import { describe, it } from 'vitest';

// NOTE: This is a Wave 0 stub — behavior contract only.
// Production wiring of entity context into T3EnrichmentContext is deferred
// to harness validation. The test below defines the expected shape.

describe('entity context injection', () => {
  it('includes entity summary block in T3 enrichment context when entities are known', () => {
    // STUB: When an atom has entity mentions with resolved entityIds, and those
    // entities have known relationships (e.g., "Pam" -> spouse), the
    // T3EnrichmentContext should include an entitySummary string such as:
    //   "Known entities: Pam (spouse), Dr. Chen (healthcare-provider)"
    //
    // This gives the LLM coach relationship context without exposing raw names
    // (the T3 prompt should use the relationship-tagged form after sanitization).
    //
    // Expected shape:
    //   ctx.entitySummary: string | undefined
    //   When present, buildPrompt() includes it in the CONTEXT section.
    //
    // Harness validation: Phase 29 adversarial harness seeds atoms with known
    // entities and verifies entity context appears in the LLM prompt payload.
  });
});
