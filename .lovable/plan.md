## Problem

Gamle NOTAMs (f.eks. Trondheim 17. mai, `A3142/26`) blir liggende selv om sluttdato er passert. To bugs i `supabase/functions/fetch-notams/index.ts`:

1. **PERM-deteksjonen er for løs.** Regex `/PERM|permanent/i` matcher delstrenger som "**PERM**ISSION" i NOTAM-tekster som "UNLESS PRIOR PERMISSION GRANTED…". Mange tidsavgrensede tempo-soner blir derfor stemplet `effective_end_interpretation = 'PERM'`.
2. **Opprydning hopper alltid over PERM og EST.** Sletteforespørselen (linje 344–348) ekskluderer både `PERM` og `EST` selv når `effective_end` faktisk er passert. Resultat: feilstemplet `PERM` = evig liv. Også reelle `EST` med konkret sluttdato bør ryddes når datoen er passert.

## Endringer

### 1. Strammere PERM-deteksjon (parser, linje 154)
- Bytt fra `/PERM|permanent/i` til ordgrensestrenger som faktisk forekommer i NOTAM-formatet, f.eks. `/\bPERM\b/i` (men ekskluder treff på "PERMISSION"/"PERMITTED"), eller enklere: kun sett `PERM` når det ikke finnes en `TO:`-dato i samme tekst.
- Logikk: `isPerm = !toMatch && /\bPERM(?!I)\w*/i.test(cleanDesc)` — krever fravær av TO-dato. PERM med konkret sluttdato er motsigelse og skal aldri trigges.

### 2. Rydd basert på `effective_end` uavhengig av tolkning (linje 343–348)
- Endre slettespørringen til å fjerne alle rader hvor `effective_end < now()`, uavhengig av `effective_end_interpretation`. PERM uten sluttdato (effective_end IS NULL) beholdes via stale-grensen på 30 dager (linje 350–355), som allerede finnes.
- Dette gjør oss robuste mot fremtidige feilklassifiseringer: så lenge vi har en sluttdato i fortiden, slettes raden.

### 3. Engangs-opprydning av eksisterende feildata
- Etter koden er deployert kjøres en SELECT/DELETE-runde manuelt (via `read_query`/migrasjon) for å fjerne alle eksisterende rader hvor `effective_end < now()` — inkludert dagens Trondheim-NOTAM.

## Effekt

- Trondheim-NOTAMen forsvinner umiddelbart etter neste sync (eller manuell opprydning).
- Fremtidige tempo-soner med "PERMISSION" i teksten klassifiseres riktig og ryddes automatisk når sluttdato passeres.
- Cron-jobben kjører allerede daglig (`fetch-notams`), så ingen ekstra schedulering nødvendig.

## Tekniske detaljer

Berørte filer:
- `supabase/functions/fetch-notams/index.ts` — to små endringer (regex + delete-query).

Ingen DB-skjemaendringer. Ingen frontend-endringer. Manuell engangs-DELETE kjøres etter deploy for å fjerne historisk skrot.
