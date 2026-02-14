

## Automatisk utlogging ved inaktivitet

### Hva skal bygges
En idle-timeout-funksjon som automatisk logger ut brukere etter 60 minutter uten aktivitet. En advarselsdialog vises 5 minutter for utlogging, slik at brukeren kan velge a forlenge sesjonen.

### Brukeropplevelse
1. Brukeren jobber normalt i appen -- timeren nullstilles ved klikk, tastetrykk, scrolling og touch
2. Etter 55 minutter uten aktivitet vises en advarselsdialog: "Du blir logget ut om 5 minutter pa grunn av inaktivitet"
3. Brukeren kan klikke "Forleng sesjon" for a nullstille timeren
4. Hvis brukeren ikke reagerer innen 5 minutter, logges de automatisk ut og sendes til innloggingssiden
5. Under aktive flyturer (active_flights) deaktiveres idle-timeout midlertidig for a unnga utlogging midt i en operasjon

### Unntak
- Idle-timeout er deaktivert nar brukeren er offline (for a unnga utlogging uten nettilgang)
- Idle-timeout er deaktivert under aktive flyturer knyttet til brukeren

---

### Teknisk plan

**Ny fil: `src/hooks/useIdleTimeout.ts`**
- Custom hook som lytter pa `mousemove`, `keydown`, `scroll`, `touchstart`, `click` events
- Bruker `setTimeout` for advarsel (55 min) og utlogging (60 min)
- Returnerer `{ showWarning, remainingSeconds, extendSession }`
- Sjekker `navigator.onLine` -- hopper over timeout nar offline
- Sjekker om brukeren har aktive flyturer via en enkel query mot `active_flights`-tabellen

**Ny fil: `src/components/IdleTimeoutWarning.tsx`**
- AlertDialog som viser nedtelling til utlogging
- Knapper: "Forleng sesjon" og "Logg ut na"
- Nedtelling vises i sanntid (sekunder)

**Endring: `src/App.tsx`**
- Legge til `IdleTimeoutWarning`-komponenten inne i `AuthenticatedLayout`, slik at den kun er aktiv for innloggede brukere

