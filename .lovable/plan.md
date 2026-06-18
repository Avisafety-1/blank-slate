## Mål
Fjerne krasjen `cannot add 'postgres_changes' callbacks for realtime channel after subscribe` som oppstår etter oppgraderingen til `@supabase/supabase-js` 2.108. Beholde native passkey-støtten.

## Årsak
Den nye realtime-klienten returnerer en eksisterende kanal hvis `supabase.channel("static-name")` kalles med et navn som allerede finnes — og kaster hvis man da kjeder `.on('postgres_changes', ...)` etter at den gamle instansen allerede er subscribed. Dette skjer ved rute-navigasjon, tab-bytte (visibilitychange), eller når cleanup-funksjonen kjører litt etter at den nye mounten har startet.

Vi har ~25 statiske `postgres_changes`-kanalnavn i kodebasen som er sårbare.

## Løsning
Gi hver mount sitt eget unike kanalnavn ved å suffixere med `crypto.randomUUID()`. Cleanup-funksjonen river ned akkurat den instansen, og det blir aldri kollisjon.

Viktig presisering: **Kun** `postgres_changes`-kanaler endres. Broadcast- og presence-kanaler beholdes med statiske navn fordi de er avhengig av at alle instanser lytter på samme kanalnavn.

### Steg 1 — Ny hjelpefunksjon
Lag `src/lib/realtimeChannel.ts`:

```ts
import { supabase } from "@/integrations/supabase/client";

/**
 * Lager en realtime-kanal med et garantert unikt navn per mount.
 * Forhindrer "cannot add postgres_changes callbacks" feilen fra
 * @supabase/realtime-js >=2.11 ved kollisjon mellom mount/unmount-sykluser.
 * Brukes KUN for postgres_changes-kanaler, ikke for broadcast/presence-kanaler.
 */
export function createUniqueChannel(baseName: string) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return supabase.channel(`${baseName}-${suffix}`);
}
```

### Steg 2 — Bytt ut statiske navn på postgres_changes-kanaler
Endre `supabase.channel("name")` → `createUniqueChannel("name")` i følgende filer (alle har allerede korrekt cleanup med `removeChannel`):

- `src/hooks/useDashboardRealtime.ts` (2 kanaler)
- `src/hooks/useSoraApprovalEnabled.ts`
- `src/hooks/useFlightTimer.ts`
- `src/hooks/useOppdragData.ts`
- `src/pages/Resources.tsx`
- `src/pages/Hendelser.tsx`
- `src/pages/Kalender.tsx`
- `src/pages/Documents.tsx`
- `src/pages/Admin.tsx` (kun `admin-profiles-changes` og `admin-roles-changes`)
- `src/contexts/AuthContext.tsx` (kanalen har `${user.id}`-suffiks; gjøres helt unik per mount)
- `src/components/OpenAIPMap.tsx`
- `src/components/PendingApprovalsBadge.tsx`
- `src/components/dashboard/KPIChart.tsx`
- `src/components/dashboard/IncidentDetailDialog.tsx` (har `${incident.id}`-suffiks; gjøres unik likevel)
- `src/components/resources/PersonCompetencyDialog.tsx`
- `src/components/resources/EquipmentDetailDialog.tsx`
- `src/components/resources/DroneDetailDialog.tsx`
- `src/components/admin/CustomerManagementSection.tsx`
- `src/components/admin/CompanyManagementSection.tsx`
- `src/components/admin/ChildCompaniesSection.tsx`
- `src/lib/mapSafeSky.ts`

### Steg 3 — Ikke endre broadcast-/presence-kanaler
Disse beholdes med statiske navn:
- `global-force-reload` (4 bruksteder i `src/pages/Admin.tsx` + `src/hooks/useForceReload.ts`) — brukes for cross-tab broadcast og krever felles kanalnavn.
- `presence-room` (`src/hooks/usePresence.ts`) — presence-kanal uten postgres_changes.

### Steg 4 — Verifisering
- Sjekk hver berørt useEffect for korrekt `removeChannel(channel)` i cleanup.
- Test i preview: naviger frem og tilbake mellom Dashboard ↔ Oppdrag ↔ Hendelser ↔ Admin flere ganger raskt.
- Test i produksjon etter publish: logg inn, naviger, sett fanen i bakgrunnen og bytt tilbake.

## Teknisk omfang
- 1 ny fil (~15 linjer)
- ~25 enkle search-replace-endringer (en `import` + en funksjonsbytte per fil)
- Ingen DB-endringer, ingen edge-funksjon-endringer, ingen avhengighetsendringer
- Total risiko: lav. Hver postgres_changes-kanal blir unik per mount, cleanup er allerede på plass.

## Hva som IKKE endres
- Passkey-implementasjonen (Supabase native)
- Edge-funksjoner
- Database / RLS
- `@supabase/supabase-js`-versjon
- Broadcast- og presence-kanaler (statiske navn beholdes)
