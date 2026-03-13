/**
 * Consensus layer barrel — re-exports types, pure voter function, and specialist runner.
 *
 * Phase 36: CONS-02, CONS-04
 */

export type { SpecialistOutput, ConsensusResult, SpecialistFeatureSlice } from './types';
export { SPECIALIST_WEIGHTS, SPECIALIST_FEATURE_SLICES } from './types';
export { computeConsensus } from './consensus-voter';
export { runConsensusForAtom, incrementVectorCount } from './specialist-runner';
