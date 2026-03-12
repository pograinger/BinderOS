/**
 * Persona generator CLI — creates diverse synthetic personas with ground truth.
 *
 * Usage:
 *   npx tsx scripts/harness/generate-persona.ts --archetype margaret-chen --complexity high
 *   npx tsx scripts/harness/generate-persona.ts --archetype james-okafor --dry-run
 *   npx tsx scripts/harness/generate-persona.ts --validate  (validate coverage matrix only)
 *
 * Flags:
 *   --archetype <name>      Required. One of the 12 supported archetypes.
 *   --complexity <level>    low|medium|high. Default: medium.
 *   --binder-type <type>    Default: gtd-personal.
 *   --name <name>           Override derived persona name.
 *   --validate              Validate coverage matrix of existing persona only.
 *   --dry-run               Print config and expected output path without API call.
 *
 * Phase 29: TVAL-01
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PERSONAS_DIR = path.join(__dirname, 'personas');

// ---------------------------------------------------------------------------
// Archetype definitions
// ---------------------------------------------------------------------------

interface ArchetypeConfig {
  id: string;
  derivedName: string;
  lifeStage: string;
  culturalBackground: string;
  occupation: string;
  familyStructure: string;
  gtdStyle: string;
  namingPattern: string;
  complexity: { low: string; medium: string; high: string };
}

const ARCHETYPES: Record<string, ArchetypeConfig> = {
  'margaret-chen': {
    id: 'margaret-chen',
    derivedName: 'Margaret Chen',
    lifeStage: 'retiree (68)',
    culturalBackground: 'Chinese-American, second generation',
    occupation: 'Retired schoolteacher, part-time volunteer',
    familyStructure: 'Widowed, 2 adult children, 4 grandchildren',
    gtdStyle: 'Methodical, detailed, paper-to-digital transition',
    namingPattern: 'Western first + Chinese surname, uses "Dr." titles frequently',
    complexity: {
      low: '12 entities, 10 relationships — tight family + 2 service providers',
      medium: '18 entities, 14 relationships — extended family + medical team + community org',
      high: '22 entities, 18 relationships — full extended family + multiple providers + church committee + grandchildren activities',
    },
  },
  'james-okafor': {
    id: 'james-okafor',
    derivedName: 'James Okafor',
    lifeStage: 'early career (24)',
    culturalBackground: 'Nigerian-American, first generation',
    occupation: 'Junior data analyst at a startup',
    familyStructure: 'Single, living with roommates, close ties to parents',
    gtdStyle: 'Terse, shorthand, high velocity',
    namingPattern: 'Yoruba first name variant, uses nicknames freely ("Jams", "OG")',
    complexity: {
      low: '10 entities, 8 relationships — manager + 2 friends + parents',
      medium: '15 entities, 12 relationships — work team + friends + family + side hustle contacts',
      high: '20 entities, 16 relationships — full network including mentors, community org, girlfriend',
    },
  },
  'priya-nair': {
    id: 'priya-nair',
    derivedName: 'Priya Nair',
    lifeStage: 'executive (41)',
    culturalBackground: 'South Indian (Keralite), US immigrant',
    occupation: 'VP of Product at a mid-size SaaS company',
    familyStructure: 'Married, 2 kids (10 and 7), husband works remotely',
    gtdStyle: 'Strategic, outcome-focused, heavy on delegation',
    namingPattern: 'South Indian naming (patronymic common), uses formal titles at work',
    complexity: {
      low: '14 entities, 12 relationships — immediate family + 3 direct reports + doctor',
      medium: '20 entities, 16 relationships — full work team + family + board member + school',
      high: '25 entities, 20 relationships — full executive network + vendors + advisors + family extended',
    },
  },
  'tyler-kowalski': {
    id: 'tyler-kowalski',
    derivedName: 'Tyler Kowalski',
    lifeStage: 'freelancer (33)',
    culturalBackground: 'Polish-American, Midwest',
    occupation: 'Independent UX consultant, occasional band gigs',
    familyStructure: 'Divorced, shared custody of daughter',
    gtdStyle: 'Chaotic captures, intermittent review, context-switching heavy',
    namingPattern: 'Anglo first names, Eastern European surname, uses first names only with clients',
    complexity: {
      low: '10 entities, 9 relationships — 3 clients + daughter + ex-wife',
      medium: '16 entities, 13 relationships — clients + band members + daughter + co-working space',
      high: '21 entities, 17 relationships — full client roster + band + custody + accountant + dating',
    },
  },
  'sunita-patel': {
    id: 'sunita-patel',
    derivedName: 'Sunita Patel',
    lifeStage: 'parent (38)',
    culturalBackground: 'Gujarati Indian, second generation',
    occupation: 'High school biology teacher, active in temple community',
    familyStructure: 'Married with 3 kids (14, 11, 6), lives near in-laws',
    gtdStyle: 'Family-system centric, uses GTD for household management',
    namingPattern: 'Gujarati names, some family members known by nickname + ji honorific',
    complexity: {
      low: '13 entities, 11 relationships — husband + 3 kids + in-laws + principal',
      medium: '19 entities, 15 relationships — full household + school contacts + temple committee + doctor',
      high: '24 entities, 20 relationships — extended family (US + India) + full school + temple + pediatrician',
    },
  },
  'rafael-moreno': {
    id: 'rafael-moreno',
    derivedName: 'Rafael Moreno',
    lifeStage: 'business owner (47)',
    culturalBackground: 'Mexican-American, third generation',
    occupation: 'Owner of 3-location taqueria chain, LA area',
    familyStructure: 'Married with adult son in the business, aging parents',
    gtdStyle: 'Operational focus, uses GTD for staff + vendor management',
    namingPattern: 'Spanish first names, uses surnames with business contacts ("Señor Moreno")',
    complexity: {
      low: '12 entities, 11 relationships — key staff + supplier + accountant + family',
      medium: '18 entities, 15 relationships — all staff leads + 3 vendors + accountant + lawyer + family',
      high: '23 entities, 19 relationships — full org + vendor network + family + health + community sponsor',
    },
  },
  'anna-liu': {
    id: 'anna-liu',
    derivedName: 'Anna Liu',
    lifeStage: 'grad student (27)',
    culturalBackground: 'Taiwanese, international student (PhD)',
    occupation: 'PhD candidate in computational biology',
    familyStructure: 'Single, partner in another city, international family',
    gtdStyle: 'Research-notebook style, heavy on project and reference items',
    namingPattern: 'Western name adopted (Anna), Chinese family name, advisor by surname only',
    complexity: {
      low: '10 entities, 8 relationships — advisor + 2 labmates + partner + parents',
      medium: '16 entities, 13 relationships — lab group + department contacts + partner + family',
      high: '21 entities, 17 relationships — full lab + collaborators + partner + international family + teaching contacts',
    },
  },
  'sam-park': {
    id: 'sam-park',
    derivedName: 'Sam Park',
    lifeStage: 'semi-retired (59)',
    culturalBackground: 'Korean-American, second generation',
    occupation: 'Former software architect, now consultant + board advisor',
    familyStructure: 'Married, 2 adult kids out of house, grandchild on the way',
    gtdStyle: 'Systems thinker, long-horizon planning, uses GTD for board commitments',
    namingPattern: 'Korean surname, Western first name, mixes formal/informal freely',
    complexity: {
      low: '12 entities, 10 relationships — 2 board companies + spouse + kids + doctor',
      medium: '17 entities, 14 relationships — advisory portfolio + family + financial advisor + doctor',
      high: '22 entities, 18 relationships — full board network + family + financial + health + community organization',
    },
  },
  'olivia-hassan': {
    id: 'olivia-hassan',
    derivedName: 'Olivia Hassan',
    lifeStage: 'military spouse (31)',
    culturalBackground: 'African-American / Lebanese-American (married)',
    occupation: 'Remote project manager, frequent relocations',
    familyStructure: 'Married to active-duty soldier, 2 young kids (4 and 2)',
    gtdStyle: 'Relocation-aware, tracks contacts across bases, high administrative load',
    namingPattern: 'Western first name, Arabic surname (married), uses rank + surname for military contacts',
    complexity: {
      low: '11 entities, 9 relationships — husband + 2 kids + daycare + remote manager',
      medium: '17 entities, 13 relationships — full family + base contacts + pediatrician + remote team',
      high: '22 entities, 18 relationships — extended family both sides + military network + remote team + childcare + legal (POA)',
    },
  },
  // Existing personas (for --dry-run validation only)
  'alex-jordan': {
    id: 'alex-jordan',
    derivedName: 'Alex Jordan',
    lifeStage: 'professional (30s)',
    culturalBackground: 'American',
    occupation: 'Software engineer',
    familyStructure: 'Married with one child',
    gtdStyle: 'Standard GTD user',
    namingPattern: 'Western naming',
    complexity: { low: '', medium: '', high: '' },
  },
  'dev-kumar': {
    id: 'dev-kumar',
    derivedName: 'Dev Kumar',
    lifeStage: 'professional',
    culturalBackground: 'South Asian-American',
    occupation: 'Tech professional',
    familyStructure: 'Family',
    gtdStyle: 'Standard GTD user',
    namingPattern: 'South Asian naming',
    complexity: { low: '', medium: '', high: '' },
  },
  'maria-santos': {
    id: 'maria-santos',
    derivedName: 'Maria Santos',
    lifeStage: 'professional',
    culturalBackground: 'Latina',
    occupation: 'Professional',
    familyStructure: 'Family',
    gtdStyle: 'Standard GTD user',
    namingPattern: 'Spanish naming',
    complexity: { low: '', medium: '', high: '' },
  },
};

// ---------------------------------------------------------------------------
// Coverage matrix validation
// ---------------------------------------------------------------------------

interface CoverageMatrix {
  familyRelationships: number;
  workRelationships: number;
  serviceProviders: number;
  orgMemberships: number;
}

const RELATIONSHIP_CATEGORIES: Record<string, keyof CoverageMatrix> = {
  spouse: 'familyRelationships',
  partner: 'familyRelationships',
  child: 'familyRelationships',
  parent: 'familyRelationships',
  sibling: 'familyRelationships',
  'extended-family': 'familyRelationships',
  'colleague': 'workRelationships',
  'reports-to': 'workRelationships',
  'direct-report': 'workRelationships',
  'client': 'workRelationships',
  'business-partner': 'workRelationships',
  'healthcare-provider': 'serviceProviders',
  'dentist': 'serviceProviders',
  'therapist': 'serviceProviders',
  'veterinarian': 'serviceProviders',
  'lawyer': 'serviceProviders',
  'financial-advisor': 'serviceProviders',
  'accountant': 'serviceProviders',
  'childcare': 'serviceProviders',
  'works-at': 'orgMemberships',
  'member-of': 'orgMemberships',
  'board-member': 'orgMemberships',
  'volunteer-at': 'orgMemberships',
};

function validateCoverageMatrix(
  groundTruth: { relationships: Array<{ type: string }> },
): { valid: boolean; matrix: CoverageMatrix; errors: string[] } {
  const matrix: CoverageMatrix = {
    familyRelationships: 0,
    workRelationships: 0,
    serviceProviders: 0,
    orgMemberships: 0,
  };

  for (const rel of groundTruth.relationships) {
    const category = RELATIONSHIP_CATEGORIES[rel.type];
    if (category) {
      matrix[category]++;
    }
  }

  const errors: string[] = [];
  if (matrix.familyRelationships < 2) {
    errors.push(`familyRelationships: ${matrix.familyRelationships} < 2 required`);
  }
  if (matrix.workRelationships < 1) {
    errors.push(`workRelationships: ${matrix.workRelationships} < 1 required`);
  }
  if (matrix.serviceProviders < 1) {
    errors.push(`serviceProviders: ${matrix.serviceProviders} < 1 required`);
  }
  if (matrix.orgMemberships < 1) {
    errors.push(`orgMemberships: ${matrix.orgMemberships} < 1 required`);
  }

  return { valid: errors.length === 0, matrix, errors };
}

// ---------------------------------------------------------------------------
// Load relationship patterns for the prompt
// ---------------------------------------------------------------------------

function loadPatternSummary(): string {
  const patternsPath = path.join(__dirname, '../../src/config/relationship-patterns.json');
  const patterns = JSON.parse(fs.readFileSync(patternsPath, 'utf-8')) as {
    patterns: Array<{ id: string; keywords: string[]; relationshipType: string }>;
  };
  return patterns.patterns
    .map((p) => `  - ${p.relationshipType}: ${p.keywords.slice(0, 6).join(', ')}`)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Persona generation prompt
// ---------------------------------------------------------------------------

function buildPersonaPrompt(
  archetype: ArchetypeConfig,
  complexity: 'low' | 'medium' | 'high',
  binderType: string,
  overrideName?: string,
): string {
  const patternSummary = loadPatternSummary();
  const complexitySpec = archetype.complexity[complexity];
  const personaName = overrideName ?? archetype.derivedName;

  // Relationship category counts based on complexity
  const entityCount = complexity === 'low' ? '10-14' : complexity === 'medium' ? '15-20' : '20-26';
  const relCount = complexity === 'low' ? '8-12' : complexity === 'medium' ? '12-17' : '17-22';

  return `You are generating a synthetic persona for a ${binderType} GTD binder testing harness.

## Archetype: ${archetype.id}

**Life stage:** ${archetype.lifeStage}
**Cultural background:** ${archetype.culturalBackground}
**Occupation:** ${archetype.occupation}
**Family structure:** ${archetype.familyStructure}
**GTD usage style:** ${archetype.gtdStyle}
**Naming pattern:** ${archetype.namingPattern}
**Complexity spec:** ${complexitySpec}

## Required Output Structure

Generate a JSON object with this EXACT schema (matching the alex-jordan example):

{
  "personaName": "${personaName}",
  "bio": "<2-3 sentence natural bio describing who this person is>",
  "groundTruth": {
    "entities": [
      {
        "canonicalName": "<full formal name>",
        "type": "PER" | "LOC" | "ORG",
        "aliases": ["<nickname>", "<shortened form>", ...]
      },
      ...
    ],
    "relationships": [
      {
        "entity": "<canonical name of entity>",
        "type": "<relationship type from allowed list>",
        "confidence": 1.0,
        "note": "<brief note>"
      },
      ...
    ],
    "facts": [
      "<plain-language fact about persona>",
      ...
    ]
  }
}

## Entity Count Requirements
- ${entityCount} total entities (PER + LOC + ORG mixed)
- ${relCount} relationships total
- MUST include: >= 2 family relationships, >= 1 work relationship, >= 1 service provider, >= 1 org membership

## Allowed Relationship Types (ONLY use these exact strings)
spouse, partner, child, parent, sibling, extended-family,
colleague, reports-to, direct-report, client, business-partner,
healthcare-provider, dentist, therapist, veterinarian, lawyer,
financial-advisor, accountant, childcare,
friend, neighbor, mentor, mentee,
works-at, member-of, board-member, volunteer-at,
lives-at, studies-at

## Keyword Pattern Engine (for test corpus generation later)
The harness infers relationships by detecting keywords in the same sentence as entity names:
${patternSummary}

## Naming conventions
- Use culturally appropriate names matching the archetype background
- Include realistic aliases (nicknames, shortened names, honorific variants)
- Avoid using the same names as alex-jordan, dev-kumar, or maria-santos personas

## Important
- Return ONLY valid JSON, no markdown, no comments
- All entity names in "relationships" array MUST exactly match "canonicalName" in "entities" array
- bio should read as a natural description, not a data dump
- facts should be short plain-English statements useful for test corpus generation`;
}

// ---------------------------------------------------------------------------
// API generation with retry
// ---------------------------------------------------------------------------

async function generateWithRetry(
  client: Anthropic,
  archetype: ArchetypeConfig,
  complexity: 'low' | 'medium' | 'high',
  binderType: string,
  overrideName: string | undefined,
  maxRetries = 3,
): Promise<Record<string, unknown>> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const prompt = buildPersonaPrompt(archetype, complexity, binderType, overrideName);

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText =
      message.content[0].type === 'text' ? message.content[0].text : '';

    // Strip code fences
    const cleaned = responseText
      .replace(/^```json\s*/m, '')
      .replace(/^```\s*/m, '')
      .replace(/```\s*$/m, '')
      .trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.warn(`  Attempt ${attempt}: Failed to parse JSON response`);
      if (attempt === maxRetries) throw new Error('Failed to parse persona JSON after retries');
      continue;
    }

    // Validate coverage matrix
    const gt = parsed.groundTruth as { relationships: Array<{ type: string }> };
    if (!gt || !Array.isArray(gt.relationships)) {
      console.warn(`  Attempt ${attempt}: Missing groundTruth.relationships`);
      if (attempt === maxRetries) throw new Error('Missing groundTruth.relationships');
      continue;
    }

    const coverage = validateCoverageMatrix(gt);
    if (!coverage.valid) {
      console.warn(`  Attempt ${attempt}: Coverage matrix failed — ${coverage.errors.join(', ')}. Regenerating...`);
      if (attempt === maxRetries) {
        console.warn('  WARNING: Using persona despite coverage gaps (max retries reached)');
        return parsed;
      }
      continue;
    }

    console.log(`  Coverage matrix: family=${coverage.matrix.familyRelationships} work=${coverage.matrix.workRelationships} service=${coverage.matrix.serviceProviders} org=${coverage.matrix.orgMemberships} [OK]`);
    return parsed;
  }

  throw new Error('Unreachable');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isValidate = args.includes('--validate');

  // Parse flags
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const archetypeId = getArg('--archetype');
  const complexity = (getArg('--complexity') ?? 'medium') as 'low' | 'medium' | 'high';
  const binderType = getArg('--binder-type') ?? 'gtd-personal';
  const overrideName = getArg('--name');

  if (!archetypeId) {
    console.error('ERROR: --archetype is required');
    console.error('Available archetypes: ' + Object.keys(ARCHETYPES).join(', '));
    process.exit(1);
  }

  const archetype = ARCHETYPES[archetypeId];
  if (!archetype) {
    console.error(`ERROR: Unknown archetype "${archetypeId}"`);
    console.error('Available archetypes: ' + Object.keys(ARCHETYPES).join(', '));
    process.exit(1);
  }

  if (!['low', 'medium', 'high'].includes(complexity)) {
    console.error('ERROR: --complexity must be low, medium, or high');
    process.exit(1);
  }

  const personaDirName = archetypeId; // directory name matches archetype id
  const outputDir = path.join(PERSONAS_DIR, personaDirName);
  const outputPath = path.join(outputDir, 'synthetic-user.json');

  // --validate: check existing persona
  if (isValidate) {
    if (!fs.existsSync(outputPath)) {
      console.error(`ERROR: No persona found at ${outputPath}`);
      process.exit(1);
    }
    const existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    const gt = existing.groundTruth as { relationships: Array<{ type: string }> };
    const coverage = validateCoverageMatrix(gt);
    console.log(`[validate] ${archetypeId}`);
    console.log(`  Coverage: family=${coverage.matrix.familyRelationships} work=${coverage.matrix.workRelationships} service=${coverage.matrix.serviceProviders} org=${coverage.matrix.orgMemberships}`);
    if (coverage.valid) {
      console.log('  Status: PASSED');
    } else {
      console.log('  Status: FAILED');
      for (const err of coverage.errors) {
        console.log(`    - ${err}`);
      }
      process.exit(1);
    }
    process.exit(0);
  }

  // --dry-run: print config without API call
  if (isDryRun) {
    console.log('[generate-persona] DRY-RUN MODE');
    console.log(`  Archetype: ${archetypeId}`);
    console.log(`  Derived name: ${overrideName ?? archetype.derivedName}`);
    console.log(`  Life stage: ${archetype.lifeStage}`);
    console.log(`  Cultural background: ${archetype.culturalBackground}`);
    console.log(`  Occupation: ${archetype.occupation}`);
    console.log(`  Complexity: ${complexity}`);
    console.log(`  Complexity spec: ${archetype.complexity[complexity]}`);
    console.log(`  Binder type: ${binderType}`);
    console.log(`  Would generate: ${outputPath}`);
    console.log('');
    console.log('  To generate, set ANTHROPIC_API_KEY and run without --dry-run');
    process.exit(0);
  }

  // Check for existing persona (skip unless --force)
  const isForce = args.includes('--force');
  if (fs.existsSync(outputPath) && !isForce) {
    console.log(`[generate-persona] Skipping ${archetypeId} — synthetic-user.json already exists`);
    console.log(`  Use --force to regenerate`);
    process.exit(0);
  }

  // API call
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ERROR: ANTHROPIC_API_KEY environment variable not set.');
    process.exit(1);
  }

  console.log(`[generate-persona] Generating ${archetypeId} (complexity: ${complexity})...`);
  const client = new Anthropic({ apiKey });

  const persona = await generateWithRetry(client, archetype, complexity, binderType, overrideName);

  // Ensure output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write output
  fs.writeFileSync(outputPath, JSON.stringify(persona, null, 2), 'utf-8');

  const gt = persona.groundTruth as {
    entities: unknown[];
    relationships: Array<{ type: string }>;
  };
  console.log(`[generate-persona] SUCCESS`);
  console.log(`  Output: ${outputPath}`);
  console.log(`  Entities: ${gt.entities.length}`);
  console.log(`  Relationships: ${gt.relationships.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[generate-persona] Fatal error:', err);
  process.exit(1);
});
