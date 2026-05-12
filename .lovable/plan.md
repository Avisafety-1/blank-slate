# Fiks: Ninox-badge på oppdrag utenfor 5 km-sonen

## Årsak

I `src/components/oppdrag/MissionCard.tsx` (linje 592–595) settes `has5kmZone = true` så snart `AirspaceWarnings` returnerer en advarsel med `zone_type === '5KM'`:

```ts
onAirspaceResult={(warnings) => {
  const found = warnings.some(w => w.zone_type === '5KM');
  setHas5kmZone(found);
}}
```

Men RPC-en `check_mission_airspace` returnerer også **nærhets-treff** for 5 km-soner (oppdrag i nærheten, ikke bare inne i sonen) — disse får da `is_inside = false` og `level = "caution"` med meldingen *"Nærhet til 5 km-sonen rundt …"*.

For Hybelneset (Stord) ligger oppdraget utenfor selve 5 km-sirkelen rundt Stord lufthavn, men nært nok til å trigge nærhets-treffet → badgen "Ikke godkjent i Ninox" vises feilaktig.

Til sammenligning: `AirspaceWarnings.normalizeWarning` og selve advarselsmeldingen skiller riktig på `is_inside`, men callbacken som styrer badgen gjør ikke det.

## Endring

Én linje i `src/components/oppdrag/MissionCard.tsx`:

```ts
const found = warnings.some(w => w.zone_type === '5KM' && w.is_inside);
```

Dette matcher SORA/Ninox-regelen (godkjenning kreves kun når man faktisk opererer inne i 5 km RPAS-sonen, jf. eksisterende kommentar i `AirspaceWarnings.tsx` linje 105).

## Verifisering

- Hybelneset Stord: badgen forsvinner (kun nærhetstreff, ikke `is_inside`).
- Et oppdrag som faktisk ligger inne i 5 km-sonen rundt en flyplass: badgen vises fortsatt og krever bekreftelse.
- Selve nærhetsadvarselen i `AirspaceWarnings`-listen vises uendret (fortsatt informativ "Nærhet til 5 km-sonen …").

Ingen DB-/RPC-endringer nødvendig.
