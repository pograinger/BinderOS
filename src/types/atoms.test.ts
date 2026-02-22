/**
 * Quick verification of Zod atom schemas.
 * Validates all five types parse correctly and invalid atoms are rejected.
 */
import { describe, it, expect } from 'vitest';
import { AtomSchema, InboxItemSchema, CreateAtomInputSchema } from './atoms';

const baseFields = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  title: 'Test',
  content: '# Hello',
  status: 'open' as const,
  links: [],
  created_at: Date.now(),
  updated_at: Date.now(),
};

describe('AtomSchema', () => {
  it('validates a task atom', () => {
    const result = AtomSchema.safeParse({ ...baseFields, type: 'task' });
    expect(result.success).toBe(true);
  });

  it('validates a fact atom', () => {
    const result = AtomSchema.safeParse({ ...baseFields, type: 'fact' });
    expect(result.success).toBe(true);
  });

  it('validates an event atom', () => {
    const result = AtomSchema.safeParse({ ...baseFields, type: 'event' });
    expect(result.success).toBe(true);
  });

  it('validates a decision atom', () => {
    const result = AtomSchema.safeParse({ ...baseFields, type: 'decision' });
    expect(result.success).toBe(true);
  });

  it('validates an insight atom', () => {
    const result = AtomSchema.safeParse({ ...baseFields, type: 'insight' });
    expect(result.success).toBe(true);
  });

  it('rejects atom with missing type', () => {
    const result = AtomSchema.safeParse(baseFields);
    expect(result.success).toBe(false);
  });

  it('rejects atom with invalid type', () => {
    const result = AtomSchema.safeParse({ ...baseFields, type: 'note' });
    expect(result.success).toBe(false);
  });

  it('rejects atom with invalid status', () => {
    const result = AtomSchema.safeParse({ ...baseFields, type: 'task', status: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('validates task with optional dueDate', () => {
    const result = AtomSchema.safeParse({ ...baseFields, type: 'task', dueDate: Date.now() });
    expect(result.success).toBe(true);
  });

  it('validates event with optional eventDate', () => {
    const result = AtomSchema.safeParse({ ...baseFields, type: 'event', eventDate: Date.now() });
    expect(result.success).toBe(true);
  });

  it('validates atom with links', () => {
    const result = AtomSchema.safeParse({
      ...baseFields,
      type: 'task',
      links: [
        {
          targetId: '660e8400-e29b-41d4-a716-446655440001',
          relationshipType: 'depends-on',
          direction: 'forward',
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('InboxItemSchema', () => {
  it('validates inbox item with optional type', () => {
    const result = InboxItemSchema.safeParse({
      ...baseFields,
      isInbox: true,
    });
    expect(result.success).toBe(true);
  });

  it('validates inbox item with type set', () => {
    const result = InboxItemSchema.safeParse({
      ...baseFields,
      type: 'task',
      isInbox: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects inbox item without isInbox flag', () => {
    const result = InboxItemSchema.safeParse(baseFields);
    expect(result.success).toBe(false);
  });
});

describe('CreateAtomInputSchema', () => {
  it('validates create input without id/timestamps', () => {
    const result = CreateAtomInputSchema.safeParse({
      type: 'task',
      title: 'New Task',
      content: 'Do something',
      status: 'open',
      links: [],
    });
    expect(result.success).toBe(true);
  });
});
