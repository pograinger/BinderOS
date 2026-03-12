/**
 * Validate corpus.json entity mention spans.
 *
 * Checks that content.slice(spanStart, spanEnd) === entityText for every mention.
 * Also checks for basic structural issues (missing fields, bad types).
 *
 * Usage:
 *   npx tsx scripts/harness/validate-corpus.ts <corpus-path>
 *   npx tsx scripts/harness/validate-corpus.ts scripts/harness/personas/maria-santos/corpus.json
 *   npx tsx scripts/harness/validate-corpus.ts --fix <corpus-path>
 */

import fs from 'node:fs';

interface EntityMention {
  entityText: string;
  entityType: string;
  spanStart: number;
  spanEnd: number;
  confidence: number;
}

interface CorpusItem {
  id: string;
  content: string;
  expectedEntities: string[];
  expectedRelationships: string[];
  entityMentions: EntityMention[];
}

interface Corpus {
  items: CorpusItem[];
  [key: string]: unknown;
}

function main(): void {
  const args = process.argv.slice(2);
  const doFix = args.includes('--fix');
  const filePath = args.find((a) => !a.startsWith('--'));

  if (!filePath) {
    console.error('Usage: npx tsx scripts/harness/validate-corpus.ts [--fix] <corpus-path>');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: File not found: ${filePath}`);
    process.exit(1);
  }

  const corpus: Corpus = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  let errors = 0;
  let fixed = 0;

  for (const item of corpus.items) {
    if (!item.id || !item.content || !Array.isArray(item.entityMentions)) {
      console.error(`  ${item.id ?? '?'}: missing required fields`);
      errors++;
      continue;
    }

    for (const mention of item.entityMentions) {
      const actual = item.content.slice(mention.spanStart, mention.spanEnd);

      if (actual !== mention.entityText) {
        console.error(
          `  ${item.id}: SPAN MISMATCH for "${mention.entityText}"` +
          ` — span [${mention.spanStart}:${mention.spanEnd}] yields "${actual}"`,
        );

        if (doFix) {
          // Try to find the correct position
          const idx = item.content.indexOf(mention.entityText);
          if (idx >= 0) {
            mention.spanStart = idx;
            mention.spanEnd = idx + mention.entityText.length;
            console.log(`    FIXED: [${mention.spanStart}:${mention.spanEnd}]`);
            fixed++;
          } else {
            console.error(`    CANNOT FIX: "${mention.entityText}" not found in content`);
            errors++;
          }
        } else {
          // Suggest fix
          const idx = item.content.indexOf(mention.entityText);
          if (idx >= 0) {
            console.log(`    FIX: spanStart=${idx}, spanEnd=${idx + mention.entityText.length}`);
          } else {
            console.error(`    "${mention.entityText}" NOT FOUND in: "${item.content}"`);
          }
          errors++;
        }
      }

      // Validate entity type
      if (!['PER', 'LOC', 'ORG', 'MISC', 'DATE'].includes(mention.entityType)) {
        console.error(`  ${item.id}: invalid entityType "${mention.entityType}" for "${mention.entityText}"`);
        errors++;
      }

      // Validate confidence range
      if (mention.confidence < 0 || mention.confidence > 1) {
        console.error(`  ${item.id}: confidence out of range: ${mention.confidence}`);
        errors++;
      }
    }
  }

  if (doFix && fixed > 0) {
    fs.writeFileSync(filePath, JSON.stringify(corpus, null, 2), 'utf-8');
    console.log(`\nFixed ${fixed} span(s). Written to ${filePath}`);
  }

  if (errors === 0 && fixed === 0) {
    console.log(`VALID: ${corpus.items.length} items, all spans correct.`);
  } else if (errors > 0) {
    console.error(`\n${errors} error(s) found.${doFix ? '' : ' Run with --fix to auto-correct.'}`);
    process.exit(1);
  }
}

main();
