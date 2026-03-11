/**
 * Type-specific entity matcher framework for deduplication.
 *
 * Each matcher normalizes entity names and computes match scores against
 * existing entities in the registry. Pluggable per entity type.
 *
 * Phase 27: ENTR-04
 */

export interface EntityMatcher {
  normalize(text: string): string;
  matchScore(candidateName: string, existingEntity: { canonicalName: string; aliases: string[] }): number;
}

const PER_TITLES = /^(dr\.?|mr\.?|mrs\.?|ms\.?|prof\.?|sir|dame)\s+/i;

export const personMatcher: EntityMatcher = {
  normalize(text: string): string {
    return text.normalize('NFC').replace(PER_TITLES, '').trim().toLowerCase();
  },
  matchScore(candidate: string, existing: { canonicalName: string; aliases: string[] }): number {
    const normCandidate = this.normalize(candidate);
    const normCanonical = this.normalize(existing.canonicalName);
    // Exact normalized match
    if (normCandidate === normCanonical) return 1.0;
    // Check aliases
    for (const alias of existing.aliases) {
      if (this.normalize(alias) === normCandidate) return 1.0;
    }
    // Substring match (e.g., "Sarah" matches "Sarah Chen")
    if (normCanonical.includes(normCandidate) || normCandidate.includes(normCanonical)) {
      return 0.8;
    }
    return 0;
  },
};

export const locationMatcher: EntityMatcher = {
  normalize(text: string): string {
    return text.normalize('NFC').trim().toLowerCase();
  },
  matchScore(candidate: string, existing: { canonicalName: string; aliases: string[] }): number {
    const normCandidate = this.normalize(candidate);
    if (this.normalize(existing.canonicalName) === normCandidate) return 1.0;
    for (const alias of existing.aliases) {
      if (this.normalize(alias) === normCandidate) return 1.0;
    }
    // No substring matching for locations (prevents "New" matching "New York")
    return 0;
  },
};

const ORG_SUFFIXES = /\s*(inc\.?|ltd\.?|corp\.?|llc|co\.?|plc)\s*$/i;

export const orgMatcher: EntityMatcher = {
  normalize(text: string): string {
    return text.normalize('NFC').replace(ORG_SUFFIXES, '').trim().toLowerCase();
  },
  matchScore(candidate: string, existing: { canonicalName: string; aliases: string[] }): number {
    const normCandidate = this.normalize(candidate);
    if (this.normalize(existing.canonicalName) === normCandidate) return 1.0;
    for (const alias of existing.aliases) {
      if (this.normalize(alias) === normCandidate) return 1.0;
    }
    return 0;
  },
};

export function getMatcherForType(type: 'PER' | 'LOC' | 'ORG'): EntityMatcher {
  switch (type) {
    case 'PER': return personMatcher;
    case 'LOC': return locationMatcher;
    case 'ORG': return orgMatcher;
  }
}
