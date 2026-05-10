## Mål

Utvide admin-touren slik at hver fane (1) faktisk åpnes via klikk, (2) får 3–6 dyptgående steg som dekker alle hovedfunksjonene, og (3) ingen superadmin-spesifikke ting tas med. «Mitt selskap» beholdes (admin-tilgjengelig). «Selskaper»-fanen, NOTAM RSS, Kalkulator og Tving oppdatering forblir utelatt.

## Endringer

### 1. `src/pages/Admin.tsx` — flere `data-tour`-ankere

Legge til ankere på underseksjoner som touren skal peke på (uten å røre superadmin-blokker):

- Brukere-fanen: `admin-approved-search` (søkefelt), `admin-approved-mailcopy` (kopier-mailliste-knapp), `admin-user-card` (første kort), og inne i åpnet kort: `admin-user-role`, `admin-user-department`, `admin-user-approver`, `admin-user-technical`, `admin-user-incident`, `admin-user-eccairs`, `admin-user-training-modules`, `admin-user-under-training`, `admin-user-delete`
- E-post: `admin-email-templates`, `admin-email-settings-btn`, `admin-email-bulk`
- SORA: `admin-sora-flightgeo`, `admin-sora-altitude`, `admin-sora-mitigations` (ankere inne i `CompanySoraConfigSection`)
- Mitt selskap: `admin-child-info`, `admin-child-departments`, `admin-child-checklists`, `admin-child-integrations`, `admin-child-propagation` (ankere inne i `ChildCompaniesSection`)
- Opplæring: `admin-training-courses`, `admin-training-assign`, `admin-training-status`, `admin-training-ai` (ankere inne i `TrainingSection`)
- Kunder: `admin-customers-add`, `admin-customers-list` (i `CustomerManagementSection`)

Ingen ankere legges på superadmin-only `TabsTrigger value="companies"`, `notam-feeds`, `calculator` eller `ForceReloadBanner`.

### 2. `src/tours/adminTour.ts` — utvide til ~38 steg

For hver fane brukes mønsteret:
1. `clickTab` i `beforeStep` for å åpne fanen
2. Et oversiktssteg på selve `TabsContent`
3. 3–5 detaljsteg på enkelt-elementer i fanen (alle med `requiresAdmin: true`)
4. Bruk `optional: true` på elementer som kan være skjult (registreringskode, ventende, SORA-felt, kunde-elementer i tomme lister)

Konkret oppdeling:

- **Intro + Tabs** (2 steg)
- **Brukere** (8 steg): registreringskode (optional) → inviter ny → ventende godkjenninger (optional) → godkjente-toppen (søk/mailkopi) → åpne første brukerkort (`beforeStep` klikker `admin-user-card`) → rolle/avdeling → bryterne (godkjenner/teknisk/hendelsesansv./ECCAIRS) → opplæringsmoduler + under opplæring + slett
- **Kunder** (3 steg): tab-overskrift → legg til ny kunde → kundelisten (delte fra morselskap nevnes)
- **E-post** (4 steg): tab → maler → e-postinnstillinger (avsender/SMTP) → bulk-utsending + historikk
- **SORA** (4 steg, hele blokken `optional` via `hasAddon`-gate): tab → standard flygeområde → høydegrenser → avbøtende tiltak/standarder
- **Mitt selskap** (5 steg): tab → selskapsinfo & terminologi → avdelinger/datterselskap → standard sjekklister → integrasjoner (FH2/ECCAIRS/DroneTag) → granulær propagering
- **Opplæring** (5 steg): tab → kursbygger (manuell) → AI-kursgenerator → tildeling → status/score
- **Avslutning** (1 steg): oppsummering, RLS/sletting-advarsel, `clickTab` tilbake til Brukere

`beforeStep` for kort som må åpnes (f.eks. brukerkort) klikker elementet og venter ~400ms før neste selector søkes opp. Alle `selector`s peker på eksisterende `data-tour`-ankere; ingen tekstmatching.

### 3. Ingen endringer i

- `GuidedTourProvider.tsx` (allerede filtrerer `requiresAdmin`)
- `StartTourButton.tsx` (filtrerer allerede admin-touren bort fra ikke-admins)
- `tourDefinitions.ts` / `types.ts` (admin-tour er allerede registrert)

### Tekniske detaljer

- Alle nye steg får `requiresAdmin: true` så ikke-admins ser dem ikke i det hele tatt
- Steg som peker på elementer som kan være skjult avhengig av tilstand (f.eks. ingen ventende brukere, tom kundeliste, SORA-tillegg ikke aktivt, ingen avdelinger) får `optional: true` slik at de hoppes over stille
- `clickTab`-helper beholdes; nytt `clickAndWait(selector, ms=400)`-helper for å åpne brukerkort før neste steg
- Ingen DB- eller backendendringer
