

## Oppdater drone-katalogen med brukerens komplette datasett

### Problemer funnet

**Feil MTOW i eksisterende data:**
- DJI Matrice 4E: 14.1 → 1.4 kg, payload 0.7 → 0.2
- DJI Matrice 4T: 14.1 → 1.4 kg, payload 0.7 → 0.2
- DJI Matrice 30T: 3.85 → 3.77
- DJI Matrice 350 RTK: 6.5 → 6.47
- DJI Mini 2 SE: 0.249 → 0.246
- DJI Agras T40: weight_kg 38 → 50 (MTOW, not dry weight)
- Autel EVO Max 4T: 1.57 → 1.6

**Modeller som mangler helt (fra brukerens liste):**
- DJI Mini 4 Pro, DJI Avata (v1), DJI Mavic 2 Pro
- Autel Nano, Autel EVO II (base), Autel EVO II Dual, Autel Dragonfish Pro
- Parrot Anafi, Parrot Anafi FPV
- Skydio X2
- Wingtra WingtraOne Gen II, Quantum Systems Trinity F90+
- DJI Agras T10, DJI Agras T25, DJI FlyCart 30

**Klasse-korreksjon:**
- DJI Agras T30/T40 har C4, bør trolig være C3 (basert på brukerens data)

### Skjemaendring

Legge til 4 nye kolonner på `drone_models`:

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| `category` | TEXT | consumer, prosumer, fpv, enterprise, survey, vtol, agriculture, cargo |
| `endurance_min` | INTEGER | Flygetid i minutter |
| `max_wind_mps` | NUMERIC | Maks vindstyrke (m/s) |
| `sensor_type` | TEXT | Sensortype / kamera |

### Datakorreksjon

UPDATE alle eksisterende rader med korrigerte verdier fra brukerens liste, og fyll inn de nye kolonnene.

### Nye modeller

INSERT ~15 modeller som mangler i databasen.

### UI-endring

Vise de nye feltene (flygetid, vindgrense, sensor) i `AddDroneDialog` som info når en katalogmodell er valgt — i den eksisterende info-boksen under vekt/payload.

### Oppsummering
- 1 migrasjon (4 nye kolonner)
- ~20 UPDATEs for eksisterende data
- ~15 INSERTs for nye modeller
- Liten UI-oppdatering i AddDroneDialog

