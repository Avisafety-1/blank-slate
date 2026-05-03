## Mål

Når bruker velger drone i SORA-volum-panelet, skal VLOS-radius rundt pilotposisjon beregnes ut fra ALOS i stedet for fast 120 m. Beregningen skal vises i popup når man klikker på pilotmarkøren.

## ALOS-formel (samme som AI-risikovurdering)

- Multirotor/helikopter: `ALOS = 327 × CD + 20 m`
- Fastvinget/VTOL: `ALOS = 490 × CD + 30 m`

CD (karakteristisk dimensjon) hentes allerede inn til `soraSettings.characteristicDimensionM` i `Kart.tsx` (linje 106) når drone velges. Dronetype detekteres fra modellnavn (regex `fixed|wing|fastving|fly|plane|vtol`).

Hvis ingen drone er valgt eller CD mangler → fallback 120 m (dagens oppførsel).

## Endringer

### 1. Ny helper `src/lib/alosCalculator.ts`
Eksporterer:
```ts
calculateAlos(cdM?: number|null, droneModel?: string|null): {
  alosMaxM: number;
  alosCalculation: string; // "327 × 0.35m + 20m = 134m"
  formula: 'multirotor' | 'fixed-wing';
} | null
```
Identisk logikk som `supabase/functions/ai-risk-assessment/index.ts` linje 77–94.

### 2. `src/pages/Kart.tsx`
- Beregn `alosInfo` via memo basert på `soraSettings.characteristicDimensionM` + `soraDroneModel`.
- Bruk `alosInfo?.alosMaxM ?? 120` som `VLOS_LIMIT` i `vlisInfo` (linje 456–487).
- Send `vlosRadiusM` og `alosCalculation` ned til `<OpenAIPMap>` (begge stedene markøren brukes, linje 944 og 972).

### 3. `src/components/OpenAIPMap.tsx`
- Legg til props `vlosRadiusM?: number` og `alosCalculation?: string`.
- I pilot-effect (linje 1011–1063):
  - Bruk `VLOS_RADIUS = vlosRadiusM ?? 120`.
  - Popup viser:
    - "Pilotposisjon"
    - "Dra for å flytte"
    - "VLOS-radius: {N} m"
    - Hvis `alosCalculation` finnes: "ALOS: {formel}" (f.eks. "327 × 0.35m + 20m = 134m")
    - Hvis ikke: "(standard 120 m – velg drone i SORA for ALOS)"

### 4. UI-tekst i topp-panelet (valgfri liten justering)
"utenfor"-telleren i `vlisInfo` bruker automatisk ny grense, så ingen ekstra endring nødvendig der.

## Ikke i scope
- Ingen endring i selve SORA-buffer-tegningen.
- Ingen endring i AI-risikovurdering eller PDF-eksport.
