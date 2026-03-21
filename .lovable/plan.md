

## Plan: Lock orientation to portrait on phones, keep landscape on DJI RC Pro

### Problem
`orientation: "any"` in the PWA manifest allows auto-rotation on all devices. Phones rotate even when the user has rotation lock enabled in system settings, because the PWA manifest overrides it. DJI RC Pro controllers need landscape.

### Approach
Keep `orientation: "any"` in the manifest (needed for DJI RC Pro). Add a runtime orientation lock in `App.tsx` that:

1. Detects if the device is a DJI controller by checking `navigator.userAgent` for "DJI" or by checking if the screen's natural width > height (DJI RC Pro is natively landscape)
2. If NOT a DJI device, calls `screen.orientation.lock("portrait")` to lock to portrait
3. Wrapped in try/catch since the API isn't supported everywhere and may throw

### File changes

**`src/App.tsx`** — Add a `useEffect` near the top:
```typescript
useEffect(() => {
  const isDji = /dji/i.test(navigator.userAgent) || 
    (window.screen.width > window.screen.height);
  if (!isDji && screen.orientation?.lock) {
    screen.orientation.lock("portrait").catch(() => {});
  }
}, []);
```

Wait — `screen.width > screen.height` would also match tablets and desktop in landscape. Better detection: check if it's a mobile phone (not tablet) using a narrow screen check combined with touch support.

Revised logic:
```typescript
useEffect(() => {
  const isDji = /dji/i.test(navigator.userAgent);
  const isMobilePhone = 'ontouchstart' in window && 
    Math.min(window.screen.width, window.screen.height) < 600;
  if (isMobilePhone && !isDji && screen.orientation?.lock) {
    screen.orientation.lock("portrait").catch(() => {});
  }
}, []);
```

This locks portrait only on small touch devices (phones), leaving tablets, desktops, and DJI controllers free to rotate.

### Files
- `src/App.tsx` — add orientation lock useEffect

