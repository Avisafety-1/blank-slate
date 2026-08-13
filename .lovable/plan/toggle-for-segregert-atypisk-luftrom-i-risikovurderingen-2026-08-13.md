# Toggle for segregert/atypisk luftrom i risikovurderingen

## Mål
Legge til en bryter i input-fanen på AI-risikovurderingen: "Segregert/atypisk luftrom (NOTAM-området)". Når den er på, sendes en erklæring om atypisk/segregert luftrom med i vurderingen, slik at ARC blir ARC-a (AEC 12). Bryteren slås automatisk på når oppdraget har NOTAM.

## Slik fungerer det for brukeren
- Ny bryter i input-fanen, plassert sammen med de andre operative valgene (over mitigerings-listen).
- Hvis oppdraget har NOTAM (samme betingelse som NOTAM-badgen på oppdragskortet: oppdraget har NOTAM-tekst), er bryteren på som standard. Brukeren kan slå den av manuelt.
- Ingen hjelpetekst under bryteren: dette er en initial ARC-fastsettelse (ARC-a), ikke en reduksjon, så Annex G 3.20(d) kreves ikke her.
- Mitigerings-listen ("Mitigeringer som blir tatt med") får en ekstra linje for luftrisiko som viser ARC-a når bryteren er på, ellers "Ikke kreditert".
- Resultatet viser da ARC-a med begrunnelse "erklært atypisk/segregert luftrom (NOTAM-område)" — samme logikk som dagens manuelle erklæring i resultatvisningen.

## Teknisk

`src/components/dashboard/RiskAssessmentDialog.tsx`
- Ny state `atypicalSegregated: boolean` (del av `pilotInputs` eller egen state).
- Auto-sett til `true` når `soraMissionDetails.notam_text` finnes (kun ved initiell lasting/oppdragsbytte, slik at manuell av-slåing ikke overstyres på nytt).
- Send `manualAirRisk: { arc_a_atypical: true }` i `runAssessment`-payloaden når bryteren er på (feltet støttes allerede av edge-funksjonen; ved av sendes ingenting/`false`).

`src/components/dashboard/AutoMitigationsPreview.tsx`
- Ny prop `atypicalSegregated`. Viser en luftrisiko-linje: ARC-a når på, ellers ikke kreditert. Totalen i overskriften gjelder fortsatt GRC-reduksjon.

`src/lib/soraAutoMitigations.ts`
- Ingen endring i GRC-logikken; luftrisiko-linjen håndteres som eget visningselement.

i18n: nye nøkler i `no.json` og `en.json` (bryterlabel, hjelpetekst, ARC-a-linje i listen).

Ingen databaseendringer og ingen endring i edge-funksjonen — `manualAirRisk.arc_a_atypical` håndteres allerede der (setter AEC 12 og ARC-a).
