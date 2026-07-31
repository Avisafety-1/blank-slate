## Problem

In "Min profil" → Oppfølging, the content extends past the screen width on mobile. Two causes in `src/components/ProfileDialog.tsx`:

1. The Radix `ScrollArea` viewport (shadcn default) renders its child with `display: table`, which grows to fit the widest content instead of being capped at 100% width. Long, unbreakable incident titles therefore stretch the whole tab.
2. The incident row title uses `truncate`, which never kicks in because that ancestor chain is allowed to expand (point 1), so the title renders in full and pushes the card wide.

## Changes (frontend only, one file)

`src/components/ProfileDialog.tsx`:

- On the `ScrollArea` wrapping the tabs, constrain the viewport child: add `w-full min-w-0` plus `[&>div]:!block [&>div]:w-full [&>div]:min-w-0` so the scroll content can no longer exceed the dialog width.
- Follow-up incidents card: keep the row as `flex ... min-w-0`, ensure the text column is `min-w-0 flex-1`, and change the title from `truncate` to `break-words` (with `line-clamp-2` so a long title stays on max two lines instead of many). Status/date line stays `truncate`.
- Verify the pending-approval mission cards in the same tab also stay within width (title already uses `break-words min-w-0`; add `min-w-0` to the card wrapper if needed).

## Verification

Screenshot the profile dialog's Oppfølging tab at 360px width via Playwright and confirm no horizontal overflow and that the long incident title wraps/clamps.
