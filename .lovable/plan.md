## Hva som er feil

Varslene «GAULDAL A» og «GAULDAL B» kommer fra `aip_restriction_zones`-rader som er ATZ-soner for **Gauldal seilflyklubb** (`remarks: "Gauldal seilflyklubb www.gauldal.aero"`). Disse er allerede markert som `is_official = false`, men funksjonen `check_mission_airspace` (siste versjon i migrasjonen `20260524055251_…`) tar med **alle** ATZ-rader i `ATZ_5KM`-CTE-en uten å filtrere på `is_official`:

```sql
SELECT az.id::text, 'ATZ_5KM',
       COALESCE(az.name, az.zone_id, 'Ukjent småflyplass'),
       ST_Buffer(ST_Centroid(az.geometry)::geography, 5000)::geometry
FROM aip_restriction_zones az
WHERE az.zone_type = 'ATZ'
  AND az.geometry IS NOT NULL
  AND ST_DWithin(ST_Centroid(az.geometry)::geography, v_envelope::geography, 50000)
```

GAULDAL A er en svær seilflyaktivitet-ATZ (~604 km²). Sentroiden + 5 km treff dekker Lundamo, så ruten merkes som «inne i 5 km-sonen rundt småflyplassen». GAULDAL B (134 km²) havner 4.3 km unna sentroiden. Det er feil merkelapp — dette er ikke en småflyplass og PPR/myppr.no gjelder ikke. «Ler flyplass» (3.1 km unna) kommer fra `caa_drone_zones`-laget og er korrekt.

## Endring

Én migrasjon som oppdaterer `check_mission_airspace` slik at `ATZ_5KM`-CTE-en kun inkluderer offisielle ATZ-er:

```sql
WHERE az.zone_type = 'ATZ'
  AND az.is_official = true
  AND az.geometry IS NOT NULL
  AND ST_DWithin(...)
```

`caa_drone_zones`-grenen (flyplasser fra dronesoner.no) er uendret, så ekte småflyplasser som Ler beholdes.

Ingen frontend-endringer trengs — popup-tekst og alvorlighetslogikk er allerede riktig for de gjenværende treffene.

## Verifisering

- Kjør `check_mission_airspace` for et punkt nær Lundamo og bekreft at GAULDAL A/B ikke lenger returneres som `ATZ_5KM`, mens «Ler flyplass» fortsatt vises.
