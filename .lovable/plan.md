

## Fix: Leaflet crash when toggling layers + route planning

### Problem
When the user disables a map layer (e.g. RMZ/TMZ/ATZ) and then clicks "Ruteplanlegging", the app crashes with `TypeError: null is not an object (evaluating 'this._map._targets')`.

**Root cause**: `setGeoJsonInteractivity` calls `layer.removeInteractiveTarget(el)` on layers that have been removed from the map. When a layer is removed, Leaflet sets `layer._map = null`, so accessing `this._map._targets` throws.

### Fix

**File: `src/components/OpenAIPMap.tsx`** (lines 119-122)

Add a guard to check `layer._map` before calling `removeInteractiveTarget` / `addInteractiveTarget`:

```typescript
if (!enabled && typeof layer.removeInteractiveTarget === "function" && el) {
  if (layer._map) layer.removeInteractiveTarget(el);
} else if (enabled && typeof layer.addInteractiveTarget === "function" && el) {
  if (layer._map) layer.addInteractiveTarget(el);
}
```

This is a one-line-per-branch change that prevents the crash while preserving correct behavior for layers that are still on the map.

