# Isingsvurdering i AI-risikovurdering: kun under frysepunktet

## Problemet

Regelen for ising i AI-prompten utløses av liten differanse mellom lufttemperatur og duggpunkt — uten hensyn til selve temperaturen. Dermed kan en våt sommerdag med 15°C og duggpunkt 14°C gi «ADVARSEL — svært høy risiko for ising» og trekk i vær-score, selv om ising er fysisk umulig. Samtidig underspilles den virkelige faren: ising når det er under frysepunktet.

Isingslogikken finnes kun i promptene i `supabase/functions/ai-risk-assessment/prompts.ts` (norsk linje ~179 og engelsk linje ~739). Ingen deterministisk kode i `index.ts` berører ising, så endringen er begrenset til promptteksten.

## Ny logikk (begge språk)

Temperatur styrer om ising overhodet er et tema:

```text
Lufttemperatur > +2°C:   Ingen isingsrisiko. Ising nevnes ikke som fare,
                         og det gis IKKE score-trekk for ising.
                         Liten duggpunktdifferanse vurderes fortsatt som
                         risiko for tåke/kondens/sikt — det er en annen fare.
+2°C ≥ temp > 0°C:       Marginal sone. Kort merknad om mulig ising i
                         sky/nedbør og ved høyere flyhøyde (kaldere aloft).
                         Maksimalt lite score-trekk (maks 1 poeng).
Temp ≤ 0°C:              Reell isingsfare. Eksisterende
                         duggpunkt-terskler (<1 / <3 / <5°C) gjelder med
                         full vekt: advarsel, score-trekk og konkrete
                         anbefalinger (unngå nedbør/sky, begrens tid, sjekk
                         propeller).
```

Tilleggsregler i prompten:

- «ALDRI si at høy differanse øker risikoen» beholdes (dagens korrekte regel).
- Ny eksplisitt regel: «ALDRI nevn ising som risiko når temperaturen er over +2°C, og gi aldri score-trekk for ising da.»
- Ved temp ≤ 0°C understrekes at ising på propeller/kontrollflater er alvorlig (mistanke om endret lyft og vibrasjon) — farligere enn kondens.
- Regelen gjelder også når vær er vurdert; når brukeren har valgt «ikke vurdert vær» endres ingenting (weather settes fortsatt til null).

## Teknisk

- `supabase/functions/ai-risk-assessment/prompts.ts`: seksjonene «DUGGPUNKT OG ISINGSRISIKO» (no) og «DEW POINT AND ICING RISK» (en) skrives om til tabellen over. Ingen endring i JSON-skjema, kategorier eller andre promptdeler.
- Funksjonen `ai-risk-assessment` redeployes etter endring.
- Ingen databaseendring, ingen frontend-endring, ingen nye i18n-nøkler (prompttekst er ikke UI-tekst).
