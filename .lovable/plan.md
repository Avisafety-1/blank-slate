## Årsak

Når en flylogg lagres trigges `checkFlightAlerts` i `UploadDroneLogDialog`. Den kaller `send-notification-email` med rå `htmlContent` (selve varselmailen er bygd i klienten), uten å sette `type`. Edge-funksjonen blokkerer dette med 403 fordi `htmlContent` kun er tillatt for admin/superadmin-typer — for å hindre at vanlige brukere sender vilkårlig HTML under selskapets brand. Piloter er ikke admin, så hver gang en pilot laster opp en logg som overskrider en terskel, returnerer funksjonen 403.

## Løsning

Flytt HTML-genereringen til serveren og introduser en ny company-scoped type `notify_flight_alert`. Klienten skal bare sende strukturerte data (drone, pilot, dato, brudd-strenger og mottakerliste fra `get_effective_flight_alert_config`), aldri rå HTML.

### `supabase/functions/send-notification-email/index.ts`

1. Legg til `'notify_flight_alert'` i `COMPANY_SCOPED_TYPES` (krever innlogget bruker som tilhører `companyId`, ikke admin).
2. Ny håndterer for `type === 'notify_flight_alert'`:
   - Validerer payload: `companyId`, `droneName`, `pilotName`, `flightDate`, `violations: string[]` (maks ~20, hver ≤ 200 tegn — escape før render), og `recipientEmails: string[]` valgfritt.
   - Authcheck: `requireUser` + `assertUserInCompany(caller, companyId)` (gjøres allerede av den eksisterende `COMPANY_SCOPED_TYPES`-grenen).
   - Henter mottakere selv via `get_effective_flight_alert_config(companyId)` + `profiles` (samme spørringer som klienten gjør i dag) — ignorerer `recipientEmails` fra klient for å unngå at noen sender mail til vilkårlige adresser.
   - Bygger samme HTML-mal som klienten har i dag (samme styling, logo, header, violation-bokser) inne i edge-funksjonen, med strenge-escaping av alle felter.
   - Sender én mail per mottaker via samme sende-mekanisme som de andre typene allerede bruker i denne filen.
3. Ingen endring i `htmlContent`-guarden — den fortsetter å beskytte mot fri-form HTML fra ikke-admin brukere.

### `src/components/UploadDroneLogDialog.tsx`

`checkFlightAlerts` (linje ~2104–2209):
- Fjern HTML-templaten og recipient-loopen som kaller funksjonen én gang per epost.
- Erstatt med ett enkelt kall:
  ```ts
  await supabase.functions.invoke('send-notification-email', {
    body: {
      type: 'notify_flight_alert',
      companyId,
      droneName,
      pilotName,
      flightDate,
      violations,
    },
  });
  ```
- Beholder fortsatt `violations`-beregning og early-return når lista er tom.

### Ingen DB-endring

`get_effective_flight_alert_config` finnes allerede; ingen migrering.

## Resultat

- 403-feilen forsvinner — piloter trigger en company-scoped type uten å sende HTML.
- Brand-HTML kontrolleres helt server-side; misbruk via `htmlContent` fra vanlige brukere er fortsatt blokkert.
- Klient-koden blir enklere (ingen 90-linjer HTML-template i React-filen).
