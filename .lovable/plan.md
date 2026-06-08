## Hva som er feil

Etter den nye Avinor-synkroniseringen (`Dronerestriksjonsomraader_gdb`) er det rot i `rpas_5km_zones`:

```
Zone      Antall   med TEKST   med navn
5km        99        50          99
CTR        19         0           0   <- skal ikke ligge her
TIZ        31         0           0   <- skal ikke ligge her
Kran        2         0           2
```

To konkrete problemer:

1. **Bodø (og 48 andre flyplasser) mangler info i popup**
   Det ligger to rader for Bodø: en gammel enkel 5km-sirkel (OBJECTID 13, ingen TEKST/KONTAKT) og en ny rik rad (OBJECTID 2469, full NINOX-tekst + telefon). Den gamle blev aldri slettet, så når man klikker treffer Leaflet ofte den gamle og popupen faller tilbake til kort default-tekst. Værnes vises riktig fordi den ikke har en gammel duplikatrad lenger.
   - 49 av 99 5km-rader er gamle duplikater uten TEKST.

2. **CTR/TIZ vises som "RPAS 5 km · Ukjent"**
   Det nye Avinor-endepunktet returnerer CTR/TIZ/Kran-polygoner i samme respons. Disse har ikke NAVN og ble lagret i `rpas_5km_zones` med navn = "Ukjent". CTR/TIZ skal komme fra `rpas_ctr_tiz`, ikke fra 5km-laget — de viser feil etikett, feil farge og dobbeltrenderer kontrollsonene.

## Plan

### 1. Filtrer sync-geo-layers (`supabase/functions/sync-geo-layers/index.ts`)
I `rpas_5km_zones`-mapperen, slipp gjennom kun features hvor `Zone === '5km'` (drop CTR/TIZ/Kran). De hører hjemme i `rpas_ctr_tiz`-laget som allerede synces fra eget endepunkt.

### 2. Migrasjon: rens opp tabellen
Én SQL-migrasjon som:
- Sletter alle rader hvor `properties->>'Zone'` er noe annet enn `'5km'` (fjerner de 19 CTR + 31 TIZ + 2 Kran).
- Sletter de gamle duplikatene: for hver ICAO med flere rader, behold raden som har `properties ? 'TEKST1'` (den nye rike); slett resten.

### 3. Verifisere
Kjør sync på nytt etter migrasjon for å bekrefte at antallet stabiliserer seg på ~50 rader, alle med ICAO + TEKST. Klikk Bodø og en CTR-sone for å sjekke popup.

## Tekniske detaljer

- Ingen endring i popup-renderer (`src/lib/rpas5kmPopup.ts`) eller fetcher trengs — de fungerer riktig så snart dataene er rene.
- Ingen endring i `rpas_ctr_tiz` — CTR/TIZ vises som før via `RPAS_CTR_TIZ/FeatureServer/0`.
- Ingen endringer i frontend kart-lagene utover at "Ukjent"-popupene forsvinner og Bodø får rik info.
