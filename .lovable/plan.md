Jeg fant at dokumentmodalen kun bruker `isAdmin` for å vise «Slett» og «Lagre». Derfor kan en admin i et mottakerselskap se aktive redigerings-/sletteknapper for dokumenter som er delt fra Avisafe/foreldreselskap, selv om RLS trolig vil blokkere selve slettingen hvis dokumentets `company_id` ikke er deres aktive selskap. UI-et bør likevel være tydelig og sperre dette.

Plan:

1. Skille mellom administrator og eier av dokument
   - I `Documents.tsx` beregnes om dokumentet tilhører aktivt selskap: `document.company_id === companyId`.
   - Send denne informasjonen videre til `DocumentCardModal`.
   - Utvid Document-typen slik at `company_id`, `company_name`, `visible_to_children` og `global_visibility` håndteres tydelig i UI.

2. Gjøre delte dokumenter skrivebeskyttet
   - I `DocumentCardModal` settes redigering/sletting kun tilgjengelig når:
     - bruker er admin, og
     - dokumentet eies av aktivt selskap, eller bruker er superadmin.
   - For dokumenter delt fra Avisafe/annet selskap skal modal være read-only:
     - ingen «Slett»-knapp
     - ingen «Lagre»-knapp
     - ingen filopplasting eller redigerbare felt
     - fortsatt mulig å åpne/lese dokument og lenker
   - Legg inn en kort forklaring i modal, f.eks. «Dette dokumentet er delt fra [selskap] og kan ikke endres eller slettes her.»

3. Sikre at sletting ikke kan trigges feil
   - `handleDelete` får en ekstra guard som avbryter hvis dokumentet ikke kan administreres.
   - `onSubmit` får samme guard, slik at delt dokument ikke kan oppdateres ved feil i UI-state.

4. Gjøre mappehandlinger konsekvente
   - `FolderGrid` har allerede `inherited` for mapper eid av annet selskap, men `FolderDetailDialog` får bare `isAdmin` og viser derfor slett/rediger/endre innhold for delte mapper.
   - Send `folder.company_id`/`inherited` inn i `FolderDetailDialog`.
   - Skjul/deaktiver mappehandlinger for arvede mapper:
     - slett mappe
     - endre navn
     - legge til/fjerne dokumenter
     - endre faner
     - endre «Synlig for alle avdelinger»
   - Dokumenter i delte mapper kan fortsatt åpnes.

5. Valider mot eksisterende RLS
   - Behold server-side sikkerhet som siste barriere: dokument-DELETE-policyene er allerede begrenset til `company_id = get_user_company_id(auth.uid())` eller superadmin.
   - Ingen databaseendring er nødvendig med mindre vi finner at folder-RLS også tillater sletting av arvede mapper; i så fall strammes tilsvarende policy i en migrasjon.

Resultat:
- Mottakerselskaper kan lese delte dokumenter, men ikke redigere eller slette dem.
- UI-et viser ikke lenger en aktiv sletteknapp for dokumenter eller mapper som eies av annet selskap.
- Superadmin beholder nødvendig overstyring.