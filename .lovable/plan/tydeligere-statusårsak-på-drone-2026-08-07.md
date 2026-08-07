# Tydeligere statusårsak på drone

## Hva som faktisk skjer nå (verifisert)

Dronens status er en aggregert "verste status" av flere kilder, men UI-et viser bare én generisk setning: "🔧 Vedlikehold forfalt".

Kildene som aggregeres i dag (`calculateDroneAggregatedStatus`):
- Dronens egen inspeksjon: dato (`neste_inspeksjon` + varseldager), timer siden inspeksjon, oppdrag siden inspeksjon
- Hvert tilbehør: `neste_vedlikehold`-dato
- Hvert tilknyttet utstyr (f.eks. batteri): `neste_vedlikehold`-dato
- I tillegg kombineres dette med `drones.status` fra databasen (avvik/varsel fra loggbok)

I ditt tilfelle er dronens egen inspeksjon nettopp utført (neste inspeksjon 17.8.2026), mens batteri "0P2AF9353405RG" har forfalt vedlikeholdsdato og står Rød. Batteriet driver derfor dronestatusen, men teksten sier bare "Vedlikehold forfalt" som om det gjelder dronen selv. Linjen "Status påvirket av: ..." vises kun øverst i dialogen og forklarer ikke hvorfor.

## Hva som bygges

1. Utvid statusberegningen slik at den returnerer strukturerte årsaker, ikke bare en status:
   - hver årsak har: kilde (drone / tilbehør / utstyr / loggvarsel), navn, hva som utløste (dato, timer, oppdrag), status (Gul/Rød) og relevante tall/datoer.
2. Vis en tydelig årsaksliste i dronekortet under Status, f.eks.:
   - "Rød: Batteri 0P2AF9353405RG – vedlikehold forfalt 12.06.2026 (tilknyttet utstyr)"
   - "Gul: Timer siden inspeksjon 8,2 / 10"
   - "Rød: Avvik fra loggbok – <tittel>"
   - Kun kilder som faktisk påvirker status listes; verste kilde markeres først.
3. Fjern/erstatt den generiske "🔧 Vedlikehold forfalt"-teksten og den løse "Status påvirket av"-linjen med denne listen (unngår dobbeltinformasjon).
4. Marker i listen over tilknyttet utstyr/tilbehør hvorfor de er gule/røde (forfalt dato / forfaller om X dager), slik at badgen ikke står uforklart.
5. Samme årsaksvisning brukes i utstyrskortet (`EquipmentDetailDialog`) som har tilsvarende generisk tekst.

## Teknisk

- `src/lib/maintenanceStatus.ts`: ny `getDroneStatusReasons()` (og `getEquipmentStatusReasons()`) som returnerer `{ status, reasons: StatusReason[] }`. `calculateDroneAggregatedStatus` beholdes som tynn wrapper så eksisterende kall (`useStatusData`, `Resources`) er uendret.
- `src/components/resources/DroneDetailDialog.tsx`: erstatt linje 915-919 og 1037-1050 med årsakslisten; utvid badge-visning for tilknyttet utstyr (linje ~1281) med årsakstekst.
- `src/components/resources/EquipmentDetailDialog.tsx`: samme mønster for `statusHints.maintenanceDue`.
- Alle nye strenger legges i BÅDE `src/i18n/locales/no.json` og `en.json` (nøkler under `resourceDialogs.droneDetail.statusReasons.*`), med interpolering av navn/dato/tall.
- Ingen databaseendringer; kun visning og beregningslogikk.
