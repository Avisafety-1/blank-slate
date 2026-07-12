## Mål

Gjøre både `/hendelser`-siden, alle incident-dialogene og hele ECCAIRS Classification-dialogen fullt to­språklige (NO/EN) via `t()`, uten å endre DB-verdier eller forretningslogikk.

## Prinsipper

- DB-lagrede enum-lignende verdier (`Åpen`, `Under behandling`, `Ferdigbehandlet`, `Lukket`, `Middels`, `Høy`, `Kritisk`, `Luft`, `Bakke`, `Miljø` osv.) beholdes uendret i databasen. Kun visning oversettes via eksisterende hjelpere: `translateIncidentStatus`, `translateSeverity`, `translateIncidentCategory`.
- Alle nye brukervendte strenger legges i **både** `src/i18n/locales/no.json` og `src/i18n/locales/en.json`.
- Ingen endringer i forretningslogikk, ingen skjema-/RLS-endringer.

## 1. Hendelser-siden (`src/pages/Hendelser.tsx`)

- Statusfilter-knapper (`statusOptions`): behold interne verdier `Alle | Åpen | Under behandling | Ferdigbehandlet | Lukket`, men vis dem via ny hjelper — `Alle` → `t('incidents.filters.all')` og de fire status-verdiene via `translateIncidentStatus(...)`.
- Hardkodede JSX-strenger som skal gjennom `t()`:
  - «Rediger» (kortknapp)
  - «Rapportert av: …», «Avdeling: …», «Ansvarlig: …»
  - «Beskrivelse»-overskrift
  - «Laster…»
  - Tom-tilstand-tekst («… ingen hendelser …»)
  - Kommentar-collapsible-etiketter
  - Toast-meldinger («Kunne ikke laste …», eksport-meldinger osv.)
- Feilaktig streng `"{t('incidents.eccairs.exporting')}"` (linje 1030) fikses til reell `t()`-kall.
- Datoformat: bytt `format(..., "d. MMMM yyyy 'kl.' HH:mm", { locale: nb })` til å velge locale (`nb` vs `enUS`) og formatstreng basert på gjeldende språk.

## 2. Incident-dialoger

**`src/components/dashboard/IncidentDetailDialog.tsx`**
- Statusvelger: `SelectItem`-tekst rendres via `translateIncidentStatus(value)`, ikke hardkodet «Under behandling / Ferdigbehandlet / Lukket».
- Labels: «Endre status (Admin)», «Knyttet til oppdrag», «Hendelsestidspunkt», «Lokasjon», «Rapportert av», «Rapportert dato», «Beskrivelse», «Vedlagt bilde», «Hendelsesbilde» (alt), toast «Hendelsesrapport lagret i dokumenter».

**`src/components/dashboard/AddIncidentDialog.tsx`**
- DialogTitle/Description («Rediger hendelse» / «Rapporter hendelse» / undertekst) via `t()`.
- Alle toasts: «Hendelse oppdatert!», «Hendelse rapportert!», «Kunne ikke laste opp bilde», «Feil ved lagring: …».
- Notification `title/description` som starter med «Hendelse: …» og «(offline)» går gjennom `t()` med interpolasjon.

**`src/components/dashboard/IncidentsSection.tsx`**
- Gjennomgå og bytt eventuelle gjenværende hardkodede etiketter til `t()` (badges bruker allerede `translateIncident*`; kun statiske overskrifter/tom-tilstander gjenstår).

## 3. ECCAIRS Classification-dialogen

**`src/config/eccairsFields.ts`** — flytt tekst ut av konfigen til i18n:
- Legg til nye felter i typen: `labelKey: string`, `helpTextKey?: string`, `additionalTextFieldKey?: string`. Beholder `label`/`helpText` som fallback for eksisterende bruk under overgangen; komponenter går over til nøkler.
- `ECCAIRS_FIELD_GROUP_LABELS` konverteres til en oversettelses-oppslag `t('eccairs.groups.<group>')`. Beholder ikonene som de er.
- ~60 felt-labels + ~40 hjelpetekster + 10 gruppetitler → tilsvarende nye nøkler under `eccairs.fields.<code>.label|helpText` og `eccairs.groups.*` i **både** `no.json` og `en.json`. Engelske oversettelser skrives fra kilden (ECCAIRS-taksonomiens offisielle engelske betegnelser der de finnes; ellers naturlig oversettelse).

**`src/components/eccairs/EccairsMappingDialog.tsx`**
- Erstatt gjenværende norske toasts: «Forslag anvendt», «Klassifisering lagret», «Kunne ikke lagre klassifisering» → `t()`.
- Bruk nye `labelKey`/`helpTextKey`/gruppenøkler når felter rendres.
- `OCCURRENCE_CLASS_LABELS` og øvrige mappinger som vises i UI (hvis norske) løftes til `t()`.

**Øvrige eccairs-komponenter** (`EccairsSettingsDialog`, `EccairsEventTypeTreeSelect`, `EccairsPhaseOfFlightSelect`, `EccairsMultiSelect`, `EccairsTaxonomySelect`, `EccairsAttachmentUpload`, `EccairsEventTypeSelect`): gjennomgang for gjenværende norske strenger og bytt til `t()` der nødvendig (disse er stort sett allerede oversatt basert på scan).

## 4. Filer som endres

- `src/pages/Hendelser.tsx`
- `src/components/dashboard/IncidentDetailDialog.tsx`
- `src/components/dashboard/AddIncidentDialog.tsx`
- `src/components/dashboard/IncidentsSection.tsx`
- `src/components/eccairs/EccairsMappingDialog.tsx` (+ mindre justering i øvrige eccairs-komponenter ved behov)
- `src/config/eccairsFields.ts`
- `src/i18n/locales/no.json`
- `src/i18n/locales/en.json`

## 5. Verifikasjon

- `bunx tsgo --noEmit` passerer.
- Manuell sjekk: bytt språk via velgeren, åpne `/hendelser`, filtrer på hver status, åpne «Rediger», åpne ECCAIRS Classification-dialogen og bekreft at alle gruppetitler, feltlabels, hjelpetekster, knapper og toasts er på valgt språk.

## Ikke inkludert

- Endring av DB-verdier eller migrasjoner.
- Oversettelse av PDF-eksportmaler (håndteres separat om ønskelig).
- ECCAIRS-taksonomi-verdier hentet fra Supabase (`eccairs_values`) — disse leveres av backend og er utenfor scope.
