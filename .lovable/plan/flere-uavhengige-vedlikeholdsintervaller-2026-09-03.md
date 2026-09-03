# Flere uavhengige vedlikeholdsintervaller

I dag har hver drone/utstyr ett innebygd inspeksjonsintervall. Denne endringen gjør det mulig å legge til flere navngitte inspeksjoner per ressurs, hver med egen sjekkliste, egne intervaller (dager/timer/oppdrag), egne varselmarginer og eget e-postvarsel — helt uavhengig av dagens inspeksjon.

## Ny knapp: "Legg til ny inspeksjon"

- Plasseres i inspeksjonsseksjonen på drone- og utstyrskortet (rett under dagens "Inspeksjon og vedlikeholdsintervall").
- Åpner samme skjema som dagens inspeksjon: sjekkliste, startdato, intervall (dager), flytimer mellom, oppdrag mellom, varsel dager/timer/oppdrag — pluss et navnefelt (f.eks. "200-timers ettersyn").
- Den nye inspeksjonen kjører helt for seg selv: egen status, egen "sist utført", eget varsel. Dagens inspeksjon endres ikke.
- Hver ekstra inspeksjon kan redigeres og slettes fra samme kort.

## Lagre og gjenbruke innstillinger

- I skjemaet: "Lagre som mal" med navn. Malen lagres på selskapet (synlig for avdelinger i samme hierarki).
- Ved oppretting på en annen drone: nedtrekk "Hent fra mal" fyller alle feltene (navn, sjekkliste, intervaller, varselmarginer), som deretter kan justeres før lagring.

## Faner på /vedlikehold

- Over listen kommer en fanerad med intervallene: "Standard inspeksjon" + én fane per egendefinert inspeksjonsnavn som finnes på ressursene i valgt visning (Droner/Utstyr).
- Forhåndsvalgt fane er den som forfaller først (verste/nærmeste status på tvers av ressursene).
- Valgt fane styrer hva som vises: KPI-barene (flytimer / oppdrag / dager), statusfarge, "Utfør vedlikehold", "Nullstill" og sjekklistevalg gjelder da det intervallet. Ressurser uten det intervallet vises ikke i den fanen.
- Søk, avdelingsfilter, statusfilter, "Merk alle" og bulk-utkvittering fungerer som i dag, men mot valgt intervall.

## Teknisk

Database (migrasjoner med GRANT + RLS etter samme mønster som `drone_inspections`):

- `maintenance_schedules`: `id`, `company_id`, `drone_id` / `equipment_id` (én av dem), `navn`, `sjekkliste_id`, `interval_days`, `interval_hours`, `interval_missions`, `warn_days`, `warn_hours`, `warn_missions`, `start_date`, `last_performed_at`, `next_due_date`, `hours_at_last`, `missions_at_last`, `notification_sent`, `email_alerts_enabled`.
- `maintenance_schedule_presets`: selskapseide maler med samme innstillingsfelt + `navn`.
- Utførelser logges i `drone_inspections` / eksisterende utstyrslogg med ny nullbar `schedule_id`, så loggboken viser hvilken inspeksjon som ble utført.
- RLS: samme selskaps-/hierarkiregler som ressursen (`get_user_visible_company_ids`). Ingen endring i eksisterende policies.

Kode:

- Trekk inspeksjonsfeltene i `DroneFormFields.tsx` ut til gjenbrukbar `MaintenanceScheduleForm` som både dagens felt og ny dialog `MaintenanceScheduleDialog.tsx` bruker.
- `src/lib/maintenanceStatus.ts`: ny `calculateScheduleStatus()` som gjenbruker `calculateMaintenanceStatus` / `calculateUsageStatus` — ingen ny statuslogikk.
- `src/pages/Vedlikehold.tsx`: intervall-faner, valgt-intervall-avledet `MaintenanceItem`, utfør/nullstill mot `maintenance_schedules` når en egendefinert fane er valgt.
- `supabase/functions/check-maintenance-expiry`: utvides til også å gå gjennom `maintenance_schedules` og sende varsel med inspeksjonsnavnet i emnefeltet.
- Alle nye tekster via `t()` med nøkler i både `no.json` og `en.json`.
