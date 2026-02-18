
# Bildeopplasting i loggbok-oppføringer

## Gjeldende situasjon

De tre loggbokdialogene håndterer manuell oppføring slik:

| Dialog | Tabell | Manuell oppføring |
|---|---|---|
| `DroneLogbookDialog` | `drone_log_entries` | Ja – type, dato, tittel, beskrivelse |
| `EquipmentLogbookDialog` | `equipment_log_entries` | Ja – type, dato, tittel, beskrivelse |
| `FlightLogbookDialog` (personell) | Kun `profiles.flyvetimer` | Kun timer/minutter – ingen logg-innlegg |

Ingen av tabellene har et `image_url`-felt, og personellets loggbok støtter ikke generelle logg-innlegg i det hele tatt.

## Endringer som kreves

### 1. Databasemigrasjoner

**a) Legg til `image_url`-kolonne i eksisterende tabeller:**
```sql
ALTER TABLE drone_log_entries ADD COLUMN image_url text;
ALTER TABLE equipment_log_entries ADD COLUMN image_url text;
```

**b) Opprett ny `personnel_log_entries`-tabell** (tilsvarende de to over, men for personell):
```sql
CREATE TABLE personnel_log_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  entry_date timestamptz NOT NULL,
  entry_type text,
  title text NOT NULL,
  description text,
  image_url text,
  created_at timestamptz DEFAULT now()
);
-- RLS policies: company-level isolation
```

**c) Opprett ny Storage-bøtte `logbook-images`** (offentlig, slik at bilder kan vises inline i dialogen):
```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('logbook-images', 'logbook-images', true);
-- RLS policies: autentiserte brukere kan laste opp i sin company-mappe
```

Filsti-mønster: `{company_id}/{table_prefix}-{entry_id}-{timestamp}.{ext}`

### 2. Endringer i `DroneLogbookDialog`

**Ny state:**
```typescript
const [imageFile, setImageFile] = useState<File | null>(null);
const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
```

**Nytt felt i skjemaet** — under "Beskrivelse"-feltet:
```
[ 📷 Last opp bilde (valgfritt) ]
[ Forhåndsvisning av valgt bilde ]
```

**Opplastingslogikk i `handleAddEntry`:**
1. Lagre innlegget i `drone_log_entries` og få tilbake `id`.
2. Hvis et bilde er valgt: last opp til `logbook-images/{company_id}/drone-{id}-{timestamp}.{ext}`.
3. Oppdater raden med `image_url = filePath`.

**Visning av bilde i logg-listen:**
- Eksisterende innlegg som har `image_url` viser et lite klikkbart miniatyrbilde under beskrivelsen.
- Klikk åpner bildet i full størrelse (via en enkel `<img>` i en dialog eller native browser).

**Henting:** Legg til `image_url` i SELECT-spørringen for `drone_log_entries`.

### 3. Endringer i `EquipmentLogbookDialog`

Identiske endringer som for drone-loggen, men mot `equipment_log_entries`-tabellen og med `equipment-` som filsti-prefiks.

### 4. Endringer i `FlightLogbookDialog` (personell)

**Problemet:** Personell-loggboken støtter kun manuell registrering av flytimer (oppdatering av `profiles.flyvetimer`), ikke generelle logg-innlegg.

**Løsning:** Legg til en ny "Logginnlegg"-seksjon i tillegg til den eksisterende "Legg til flytimer"-seksjonen:
- Bruk den nye `personnel_log_entries`-tabellen.
- Samme skjema som drone/utstyr: type (merknad, hendelse, reparasjon, annet), dato, tittel, beskrivelse, og bilde-opplasting.
- Vis innleggene under flyturene i en kombinert liste (eller en ny fane).

### 5. Bildevisning i logglisten

For alle tre dialoger vises bilde-innlegg med et lite thumbnail:

```
┌─────────────────────────────────────────────────────┐
│ 📅 14. februar 2026          [Reparasjon]           │
│ Motorbytte venstre arm                              │
│ Erstattet defekt motor etter krasjlanding           │
│ ┌────────────┐                                      │
│ │            │  ← klikkbart miniatyrbilde (80×60px) │
│ │   [bilde]  │                                      │
│ └────────────┘                                      │
│                                  Utført av: Ole N.  │
└─────────────────────────────────────────────────────┘
```

### 6. Storage-bøtte og RLS

Ny bøtte `logbook-images` med følgende RLS-policyer:
- **SELECT (public read):** Alle kan lese (bøtten er offentlig – bilder vises inline uten autentisering).
- **INSERT:** Kun autentiserte brukere kan laste opp filer i sin companies mappe (`{company_id}/*`).
- **DELETE:** Kun brukere i samme selskap kan slette.

## Filer som endres

| Fil | Endring |
|---|---|
| DB-migrasjon | `ALTER TABLE drone_log_entries ADD COLUMN image_url text` |
| DB-migrasjon | `ALTER TABLE equipment_log_entries ADD COLUMN image_url text` |
| DB-migrasjon | Ny `personnel_log_entries`-tabell + RLS |
| DB-migrasjon | Ny `logbook-images` Storage-bøtte + RLS |
| `src/components/resources/DroneLogbookDialog.tsx` | Bildeopplasting i skjema, visning av bilde i liste |
| `src/components/resources/EquipmentLogbookDialog.tsx` | Bildeopplasting i skjema, visning av bilde i liste |
| `src/components/FlightLogbookDialog.tsx` | Ny "Logg innlegg"-seksjon med bilde-støtte |

## Brukerflyt

1. Bruker åpner loggboken for en drone/utstyr/person.
2. Klikker "Legg til innlegg".
3. Fyller inn type, dato, tittel og beskrivelse som før.
4. Velger valgfritt et bilde fra enhet (kamera eller filvelger).
5. Ser en forhåndsvisning av bildet i skjemaet.
6. Klikker "Lagre" — innlegget og bildet lastes opp.
7. Innlegget vises i listen med et klikkbart miniatyrbilde.
