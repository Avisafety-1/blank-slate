## Mål

I opprett/rediger oppdrag-dialogen sier toggelen alltid "Del kontaktinfo (navn, telefon, e-post)", uavhengig av hva admin har skrudd på. Admin har granulær kontroll (Del navn / Del telefon / Del e-post). Toggelen i oppdragsdialogen skal vise hva som faktisk vil bli delt.

## Endringer

### 1. `src/hooks/useCompanySettings.ts`
- Legg til feltene `default_share_contact_name`, `default_share_contact_phone`, `default_share_contact_email` (alle `boolean`, default `true`) i interface, defaults og select-listen mot `companies`-tabellen. Disse finnes allerede i DB og brukes av `sync_mission_map_publication`-trigger.

### 2. `src/components/dashboard/MissionPublicationSection.tsx`
- Ta inn tre nye props: `shareName: boolean`, `sharePhone: boolean`, `shareEmail: boolean`.
- Bygg etiketten dynamisk fra de admin-aktiverte feltene, f.eks.:
  - alle tre på → "Del kontaktinfo (navn, telefon, e-post)"
  - bare telefon → "Del kontaktinfo (telefon)"
  - ingen → toggelen disables og viser "Admin deler ingen kontaktdetaljer" som hjelpetekst (toggelen blir meningsløs).
- Liten muted hjelpetekst under toggelen: "Admin har valgt å dele: navn, telefon" (lister kun aktive felter).

### 3. `src/components/dashboard/AddMissionDialog.tsx`
- Send `shareName/sharePhone/shareEmail` fra `companySettings` videre til `MissionPublicationSection`.

## Hva som ikke endres

- DB-trigger og kart-popup: respekterer allerede admin-flaggene per felt — ingen endring nødvendig.
- Admin-siden (`MapPublicationDefaultsCard`): allerede korrekt.
