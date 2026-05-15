## Problem

Norconsult-admin (Jan Amund / Joakim) ligger i morselskapet **Norconsult Norge AS**. Tryggve Leigland Njaa ligger i underavdelingen **Sandvika**. Edge-funksjonen `admin-delete-user` har en hard sjekk:

```
requesterProfile.company_id !== targetProfile.company_id  →  403 Forbidden
```

Den respekterer ikke selskaps­hierarkiet (`get_user_visible_company_ids`), som ellers brukes overalt for parent → child synlighet. Resultatet: en gyldig parent-admin får 403, og frontend viser den generiske meldingen *"Edge Function returned a non-2xx status code"*.

Jeg verifiserte:
- Tryggve har ingen blokkerende FK-referanser (incidents, mission_personnel, flight_logs osv. = 0).
- Sandvika har 0 lokale administratorer — eneste admins er på morselskapet.
- Andre admin-funksjoner i appen aksepterer parent-admins for child-brukere via `get_user_visible_company_ids`.

## Løsning

Bytt ut likhets­sjekken i `supabase/functions/admin-delete-user/index.ts` med samme hierarki­regel som resten av systemet:

1. Hent requester sitt sett av synlige `company_id` via RPC `get_user_visible_company_ids(_user_id)` (allerede SECURITY DEFINER, brukes av flere edge-funksjoner og `_shared/companyScope.ts`).
2. Hent target sin `company_id` fra `profiles`.
3. Tillat sletting hvis `targetProfile.company_id` er i settet, eller requester er superadmin (eksisterende bypass beholdes).
4. Returner fortsatt 403 med tydelig `detail: "Target user is outside requester's company hierarchy"` ellers, så vi får bedre feilsøkings­info i loggen.

Ingen DB-migrasjon nødvendig — kun edge-funksjonsendring. `delete-own-account` er ikke berørt (bruker sletter seg selv).

## Etterpå

- Re-test sletting av Tryggve som Norconsult-admin.
- Vurdere om vi skal vise mer informativ feiltekst i `Admin.tsx` når funksjonen returnerer `data.detail` (er allerede støttet via `data?.detail`-fallback, så det burde dukke opp neste gang).
