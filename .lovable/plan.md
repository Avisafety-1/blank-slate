

# Plan: Kalendersynkronisering med telefon (filtrert på company_id)

## Oversikt
Implementerer kalendereksport til telefon (Google Calendar, Apple Calendar, Samsung Calendar) via standard iCalendar-format (.ics). All data filtreres automatisk på company_id via eksisterende RLS-policies.

## Viktig: Datasikkerhet
Data er allerede isolert per selskap fordi:
1. Alle Supabase-tabeller (calendar_events, missions, documents, drones, equipment, incidents, drone_accessories) har RLS-policies som filtrerer på `company_id = get_user_company_id(auth.uid())`
2. Edge function vil bruke brukerens auth token for å hente data, slik at RLS automatisk gjelder
3. Ingen endringer i databasen trengs

---

## Teknisk implementering

### Del 1: ICS-hjelpefunksjon (`src/lib/icsExport.ts`)

Ny fil som håndterer konvertering til iCalendar-format:

```typescript
export interface CalendarEventExport {
  id: string;
  title: string;
  description?: string;
  startDate: Date;
  endDate?: Date;
  type: string;
}

export function generateICSContent(events: CalendarEventExport[], companyName: string): string
export function downloadICSFile(content: string, filename: string): void
```

Funksjoner:
- Genererer standard ICS-format (RFC 5545)
- Inkluderer VTIMEZONE for norsk tid
- Setter riktig PRODID med selskapsnavn
- Håndterer heldagshendelser vs. tidspunktbaserte

### Del 2: Eksport-dialog (`src/components/dashboard/CalendarExportDialog.tsx`)

Ny dialog-komponent med:
- "Last ned alle hendelser"-knapp som genererer .ics-fil
- Forklarende tekst om hvordan man importerer til ulike kalenderapper
- Viser antall hendelser som vil eksporteres
- Datointervall-velger (valgfritt: neste 30/90/365 dager)

### Del 3: Integrasjon i Kalender.tsx

Legger til synkroniseringsknapp ved siden av "Legg til oppføring":

```
[📥 Synkroniser]  [+ Legg til oppføring]
```

Knappen åpner CalendarExportDialog.

---

## Filer som opprettes/endres

| Fil | Endring |
|-----|---------|
| `src/lib/icsExport.ts` | **NY** - ICS-format generering og nedlasting |
| `src/components/dashboard/CalendarExportDialog.tsx` | **NY** - Dialog med eksport-alternativer |
| `src/pages/Kalender.tsx` | Legge til synkroniseringsknapp og dialog |

---

## Datakilder som inkluderes

Kalenderhendelsene hentes fra følgende tabeller (alle med RLS på company_id):

1. **calendar_events** - Egendefinerte hendelser
2. **missions** - Oppdrag (tidspunkt)
3. **incidents** - Hendelser (hendelsestidspunkt)
4. **documents** - Dokumenter som utløper (gyldig_til)
5. **drones** - Drone-inspeksjoner (neste_inspeksjon)
6. **equipment** - Utstyrsvedlikehold (neste_vedlikehold)
7. **drone_accessories** - Tilbehørsvedlikehold (neste_vedlikehold)

---

## ICS-filformat

Eksempel på generert fil:
```text
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//AviSafe//Drone Management v1.0//NO
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:AviSafe Kalender
BEGIN:VEVENT
UID:mission-abc123@avisafe.no
DTSTAMP:20260130T120000Z
DTSTART:20260201T090000Z
DTEND:20260201T120000Z
SUMMARY:Inspeksjon kraftlinjer
DESCRIPTION:Oppdrag - Kunde: Energiselskapet
CATEGORIES:Oppdrag
END:VEVENT
END:VCALENDAR
```

---

## Brukeropplevelse

1. Bruker klikker "Synkroniser"-knappen i kalenderen
2. Dialog åpnes med informasjon om eksport
3. Bruker velger tidsperiode (standard: alle fremtidige hendelser)
4. Klikker "Last ned kalender"
5. .ics-fil lastes ned
6. Bruker åpner filen på telefon/PC - kalenderappen tilbyr å importere

### Importveiledning i dialogen:
- **iPhone**: Åpne filen i Filer-appen, velg "Del" og så "Kalender"
- **Android/Samsung**: Åpne filen, Google Kalender åpner automatisk
- **Google Calendar (web)**: Innstillinger → Importer og eksporter → Importer

---

## Forventet resultat

- Brukere kan eksportere sin bedrifts kalenderhendelser til personlig kalender
- Data er alltid filtrert på company_id (via RLS)
- Støtter alle store kalenderapper
- Enkel én-knapps nedlasting uten komplisert oppsett
- Ingen tredjepartsbiblioteker nødvendig

