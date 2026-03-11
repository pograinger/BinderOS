/**
 * Corpus generator — calls Anthropic API to produce 30-50 inbox items
 * for the synthetic user persona (Alex Jordan).
 *
 * Each item has:
 *   - id: string
 *   - content: inbox text (realistic GTD item)
 *   - expectedEntities: ground truth entity names referenced
 *   - expectedRelationships: relationship types this item provides evidence for
 *   - entityMentions: pre-annotated spans (injected into harness, skips NER)
 *
 * Usage:
 *   ANTHROPIC_API_KEY=<key> npx tsx scripts/harness/generate-corpus.ts
 *   npx tsx scripts/harness/generate-corpus.ts --dry-run
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

export interface CorpusItem {
  id: string;
  content: string;
  expectedEntities: string[]; // canonical names from ground truth
  expectedRelationships: string[]; // relationship types this item evidences
  entityMentions: CorpusEntityMention[];
}

export interface Corpus {
  generatedAt: string;
  personaName: string;
  totalItems: number;
  items: CorpusItem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadSyntheticUser(): Record<string, unknown> {
  const userPath = path.join(__dirname, 'synthetic-user.json');
  if (!fs.existsSync(userPath)) {
    console.error('ERROR: synthetic-user.json not found. Run from scripts/harness/ directory.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(userPath, 'utf-8'));
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

// ---------------------------------------------------------------------------
// Dry-run mode
// ---------------------------------------------------------------------------

function dryRun(syntheticUser: Record<string, unknown>): void {
  const gt = syntheticUser.groundTruth as Record<string, unknown>;
  const entities = (gt.entities as unknown[]).length;
  const relationships = (gt.relationships as unknown[]).length;

  console.log('[generate-corpus] DRY-RUN MODE');
  console.log(`  Persona: ${syntheticUser.personaName}`);
  console.log(`  Ground truth entities: ${entities}`);
  console.log(`  Ground truth relationships: ${relationships}`);
  console.log('  Would generate: 35 inbox items (80% natural, 20% edge cases)');
  console.log('  Output: scripts/harness/corpus.json');
  console.log('');
  console.log('  To generate corpus, set ANTHROPIC_API_KEY and run without --dry-run');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Generation prompt
// ---------------------------------------------------------------------------

function buildPrompt(syntheticUser: Record<string, unknown>): string {
  const gt = syntheticUser.groundTruth as Record<string, unknown>;
  const entities = JSON.stringify(gt.entities, null, 2);
  const relationships = JSON.stringify(gt.relationships, null, 2);
  const facts = JSON.stringify(gt.facts, null, 2);

  return `You are generating a realistic GTD (Getting Things Done) inbox dataset for a synthetic user named Alex Jordan.

## Alex Jordan's Profile

**Bio:** ${syntheticUser.bio}

**Ground Truth Entities:**
${entities}

**Ground Truth Relationships:**
${relationships}

**Key Facts:**
${facts}

## Task

Generate exactly 35 inbox items that Alex might capture during a typical week. These are raw inbox captures — thoughts, tasks, reminders, notes — NOT structured tasks.

**Distribution:**
- 28 items (80%): Natural, realistic phrasing with organic entity mentions
- 7 items (20%): Edge cases covering:
  * Alias usage ("Pam" vs "Pamela", "Dr. Chen" vs "Chen", "Mom" vs "Linda")
  * Title variations
  * Multi-entity sentences (multiple people in one item)
  * Entity-free items (no people/places mentioned)
  * Ambiguous context

**Requirements:**
1. Cover ALL 14 ground truth relationships across the 35 items
2. Use natural, first-person GTD inbox capture style
3. Vary length (some very short like "Call Pam", some detailed)
4. For each item, annotate entity mentions with character-level span positions
5. Mark which ground truth relationships this item provides evidence for

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
      ]
    },
    ...
  ]
}

**Important for entityMentions:**
- spanStart and spanEnd must be accurate character indices into the content string
- confidence should reflect how clearly this text identifies the entity (0.7-0.99)
- entityId should NOT be set (resolved at runtime)
- Only annotate PER, LOC, ORG entities (not DATE or MISC)

Generate all 35 items now. Return ONLY valid JSON.`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');

  const syntheticUser = loadSyntheticUser();

  if (isDryRun) {
    dryRun(syntheticUser);
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ERROR: ANTHROPIC_API_KEY environment variable not set.');
    console.error('');
    console.error('Usage:');
    console.error('  ANTHROPIC_API_KEY=<your-key> npx tsx scripts/harness/generate-corpus.ts');
    console.error('');
    console.error('To get an API key: https://console.anthropic.com/');
    console.error('');
    console.error('Dry-run mode (no API call):');
    console.error('  npx tsx scripts/harness/generate-corpus.ts --dry-run');
    process.exit(1);
  }

  console.log('[generate-corpus] Calling Anthropic API to generate corpus...');
  console.log(`  Persona: ${syntheticUser.personaName}`);

  const client = new Anthropic({ apiKey });
  const prompt = buildPrompt(syntheticUser);

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const responseText =
    message.content[0].type === 'text' ? message.content[0].text : '';

  // Parse JSON response
  let parsedItems: { items: CorpusItem[] };
  try {
    // Strip any markdown code fences if present
    const cleaned = responseText
      .replace(/^```json\s*/m, '')
      .replace(/^```\s*/m, '')
      .replace(/```\s*$/m, '')
      .trim();
    parsedItems = JSON.parse(cleaned);
  } catch (err) {
    console.error('ERROR: Failed to parse API response as JSON');
    console.error('Response preview:', responseText.slice(0, 500));
    process.exit(1);
  }

  if (!parsedItems.items || !Array.isArray(parsedItems.items)) {
    console.error('ERROR: Response missing items array');
    process.exit(1);
  }

  // Build corpus
  const corpus: Corpus = {
    generatedAt: new Date().toISOString(),
    personaName: syntheticUser.personaName as string,
    totalItems: parsedItems.items.length,
    items: parsedItems.items,
  };

  // Validate basic structure
  if (!validateCorpus(corpus)) {
    console.error('ERROR: Corpus failed validation check');
    process.exit(1);
  }

  // Write output
  const outputPath = path.join(__dirname, 'corpus.json');
  fs.writeFileSync(outputPath, JSON.stringify(corpus, null, 2), 'utf-8');

  console.log(`[generate-corpus] SUCCESS`);
  console.log(`  Generated: ${corpus.totalItems} items`);
  console.log(`  Output: ${outputPath}`);
}

main().catch((err) => {
  console.error('[generate-corpus] Fatal error:', err);
  process.exit(1);
});
