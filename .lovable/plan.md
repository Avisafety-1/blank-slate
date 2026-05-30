Jeg fant at selve ArduPilot-navnet allerede er forsøkt trunkert, men skjermbildet viser fortsatt at andre elementer i samme område kan presse dialogen bredere: header/toggle-linjen, hjelpeteksten og selve pending-logg-wrapperen mangler flere `min-w-0`/wrapping-begrensninger. I tillegg kan `overflow-x-hidden` på dialogen alene skjule noe visuelt, men ikke alltid stoppe intern sidelengs scroll på mobil.

Plan:
1. Stramme inn `PendingDjiLogsSection`:
   - Gi hovedcontaineren `min-w-0 w-full overflow-x-hidden`.
   - Endre headeren slik teksten, badge og “Kun mine”-toggle kan wrappe på små skjermer i stedet for å presse bredden.
   - Gi hjelpetekst og loggliste eksplisitt `min-w-0 max-w-full`.
   - Sørge for at hver loggrad og alle tekstlinjer (`dato`, `eier`, feilmelding) truncates/wrapper uten å øke bredden.

2. Stramme inn `UploadDroneLogDialog` rundt metodevisningen:
   - Legge `min-w-0 max-w-full overflow-x-hidden` på method-step wrappers.
   - Gjøre kort-grid og pending-wrapper trygge på mobil med `min-w-0`.
   - Sikre at DJI-kortets e-post og auto-sync-tekst ikke kan utvide kortet.

3. Beholde funksjonalitet uendret:
   - Ingen endring i sync, ArduPilot/DJI-logikk eller dataflyt.
   - Kun CSS/Tailwind-klasser for mobil layout og overflow.

Teknisk detalj:
- Rotårsaken er sannsynligvis flere flex/grid-barn som mangler `min-w-0`, ikke bare ArduPilot-teksten. På mobile nettlesere kan disse barna beholde sin intrinsic width og dermed gjøre dialoginnholdet bredere enn viewporten.