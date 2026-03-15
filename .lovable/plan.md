

# Fix: Duplicate React instance causing `useRef` crash

## Problem
The error `Cannot read properties of null (reading 'useRef')` at `TooltipProvider` indicates two copies of React are loaded simultaneously. This commonly happens when a dependency (likely `@simplewebauthn/browser` v11 or another package) resolves to a separate React instance.

## Solution
Add `resolve.dedupe` to `vite.config.ts` to force Vite to always resolve to a single copy of React and React DOM.

## Changes

**`vite.config.ts`** — Add dedupe configuration:
```ts
resolve: {
  dedupe: ['react', 'react-dom'],
  alias: {
    "@": path.resolve(__dirname, "./src"),
  },
},
```

This is a one-line addition that forces all imports of `react` and `react-dom` to resolve to the same instance, eliminating the duplicate React error.

