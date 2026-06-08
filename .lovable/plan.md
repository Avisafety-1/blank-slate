## Mål
Gjøre stolpediagrammene under "Flytid" i personell-kortet selvforklarende. Stolpene viser flytid (i timer/minutter) fordelt på like store delperioder over hele perioden (f.eks. 30/90/180 dager delt i 6–12 bøtter). I dag har tooltipen tom etikett og bøttene har ingen synlig datoinformasjon.

## Endringer i `src/components/resources/PersonnelFlightKpi.tsx`

1. **Lagre datoperiode per bøtte** i `bucketize`:
   - Returner `{ label, minutes, start: Date, end: Date }` for hver bøtte.
   - `label` settes til kort datospenn, f.eks. `15.05–21.05` (norsk dd.MM). Brukes til tooltip-label.

2. **Tooltip viser dato + flytid**:
   - `labelFormatter={(label) => label}` (datospennet for bøtten).
   - `formatter={(v) => [formatHours(v), "Flytid"]}` (uendret).
   - Behold eksisterende stil.

3. **Hover-cursor** beholdes (`cursor={{ fill: "hsl(var(--muted))" }}`) slik at man ser hvilken stolpe man peker på selv når den er 0.

4. **Liten forklarende undertekst** under hvert stolpediagram:
   - Tekst som `Flytid per uke` når bøtte-størrelsen er ca 7 dager, ellers `Flytid per N dager` der N er `Math.round(bucketDays)`.
   - Styling: `text-[9px] text-muted-foreground/70 leading-none mt-0.5 text-center`.

5. **Tilgjengelighet**: legg `aria-label` på chart-container med samme beskrivelse (`Flytid fordelt på N-dagers perioder, siste X dager`).

## Ingen andre endringer
- Ingen datamodell- eller spørringsendringer.
- Ingen endringer i andre komponenter.
