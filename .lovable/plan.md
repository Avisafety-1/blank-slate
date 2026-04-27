Plan for å fikse at «Kan ikke godkjenne egne oppdrag» ikke vises hos Avisafe/superadmin:

1. Flytt innstillingen til en mer robust plassering i UI
- Plasser bryteren rett under «Oppdrag krever godkjenning» i `ChildCompaniesSection`, men uten anonym IIFE/inline-blokk som kan være sårbar for render-/HMR-avvik.
- Bruk samme visuelle mønster som de andre selskapsinnstillingene.

2. Gjør innstillingen alltid synlig, men forklar avhengigheten
- Bryteren skal vises selv om «Oppdrag krever godkjenning» er av.
- Teksten skal tydelig si at den brukes når oppdrag sendes til godkjenning og hindrer flyger/personell i å godkjenne eget oppdrag.

3. Behold arvelogikken for underavdelinger
- Hvis morselskap har «Gjelder for alle underavdelinger» aktivert, skal avdelingen se låst verdi med «Arvet fra ...».
- Ved endring hos morselskap skal `prevent_self_approval` propageres sammen med de andre selskapsinnstillingene.

4. Verifiser teknisk
- Kjør TypeScript-sjekk.
- Bekreft at feltet finnes i databasen og at select/update allerede bruker `prevent_self_approval` og `propagate_prevent_self_approval`.

Teknisk notat:
- Databasefeltene finnes allerede i `companies`.
- Koden inneholder allerede lagring og håndheving, men UI-raden vises ikke i preview. Fiksen fokuserer derfor på renderingen i selskapsinnstillinger, ikke ny databaseendring.