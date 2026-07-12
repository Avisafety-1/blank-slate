# i18n – konvensjoner og migrasjonsguide

Dette dokumentet beskriver hvordan internasjonalisering (i18n) skal håndteres
i AviSafe over tid. Målet er en skalerbar, trygg og forutsigbar oppsett som
tåler at appen vokser, og som lar oss migrere modul for modul uten å rive opp
det som allerede er oversatt.

## Status

- **Bibliotek:** `i18next` + `react-i18next` + `i18next-browser-languagedetector`.
- **Språk:** `no` (norsk bokmål, default), `en` (engelsk).
- **Fallback:** `no`. Eksisterende norsk-først innhold beholdes på norsk hvis
  en engelsk oversettelse mangler.
- **Eksisterende oversettelser:** `src/i18n/locales/no.json` og `en.json` under
  ett samlet `translation`-namespace. Disse er **ikke** delt opp – de virker
  som de alltid har.

## Sannhetskilde for språk

Bruk alltid `getCurrentLanguage()` fra `@/lib/i18nHelpers` i stedet for å
plukke fra `i18n.language` direkte. Det normaliserer `en-US`/`nb-NO` osv. til
`'en' | 'no'`, og gir én å trekke ut i tester/refaktor.

```ts
import { getCurrentLanguage, setLanguage } from "@/lib/i18nHelpers";

const lang = getCurrentLanguage(); // 'no' | 'en'
setLanguage('en');
```

## I React-komponenter

Bruk `useTranslation()` som vanlig.

```tsx
import { useTranslation } from "react-i18next";

const { t } = useTranslation();
return <h1>{t('missions.create')}</h1>;
```

## Utenfor React (PDF, eksport, varsler, AI-payloads)

Bruk `getFixedT(language, namespace?)` – aldri hooks.

```ts
import { getFixedT, getCurrentLanguage } from "@/lib/i18nHelpers";

export function generateMissionPdf(language = getCurrentLanguage()) {
  const t = getFixedT(language, 'pdf');
  doc.text(t('mission.title'));
}
```

## Når trenger en modul eget namespace?

Hold deg innenfor det eksisterende `translation`-namespacet med mindre én av
disse stemmer:

- Modulen har > ~50 strenger som ikke deles med UI.
- Modulen lever utenfor React (PDF, edge functions, jobs).
- Modulen har domeneterminologi som ikke skal blandes med generelle UI-nøkler
  (eksempler: SORA, safety, AI-prompts, kart-popup-tekst).

Foreslåtte fremtidige namespaces (opprettes **bare** når en modul faktisk
migreres – ingen tomme placeholder-filer):

- `pdf` – PDF-eksport-tekst
- `ai` – frontend-side av AI-tekst (knapper, statusmeldinger)
- `map` – kart-popups og lag-etiketter
- `sora` – SORA-prosess og buffer-terminologi
- `safety` – sikkerhetsanalyse, varslinger
- `notifications` – varselmaler

### Slik registreres et nytt namespace

1. Lag `src/i18n/locales/<lang>/<namespace>.json` for hvert språk.
2. Importer i `src/i18n/index.ts` og legg inn under
   `resources[<lang>][<namespace>]`.
3. Bruk: `useTranslation('<namespace>')` eller `getFixedT(lang, '<namespace>')`.

## Aviation/drone-terminologi

`useTerminology()` håndterer fly vs drone (basert på `companyType`). Bruk den
heller enn å hardkode "drone"/"luftfartøy" – også i nye moduler.

For SORA, ECCAIRS, NSM, RPAS og andre regulatoriske begreper: behold engelsk
forkortelse + lokal forklaring. Eksempel:

```json
{
  "sora.contingencyVolume": "Contingency Volume (sikkerhetsvolum)"
}
```

## AI-generert tekst

Frontend skal sende `language` eksplisitt til AI-edge-functions:

```ts
const { data } = await supabase.functions.invoke('ai-search', {
  body: { q, language: getCurrentLanguage() },
});
```

Edge-functions skal **ikke** importere frontend-i18n. Hver function holder sine
egne prompts i en lokal `prompts/`-mappe (`prompts.no.ts`, `prompts.en.ts`)
med en liten lokal helper. Se senere migrasjons-PR for `ai-search` som
referansemønster.

## PDF-eksport

PDF skal være helt frikoblet fra React. Hver eksportfunksjon skal akseptere
`language` som parameter (med `getCurrentLanguage()` som default) og bruke
`getFixedT(language, 'pdf')` for all tekst. Det betyr at en kunde kan be om
PDF på engelsk selv om UI står på norsk – uten å bytte UI-språk.

## Fallback-policy

- `fallbackLng: 'no'` – gjelder for **alle** namespaces og er bevisst valgt
  fordi størstedelen av kildeinnholdet er norsk-først.
- `returnEmptyString: false` og `returnNull: false` – manglende nøkler gir
  nøkkelnavn i UI (synlig under utvikling) i stedet for blanke områder.
- `saveMissing` er på i dev og logger en `console.warn`. Skal aldri brukes til
  å sende noe til server.

## Inkrementell migrasjon

1. Kjør `scripts/i18n-scan.ts` (manuelt) – produserer `i18n-scan-report.md`
   med filer sortert etter mengde sannsynlig hardkodet norsk.
2. Velg én fil/modul fra toppen.
3. Legg nye nøkler i passende eksisterende toppnivå (eller eget namespace om
   det er stort nok – se kriterier over).
4. Bytt strenger til `t(...)` / `getFixedT(...).` Verifiser i begge språk i
   preview.
5. Commit som egen PR. Ikke kombiner flere moduler.

## Hva man **ikke** skal gjøre

- Ikke omdøp eksisterende nøkler.
- Ikke flytt eksisterende nøkler mellom filer.
- Ikke lag tomme JSON-filer "for fremtiden".
- Ikke legg AI-prompts i frontend-bundle.
- Ikke bruk `i18n.language` direkte – bruk `getCurrentLanguage()`.
- Ikke kast feil ved manglende nøkkel – bibilioteket fallback-er trygt.

## Length-sensitive strings (kort-plass-kontekst)

Engelsk er ofte 20-40 % lengre enn norsk og sprenger knapper, tabs, badges,
tabellheadere og andre trange UI-flater. For å unngå at layout brekker på EN
uten å nedgradere norsk-språket, bruker vi et fast mønster med to nøkler:

- `foo.action` – full form (menyer, dialoger, tooltips, aria-label).
- `foo.actionShort` – forkortet variant (knapp/tab/badge/tabellheader).

Regelen: hvis EN-strengen ville bli mer enn ~30 % lengre enn NO-strengen i
en trang kontekst, **må** komponenten bruke `Short`-varianten der og
`title`/`aria-label` med full form for tilgjengelighet.

For standard bransjeforkortelser (FH, Reg., Maint.) bruk suffikset `Abbr`
i stedet for `Short` – det signaliserer at forkortelsen er fastlagt og
gjelder begge språk (f.eks. `flightHoursAbbr: "FH"` i både no og en).

### Godkjente engelske forkortelser (levende liste)

| Full | Short/Abbr | Brukskontekst |
|------|------------|----------------|
| Risk assessment | Risk assmt. | Knapp/badge |
| Maintenance | Maint. | Tabellheader/badge |
| Equipment | Equip. | Badge |
| Personnel | People | Tab/knapp |
| Documents | Docs | Sidebar/tab |
| Flight hours | FH | Tabellheader/KPI |
| Last inspection | Last insp. | Tabellheader |
| Next inspection | Next insp. | Tabellheader |
| Registration | Reg. | Tabellheader |

Utvid listen når nye forkortelser vedtas i en migrasjons-PR. Ikke bruk CSS
(`truncate`, `text-xs`) som primær fiks – teksten skal passe uten å kuttes.

## Legge til et nytt språk

1. Lag `src/i18n/locales/<lang>.json` ved å kopiere `no.json` som mal.
2. Importer i `src/i18n/index.ts` under `resources`.
3. Legg språkkoden i `SUPPORTED`-arrayet i `src/lib/i18nHelpers.ts`.
4. Legg til knapp/valg i `Header.tsx` (eller bytt til en proper språkmeny).
5. Kjør scan-scriptet og start migrasjonen – det nye språket arver fallback fra `no`.
