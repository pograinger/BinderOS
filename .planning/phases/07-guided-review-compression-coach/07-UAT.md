---
status: testing
phase: 07-guided-review-compression-coach
source: 07-01-SUMMARY.md, 07-02-SUMMARY.md, 07-03-SUMMARY.md
started: 2026-03-02T20:00:00Z
updated: 2026-03-02T20:00:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: Start Guided Review from Briefing
expected: |
  On the Review Briefing page, a "Start Guided Review" primary button is visible. Clicking it navigates to a new review flow view (not the briefing page). The view shows three phase progress dots at the top (Get Clear, Get Current, Get Creative) with the first dot highlighted.
awaiting: user response

## Tests

### 1. Start Guided Review from Briefing
expected: On the Review Briefing page, a "Start Guided Review" primary button is visible. Clicking it navigates to a new review flow view. The view shows three phase progress dots at the top with the first dot (Get Clear) highlighted.
result: [pending]

### 2. Get Clear Phase — Inbox Processing
expected: The Get Clear phase shows ConversationTurnCard question cards for inbox items. Each card presents 3-4 options (like classify, defer, archive) plus optional freeform input. Selecting an option advances to the next inbox item or transitions to Get Current when inbox is empty.
result: [pending]

### 3. Phase Transition — Get Clear to Get Current
expected: After completing Get Clear, the review transitions to Get Current. The progress dots update to show Get Current as active. A brief loading state may appear while AI generates a phase summary.
result: [pending]

### 4. Get Current Phase — Project and Stale Item Review
expected: Get Current presents questions about active projects (does each have a next action?) and stale items. Each step is a ConversationTurnCard with options. Compression candidates appear with AI-written explanations referencing specific signals (e.g., "stale for 45 days", link count, similar atoms).
result: [pending]

### 5. Get Creative Phase — Bounded Steps
expected: Get Creative presents a bounded set of 5-8 steps: Someday/Maybe scan, area gap check (one per area), trigger list (health, career, family, etc.), AI pattern surfacing, and a final freeform capture. Each step is a ConversationTurnCard. The phase ends after the fixed steps — it does not become open-ended chat.
result: [pending]

### 6. Staging Area — Proposals Before Commit
expected: During or at the end of the review, a staging area appears showing AI-proposed changes (compression candidates, new atoms, mutations). Proposals are displayed as cards grouped by type (compression coach first, then new atoms, then other changes). Nothing is written to the store until explicitly approved.
result: [pending]

### 7. Staging Area — Individual Approve/Reject
expected: Each staging proposal has individual Approve and Reject buttons. Clicking Approve applies the change. Clicking Reject removes the proposal. An "Approve All" button exists but is styled as a secondary/outline button — not the primary action.
result: [pending]

### 8. AI Mutation Tracking — Changelog Source
expected: After approving a staged AI proposal, the changelog entry for that mutation shows source: 'ai'. This can be verified by inspecting the changelog data in IndexedDB or by checking that the atom's mutation history includes the AI source tag.
result: [pending]

### 9. Undo Reverses AI Mutations
expected: After approving an AI-proposed change, using Undo (Ctrl+Z or undo action) completely reverses the change as if it never happened. The atom returns to its previous state.
result: [pending]

### 10. AIOrb Redirects to In-Progress Review
expected: While a guided review is in progress, clicking the floating AIOrb does not start a new briefing. Instead, it navigates back to the active review flow at the current step.
result: [pending]

### 11. Review Completion and Session Cleanup
expected: After completing all three phases and reviewing staged proposals, the review flow shows a completion state. Staging proposals are cleared. The review session is marked as completed.
result: [pending]

### 12. ConversationTurnCard Component
expected: Each ConversationTurnCard shows a question/prompt, 3-4 selectable options with descriptions, and an optional freeform text input. Selecting an option highlights it. The card is inline within the review flow (not a modal overlay).
result: [pending]

## Summary

total: 12
passed: 0
issues: 0
pending: 12
skipped: 0

## Gaps

[none yet]
