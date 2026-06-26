Clarification from user: when navigating from an Oppdrag card to /kart via ?missionId=..., the map must be centered on the selected mission's route/area, not on the user's current GPS position. The geolocation marker may still be shown as today.

Current state:
- Kart.tsx already loads the mission when `missionId` query param is present and enters route-planning mode.
- The map has a `pilotPosition` / geolocation feature that presumably auto-centers on the user.
- A previous plan already added: loading existing route, SORA buffer, zoom-to-centroid, save-without-reset, and a "Tilbake til oppdrag" button.

What this plan adds:
1. Disable or skip the user-position auto-center when `editingMissionId` (or `missionId` query param) is present on initial load.
2. Compute the mission route bounding box/center on load and set the map initial view to that area.
3. Ensure the geolocation dot/marker still renders if the user has granted permission, but only centers the map on first fix when no mission is selected.
4. Keep the existing "Tilbake til oppdrag" and save behaviour unchanged.

No database or API changes. Frontend only.