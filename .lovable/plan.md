## Årsak

`support@avisafe.no` har rollen **administrator**, ikke **superadmin**.

Når dashboardet laster, kjører `MissionsSection.tsx` (linje 73):

```ts
supabase.functions.invoke('auto-complete-missions').catch(console.error);
```

Denne edge-funksjonen er beskyttet med `requireCronOrSuperadmin` — den aksepterer kun cron-secret eller superadmin-JWT. For alle andre innloggede brukere returnerer den **403 "Insufficient role"**, som dukker opp i konsollen ved hver innlogging / dashboard-besøk.

Bekreftet i edge-loggen: `POST | 403 | /functions/v1/auto-complete-missions` rett etter login som support@avisafe.no.

## Løsning

Fjern klient-invokasjonen i `src/components/dashboard/MissionsSection.tsx`. Funksjonen er en vedlikeholdsjobb og skal kun kalles av pg_cron (eller manuelt av superadmin) — ikke ved hver dashboard-lasting.

```text
src/components/dashboard/MissionsSection.tsx
  - Fjern useEffect-blokken som kaller supabase.functions.invoke('auto-complete-missions')
  - Behold fetchMissions()
```

## Hvorfor ikke endre rollesjekken?

Auto-fullføring av oppdrag eldre enn 24t er en bakgrunnsjobb som ikke skal trigges av tilfeldige innlogginger — det belaster databasen unødvendig og er allerede dekket av cron. Å åpne den for alle brukere ville skjult bugs og økt last.

## Verifisering

Etter fix: logg inn som support@avisafe.no → ingen 403 i edge-loggen, ingen "Insufficient role" i konsollen.
