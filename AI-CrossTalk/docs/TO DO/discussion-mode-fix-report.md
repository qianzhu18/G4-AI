# Discussion Mode Fix Report

Date: 2026-03-10
Scope: discussion mode message propagation, four-card layout, self-test, follow-up notes
Status: fixed and browser-automation verified

## Problem Summary

The normal chat area was basically usable, but discussion mode had two structural problems:

1. Discussion mode was not reusing the shared conversation history, so message context from the chat flow was not being carried into the discussion cards correctly.
2. In multi-party rounds, the implementation could send multiple concurrent prompts to the same AI in one round, which made the discussion chain unstable and caused missing or blank cards.
3. The four-card layout did not fully occupy the available workspace, leaving too much empty area and weakening readability.

## Root Cause

### Message chain bug

- Discussion mode rendered from its own `responses` state instead of the main `conversations` store.
- Discussion mode did not add user prompts into the shared conversation timeline.
- For 3-4 participants, one round could send multiple pairwise prompts to the same AI, which is not a stable interaction model for web-chat automation.

### Layout bug

- The four-card grid used extra height constraints inside already-sized grid cells.
- Cards were not consistently stretching to fill the grid rows.

## Changes Made

### Message flow

- Discussion mode now reads directly from the shared `conversations` data used by normal mode.
- Discussion mode now writes every discussion prompt into the shared conversation history through `addUserMessage`.
- Assistant replies are synchronized back into the same shared history through the same assistant upsert path used by normal mode.
- Each participant now receives exactly one aggregated prompt per discussion round, not multiple pairwise prompts.

### Layout

- Discussion cards now reuse the same `AiCard` component as the normal chat area.
- The discussion grid now uses a real full-height two-by-two layout for four participants.
- The three-participant layout now fills the grid more intentionally instead of collapsing into narrow cards.

### Testability

- Added hidden fixture route: `web/index.html?fixture=discussion`
- Added browser automation script: `scripts/test-discussion-mode.mjs`
- Added stable selectors with `data-testid` for discussion-mode automation

## Updated TODO

- [x] Stop discussion mode from using an isolated response store for display
- [x] Reuse normal-mode message rendering in discussion mode
- [x] Ensure discussion prompts are written into shared conversations
- [x] Ensure each AI gets one aggregated prompt per round
- [x] Fix four-card layout so the main work area is filled
- [x] Add browser automation self-test path
- [x] Run self-test and record evidence
- [ ] Run one manual clean-machine visual regression after next release

## Browser Automation Self-Test

### Test setup

- Built latest extension assets locally
- Loaded extension in Chromium via Playwright
- Opened internal fixture route:
  - `chrome-extension://<extension-id>/web/index.html?fixture=discussion`
- Selected all four participants
- Entered topic
- Started discussion
- Triggered next round

### Test script

- `scripts/test-discussion-mode.mjs`

### Assertions verified

- [x] Round 1: all four cards rendered a fixture reply
- [x] Round 2: all four cards visibly contained `上一轮观点` context
- [x] Layout fill ratio was high enough to confirm the cards occupy the main work area
- [x] Minimum card height was large enough to confirm the cards are not collapsed

### Measured result

- `fillRatio`: `0.9635`
- `minCardHeight`: `361.5`

### Evidence

- `test-artifacts/discussion-mode/discussion-round-1.png`
- `test-artifacts/discussion-mode/discussion-round-2.png`

## Conclusion

This round fixed the structural discussion-mode bug instead of just patching symptoms.

The important result is:

- discussion mode now carries message context through the same shared data path as normal mode
- discussion rounds now use a stable one-message-per-AI pattern
- the four-card grid now fills the usable workspace properly
- browser automation confirmed both message propagation and layout behavior

## Follow-up

- Keep the fixture route for future regression tests
- Re-run `scripts/test-discussion-mode.mjs` after any discussion-mode change
- When the next public release is cut, run one external unpacked-extension smoke test again
