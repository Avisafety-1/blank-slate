

## Analyse: Er endringen trygg for eksisterende selskaper?

**Ja, det er helt trygt.** Her er hvorfor:

`get_user_visible_company_ids` fungerer slik:

1. **Vanlige brukere** (ikke admin): Returnerer `ARRAY[brukerens company_id]` — identisk med `get_user_company_id`
2. **Administratorer**: Returnerer `brukerens company_id + alle child companies`

For et selskap **uten avdelinger** finnes det ingen rader i `companies` med `parent_company_id` som matcher. Dermed returnerer funksjonen kun `ARRAY[eget_company_id]` — **nøyaktig samme resultat** som `get_user_company_id`.

Endringen utvider altså kun tilgangen for administratorer som faktisk har underavdelinger. Alle andre selskaper får identisk oppførsel.

### Plan

**SQL-migrasjon:** Oppdater UPDATE-policyen for `missions`:

```sql
DROP POLICY IF EXISTS "Users can update missions in own company" ON missions;
CREATE POLICY "Users can update missions in own company" ON missions 
FOR UPDATE USING (
  company_id = ANY(get_user_visible_company_ids(auth.uid()))
);
```

Ingen andre filer eller kode trenger endres. Godkjenningslogikken i `ProfileDialog.tsx` kaller allerede `.update().eq('id', missionId)` — det er kun RLS som blokkerer.

