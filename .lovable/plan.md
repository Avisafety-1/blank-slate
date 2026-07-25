# Plan: fullføre Polen-import trygt etter restart

## Status jeg har verifisert

- PANSA luftrom: **2 738** rader finnes, **2 735 aktive**.
- GDOŚ naturvern: **5 av 6 lag er importert**:
  - National parks: 76
  - Nature reserves: 2 317
  - Landscape parks: 351
  - Natura 2000 SPA/fugleområder: 52
  - Protected landscape areas: 205
- Mangler sannsynligvis: **Natura 2000 SAC/habitatområder** (`pl_gdos_natura2000_sac`).
- NOTAM-feed for Polen finnes og er aktiv: `notaminfo: Poland`.
- Edge-loggene viser at forrige forsøk traff **CPU Time exceeded**, så vi må redusere chunk-størrelse før mer import.

## Viktig operasjonell regel

Vi skal ikke kjøre flere store layers i én curl-loop. Vi kjører **ett lite chunk-kall av gangen**, verifiserer etter hvert kall, og stopper hvis Supabase begynner å vise tegn til press.

## Tiltak før ny import

1. Juster `sync-pl-nature` slik at standardkjøring blir mer konservativ:
   - `tileCount` default ned fra 30 til 10.
   - maksimum `tileCount` ned fra 300 til 25.
   - `UNIFIED_BATCH_SIZE` ned fra 500 til 150–200.
   - Legg inn kort pause mellom tile-prosessering, ca. 300–500 ms.
   - Sørg for at `finalize` bare kjøres på siste chunk, ikke på hvert delkall.

2. Deploy edge-funksjonen på nytt.

## Trygg backfill-strategi

For manglende lag (`layerIndex: 4`, Natura 2000 SAC):

1. Kjør chunk 0–9.
2. Les respons:
   - `ok` må være true.
   - `batch_failures` må være 0.
   - `tilesAtCap` må helst være lav/0.
3. Vent kort før neste chunk.
4. Fortsett 10 tiles av gangen til `reachedEnd: true`.
5. Kjør `finalize: true` bare på siste kall med komplett `keepIds` dersom funksjonen trenger stale-deaktivering. Hvis keepId-listen blir stor, dropper vi finalize for SAC i denne omgang heller enn å risikere feilaktig deaktivering.

## Verifisering etterpå

- Query `airspace_zones` for alle `pl_gdos_*` kilder og antall aktive rader.
- Sjekk edge logs for `sync-pl-nature` etter CPU-timeout eller batch failures.
- Sjekk NOTAM-status for Polen i `notam_rss_feeds`.
- Hvis database-dashboardet blir unhealthy igjen: stopp importen umiddelbart, ikke fortsett.

## Produksjonsrisiko

Dette påvirker fortsatt bare unified airspace for allowlist-selskapet **Moderavdeling** og ikke norske brukere/NO-data. Vi gjør ingen endring i Norge-logikk eller eksisterende norske kartlag.
