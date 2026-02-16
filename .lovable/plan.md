

## VLOS/BVLOS-valg i AI-risikovurdering

### Hva dette gjor
1. Erstatter den enkle VLOS av/pa-bryteren med et tydelig VLOS/BVLOS-valg (radioknapper) i input-fanen pa risikovurderingen.
2. Oppdaterer AI-prompten slik at BVLOS-operasjoner vurderes strengere enn VLOS, i trad med EASA-krav (BVLOS krever SORA, hoyere pilotkompetanse, C2-link, DAA-systemer, osv.).

### Endringer

#### 1. `src/components/dashboard/RiskAssessmentDialog.tsx`
- Erstatt Switch-komponenten for "VLOS-operasjon" (linje 374-379) med en RadioGroup med to valg:
  - **VLOS** -- Visuell linje (Visual Line of Sight)
  - **BVLOS** -- Utenfor visuell linje (Beyond Visual Line of Sight)
- Nar BVLOS velges, settes `isVlos = false` i pilotInputs (ingen endring i datamodellen)
- Vis en kort informasjonstekst under valget som forklarer forskjellen

#### 2. `supabase/functions/ai-risk-assessment/index.ts`
Legg til en ny seksjon i systemprompten som instruerer AI-modellen om VLOS vs BVLOS:

```
### VLOS / BVLOS-VURDERING
Pilotens input angir om operasjonen er VLOS eller BVLOS (isVlos-feltet i pilotInputs).

Hvis BVLOS (isVlos = false):
- Krev SORA-analyse (mission_sora). Hvis ingen SORA finnes, reduser overall_score med 3 og legg til NO-GO-anbefaling.
- Krev spesifikke BVLOS-kompetanser (STS-02, BVLOS-sertifisering e.l.). Reduser pilot_experience score med 2 hvis mangler.
- Vurder behov for C2-link (command & control), DAA (detect and avoid), og redundante systemer.
- Reduser mission_complexity score med 1-2 pga. okt operasjonell kompleksitet.
- Legg til spesifikke BVLOS-anbefalinger i recommendations (kommunikasjonsplan, nodstopp-prosedyrer, lost-link-prosedyre).

Hvis VLOS (isVlos = true):
- Standard vurdering uten ekstra BVLOS-krav.
- Observer-behov vurderes basert pa observerCount.
```

### Filer som endres
- `src/components/dashboard/RiskAssessmentDialog.tsx` -- Bytt Switch til RadioGroup
- `supabase/functions/ai-risk-assessment/index.ts` -- Legg til VLOS/BVLOS-instruksjoner i systemprompten
