# Sync-logg

## 2026-07-09 — iOS safe-area-fiks for mobilmeny

**Komponent:** `src/components/Header.tsx`  
**Problem:** På iPhone startet mobilmenyen (hamburger-panelet) helt øverst på skjermen, slik at lukke-krysset (×) havnet bak/under statuslinjen (klokke, batteri, notch). Android/Samsung var upåvirket.

**Endringer:**
- Fjernet fast `pt-10` på `SheetPrimitive.Content`.
- La til `style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 2.5rem)' }}` for å skyve hele menyen ned under statuslinjen på iPhone.
- Endret `SheetPrimitive.Close` fra fast `top-4` til `style={{ top: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}` slik at krysset følger samme forskyvning.

**Verifisering:**
- `tsgo --noEmit` kjørt uten feil.
- Mobil-preview (iPhone-viewport) bekrefter at meny og lukke-kryss ligger under statuslinjen.
- Android/Samsung-viewport bekrefter uendret utseende.
