

## Fix: Dropdown active/hover states too dark

### Problem
The CSS variable `--accent` is set to `210 80% 28%` (dark blue). All dropdown UI components use `bg-accent` as a solid background for hover/focus/active states, making them appear too dark and hard to read.

### Solution
Change `hover:bg-accent` and `focus:bg-accent` to use opacity variants (`bg-accent/10` or `bg-accent/15`) across all affected UI components. This keeps the accent color but makes it translucent.

### Files to update

| File | What changes |
|---|---|
| `src/components/ui/select.tsx` | `SelectItem`: `hover:bg-accent` → `hover:bg-accent/15` |
| `src/components/ui/dropdown-menu.tsx` | `DropdownMenuItem`, `DropdownMenuCheckboxItem`, `DropdownMenuRadioItem`, `DropdownMenuSubTrigger`: all `focus:bg-accent` / `data-[state=open]:bg-accent` → `/15` opacity variants |
| `src/components/ui/command.tsx` | `CommandItem`: `hover:bg-accent` → `hover:bg-accent/15` |
| `src/components/ui/context-menu.tsx` | Same pattern: `focus:bg-accent` / `data-[state=open]:bg-accent` → `/15` |
| `src/components/ui/menubar.tsx` | Same pattern for menubar items |

All changes follow the same mechanical pattern: append `/15` to every `bg-accent` used in interactive highlight states, and similarly `/80` for `text-accent-foreground` if needed (though text color may remain solid).

