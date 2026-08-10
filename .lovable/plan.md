# Global deling begrenses til superadmin

## Hvorfor skjer det

To grunner, begge bekreftet:

1. **Frontend:** I redigeringsdialogen for dokumenter/sjekklister (`DocumentCardModal`) vises bryteren «Synlig for alle selskaper» uten noen rollesjekk. Til sammenligning er samme bryter allerede gjemt bak `isSuperAdmin` i «Nytt dokument» (`DocumentUploadDialog`), «Ny sjekkliste» (`CreateChecklistDialog`) og evalueringsskjema-dialogen. Redigeringsdialogen ble aldri gated.
2. **Database:** Policyen «Admins can update documents in own company» lar en admin oppdatere alle kolonner på egne dokumenter — inkludert `global_visibility`. Det finnes en egen superadmin-policy for global deling, men ingenting hindrer admin i å sette flagget selv. Så selv om UI-et skjules, kan flagget fortsatt settes via API.

## Hva som gjøres

**Frontend**
- Skjul bryteren «Synlig for alle selskaper» i redigeringsdialogen for dokumenter og sjekklister for alle som ikke er superadmin.
- Behold verdien uendret ved lagring for ikke-superadmin (ikke nullstill eksisterende global deling som en superadmin har satt).

**Database (sikkerhetsfiks)**
- Legg til en trigger på `documents` som blokkerer endring av `global_visibility` når brukeren ikke er superadmin: hvis `NEW.global_visibility` er forskjellig fra `OLD.global_visibility` (og ved INSERT hvis satt til true) og `is_superadmin(auth.uid())` er false, kastes en feil.
- Samme beskyttelse for `evaluation_templates.global_visibility`.

Dette gir håndhevelse på serversiden uansett hvilken klient som brukes, i tillegg til at UI-et blir konsistent med de andre dialogene.

## Ikke i scope
- Deling til enkeltavdelinger og «synlig for underavdelinger» endres ikke — det skal fortsatt kunne styres av admin i eget selskap.
