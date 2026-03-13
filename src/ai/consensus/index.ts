/**
 * Consensus layer barrel — re-exports types and pure voter function.
 *
 * Phase 36: CONS-02
 */

export type { SpecialistOutput, ConsensusResult, SpecialistFeatureSlice } from './types';
export { SPECIALIST_WEIGHTS, SPECIALIST_FEATURE_SLICES } from './types';
export { computeConsensus } from './consensus-voter';
