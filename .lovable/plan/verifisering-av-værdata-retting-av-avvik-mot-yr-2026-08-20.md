# Verifisering av værdata + retting av avvik mot Yr

## Konklusjon på verifiseringen

Vi henter riktige data fra riktig kilde. Test mot MET Norway for Sjøveien 11, 7130 Brekstad (63.68167, 9.66393), 29. august:

```text
MET (rådata)          Avisafe (edge function)   Yr (29. aug)
00:00Z 15.0°C 5.1 m/s   -                        02–08: 15°, 5 m/s
06:00Z 14.3°C 6.3 m/s   -                        08–14: 14°, 6 m/s
12:00Z 16.9°C 4.4 m/s   valgt punkt: 16.9 / 4.4  14–20: 17°, 4 m/s
18:00Z 16.3°C 4.5 m/s   -                        20–02: 16°, 4 m/s
```

Tallene er identiske. Yr runder av til hele grader/m-per-sekund og viser 6-timers bolker, derfor ser det ulikt ut.

Det som faktisk er feil hos oss er presentasjonen så langt frem i tid:

1. Så langt frem leverer MET kun punkter hver 6. time, men vi kaller grafen «Timeprognose» og tegner hver bolk som én time.
2. «Beste flyvindu: X timer» teller antall punkter som timer — 4 punkter blir feilaktig «4 timer» i stedet for 24 timer.
3. Nedbør og værsymbol hentes bare fra `next_1_hours`, som ikke finnes på 6-timerspunkter. Derfor viser vi «0.0 mm» og ukjent symbol selv om Yr melder 0–3 mm.
4. Oppdraget starter 17:18 lokal, men vi låser oss til nærmeste punkt (14:00) uten å vise at oppløsningen er 6 timer.

## Endringer

### Edge function `drone-weather`
- Returner oppløsningen på prognosen (`step_hours`, utledet fra avstanden mellom timeseries-punktene rundt måltidspunktet).
- Fallback for nedbør/symbol: `next_1_hours` → `next_6_hours` → `next_12_hours`, og returner hvilken periode verdien gjelder for, samt min/maks nedbør når MET oppgir intervall.
- Beregn «beste flyvindu» i faktiske timer (antall punkter × step) i stedet for antall punkter.
- Ta med både lav og høy nedbørsverdi i vurderingen av advarsler så vi ikke sier «0 mm» når MET melder 0–3 mm.

### `DroneWeatherPanel.tsx`
- Bytt overskrift dynamisk: «Timeprognose» ved 1-times steg, «6-timersprognose» når stegene er 6 timer.
- Vis tidsintervall i tooltip (f.eks. «14:00–20:00») når steget er større enn 1 time.
- Vis nedbør som intervall («0–3 mm») når MET oppgir det.
- Vis flyvindu-varigheten i reelle timer.
- Liten hjelpetekst under badgen: prognosen er 6-timers oppløsning så langt frem, og blir mer detaljert nærmere oppdraget.

### i18n
Nye nøkler i både `no.json` og `en.json` for 6-timersprognose, intervalltekst og oppløsningsforklaring.

## Merk
Ingen databaseendringer. Edge-funksjonen må deployes for at endringene skal slå inn.
