

## Problem: AI-risikovurderingen gir kryptisk output med rå variabelnavn

Brukeren ser tekst som `landUse.groundRiskClassification='low'` og `maxDensity=21 pers/km²` i risikovurderingen — dette er tekniske variabelnavn som AI-modellen kopierer rett fra system-prompten.

### Rotårsak

I system-prompten (linje 856) står det:
> "VIKTIG: Oppgi alltid befolkningstettheten (maxDensity) i actual_conditions"

Dette gjør at AI-modellen inkluderer rå variabelnavn i sin norske tekst. Prompten refererer også til `landUse.groundRiskClassification`, `populationDensity.maxDensity`, `grcImpact` osv. som tekniske begreper, og AI-en kopierer dem inn i brukerteksten.

### Plan

**Fil: `supabase/functions/ai-risk-assessment/index.ts`**

1. **Oppdater system-prompten** (linje 837–857) for å instruere AI-en om å bruke naturlig norsk i all output:
   - Endre "Oppgi alltid befolkningstettheten (maxDensity)" → "Oppgi alltid befolkningstettheten i naturlig tekst, f.eks. 'Maks befolkningstetthet i området er ca. 3400 personer per km²'"
   - Legg til eksplisitt instruksjon: "Bruk ALDRI tekniske variabelnavn som `landUse.groundRiskClassification`, `maxDensity`, `grcImpact` o.l. i output-teksten. Skriv alt på forståelig norsk."
   - Erstatt referanser til tekniske feltnavn i instruksjonene med naturlig språk der de beskriver hva AI-en skal skrive i output

2. **Forbedre eksempel-formuleringer** i response-format (linje 905–911) for `mission_complexity`:
   - `complexity_factors` beskrives som "Skriv en lettlest beskrivelse av arealbruk, terreng, befolkningstetthet og operasjonelle faktorer — unngå tekniske variabelnavn"
   - `actual_conditions` beskrives tilsvarende

Ingen endringer i selve logikken eller datahentingen — kun i AI-prompten slik at output blir mer brukerlesbar.

