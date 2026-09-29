# Samle risiko og SORA i én badge

## Resultat
På oppdrag vises fortsatt risikoscoren som før, men med `+SORA` etter scoren når en SORA-basert re-vurdering er kjørt, for eksempel `5.0/10 +SORA`. Den separate statusbadgen «SORA: Under arbeid» (eller annen SORA-status) fjernes helt fra oppdragsvisningene, også når SORA er registrert manuelt. `+SORA` betyr kun at re-vurderingen er kjørt, ikke at analysen er godkjent.

## Gjennomføring
- Bruk `sora_output` på en lagret AI-risikovurdering som tegn på gjennomført re-vurdering, uavhengig av `mission_sora.sora_status`. Vis gjeldende score fra nyeste risikovurdering; behold `+SORA` hvis en av oppdragets vurderinger har en re-vurdering, også når en nyere vanlig vurdering finnes.
- Utvid den felles `MissionBadgeRow` slik at risikobadgen viser suffikset på dashbord, oppdragskort og i oppdragsdialogen, og fjern den separate SORA-statusbadgen der. Behold dagens klikk på risikobadgen og tilgang til SORA-analysen via eksisterende visninger/handlinger.
- Oppdater datainnhentingen for disse stedene og den separate oppdragslisten i profilen, slik at den viser samme `+SORA` og ingen egen SORA-statusbadge. Fjern også den ekstra statusbadgen fra SORA-delen på oppdragskortet, uten å fjerne selve analysedelen.
- Behold SORA-markeringen på **historiske enkeltvurderinger** i risikodialogen: den skiller vurderingene og avgjør hvilken PDF som eksporteres. Den er ikke den separate oppdragsstatusen som fjernes.

## Teknisk og kontroll
Ingen databaseendringer eller endringer i selve vurderingslogikken. Bruk samme formateringsregel på alle oppdragsflater og oversett nye brukerrettede tekster i både norsk og engelsk. Kontroller oppdrag uten vurdering, med vanlig vurdering, med re-vurdering og med senere ny vanlig vurdering; verifiser også at historikkeksport fortsatt velger riktig analyse.
