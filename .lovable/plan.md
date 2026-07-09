# Plan: iOS safe area fix for mobile hamburger menu

## Problem
On iPhone the mobile hamburger menu (`SheetPrimitive.Content` in `src/components/Header.tsx`) starts at the very top of the screen, so the close button (×) ends up behind/under the system status bar (clock, battery, notch). Android devices are unaffected because `safe-area-inset-top` is normally 0 there.

## Root cause
The sheet content uses a fixed `pt-10` top padding and the close button is absolutely positioned with `top-4`. Neither value accounts for `env(safe-area-inset-top)`.

## Changes

### 1. `src/components/Header.tsx` — SheetPrimitive.Content (around line 172-173)
- Remove the fixed `pt-10` from `className`.
- Add inline style that adds the iOS safe-area inset plus breathing room:
  ```tsx
  style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 2.5rem)' }}
  ```
  This pushes the whole menu down below the status bar on iPhone while leaving Android layout unchanged.

### 2. `src/components/Header.tsx` — SheetPrimitive.Close (around line 268)
- Replace the fixed `top-4` positioning with an inline style that follows the same safe-area offset:
  ```tsx
  style={{ top: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}
  ```
  The close button will now stay aligned with the shifted content and no longer collide with the status bar.

### 3. `docs/SYNC-LOG.md` — new sync log entry
- Create `docs/SYNC-LOG.md` if it does not exist.
- Add a short entry documenting this fix, the affected component, and the verification steps, per the project’s sync routine.

## Verification
- Run `tsgo --noEmit` (or project typecheck) to ensure no TypeScript errors.
- Switch preview to iPhone/mobile viewport and open the hamburger menu.
  - Confirm the menu content and close × appear below the status bar/notch.
- Switch preview to Android/Samsung viewport.
  - Confirm the menu layout is unchanged.

## Notes
- No backend, DB, or edge-function changes.
- No design tokens or dark-mode behavior changes.
- The fix is scoped to the mobile navigation sheet only.