

## Plan: Fix phone auto-rotation in PWA

### Root cause
The manifest has `orientation: "any"`, which tells the OS to allow free rotation for the installed PWA. The runtime `screen.orientation.lock("portrait")` call we added doesn't work reliably — most browsers only allow it in fullscreen mode, not in standalone PWA mode. So phones keep rotating.

### Why DJI is unaffected by manifest changes
DJI RC Pro runs the app in an Android WebView (browser), not as an installed PWA. The manifest `orientation` field only applies to installed PWAs. So changing it to `"portrait"` won't affect DJI controllers at all.

### Fix
**`vite.config.ts`** — Change manifest orientation from `"any"` to `"portrait"`:
```typescript
orientation: "portrait",
```

This is the only reliable way to lock orientation for installed PWAs on phones. The existing runtime lock in `App.tsx` can remain as a belt-and-suspenders approach but isn't sufficient on its own.

**Note:** Users will need to uninstall and reinstall the PWA (or wait for the service worker to update the manifest cache) for this change to take effect on already-installed instances.

