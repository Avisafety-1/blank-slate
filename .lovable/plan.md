# Kvittere ut loggbok-avvik på droner og utstyr

Batteri 2 / SERIAL-saken legges død — ingenting er endret i den flyten, alt fungerer som før.

## Hva som faktisk skjer i dag (verifisert)

Dronen «Demodrone – SAR61» (DJI Matrice 350 RTK) står med `status = Rød` i databasen, satt av flyloggimporten da avviket «Uventet høydeendring» ble registrert. Importen skriver både en loggbokoppføring (`entry_type = 'Advarsel'`) og setter `drones.status`.

To konkrete hindre i koden:

1. **Knappen skjules når en annen advarsel er like alvorlig.** I `DroneDetailDialog` vises «Kvitter ut advarsel» kun når loggstatusen er *strengt verre* enn vedlikeholdsstatusen. Er begge gule (f.eks. gult avvik + inspeksjon som forfaller), forsvinner knappen helt og du får bare en kursivert hjelpetekst. Nøyaktig det du mistenkte. Samme mønster gjelder utstyr.
2. **Kvitteringen kan bli blokkert av tilgangsregler.** `UPDATE`-policyen på `drones` krever `company_id = get_user_company_id(auth.uid())` — altså brukerens *egen* avdeling, ikke hele hierarkiet. Denne dronen ligger på «Moderavdeling». Ser du dronen fra en annen avdeling (som du kan, fordi SELECT går via hele hierarkiet), er statusoppdateringen avvist. Knappen svarer da uten synlig effekt utover en feilmelding som lett drukner.

## Endringer

### 1. Knappen vises alltid når det finnes en aktiv loggadvarsel

- Vis «Kvitter ut advarsel» så snart `status` fra databasen er gul eller rød — uavhengig av vedlikeholdsstatus.
- Behold hjelpeteksten, men som forklaring ved siden av knappen: «Vedlikeholdsvarsler forsvinner ikke ved kvittering — de må lukkes ved inspeksjon/vedlikehold.»
- Etter kvittering viser statusforklaringen kun de gjenværende årsakene (inspeksjon, tilknyttet batteri osv.).
- Samme oppførsel for utstyr i `EquipmentDetailDialog`, slik at et batteriavvik kan kvitteres ut på samme måte.

### 2. Kvittering fungerer på tvers av avdelinger

- Ny `SECURITY DEFINER`-funksjon `acknowledge_resource_warning(_resource_type, _resource_id)` som setter status til Grønn og skriver kvitteringen i loggboken i én operasjon.
- Funksjonen tillater kvittering når brukeren er admin/superadmin eller teknisk ansvarlig **og** ressursen ligger innenfor `get_user_visible_company_ids(auth.uid())`. Ingen eksisterende policy endres eller utvides — dagens direkte `UPDATE`-regler står urørt.
- Dialogene kaller funksjonen i stedet for direkte `update`, og viser en tydelig feilmelding hvis den nekter.

### 3. Tydeligere tilbakemelding

- Suksess: toast + umiddelbar oppdatering av kortet og listen.
- Feil: toast som sier hvorfor (manglende rettighet) i stedet for en generisk melding.

## Teknisk

- Migrasjon: ny funksjon `public.acknowledge_resource_warning(text, uuid)` (`SECURITY DEFINER`, `set search_path = public`), `REVOKE EXECUTE ... FROM public`, `GRANT EXECUTE ... TO authenticated`. Skriver `drones.status`/`equipment.status` til `'Grønn'` og setter inn rad i `drone_log_entries`/`equipment_log_entries` med `entry_type = 'Kvittering'`. Ingen tabell- eller policyendringer.
- `src/components/resources/DroneDetailDialog.tsx`: endre visningsbetingelsen for kvitteringsknappen, bytt `supabase.from('drones').update(...)` + manuell logginnsetting mot `supabase.rpc('acknowledge_resource_warning', ...)`.
- `src/components/resources/EquipmentDetailDialog.tsx`: samme knapp og kall for utstyr.
- Nye i18n-nøkler i både `no.json` og `en.json` for hjelpetekst og feilmelding.
