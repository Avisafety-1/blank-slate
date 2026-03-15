

## Plan: Gate SORA Admin-fanen i admin-panelet med addon-sjekk

### Kontekst
- **Grower-planen** gir tilgang til risikovurderingsmodulen (`canAccess('sora')`) — dette er korrekt og skal ikke endres.
- **SORA Admin-tilleggsmodulen** (`hasAddon('sora_admin')`) skal gate den avanserte SORA-konfigurasjonsfanen i admin-panelet (`CompanySoraConfigSection`), altså selskapsspesifikke hardstop-grenser, operative krav og AI-kontekst.
- Per nå kalles `hasAddon()` **aldri** i kodebasen — ingen addon er faktisk gatet i UI.

### Endringer

**1. `src/pages/Admin.tsx`**
- Importer `usePlanGating` og hent `hasAddon`.
- Skjul SORA-fanen (`company-config` TabsTrigger) hvis `!hasAddon('sora_admin')`.
- Skjul tilhørende `TabsContent` også.

**2. DJI-gating: `src/components/UploadDroneLogDialog.tsx`**
- Sjekk `hasAddon('dji')` ved åpning. Vis toast og lukk hvis mangler.

**3. DJI-gating: `src/components/PendingDjiLogsSection.tsx`**
- Returner `null` hvis `!hasAddon('dji')`.

**4. ECCAIRS-gating: `src/components/eccairs/EccairsMappingDialog.tsx`**
- Sjekk `hasAddon('eccairs')` ved åpning. Vis toast og lukk hvis mangler.

**5. ECCAIRS-gating: `src/components/eccairs/EccairsSettingsDialog.tsx`**
- Sjekk `hasAddon('eccairs')` ved åpning. Vis toast og lukk hvis mangler.

### Filer som endres
- `src/pages/Admin.tsx`
- `src/components/UploadDroneLogDialog.tsx`
- `src/components/PendingDjiLogsSection.tsx`
- `src/components/eccairs/EccairsMappingDialog.tsx`
- `src/components/eccairs/EccairsSettingsDialog.tsx`

