# Autofyll pilot + drone-ressurser ved nytt oppdrag

## Mål

Når et nytt oppdrag opprettes (fra `/oppdrag`, `/kart` eller andre innganger via `AddMissionDialog`), skal følgende skje automatisk i opprett-modus (ikke ved redigering, og kun når feltene er tomme):

1. **Pilot**: Innlogget bruker legges til i `selectedPersonnel` (rolle står tom — brukeren velger selv).
2. **Droner**: Alle droner brukeren er tilknyttet via `drone_personnel` legges til i `selectedDrones`.
3. **Utstyr**: Alt utstyr koblet til disse dronene via `drone_equipment` legges til i `selectedEquipment`.
4. **Dokumenter**: Alle dokumenter koblet til disse dronene via `drone_documents` legges til i `selectedDocuments`.

## Hvor

Kun `src/components/dashboard/AddMissionDialog.tsx`. Ingen DB-endringer, ingen RLS, ingen endring i `Oppdrag.tsx` / `Kart.tsx` — disse bruker allerede samme dialog.

## Endring

I `useEffect`-en som kjører når `open` blir true (rundt linje 183–295), i grenen som behandler **opprettelse uten initialdata** (`else`-blokken ved linje 271), legg til en ny async-funksjon `autofillFromCurrentUser()` som:

1. Henter `auth.getUser()`.
2. Henter brukerens profil-id (allerede tilgjengelig fra `user.id`).
3. Setter `selectedPersonnel = [user.id]`.
4. Spør `drone_personnel` etter `drone_id` der `profile_id = user.id`.
5. Hvis treff: setter `selectedDrones` til alle disse ID-ene, og parallelt:
   - `drone_equipment.equipment_id` for disse `drone_id`-ene → `selectedEquipment`
   - `drone_documents.document_id` for disse `drone_id`-ene → `selectedDocuments`
6. Bruker dedupliserte sett (Set) for å unngå duplikater.

Samme autofyll-logikk må også gjelde grenen `else if (initialFormData || initialRouteData)` (linje 226) — der bruker kommer tilbake fra rute-planlegger uten å ha valgt personell/drone manuelt. Bare fyll inn felt som ikke allerede er satt via `initial*`-props.

Skal IKKE kjøre når `mission` er satt (redigeringsmodus).

## Tekniske detaljer

- Alle queries respekterer RLS — brukeren ser uansett bare egne ressurser. `drones`-listen som brukes i UI er allerede begrenset av `aktiv = true`. Vi bør filtrere autofylte droner mot den allerede hentede `drones`-state (etter `fetchDrones`) for å unngå å auto-attache inaktive droner. Enkleste rekkefølge: gjør `fetchDrones`/`fetchEquipment`/`fetchDocuments` først, vent på dem, og kjør så autofyll mot resultatene.
- Bruk `Promise.all` for parallell-henting.
- Ingen toast — autofyll skal være stille. Brukeren ser bare at felt allerede er fylt ut og kan fjerne/endre fritt før lagring.

## Verifisering

1. Logg inn som bruker tilknyttet én drone med utstyr og dokumenter → opprett nytt oppdrag fra `/oppdrag`: pilot, drone, utstyr og dokumenter er forhåndsutfylt.
2. Samme fra `/kart` (via route planner): autofyll skjer på samme måte.
3. Rediger eksisterende oppdrag: ingen autofyll, eksisterende valg beholdes uendret.
4. Bruker uten drone-tilknytning: kun pilot fylles ut.
5. Fjerne en autofylt drone manuelt før lagring → fjerning fungerer som vanlig.
