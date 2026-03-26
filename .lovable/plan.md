

## Fix: Feilmelding ved klikk på "Fullførte oppdrag"

### Sannsynlige årsaker

1. **`tidspunkt` kan være null/undefined** for noen fullførte oppdrag (f.eks. auto-fullførte). Linje 297 i MissionCard kaller `format(new Date(mission.tidspunkt), ...)` uten null-sjekk. Hvis `tidspunkt` er `undefined`, gir `new Date(undefined)` "Invalid Date", og `date-fns format()` kaster `RangeError: Invalid time value` som crasher hele komponenten.

2. **"Avbrutt"-oppdrag mangler i spørringen**: Fullførte-fanen henter kun `status = "Fullført"`, men "Avbrutt"-oppdrag er også relevante for fullførte. Dette er ikke en feilårsak, men en mangel.

3. **Stille feil i datahenting**: Hvis noen av de parallelle spørringene (personell, droner, utstyr osv.) feiler for fullførte oppdrag, fanger catch-blokken det og viser toast "Kunne ikke laste oppdrag", men gir ingen detaljer.

### Plan

**Fil: `src/components/oppdrag/MissionCard.tsx`**
- Legg til null-sjekk for `mission.tidspunkt` på linje 297: vis "Ikke angitt" hvis null/undefined i stedet for å krasje
- Legg til null-sjekk for `log.flight_date` på linje 682
- Legg til null-sjekk for `incident.hendelsestidspunkt` på linje 650

**Fil: `src/hooks/useOppdragData.ts`**
- Inkluder "Avbrutt" i fullførte-fanen: `.in("status", ["Fullført", "Avbrutt"])` (linje 123)
- Gjør det samme i søkefunksjonen (linje 261)
- Legg til mer detaljert console.error i catch-blokken for å vise hvilken sub-spørring som feiler

**Fil: `src/components/oppdrag/OppdragFilterBar.tsx`**
- Oppdater tab-teksten fra "Fullførte" til "Fullførte og avbrutte" (eller behold "Fullførte" men inkluder begge statuser)

### Tekniske detaljer

```text
// MissionCard linje 297 - før:
format(new Date(mission.tidspunkt), "dd. MMMM yyyy HH:mm", { locale: nb })

// etter:
mission.tidspunkt
  ? format(new Date(mission.tidspunkt), "dd. MMMM yyyy HH:mm", { locale: nb })
  : "Ikke angitt"
```

```text
// useOppdragData linje 122-124 - før:
if (tab === "active") {
  query = query.in("status", ["Planlagt", "Pågående"]);
} else {
  query = query.eq("status", "Fullført");
}

// etter:
if (tab === "active") {
  query = query.in("status", ["Planlagt", "Pågående"]);
} else {
  query = query.in("status", ["Fullført", "Avbrutt"]);
}
```

