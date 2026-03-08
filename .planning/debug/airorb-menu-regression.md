---
status: diagnosed
trigger: "Investigate why the AIOrb radial menu is no longer appearing when clicked"
created: 2026-03-04T00:00:00Z
updated: 2026-03-04T00:00:00Z
---

## Current Focus

hypothesis: The `<Show when={orbState() === 'expanded' && state.aiEnabled && !props.isOverlayOpen}>` guard for the radial menu was NOT changed by f95b08f — the regression predates that commit. The `state.aiEnabled` condition was introduced in Phase 6 commit 8ff73d2 and the radial menu has always been blocked when AI is disabled.
test: Traced git history across every AIOrb commit from creation to HEAD
expecting: Root cause is the `state.aiEnabled` guard silently blocking the menu whenever AI is off
next_action: Fix by removing `state.aiEnabled` from radial menu Show condition — menu should always appear when orb is expanded; `state.aiEnabled` only needed for triage/review actions, not for menu visibility itself

## Symptoms

expected: Clicking the AIOrb opens the radial menu with Discuss, Review, Compress options
actual: Radial menu does not appear at all when the orb is clicked
errors: No error messages — silent failure
reproduction: Click the AIOrb in any state with AI settings at default or disabled
started: Reported in Phase 11 UAT (test 7), attributed to commit f95b08f

## Eliminated

- hypothesis: f95b08f accidentally removed functional code from AIOrb.tsx
  evidence: Git diff of f95b08f shows ONLY comment removals and console.log deletions. The functional Show condition, handleTap, handleClick, handleTouchEnd, and handleMenuAction code are byte-for-byte identical to the previous commit. The plan documentation (11-02-PLAN.md) confirms the intent was comment-only cleanup.
  timestamp: 2026-03-04

- hypothesis: The radial menu CSS was broken or removed
  evidence: layout.css retains all .ai-radial-menu, .ai-radial-backdrop, .ai-radial-item, and nth-child positioning rules. The CSS is intact and has not changed since it was written.
  timestamp: 2026-03-04

- hypothesis: The AIOrb component is not mounted in the app
  evidence: Shell.tsx always renders `<AIOrb isOverlayOpen={isAnyOverlayOpen()} />` unconditionally — no outer Show wrapper. The orb visually appears and responds to clicks (icon swaps to open binder), confirming it is mounted.
  timestamp: 2026-03-04

- hypothesis: The `isAnyOverlayOpen` flag is stuck as true, blocking the menu
  evidence: isAnyOverlayOpen() = showAISettings() || showCapture() || !state.aiFirstRunComplete || state.pendingCloudRequest !== null. The user would see the AIGuidedSetup wizard if aiFirstRunComplete were false — they did not report this. The orb shrinks to a small dot with pointer-events:none when overlay-active; the user reports clicking works (icon changes) so this flag must be false.
  timestamp: 2026-03-04

- hypothesis: The orbState signal is not transitioning to 'expanded'
  evidence: The user reports "the orb is no longer showing the menu items" — the icon visually changes to the open binder image (swapped in JSX when orbState === 'expanded'), which means the state IS transitioning to 'expanded'. The block must be in a subsequent condition.
  timestamp: 2026-03-04

## Evidence

- timestamp: 2026-03-04
  checked: git diff f95b08f~1..f95b08f -- src/ui/components/AIOrb.tsx
  found: Only 21 lines changed — all comments and two console.log removals. Functional code (Show conditions, event handlers, JSX structure) is identical to pre-commit version.
  implication: f95b08f is NOT the root cause of the regression.

- timestamp: 2026-03-04
  checked: git show 568597b:src/ui/components/AIOrb.tsx (original Phase 5 AIOrb)
  found: Original Show condition was `<Show when={anyAIAvailable()}>` wrapping the entire orb div. Radial menu inner Show was `orbState() === 'expanded' && !props.isOverlayOpen` — NO state.aiEnabled check.
  implication: The original design gated the entire orb on anyAIAvailable(), not on state.aiEnabled.

- timestamp: 2026-03-04
  checked: git show 640c7cb:src/ui/components/AIOrb.tsx (Phase 5 bug fix commit)
  found: Outer Show changed to `<Show when={orbVisible()}>` where orbVisible = () => state.aiEnabled. Radial menu inner Show still `orbState() === 'expanded' && !props.isOverlayOpen` — still NO state.aiEnabled check in inner Show.
  implication: Phase 5 fix moved gating from anyAIAvailable() to state.aiEnabled, but kept it as the OUTER wrapper. Inner Show had no aiEnabled check.

- timestamp: 2026-03-04
  checked: git show 8ff73d2:src/ui/components/AIOrb.tsx (Phase 6-01 commit — first to add state.aiEnabled to inner Show)
  found: Phase 6 commit REMOVED the outer Show wrapper (the entire orb is always rendered), and ADDED state.aiEnabled to the inner radial menu Show: `orbState() === 'expanded' && state.aiEnabled && !props.isOverlayOpen`. This is the commit that introduced the potential bug.
  implication: Since Phase 6 (8ff73d2), the radial menu only renders when state.aiEnabled is true. If the user has AI disabled, the menu never shows.

- timestamp: 2026-03-04
  checked: Phase 6 UAT results (.planning/phases/06-review-pre-analysis/06-UAT.md)
  found: Test 1 "Tap the orb to expand the radial menu. A Review action appears" — result: issue, reported "review button just collapses the orb." The user was able to SEE and CLICK the Review button, meaning the radial menu DID appear in the Phase 6 test environment.
  implication: state.aiEnabled was true during Phase 6 testing (user had AI enabled in their browser). The menu rendered correctly.

- timestamp: 2026-03-04
  checked: Phase 11 UAT results (.planning/phases/11-tech-debt-settings-correction/11-UAT.md)
  found: Test 7 "AIOrb Radial Menu (Regression)" — result: issue, reported "the orb is no longer showing the menu items — radial menu not appearing at all when you click the orb." The menu is COMPLETELY absent, not just misbehaving.
  implication: The "no longer" framing is likely user perception — the bug has existed since 8ff73d2 in any session where state.aiEnabled is false. The user may have tested with a fresh environment where AI was not yet enabled.

- timestamp: 2026-03-04
  checked: state.aiEnabled default value in store.ts
  found: initialState has aiEnabled: false. It is only set to true when (a) loaded from persisted Dexie settings, or (b) explicitly enabled via setAIEnabled(true) in the Settings panel.
  implication: In any fresh browser session, or after clearing storage, the radial menu is permanently hidden because state.aiEnabled starts as false.

- timestamp: 2026-03-04
  checked: anyAIAvailable() vs state.aiEnabled semantics
  found: anyAIAvailable = llmReady() || cloudReady() (true when a provider is connected and available). state.aiEnabled is the user's master on/off toggle (true if user has ever enabled AI). The file header comment says "Reads anyAIAvailable() from store" but the Show condition uses state.aiEnabled — the comment is stale relative to current implementation.
  implication: The Show condition is using the wrong guard. The original design intention (from the file header) was to gate on anyAIAvailable, not on the master toggle. A user could have AI enabled but no provider available, and the menu would show — OR could have AI disabled and the menu hides entirely including the Settings button that would let them enable AI. This is a design trap.

## Resolution

root_cause: |
  The radial menu Show condition `orbState() === 'expanded' && state.aiEnabled && !props.isOverlayOpen`
  requires `state.aiEnabled === true` to render the menu. This condition was introduced in Phase 6
  commit 8ff73d2 when the outer `<Show when={orbVisible()}>` wrapper was removed and `state.aiEnabled`
  was moved inside the inner Show.

  When `state.aiEnabled` is false (its default value — only becomes true when persisted settings load
  or when user explicitly enables AI), the radial menu never renders. This creates a self-defeating UX:
  the user cannot open the radial menu to access the Settings action to enable AI, because the menu
  requires AI to already be enabled to appear.

  The regression was NOT introduced by f95b08f (the cleanup commit). That commit only changed comments
  and removed console.logs. The bug has existed since Phase 6 commit 8ff73d2. It was not caught in Phase
  6 UAT because the user had AI enabled during that test session.

  The Phase 11 UAT likely encountered this in a session or environment where state.aiEnabled was false
  (fresh browser, cleared storage, or AI settings not loaded yet), making the menu permanently hidden.

fix: |
  Remove `state.aiEnabled` from the radial menu Show condition. The menu should be accessible regardless
  of whether AI is enabled — in particular, it contains the Settings action which is the mechanism by
  which users enable AI in the first place.

  Change in src/ui/components/AIOrb.tsx (line 255):

  BEFORE:
  <Show when={orbState() === 'expanded' && state.aiEnabled && !props.isOverlayOpen}>

  AFTER:
  <Show when={orbState() === 'expanded' && !props.isOverlayOpen}>

  This matches the Phase 5 design (640c7cb) where the inner Show had no aiEnabled check. Individual
  action handlers (triage, review, analyze) already guard on anyAIAvailable() inside the store functions
  themselves, so disabled-AI users who click those actions will get graceful no-ops.

  If the intent is to hide AI-specific action items (triage, review, etc.) when AI is disabled, that
  filtering should happen inside AIRadialMenu.tsx by passing `state.aiEnabled` or `anyAIAvailable()` as
  a prop and conditionally rendering items — not by hiding the entire menu including Settings.

  Additionally, remove the now-unused `anyAIAvailable` import from AIOrb.tsx since it was never used
  in the component body (it appears in the import but is not referenced in any code).

verification: Pending fix application — verify by clicking orb with AI disabled and confirming menu appears with Settings option.
files_changed:
  - src/ui/components/AIOrb.tsx
