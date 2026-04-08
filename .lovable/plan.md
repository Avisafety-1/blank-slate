

## Flylogg-varsler basert på terskelverdier (DJI/ArduPilot)

### Oversikt
Ny seksjon under Selskapsinnstillinger (admin → Avdelinger) der selskapet definerer terskelverdier fra flylogger som utløser e-postvarsler. Selskapet velger hvilke brukere som skal motta varslene.

### Foreslåtte terskelverdier

Basert på data som allerede lagres i `flight_logs` og `parsed_result`:

| Terskel | Felt i flight_logs / parsed_result | Standard |
|---|---|---|
| Batteri under X % | `parsed_result.minBattery` | 20% |
| RTH ble trigget | `rth_triggered` | på/av |
| Høyde over X meter AGL | `max_height_m` | 120m |
| Maks horisontal hastighet over X m/s | `max_horiz_speed_ms` | 20 m/s |
| GPS-satellitter under X | `gps_sat_min` | 6 |
| Battericelleavvik over X V | `battery_cell_deviation_max_v` | 0.3V |
| Batteritemperatur over X °C | `battery_temp_max_c` | 50°C |
| Høy vibrasjon (ArduPilot) | parsed warnings `high_vibration` | på/av |

### Database

**Ny tabell `company_flight_alerts`:**
```sql
CREATE TABLE public.company_flight_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  alert_type text NOT NULL,
  enabled boolean DEFAULT true,
  threshold_value numeric,
  created_at timestamptz DEFAULT now(),
  UNIQUE(company_id, alert_type)
);
```

**Ny tabell `company_flight_alert_recipients`:**
```sql
CREATE TABLE public.company_flight_alert_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  profile_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(company_id, profile_id)
);
```

RLS: Brukere i synlige selskaper kan lese/skrive.

### UI-endringer

**`src/components/admin/ChildCompaniesSection.tsx`**
- Ny seksjon «Flylogg-varsler» etter Roller-seksjonen
- Infotekst: «Motta e-postvarsler når kritiske terskelverdier nås under flyging»
- Liste over alle 8 terskelverdier med Switch (av/på) og Input for definerbar verdi
- Velger for mottakere: hent profiler fra selskapets brukere, vis som tags med X-knapp
- Bruk SearchablePersonSelect eller lignende komponent for å legge til mottakere

### Varslingslogikk

**`src/components/UploadDroneLogDialog.tsx`**
- Etter vellykket lagring av flylogg: hent selskapets aktive alerts og sjekk parsed_result mot terskelverdier
- Hvis en terskel overskrides: kall `send-notification-email` edge function med varsel-e-post til alle registrerte mottakere
- Genererer HTML med info om dronen, piloten, flyturen og hvilke terskler som ble utløst

### Filer som endres
1. **Ny migrasjon** — `company_flight_alerts` + `company_flight_alert_recipients`
2. **`src/components/admin/ChildCompaniesSection.tsx`** — Ny varsler-seksjon i innstillinger
3. **`src/components/UploadDroneLogDialog.tsx`** — Terskelsjekk og varselutsending etter lagring

