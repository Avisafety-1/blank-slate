

# Legg til DJI-konto innlogging i flylogg-dialogen

## Oversikt
Etter at brukeren klikker "Last opp DJI-flylogg", får de et valg mellom to metoder:
1. **Last opp fil** (eksisterende funksjonalitet)
2. **Logg inn med DJI-konto** (nytt) -- henter flylogger direkte fra DJI-skyen

## Brukerflyt

```text
[Last opp DJI-flylogg]
        |
   +---------+---------+
   |                   |
 Last opp fil     DJI-innlogging
 (som i dag)      (e-post + passord)
                       |
                  Hent flylogger
                       |
                  Velg flylogg fra liste
                       |
                  Behandle valgt logg
                       |
                  Resultat-visning (som i dag)
```

## Endringer

### 1. Edge function: Ny DJI-innlogging og logg-henting (`process-dronelog/index.ts`)

Legg til to nye ruter basert på request body:

- **`action: "dji-login"`** -- Sender e-post/passord til `POST /api/v1/accounts/dji`, returnerer `accountId`
- **`action: "dji-list-logs"`** -- Henter flylogger via `GET /api/v1/logs/{accountId}`, returnerer liste
- **`action: "dji-process-log"`** -- Henter en spesifikk logg via URL og prosesserer den via `POST /api/v1/logs`

### 2. Frontend: Oppdater `UploadDroneLogDialog.tsx`

- Legg til et nytt steg `method` som vises etter dialogen åpnes -- to knapper: "Last opp fil" og "DJI-konto"
- Ved valg av DJI-konto:
  - Vis innloggingsskjema (e-post + passord)
  - Etter innlogging, vis liste over flylogger fra DJI-kontoen med dato, varighet og dronemodell
  - Bruker velger en logg fra listen
  - Loggen prosesseres og vises i eksisterende resultat-visning

### 3. Steg-flyt i dialogen

| Steg | Innhold |
|------|---------|
| `method` | Velg metode: fil-opplasting eller DJI-konto |
| `upload` | Eksisterende fil-opplasting (uendret) |
| `dji-login` | E-post + passord-skjema for DJI |
| `dji-logs` | Liste over flylogger fra DJI-kontoen |
| `result` | Resultat-visning med match/opprett (uendret) |

## Tekniske detaljer

### Edge function -- nye handlinger

```typescript
// I POST-handleren, sjekk for action-felt i JSON body:
// action: "dji-login" -> POST /api/v1/accounts/dji
// action: "dji-list-logs" -> GET /api/v1/logs/{accountId}
// action: "dji-process-log" -> POST /api/v1/logs med URL + felter
```

Skiller mellom JSON-body (nye DJI-handlinger) og FormData (eksisterende fil-opplasting) basert på `Content-Type`-headeren.

### Sikkerhet
- DJI-legitimasjon sendes kun gjennom edge-funksjonen, aldri lagret
- Passord vises med `type="password"` i skjemaet
- accountId holdes kun i komponent-state under sesjonen

### Filer som endres
1. `supabase/functions/process-dronelog/index.ts` -- Nye handlinger for DJI-innlogging og logg-henting
2. `src/components/UploadDroneLogDialog.tsx` -- Nytt metodevalg-steg, DJI-innloggingsskjema og logg-liste

