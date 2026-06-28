## Plan

1. **Legg til legacy-deteksjon for DJI/Chromium 70**
   - Bruk eksisterende DJI-deteksjon hvis den allerede finnes i `deviceDetection`, ellers legg til en liten robust sjekk for DJI RC Pro/Plus og eldre Chromium.

2. **Unngå `react-pdf` på DJI RC Pro/Plus**
   - `react-pdf/pdf.js` er sannsynlig kilde til krasjen (`TypeError: URL.parse is not a function`).
   - For PDF-sjekklister på DJI skal dialogen ikke rendere `<Document>`/`<Page>` i det hele tatt.

3. **Vis trygg fallback for PDF-sjekklister på DJI**
   - Vis filnavn og tydelig knapp for å åpne/laste ned PDF i ny fane i stedet for innebygd PDF-visning.
   - Behold “Fullfør sjekkliste”-flyten slik at piloten fortsatt kan markere sjekklisten som gjennomgått.

4. **Behold dagens PDF-visning på moderne enheter**
   - iPad, telefon og PC skal fortsatt bruke den innebygde PDF-visningen med zoom/pan.

5. **Utvid polyfill kun hvis nødvendig**
   - Legg eventuelt til en enkel `URL.parse`-polyfill som sikkerhetsnett, men hovedfiksen blir å ikke laste PDF-rendereren på legacy DJI der biblioteket uansett er for moderne.

## Teknisk

- Endres primært i `src/components/resources/ChecklistExecutionDialog.tsx`.
- Eventuelt liten tilleggsendring i `src/lib/legacyPolyfills.ts` eller bruk av eksisterende `src/lib/deviceDetection.ts`.
- Ingen databaseendringer.