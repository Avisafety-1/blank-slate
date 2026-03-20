

## Funn

### `notify_followup_assigned` (linje 148-168) — OK
Denne sender direkte til den spesifikke personen som er satt som oppfølgingsansvarlig (`recipientId`). Ingen bred selskapsfiltrering — dette er korrekt.

### `notify_new_incident` (linje 41-74) — SAMME PROBLEM
Denne har identisk feil som den gamle oppdragsgodkjennings-logikken:
- Linje 44-45: Legger til parent company ID i `incidentCompanyIds`
- Linje 47: Henter ALLE godkjente brukere fra begge selskaper
- Resultat: Alle brukere i morselskapet med `email_new_incident` på får varsel om hendelser i underavdelinger, uten noen form for scoping

### Plan: Stram inn `notify_new_incident`

**Fil:** `supabase/functions/send-notification-email/index.ts` (linje 41-51)

Endre logikken slik at:
1. Brukere i **samme selskap** som hendelsen alltid varsles (med `email_new_incident` på)
2. Brukere i **morselskapet** varsles KUN hvis de har `can_be_incident_responsible = true` i profilen sin (tilsvarende "all"-scoping for hendelser)
3. Brukere i andre selskaper varsles IKKE

Erstatt den brede `incidentCompanyIds`-logikken med:
```
// Hent brukere fra samme selskap
const { data: sameCompanyUsers } = await supabase
  .from('profiles').select('id')
  .eq('company_id', companyId).eq('approved', true);

// Hent parent-company brukere med incident-ansvar scope
let parentResponsibles: any[] = [];
if (incidentCompany?.parent_company_id) {
  const { data } = await supabase
    .from('profiles').select('id')
    .eq('company_id', incidentCompany.parent_company_id)
    .eq('approved', true)
    .eq('can_be_incident_responsible', true);
  parentResponsibles = data || [];
}

const eligibleUsers = [...(sameCompanyUsers || []), ...parentResponsibles];
```

### Fil som endres
- `supabase/functions/send-notification-email/index.ts` — stram inn `notify_new_incident` filtrering

