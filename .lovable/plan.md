# Befolkning: SSB i Norge, Eurostat ellers

I dag ligger SSB- og Eurostat-WMS oppå hverandre når begge er aktive. Vi gjør laget til ett "Befolkning"-lag som auto-bytter kilde basert på kartets midtpunkt.

## Endring

I `OpenAIPMap.tsx`:

1. **Auto-bytte på moveend**: legg til en liten håndterer som sjekker om kartets `center` ligger innenfor Norge-bbox (lat 57.5–71.5, lng 4–32). Hvis ja → fjern Eurostat-laget, legg til SSB-laget. Hvis nei → motsatt. Kjøres bare når "Befolkning"-toggelen er på.

2. **Toggle on/off**: når brukeren skrur "Befolkning" på, kjør samme sjekk én gang for å legge til riktig kilde. Når av, fjern begge.

3. **Legend**: oppdater `BefolkningLegend` til å vise riktig `source` ("ssb" eller "eurostat") basert på samme sjekk.

Ingen nye filer, ingen DB-endringer.
