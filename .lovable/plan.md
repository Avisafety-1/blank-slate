

## Legg til Eciton Atlas-droner i katalogen

Eciton Corp har to dronemodeller: **Atlas MICRO** og **Atlas PRO**. Begge kan legges inn.

### Data å sette inn

| Felt | Atlas MICRO | Atlas PRO |
|------|-------------|-----------|
| name | Eciton Atlas MICRO | Eciton Atlas PRO |
| eu_class | C0 | C1 |
| weight_kg (MTOW) | 0.249 | ~2.0 (tri-copter, estimert) |
| payload_kg | 0 | 0.5 (estimert) |
| endurance_min | 35 | 32 |
| max_wind_mps | 10 | 15.5 |
| sensor_type | 4K/60fps daytime/low-light | EO/IR, 10x optical zoom |
| category | enterprise | enterprise |
| comment | Max 3500m ceiling, 61 km/h | Max 3000m ceiling, 56 km/h, NEST-kompatibel, MESH, kryptert |

Atlas MICRO er under 250g → C0-klasse. Atlas PRO er en tri-copter — vekten er ikke oppgitt på nettsiden, men basert på klassen anslår jeg C1 (under 4kg). Payload er heller ikke spesifisert eksplisitt.

### Gjennomføring

Én SQL INSERT via Supabase insert-verktøyet med begge modellene.

### Usikkerheter

Atlas PRO mangler eksakt vekt og payload fra nettsiden. Jeg setter konservative estimater som kan justeres senere. Alternativt kan vi sette disse til NULL.

