

## Plan: La brukeren velge anonym rapportering per hendelse

### Mål
Når en bruker oppretter en hendelsesrapport, skal det være en avkrysningsboks "Rapporter anonymt".
- Hvis selskapet har **`hide_reporter_identity = true`** (global anonymitet på), vises ikke avkrysningsboksen — i stedet vises en informasjonstekst: "Denne rapporten sendes inn anonymt (selskapsinnstilling)."
- Hvis global er **av**, kan brukeren selv velge — standard er av (ikke anonym).

### Datamodell
Ny kolonne på `incidents`:
```sql
ALTER TABLE public.incidents
  ADD COLUMN reported_anonymously boolean NOT NULL DEFAULT false;
```
Ingen RLS-endring trengs — den følger eksisterende policyer.

### UI-endringer

**1. `src/components/dashboard/AddIncidentDialog.tsx`**
- Importere `useCompanySettings`.
- Ny lokal state `reportAnonymously` (bool, default `false`).
- I redigeringsmodus (`incidentToEdit`): forhåndsfyll fra `incidentToEdit.reported_anonymously`.
- Rendre i skjemaet (over/under "Rapportert av"-blokken):
  - Hvis `companySettings.hide_reporter_identity === true`: vis kun en `<p>`-info: *"Denne rapporten sendes inn anonymt (selskapsinnstilling)."* med ikon (Lock/EyeOff).
  - Hvis `false`: vis en `<Checkbox>` + label "Rapporter anonymt" og kort hjelpetekst "Navnet ditt vil ikke vises på rapporten".
- I `incidentData` legge til `reported_anonymously: companySettings.hide_reporter_identity || reportAnonymously` (slik at global twinger anonymitet, og per-rapport-valg respekteres ellers).
- Samme felt sendes med ved offline-kø og ved INSERT/UPDATE.

**2. `src/components/dashboard/IncidentDetailDialog.tsx`**
- Endre rendering av "Rapportert av" til å sjekke per-incident-flag i tillegg til selskapsinnstilling:
  ```tsx
  const isAnonymous =
    incident.reported_anonymously ||
    companySettings.hide_reporter_identity;
  const showName = !isAnonymous || (isAdmin && departmentsEnabled);
  ```
  Vis "Anonym" når `!showName`. Admin-/avdelings-overstyring beholdes uendret (admin kan fortsatt se identitet).

**3. `src/integrations/supabase/types.ts`**
- Auto-genereres etter migrasjonen — ingen manuell endring.

### Filer som endres
- **Ny migrasjon** — `incidents.reported_anonymously` boolean.
- `src/components/dashboard/AddIncidentDialog.tsx` — checkbox/info + send `reported_anonymously` ved insert/update/offline.
- `src/components/dashboard/IncidentDetailDialog.tsx` — bruk per-incident-flag i visningslogikken.

### UX-detaljer
- Standard: ikke anonym (må aktivt velges).
- Hvis global anonymitet er på: ingen valgmulighet, kun informasjonstekst — og `reported_anonymously` lagres som `true` uansett.
- Admins ser fortsatt identitet på anonyme rapporter når avdelings-funksjonen er aktivert (eksisterende oppførsel beholdes).
- Ingen brytende endring: eksisterende rapporter får `reported_anonymously = false` og vises som før (avhengig av selskapsinnstilling).

### Resultat
Brukeren får valgfri anonymitet per rapport når selskapet ikke har tvunget global anonymitet. Når global er på, kommuniseres dette tydelig i skjemaet, og rapporten lagres anonymt uten ekstra interaksjon.

