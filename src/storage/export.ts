/**
 * Data export functions for JSON and Markdown formats.
 *
 * JSON export uses dexie-export-import for complete database backup.
 * Markdown export provides a human-readable format for all atoms.
 *
 * Both trigger browser download via programmatic anchor click.
 * Export button is always available (CONTEXT.md: manual export + periodic reminders).
 */

import { exportDB } from 'dexie-export-import';
import { db } from './db';
import type { Atom } from '../types/atoms';

/**
 * Export the entire database as JSON using dexie-export-import.
 * Triggers a browser download of the exported Blob.
 *
 * Filename: binderos-backup-YYYY-MM-DD.json
 */
export async function exportAllData(): Promise<{ blob: Blob; filename: string }> {
  const blob = await exportDB(db);
  const dateStr = new Date().toISOString().split('T')[0];
  return { blob, filename: `binderos-backup-${dateStr}.json` };
}

/**
 * Export all atoms as a single Markdown document.
 * Each atom becomes a section with title, type, status, content, links, and timestamps.
 *
 * Filename: binderos-atoms-YYYY-MM-DD.md
 */
export async function exportAsMarkdown(): Promise<void> {
  const atoms = await db.atoms.toArray();
  const sections = await db.sections.toArray();
  const sectionItems = await db.sectionItems.toArray();

  const lines: string[] = [
    '# BinderOS Export',
    '',
    `Exported: ${new Date().toISOString()}`,
    `Atoms: ${atoms.length}`,
    '',
    '---',
    '',
  ];

  // Group atoms by section
  const sectionMap = new Map(sections.map(s => [s.id, s.name]));
  const sectionItemMap = new Map(sectionItems.map(si => [si.id, si.name]));

  for (const atom of atoms) {
    lines.push(formatAtomAsMarkdown(atom, sectionMap, sectionItemMap));
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  const content = lines.join('\n');
  const blob = new Blob([content], { type: 'text/markdown' });
  const dateStr = new Date().toISOString().split('T')[0];
  triggerDownload(blob, `binderos-atoms-${dateStr}.md`);
}

/**
 * Format a single atom as a Markdown section.
 */
function formatAtomAsMarkdown(
  atom: Atom,
  sectionMap: Map<string, string>,
  sectionItemMap: Map<string, string>,
): string {
  const lines: string[] = [];

  lines.push(`## ${atom.title}`);
  lines.push('');
  lines.push(`- **Type:** ${atom.type}`);
  lines.push(`- **Status:** ${atom.status}`);

  if (atom.sectionId) {
    const sectionName = sectionMap.get(atom.sectionId) ?? atom.sectionId;
    lines.push(`- **Section:** ${sectionName}`);
  }

  if (atom.sectionItemId) {
    const itemName = sectionItemMap.get(atom.sectionItemId) ?? atom.sectionItemId;
    lines.push(`- **Item:** ${itemName}`);
  }

  if (atom.type === 'task' && atom.dueDate) {
    lines.push(`- **Due:** ${new Date(atom.dueDate).toISOString()}`);
  }

  if (atom.type === 'event' && atom.eventDate) {
    lines.push(`- **Event Date:** ${new Date(atom.eventDate).toISOString()}`);
  }

  lines.push(`- **Created:** ${new Date(atom.created_at).toISOString()}`);
  lines.push(`- **Updated:** ${new Date(atom.updated_at).toISOString()}`);

  if (atom.links.length > 0) {
    lines.push('');
    lines.push('### Links');
    for (const link of atom.links) {
      lines.push(`- ${link.direction} ${link.relationshipType} -> ${link.targetId}`);
    }
  }

  lines.push('');
  lines.push('### Content');
  lines.push('');
  lines.push(atom.content);

  return lines.join('\n');
}

/**
 * Trigger a file download in the browser via programmatic anchor click.
 */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
