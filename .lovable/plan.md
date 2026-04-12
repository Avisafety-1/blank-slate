

## Plan: Merge SORA Volume and Adjacent Area Headers onto One Line

### What changes

Currently, `SoraSettingsPanel` and `AdjacentAreaPanel` are two separate `Collapsible` components stacked vertically, each with its own full-width trigger line. When SORA is enabled, Adjacent Area appears on a second line below.

**Goal**: Combine both trigger headers into a single row. "SORA volum" (renamed from "SORA Operasjonelt volum") on the left with its enable switch, and the Adjacent Area trigger on the right — all on one line. Each still expands its own collapsible content below.

### Files to modify

**1. `src/pages/Kart.tsx`** (lines ~579-588)
- Wrap both `SoraSettingsPanel` and `AdjacentAreaPanel` in a single container div
- Both components remain independent but are laid out so their triggers share one row

**2. `src/components/SoraSettingsPanel.tsx`**
- Rename label from "SORA Operasjonelt volum" → "SORA volum" (line 153)

**3. Structural approach**
- Instead of two full-width collapsibles stacked, create a shared header row in `Kart.tsx` that contains:
  - Left side: "SORA volum" label + enable Switch + chevron (opens SORA settings)
  - Right side: "Tilstøtende" button/trigger with pass/fail badge + chevron (opens Adjacent Area panel)
- Both collapsible contents render below this shared row
- This requires extracting the trigger UI from both components and managing open states at the parent level, OR making the components accept a `renderTrigger` prop

**Simpler approach**: Restructure the two components so their Collapsible triggers sit inside a shared flex row in `Kart.tsx`. Each component exports its trigger and content separately, or we compose them differently.

**Pragmatic approach**: 
- Make `SoraSettingsPanel` render its trigger inline (shorter label)
- Make `AdjacentAreaPanel` render inline next to it by wrapping both in a `flex` row in `Kart.tsx`
- Use CSS: wrap both components in a div where triggers are `inline-flex` and contents span full width below

Since both are `Collapsible` components with block-level triggers, the cleanest approach is:
1. In `Kart.tsx`, wrap both in a flex container
2. Refactor both components to accept an `inline` or `compact` mode where the trigger is not full-width
3. Or better: extract trigger buttons to `Kart.tsx` and pass `open`/`onOpenChange` as props to both panels, rendering only their content

### Implementation detail

**`Kart.tsx`**: 
- Add state: `soraOpen`, `adjacentOpen` 
- Render a single shared header row with both triggers side by side
- Render `SoraSettingsPanel` content (when soraOpen) and `AdjacentAreaPanel` content (when adjacentOpen) below

**`SoraSettingsPanel`**:
- Accept `open`/`onOpenChange` props and expose content without its own trigger
- Or add a `renderTriggerOnly` mode
- Rename to "SORA volum"

**`AdjacentAreaPanel`**:
- Accept `open`/`onOpenChange` props and expose content without its own trigger
- Shorten label to "Tilstøtende" on mobile

### Result
One horizontal line: `[SORA volum] [switch] [▼]  ···  [👥 Tilstøtende] [OK badge] [▼]`
Content panels expand below this shared row.

