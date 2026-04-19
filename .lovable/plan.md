

## Plan: AviSafe-forslag for avvikshierarki

### Mål
Legg til en knapp "Bruk forslag fra AviSafe" i `DeviationCategoryTreeEditor`. Når den trykkes, fylles treet med en standard hierarkisk liste basert på AviSafe-malen (fra opplastet bilde). Brukeren kan etterpå redigere/slette/legge til som vanlig.

### Tolkning av bildet → naturlig hierarki
Bildet viser en flat liste med tydelige prefikser (KLIMA, SVIKT, NÆRHET, OVERSKRIDELSE, PIC). Disse prefiksene blir naturlige rotkategorier, og elementene under blir underkategorier:

- **Ingen avvik**
- **Klima**
  - Ising (propell/kontrollflater)
  - Nedbør (regn/yr/vått vær)
  - Vind og vindkast
- **Teknisk svikt**
  - Kompassforstyrrelse
  - GNSS (forstyrrelse/tap av signal)
  - Programvare
  - Radiokontakt (C2)
  - Batteri
  - Flysensor
  - Strukturell
  - Kommunikasjon (Multi-CREW)
  - Montering
- **Nærhet (separasjon)**
  - Annen drone (UA)
  - Småfly (GA)
  - Trafikkfly
- **Overskridelse**
  - Autorisasjon
  - Avstandsbegrensning (horisontal)
  - Energireserve
  - Høydebegrensning (vertikal)
  - Luftromsavgrensning (Airspace Infringement)
  - MTOM
  - Radiorekkevidde (BRLOS)
  - VLOS (BLOS)
- **Pilot (PIC)**
  - Forstyrrelse under operasjon
  - Ukvalifisert
  - Udyktig (IMSAFE)
- **Mangelfull lysføring**
- **(N)MAC fugl** (kollisjon/nær kollisjon med fugl)
- **Annet** (beskriv i kommentarfelt)

### UI-endring
I `DeviationCategoryTreeEditor.tsx`:
- Ny knapp "Bruk forslag fra AviSafe" (Sparkles-ikon) ved siden av "Legg til rotkategori".
- Vises alltid; men hvis treet allerede har kategorier → bekreftelsesdialog: "Dette legger til AviSafe-forslagene. Eksisterende kategorier beholdes. Fortsette?" (vi appender, sletter ikke).
- Innsetting skjer i én batch via `insert([...])` med beregnede `parent_id`/`sort_order`. Roter får `sort_order` etter eksisterende roter; barn knyttes via inserted IDs returnert fra Supabase (insert med `.select()`).
- Etter vellykket insert: `fetchRows()` + toast "Forslag lagt til".

### Filer som endres
- `src/components/admin/DeviationCategoryTreeEditor.tsx` — ny preset-konstant + handler + knapp.

Ingen DB-endringer. Ingen andre filer berøres.

