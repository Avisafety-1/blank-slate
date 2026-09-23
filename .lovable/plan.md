# Konsekvent bruk av pilotkompetanse i risikovurderingen

## Slik fungerer det i dag

- Risikovurderingen henter alle rader i kompetanselisten for tildelte piloter og deler dem kun i «gyldig» og «utløpt» (utløpsdato i fortiden).
- Eneste harde regel er: null gyldige rader = no-go. Én hvilken som helst rad — også en fullført AviSafe-modul eller en veiledet tour — fjerner det kravet.
- Hva kompetansen faktisk er (A2, STS, BVLOS) vurderes bare av AI-en ut fra fritekst i prompten, uten fast regel. Det gir tilfeldig vekting og ingen forutsigbar no-go.
- Dataene er rotete i praksis: 45 «A1/A3», 22 «A2», 21 «STS», men også «A1A3», «A1/A3 A2 STS», «A1, A3 », kurs- og tour-rader i samme liste.

## Hva vi bygger

En fast kompetansemodell i systemet (ingen ny database-tabell, ingen migrasjon) som består av to deler:

**1. Gjenkjenning (normalisering)**
Tekstgjenkjenning som oversetter fritekst i navn/beskrivelse til faste koder: A1/A3, A2, STS-01, STS-02, BVLOS, operatørgodkjenning (RO/LT), instruktør, bemannet flysertifikat. Håndterer skrivevarianter (A1A3, «A1/A3 drone», «A1/A3, A2», «A1/A3 A2 STS» gir tre koder).

Hva som teller:
- Teller: type Sertifikat, Lisens, Godkjenning, Kompetanse, Utdanning — og type Kurs når navnet gjenkjennes som et ekte sertifikat (mange registrerer A2/STS som «Kurs»).
- Teller ikke: veiledet tour og AviSafe-interne kursmoduler. De listes som tilleggsinformasjon i rapporten, men kan aldri oppfylle et krav.
- Utløpt dato = ikke gyldig. Uten dato = gyldig (som i dag).

**2. Kravmatrise (fast for alle selskaper)**
Kravene utledes deterministisk av operasjonen, ikke av AI-en:

| Operasjonens egenskap | Krav | Nivå |
| --- | --- | --- |
| Alle oppdrag | Minst ett gyldig droneførerbevis | Lovpålagt |
| Nær uinvolverte / bebygd | A2 eller høyere (STS/spesifikk) | Lovpålagt |
| Spesifikk kategori / SORA / over 120 m | STS eller operatørgodkjenning i spesifikk kategori | Lovpålagt |
| BVLOS | STS-02 eller dokumentert BVLOS-kompetanse | Lovpålagt |
| Nattflyging | Gyldig bevis + selskapets nattregel | Internt |
| Utløpt kompetanse som ellers dekker kravet | — | Lovpålagt (regnes som manglende) |

Nivå styrer utfallet: **lovpålagt mangler = hard stop (no-go)**, internt/anbefalt mangler = advarsel og scoretrekk under pilotkompetanse. Dette legges inn i den deterministiske hard stop-motoren, ikke i AI-prompten — på linje med vind, temperatur og utstyrsstatus.

## Hva brukeren ser

- Rapportens pilotdel viser: hvilke krav operasjonen utløser, hvilke som er dekket (med kilde-rad og utløpsdato), og hvilke som mangler.
- Ved manglende lovpålagt krav står no-go-begrunnelsen konkret: «Operasjonen er nær uinvolverte personer og krever A2; piloten har ingen gyldig A2.»
- Rader som ikke teller (tour/interne moduler) vises som «teller ikke som formell kompetanse».
- Piloten kan ikke «kompensere» manglende bevis med erfaring — samme prinsipp som for vær.

## Teknisk

- Ny `supabase/functions/ai-risk-assessment/competency.ts`: `normalizeCompetency()`, `deriveRequiredCompetencies(missionContext)`, `evaluateCompetencyCoverage()` — rene funksjoner med Deno-tester (`competency_test.ts`), etter samme mønster som `ipPrecipitation.ts` og `hardStops.ts`.
- `hardStops.ts`: erstatt `validCompetencyCount === 0` med resultatet fra kompetansemotoren; nye koder `competency_missing_a2`, `competency_missing_sts`, `competency_missing_bvlos`, `competency_none`, alle i kategorien `pilot_experience`, NO/EN-tekster.
- `index.ts`: send strukturert `competencyAssessment` (krav, dekket, mangler, ignorert) inn i modellens datasett i stedet for dagens flate lister.
- `prompts.ts`: fjern de skjønnsmessige kompetansereglene (punkt 4 i hard stop-listen og STS-02-regelen) og erstatt med «kompetansekravene er allerede avgjort — gjengi dem, ikke overpr\u00f8v dem».
- Ingen databaseendringer og ingen endring i hvordan kompetanse registreres. Validering: `npx tsgo --noEmit -p tsconfig.app.json && git diff --check` + Deno-tester.
- i18n for nye rapporttekster i `no.json`/`en.json`.
