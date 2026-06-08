## Mål
Vise ekstra "rolle"-badges på profilsiden for de funksjonelle rettighetene en bruker har: oppdragsgodkjenner, oppfølgingsansvarlig hendelser, ECCAIRS-tilgang og teknisk ansvarlig. Hver vises i samme badge-stil som "Administrator", men med en distinkt farge per rolle slik at de skilles fra system-rollen.

## Datakilder (allerede på profil)
Hentet via eksisterende `select("*")` mot `profiles` i `ProfileDialog.fetchUserData`:
- `can_approve_missions` + `approval_company_ids` (array av company-id, eller `['all']`)
- `can_be_incident_responsible` + `incident_responsible_company_ids`
- `can_access_eccairs`
- `is_technical_responsible`

## Endringer i `src/components/ProfileDialog.tsx`

1. **Ny state**: `extraRoleBadges: Array<{ key: string; label: string; className: string }>` (eller beregnet via `useMemo`).

2. **Hent avdelingsnavn** når brukeren har `approval_company_ids`/`incident_responsible_company_ids` som ikke er `['all']`:
   - Samle unike id-er fra begge listene.
   - Én spørring: `supabase.from("companies").select("id, navn").in("id", ids)`.
   - Bygg map `id → navn`.
   - Skjer i `fetchUserData` etter at profilen er lastet; lagre i `companyNameMap` state.

3. **Beregn badges** (i render under nåværende rolle-badge):
   - Godkjenner oppdrag: vises hvis `can_approve_missions === true`.
     - Label: `"Godkjenner oppdrag"` + parentes med avdelingsnavn, f.eks. `Godkjenner oppdrag (Alle avdelinger)` eller `Godkjenner oppdrag (Avd. A, Avd. B)`. Hvis ingen IDs satt: bare `Godkjenner oppdrag`.
     - Farge: emerald/grønn.
   - Oppfølgingsansvarlig hendelser: hvis `can_be_incident_responsible === true`, samme avdelings-format.
     - Farge: amber/oransje.
   - ECCAIRS-tilgang: hvis `can_access_eccairs === true`.
     - Farge: violet/lilla.
   - Teknisk ansvarlig: hvis `is_technical_responsible === true`.
     - Farge: sky/blå-cyan (forskjellig fra primary blå som brukes til Administrator).

4. **Render**: I `<div className="space-y-2">` for `profile.role` (ca. linje 1120–1131), legg badges i en `flex flex-wrap gap-2`:
   - Eksisterende `<Badge variant={getRoleBadgeVariant(userRole)}>` først.
   - Etterfølgende ekstra badges via `<Badge>` med `variant="outline"` overstyrt med fargeklasser via `className` (Tailwind tokens, ingen rene hex). Eksempel: `bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300`. Beholder rounded-pill-stilen fra shadcn Badge.

5. **Ingen badges**: Hvis brukeren ikke har noen ekstra rettigheter, vises bare den vanlige rolle-badgen (uendret oppførsel).

6. **i18n**: Bruk eksisterende norske strenger inline (samme som resten av filen som blander t() og hardkodet norsk).

## Ingen andre endringer
- Ingen databasemigrasjon — alle flagg eksisterer allerede på `profiles`.
- Ingen endringer i Admin-siden eller andre komponenter.
