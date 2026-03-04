

## Fix: Solid dark accent on button hover/focus states

### Problem
The `Button` component's `outline` and `ghost` variants use `hover:bg-accent` (solid dark blue). When used as Popover/combobox triggers (e.g., the "Personell" field in AddMissionDialog), hovering or focusing fills the entire field with a solid dark background. The `focus-visible:ring-ring` also uses the same solid dark color.

### Solution
Update `src/components/ui/button.tsx` to use opacity variants:

- `outline` variant: `hover:bg-accent` → `hover:bg-accent/15`
- `ghost` variant: `hover:bg-accent` → `hover:bg-accent/15`
- Base ring: `focus-visible:ring-ring` → `focus-visible:ring-ring/40`

This matches the same `/15` opacity pattern already applied to dropdown-menu, select, command, context-menu, and menubar components.

### File changed
`src/components/ui/button.tsx` — 3 class string replacements in `buttonVariants`.

