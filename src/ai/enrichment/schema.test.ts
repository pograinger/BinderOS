/**
 * Tests for InboxItemSchema enrichmentDepth field.
 *
 * Phase 25: ITER-01
 */

import { describe, it, expect } from 'vitest';
import { InboxItemSchema } from '../../types/atoms';

describe('InboxItemSchema enrichmentDepth', () => {
  it('accepts enrichmentDepth field as Record<string, number>', () => {
    const result = InboxItemSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      content: 'Test item',
      title: 'Test',
      status: 'open',
      links: [],
      created_at: Date.now(),
      updated_at: Date.now(),
      isInbox: true,
      tags: [],
      provenance: 0,
      enrichmentDepth: { 'missing-outcome': 2, 'missing-context': 1 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enrichmentDepth).toEqual({ 'missing-outcome': 2, 'missing-context': 1 });
    }
  });

  it('defaults enrichmentDepth to empty object', () => {
    const result = InboxItemSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      content: 'Test item',
      title: 'Test',
      status: 'open',
      links: [],
      created_at: Date.now(),
      updated_at: Date.now(),
      isInbox: true,
      tags: [],
      provenance: 0,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enrichmentDepth).toEqual({});
    }
  });
});
