## Cause

In `src/components/ProfileDialog.tsx` line 940 the ScrollArea got these classes in the last change:

```
[&>div]:!block [&>div]:w-full [&>div]:min-w-0
```

`&>div` matches **every** direct child of the Radix ScrollArea root — not just the viewport. The root also renders the vertical `ScrollBar` (a div) and `ScrollAreaPrimitive.Corner` (a div). Forcing `display:block; width:100%` on the scrollbar turns the thin track into a full-width grey block that appears while scrolling in every tab.

## Fix

Replace the generic child selector with a viewport-scoped one:

```
[&>[data-radix-scroll-area-viewport]]:!block
[&>[data-radix-scroll-area-viewport]]:w-full
[&>[data-radix-scroll-area-viewport]]:min-w-0
```

This keeps the overflow fix from the previous change (viewport child no longer `display: table`) while leaving the scrollbar and corner styling untouched.

## Verification

Open the profile dialog at 360px, scroll each tab, and confirm no grey block appears and the Oppfølging tab still stays inside the screen width.
