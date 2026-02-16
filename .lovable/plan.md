

## Dynamisk callsign for SafeSky Advisory: selskapsnavn + nummer

### Problem
Callsign er i dag hardkodet til "Avisafe" i alle advisory-publiseringer. Hvis flere selskaper publiserer advisory samtidig, vises alle med samme callsign. Onsket format er selskapsnavn + lopsende nummer, f.eks. "avisafe01", "norconsult01".

### Losning
Sla opp selskapets navn fra `companies`-tabellen via oppdragets `company_id`, og tell antall aktive advisory-flyvninger for samme selskap for a generere et unikt lopende nummer.

**Formel:** `callSign = selskapsnavn_lowercase + zero-padded_nummer`

### Endringer

#### 1. `supabase/functions/safesky-advisory/index.ts`

I `publish_advisory` / `refresh_advisory`-blokken (linje 339-451):

- Utvid mission-queryen til a inkludere `company_id`: `.select('id, tittel, route, latitude, longitude, company_id')`
- Sla opp selskapsnavnet fra `companies`-tabellen basert pa `mission.company_id`
- Tell antall aktive advisory-flyvninger for samme `company_id` i `active_flights`-tabellen (med `publish_mode = 'advisory'`)
- Generer callsign: ta selskapsnavnet, gjor det lowercase, fjern spesialtegn/mellomrom, og legg til et null-paddet nummer basert pa plasseringen blant aktive flyvninger
- Bruk det genererte callsignet i advisory payload i stedet for hardkodet "Avisafe"
- Fallback: hvis selskap ikke finnes, bruk "avisafe01"

Eksempel pa logikk:
```text
const companyName = company?.navn || 'avisafe'
const sanitized = companyName.toLowerCase().replace(/[^a-z0-9]/g, '')
// Tell aktive advisory-flyvninger for dette selskapet
// Finn denne missionens posisjon i listen (sortert pa start_time)
const index = sortedFlights.findIndex(f => f.mission_id === missionId) + 1
const callSign = sanitized + String(index).padStart(2, '0')
// Resultat: "avisafe01", "norconsult02" osv.
```

#### 2. `supabase/functions/safesky-cron-refresh/index.ts`

I cron-refreshen (linje 159-245) som republiserer advisory hvert 5. sekund:

- Utvid mission-queryen til a inkludere `company_id`
- Sla opp selskapsnavnet fra `companies`-tabellen
- Tell aktive advisory-flyvninger for samme selskap for a beregne riktig nummer
- Bruk det genererte callsignet i stedet for hardkodet "Avisafe"
- Samme logikk og fallback som i safesky-advisory

#### 3. Point advisory (publish_point_advisory)

For punkt-advisory (pilotposisjon) er det ingen tilknyttet mission/selskap. Her beholdes "Pilot posisjon" som callsign, da dette representerer en enkeltpilots live-posisjon uten selskapstilknytning.

### Tekniske detaljer

**Filer som endres:**
- `supabase/functions/safesky-advisory/index.ts`
- `supabase/functions/safesky-cron-refresh/index.ts`

**Databasesporringer som legges til:**
1. `companies`-oppslag: `SELECT navn FROM companies WHERE id = mission.company_id`
2. Aktive flyvninger per selskap: `SELECT mission_id FROM active_flights WHERE company_id = X AND publish_mode = 'advisory' ORDER BY start_time`

**Callsign-regler:**
- Kun lowercase bokstaver og tall (a-z, 0-9)
- Mellomrom og spesialtegn fjernes
- Nummer er alltid 2 siffer (01, 02, ... 99)
- Fallback til "avisafe01" hvis selskap ikke finnes

**Ingen databaseendringer er nodvendige.** Alle nodvendige kolonner (`company_id` i `missions` og `active_flights`, `navn` i `companies`) finnes allerede.

