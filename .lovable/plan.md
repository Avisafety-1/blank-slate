# Klarere konklusjon og SORA-formulering i risikovurderingen

## Hva som skjer i dag
- **Brå start («I tillegg er …»):** Appen fjerner setninger om BVLOS-kompetanse fra konklusjonen etter at AI-en har skrevet den. Når første setning inneholder både hovedkonklusjonen og ordet «kompetanse», forsvinner hele setningen. Da blir neste setning, som starter med «I tillegg», stående først.
- **«Krever full SORA-analyse» / «Manglende SORA-analyse»:** Dette gjelder SORA-fanen på oppdraget i AviSafe. Når fanen ikke er fylt ut for et BVLOS-oppdrag, blir AI-en bedt om å si at SORA er påkrevd. Det står ikke hvor SORA-en skal ligge, så teksten blir vag. Den kan også leses som at selskapet mangler SORA-grunnlag eller driftstillatelse generelt.

## Endringer
1. **Konklusjonen skal alltid begynne naturlig**
   - Setninger fjernes mer presist: bare setninger som faktisk handler om BVLOS-kompetanse, ikke setninger som bare nevner ordet.
   - Hvis en setning likevel fjernes, tas «I tillegg», «Videre», «Også» og lignende bort fra starten av neste setning, og første bokstav blir stor.
   - AI-en blir bedt om å begynne konklusjonen med hovedbeslutningen, for eksempel «Oppdraget vurderes som CAUTION fordi …».
2. **Tydeligere og riktigere SORA-tekst**
   - «Krever full SORA-analyse» og «Manglende SORA er en stor bekymring» erstattes med en saklig merknad:
     «Det er ikke registrert en SORA-vurdering for dette oppdraget i AviSafe (SORA-fanen). BVLOS i spesifikk kategori skal være dekket av selskapets SORA/driftstillatelse. Fyll ut SORA-fanen eller kjør re-vurdering for å dokumentere SAIL og tiltak.»
   - Merknaden kommer én gang, under anbefalinger. Den gjentas ikke flere ganger i konklusjonen.
   - Når SORA-fanen er fylt ut, nevnes ikke SORA som en mangel.
3. Ordlyden oppdateres på både norsk og engelsk.

## Utenfor denne endringen
- Poengtrekket og NO-GO når et BVLOS-oppdrag mangler SORA i appen beholdes som i dag. Si fra hvis dette skal bli en gul merknad i stedet.
- Vurderinger som allerede er laget, endres ikke. Kjør vurderingen på nytt for å se den nye teksten.

## Tekniske detaljer
- `competency.ts`: stram inn `INTERNAL_JARGON_RE`, slik at BVLOS-mønsteret bare treffer korte kompetansesetninger. Utvid `scrubCompetencyText` med en funksjon som fjerner innledende koblingsord (`I tillegg|Videre|Også|Dessuten|In addition|Additionally|Furthermore|Also`) og gjør første bokstav stor. Legg til Deno-tester.
- `prompts.ts` (NO/EN, BVLOS-seksjonen og summary-reglene): ny formulering for manglende `mission.sora`, forbud mot «full SORA-analyse» og «manglende SORA», og krav om at summary starter med beslutningen.
- Deploy `ai-risk-assessment`.
