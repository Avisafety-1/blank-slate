Enig. Vi kan styre dette fra frontend og la `eccairsPayload` være urørt.

Plan:

1. Rett automatisk forslag for VL244 i `EccairsMappingDialog.tsx`
   - Når dronen har serienummer: bruk kun numeriske tegn fra serienummeret.
   - Begrens til maks 11 siffer, siden VL244-feltet i E2-oppsettet allerede er definert med `maxLength: 11`.
   - Når dronen mangler serienummer, eller serienummeret ikke inneholder tall: sett en gyldig numerisk fallback i stedet for `xxx`, f.eks. `99999999999`.

2. Hindre ugyldig manuell inntasting i samme dialog
   - For feltkode 244 skal input kun akseptere tall.
   - Brukeren skal ikke kunne skrive `xxx`, bokstaver eller spesialtegn i dette feltet.
   - Feltet skal fortsatt vise teller `0/11`, `11/11` osv.

3. Oppdater hjelpeteksten for VL244 i `eccairsFields.ts`
   - Endre tekst til å forklare at ECCAIRS krever numerisk serienummer, maks 11 siffer.
   - Klargjør at verdien hentes fra tilknyttet drone når mulig, ellers settes en numerisk standardverdi.

4. Ikke endre `supabase/functions/_shared/eccairsPayload.js`
   - Payload-funksjonen blir stående som den er.
   - Eksisterende maksgrense på 11 tegn beholdes, men vi sørger for at frontend lagrer gyldig tallverdi før eksport.

Forventet resultat:
- Automatisk forslag setter aldri `xxx` for attributt 244.
- VL244 blir alltid et tall fra frontend.
- ECCAIRS-rapporten går videre uten regex-feilen for små bokstaver.
- Ingen backend-/edge-function-endringer.