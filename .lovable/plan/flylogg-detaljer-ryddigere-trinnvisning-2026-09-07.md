# Flylogg-detaljer: ryddigere trinnvisning

Dialogen «Flylogg-detaljer» får en tydelig trinnstruktur, all identifikasjon samles i toppen, og gjentatt informasjon fjernes.

## Toppen (oversikt)

Én kompakt topp-panel som alltid ligger øverst:

```text
16.10.2024 16:23   MAVIC 2 · SN 163DFAQ0016VW6 · Batteri SN 161AJB2639020U   [Auto-matchet]
Flytid 0 min | Maks fart 0.7 m/s | Maks høyde 12 m | Distanse 5 m | Min. batteri N/A | 229 punkter
```

- Nøkkeltallene blir én tett rad med små tall i stedet for store bokser (bryter til to rader på mobil).
- «Loggidentifikatorer»-boksen lenger nede fjernes, og drone-/batteri-serienummer gjentas ikke i loggbokdelen.
- Grønne «Auto-matchet via SN»-linjer samles til én liten markering i toppen; feltene under viser bare valget.

## Trinn

Under toppen vises en trinnindikator med tre nummererte trinn, hvert med tydelig overskrift, ikon og skillelinje:

1. **Flydata** – operasjonstype (VLOS/BVLOS/EVLOS) og eventuelle varsler om ukjent drone/batteri.
2. **Loggbok** – pilot, drone, utstyr, «knytt batteri til drone», og oppsummeringen av flytid som legges til.
3. **Oppdrag** – matchende oppdrag / opprett nytt / søk, og valg av eksisterende flytur.

Trinn brukeren allerede har fullført får en hake i indikatoren, og man kan hoppe mellom dem. Alt innhold beholdes — det er kun gruppering og overskrifter som endres. Bunnlinjen med «Tilbake» og «Lagre flylogg» blir liggende fast nederst.

## Høyoppløselig posisjonsdata

Ja — for logger fra auto-synk og masseopplasting ligger hele det tolkede resultatet, inkludert alle posisjonspunkter, allerede lagret i databasen (`pending_dji_logs.parsed_result`). Nedskaleringen sparte derfor i praksis lite; den gjorde bare selve flyloggen fattigere.

- Valget fjernes fra dialogen, og full oppløsning importeres alltid.
- Ingen merkbar ventetid: nedskaleringen er en filtrering i nettleseren, og en større liste med punkter gir bare litt større lagring i flyloggraden.

## Teknisk

- Endringer skjer i `src/components/UploadDroneLogDialog.tsx` (visningsdelen fra ca. linje 3100 og ned) — presentasjon, ikke lagringslogikk.
- Ny liten presentasjonskomponent for topp-panelet og for trinn-overskrifter, plassert under `src/components/dronelog/`.
- `highResImport`-state og de tre `maxPts/maxPoints`-nedskaleringene i `handleUpdateExisting`, `handleCreateNew` og `handleLinkToMission` fjernes, slik at `flight_track` lagres med alle punkter.
- Nye synlige tekster legges inn som nøkler i både `no.json` og `en.json`.
- Ingen databaseendringer og ingen endring i RLS.
