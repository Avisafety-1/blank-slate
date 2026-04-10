

## Add 4 drones to drone_models catalog

### Data (from official DJI specs pages)

| Model | MTOW (kg) | Weight w/o payload (kg) | Payload (kg) | Wind (m/s) | Endurance (min) | EU Class | Category | Sensor |
|---|---|---|---|---|---|---|---|---|
| DJI Matrice 4D | 1.42 | 1.22 | 0.2 | 12 | 49 | C2 | enterprise | mapping |
| DJI Matrice 4TD | 1.42 | 1.22 | 0.2 | 12 | 49 | C2 | enterprise | thermal |
| DJI Matrice 400 | 15.8 | 9.74 | 6.0 | 12 | 59 | C3 | enterprise | interchangeable |
| DJI FlyCart 100 | 170 | 55.2 | 100 | 12 | 14 | C6 | cargo | cargo |

**Sources:**
- Matrice 4D/4TD: Same airframe as Matrice 4 Series ([enterprise.dji.com/matrice-4-series/specs](https://enterprise.dji.com/matrice-4-series/specs)), Dock 3-compatible variants
- Matrice 400: [enterprise.dji.com/matrice-400/specs](https://enterprise.dji.com/matrice-400/specs) (59 min with H30T, MTOW 15.8 kg, 12 m/s wind)
- FlyCart 100: [dji.com/flycart-100/specs](https://www.dji.com/flycart-100/specs) (170 kg MTOW, 14 min dual battery at 149.9 kg, 12 m/s wind)

### Implementation

**Single step**: Insert 4 rows into the `drone_models` table using the Supabase insert tool.

**Notes:**
- Matrice 4D = mapping variant of Matrice 4 for Dock 3 (same specs as 4E but Dock-compatible)
- Matrice 4TD = thermal variant of Matrice 4 for Dock 3 (same specs as 4T but Dock-compatible)
- FlyCart 100 endurance is 14 min at near-max weight (149.9 kg); no payload endurance not published
- FlyCart 100 EU class set to C6 (>25 kg MTOW)

