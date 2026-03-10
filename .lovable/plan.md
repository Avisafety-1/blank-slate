

## Rett feil i drone-katalogen og legg til vektfelter

### 1. Rett feilaktige verdier i `drone_models`

De nye modellene fra forrige plan er ennå ikke lagt inn. Når de legges inn, brukes korrigerte verdier. I tillegg finnes det ingen feilaktige eksisterende rader å oppdatere — problemet er kun i den planlagte inserten.

Korrigerte verdier for insert:

| Modell | Klasse | MTOW (kg) | Payload (kg) |
|--------|--------|-----------|-------------|
| DJI Matrice 4E | C2 | 14.100 | 0.700 |
| DJI Matrice 4T | C2 | 14.100 | 0.700 |
| Skydio X10 | C2 | 1.100 | 0.450 |
| DJI Avata 2 | C1 | 0.377 | 0 |
| Autel EVO Max 4T | C2 | 1.570 | 0 |
| Parrot Anafi AI | C2 | 0.898 | 0 |

Resten av modellene fra forrige plan beholdes som planlagt.

### 2. Utvid `drone_models`-tabellen med nye kolonner

Dagens tabell har kun `weight_kg` (som brukes som MTOW) og `payload_kg`. Brukeren ønsker å skille mellom:

- **`weight_kg`** — beholdes, omdøpes konseptuelt til MTOW (Max Takeoff Weight). Ingen DB-endring nødvendig, kun UI-label.
- **`weight_without_payload_kg`** — ny kolonne: vekt uten payload (tom drone + batteri)
- **`standard_takeoff_weight_kg`** — ny kolonne: typisk operativ vekt med standardutstyr

Begge nye kolonner er `NUMERIC, nullable, default NULL`.

### 3. DB-migrasjon

```sql
ALTER TABLE drone_models
  ADD COLUMN weight_without_payload_kg NUMERIC DEFAULT NULL,
  ADD COLUMN standard_takeoff_weight_kg NUMERIC DEFAULT NULL;
```

### 4. Insert alle nye modeller med korrigerte verdier

En samlet INSERT med ~20 nye dronemodeller (DJI, Autel, Skydio, Parrot, Freefly, Yuneec) med korrekte vektdata.

### 5. UI-endringer i `AddDroneDialog.tsx`

- Oppdater `DroneModel`-interfacet med de to nye feltene
- Oppdater katalog-autofyll (`handleModelSelect`) til å vise de nye vektfeltene
- Legg til read-only visning av "Vekt uten payload" og "Standard takeoff-vekt" når en katalogmodell er valgt (informasjon fra katalogen, lagres ikke på den individuelle dronen)
- Endre label på eksisterende vekt-felt fra "Vekt MTOM (kg)" → "MTOW (kg)" for klarhet

### Oppsummering
- 1 migrasjon (2 nye kolonner på `drone_models`)
- 1 data-insert (~20 nye modeller med korrigerte verdier)
- Mindre UI-oppdatering i AddDroneDialog for å vise nye felter

