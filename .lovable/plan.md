## Mål
Gi droneflygeren en kort, handlingsrettet status pr. verneområde i kart-popupen, basert på Miljødirektoratets veileder. Skille klart mellom typene (nasjonalpark = forbudt, naturreservat = sjekk forskrift, marint/lite landskapsvern = ingen egne droneregler men aktsomhetsplikt, biotopvern/dyrefredning = forstyrrelsesforbud).

## Endringer (kun frontend)

### 1. `src/lib/natureProtectionRules.ts` — utvid `VerneformRule`

Legg til to nye felt pr. verneform:
- `status`: `'FORBUDT' | 'SJEKK_FORSKRIFT' | 'BEGRENSET' | 'AKTSOMHET'` — driver fargen og overskriften på status-badgen.
- `pilotAdvice`: kort tekst (1–2 setninger) rettet til droneflygeren — hva må jeg gjøre _her_?

Eksempler:
- **Nasjonalpark**: status=FORBUDT, advice=«Droneflyging er forbudt — også å fly inn fra utsiden. Du må ha tillatelse fra nasjonalparkstyret før du flyr.»
- **Naturreservat**: status=SJEKK_FORSKRIFT, advice=«Sjekk verneforskriften i faktaarket. Står 'modellfly o.l.' der, er droner forbudt. Forstyrrelse av dyreliv er uansett ulovlig.»
- **Marint verneområde / lite landskapsvern**: status=AKTSOMHET, advice=«Ingen egne droneregler, men aktsomhetsplikt (nml § 6). Sjekk om området grenser til naturreservat eller nasjonalpark.»
- **Biotopvern / dyrefredning**: status=BEGRENSET, advice=«Forstyrrelse av fugleliv er forbudt — særlig hekke-/yngletid. Krever som regel dispensasjon.»
- **Svalbard/Jan Mayen**: status=FORBUDT, advice=«Tillatelse fra Sysselmesteren kreves.»

Legg til en helper `getStatusPresentation(status)` som returnerer `{ label, color, bg }`:
- FORBUDT → rød badge «Droneflyging forbudt»
- SJEKK_FORSKRIFT → gul badge «Sjekk verneforskriften»
- BEGRENSET → oransje badge «Begrenset — krever dispensasjon»
- AKTSOMHET → blå badge «Aktsomhetsplikt»

### 2. `src/lib/mapDataFetchers.ts` — oppdater popup-blokken (linje 970–974)

Erstatt nåværende «🚁 Droneregler»-boks med:
1. **Status-badge øverst** med farge fra `getStatusPresentation` og kort tittel (f.eks. «🚫 Droneflyging forbudt»).
2. **Pilot-rådet** (`pilotAdvice`) som hovedtekst — kort og handlingsrettet.
3. **Hjemmel** i mindre tekst under (uendret innhold).
4. Lite tips: «📄 Sjekk faktaarket for verneforskriftens fulle ordlyd» — peker øyet mot faktaark-knappen som allerede finnes.

### 3. Behold eksisterende
- Metaboks, faktaark-knapp, dispensasjons-/sikker melding-knapper og Miljødirektoratet-lenke beholdes uendret.
- VERNEFORM_RULES sitt eksisterende `rule`-felt beholdes for bakoverkompatibilitet (kan brukes andre steder).

## Begrensninger / ærlighet
- Naturbase-properties har **ikke** strukturert «ferdselsforbud-periode»-felt. Vi kan ikke automatisk vise hekketider per område — kun generell formulering. Brukeren må fortsatt åpne faktaarket for periode-spesifikke forbud.
- Pilot-rådet er generisk pr. verneform, ikke pr. enkeltområde, fordi enkeltområdenes forskrifter er fritekst i Lovdata-lenken.

## Verifisering
- Klikk på en nasjonalpark → rød «Droneflyging forbudt»-badge + forbud-tekst + nasjonalparkstyre-knapp.
- Klikk på et naturreservat → gul «Sjekk verneforskriften»-badge.
- Klikk på et marint verneområde → blå «Aktsomhetsplikt»-badge.
