
# Fiks: Kommentarer lagres ikke i risikovurderingen

## Problem
Det finnes ingen RLS UPDATE-policy pa `mission_risk_assessments`-tabellen. Nar brukeren trykker "Lagre kommentarer", blokkeres oppdateringen av Row Level Security uten feilmelding, og kommentarene forblir tomme i databasen.

## Losning

### 1. Legge til UPDATE RLS-policy
Opprette en ny migrering som legger til en UPDATE-policy slik at godkjente brukere i samme selskap kan oppdatere risikovurderinger:

```sql
CREATE POLICY "Users can update risk assessments in own company"
  ON mission_risk_assessments
  FOR UPDATE
  USING (company_id = get_user_company_id(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()));
```

### 2. Forbedre feilhåndtering i saveComments
Oppdatere `saveComments`-funksjonen i `RiskAssessmentDialog.tsx` til å sjekke om oppdateringen faktisk ble utført (Supabase returnerer ikke feil ved RLS-blokkering, men `data` kan indikere ingen rader ble oppdatert).

## Tekniske detaljer
- Kun en ny SQL-migrering trengs for å fikse dette
- Ingen endringer i frontend-kode er strengt nodvendig, men bedre feilhåndtering anbefales
- Policyen begrenser oppdatering til brukere i samme selskap, noe som er konsistent med eksisterende SELECT- og INSERT-policyer
