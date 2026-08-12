# Fiks: inkonsistent AEC 12 / ARC-b i luftrisikoanalysen

## Hva som faktisk skjer

Backend utleder AEC deterministisk fra fakta systemet kjenner: flygehøyde, kontrollert luftrom, flyplass-/heliportmiljø (5 km-soner) og urbant/landlig (befolkningstetthet). Den utledningen kan **aldri** returnere AEC 12 — atypisk/segregert luftrom er ikke en fakta systemet kan slå opp, det er noe operatøren må erklære og dokumentere (Annex G 3.20(d)).

AEC 12 i skjermbildet kommer derfor fra AI-teksten (eller en lagret analyse fra før den deterministiske guarden), ikke fra tabellutledningen. Derfor blir det selvmotsigende:

- Etiketten sier AEC 12 (som per tabell 1 gir ARC-a)
- iARC vises som ARC-b (som er AEC 10 — <500 ft, ukontrollert, landlig — det systemet faktisk beregnet)
- Og bryteren «atypisk/segregert» tilbys, selv om AEC 12 pr. definisjon allerede *er* atypisk/segregert

## Hva som skal gjøres

1. **AEC 11 og 12 skal aldri komme fra AI.** Hvis lagret/AI-generert analyse oppgir AEC 11 eller 12 uten grunnlag, overstyres den av den deterministiske utledningen (AEC 1–10). Gjelder både ved ny kjøring og ved visning av gamle analyser.
2. **Konsistensvakt i UI:** iARC vises alltid som ARC-en som hører til den viste AEC-en (tabell 1). Aldri AEC 12 + ARC-b samtidig.
3. **Atypisk/segregert blir en erklæring, ikke en «reduksjon»:** når brukeren slår den på, endres AEC til 12 («erklært av operatør») og residual ARC blir ARC-a, med krav om dokumentasjonstekst. Teksten forklarer at dette er en erklæring som må dokumenteres og godkjennes.
4. **Skjul bryteren når den ikke gir mening:** er AEC allerede 12 / ARC-a, vises den som erklært status i stedet for som valgbar reduksjon.
5. **Forklar hva som drev AEC-en:** kort linje under AEC med de faktiske driverne (høyde AGL, kontrollert/ukontrollert, urbant/landlig, flyplassmiljø) slik at brukeren ser hvorfor systemet landet der.

## Teknisk

- `supabase/functions/ai-risk-assessment/index.ts`: guarden setter allerede AEC deterministisk; utvides med `atypicalSegregated` fra `manualAirRisk.arc_a_atypical` slik at erklæringen gir AEC 12 + ARC-a konsistent, og sanering av AI-satt AEC 11/12.
- `src/lib/soraAirRisk.ts`: uendret tabeller; brukes til konsistenssjekk i UI (`getAecRow(aec).arc` som fasit for iARC).
- `src/components/dashboard/AirRiskAnalysisSection.tsx`: normaliser AEC/iARC ved rendering av lagrede analyser, gjør atypisk-bryteren til erklæring som endrer vist AEC, skjul den ved AEC 12, legg til driver-forklaring.
- i18n-nøkler i `no.json` og `en.json` for de nye tekstene.
