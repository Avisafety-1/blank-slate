

## Plan: Legg til 35 avdelinger under Norconsult AS

### Tilnærming
Sett inn 35 child companies i `companies`-tabellen med `parent_company_id` satt til Norconsult AS (`3562f82d-aff7-487b-9495-7f288a5bc0e3`). Arver innstillinger: `stripe_exempt: true`, `dji_flightlog_enabled: true`, `selskapstype: 'droneoperator'`.

`registration_code` genereres automatisk av trigger.

### Avdelingsnavn (35 stk)
Bergen 1, Bergen 2, Bodø 1, Bodø 2, Gjøvik 1, Hamar 1, Jessheim 1, Kristiansand 1, Larvik 1, Levanger 1, Lillehammer 1, Lysaker 1, Mo i Rana 1, Molde 1, Namsos 1, Namsos 2, Odda 1, Os 1, Porsgrunn 1, Sandvika 1, Sandvika 2, Sandvika 3, Sandvika 4, Sandvika 5, Sandvika 6, Sandvika 7, Sandvika 8, Stavanger 1, Stjørdal 1, Trondheim 1, Trondheim 2, Tønsberg 1, Ulsteinvik 1, Voss 1, Ålesund 1

### SQL
```sql
INSERT INTO companies (navn, selskapstype, stripe_exempt, dji_flightlog_enabled, parent_company_id)
VALUES
  ('Bergen 1', 'droneoperator', true, true, '3562f82d-...'),
  ('Bergen 2', 'droneoperator', true, true, '3562f82d-...'),
  -- ... (35 rader totalt)
```

### Utføring
Kjøres via `psql INSERT` (data-operasjon, ikke skjemaendring).

### Filer
Ingen kodeendringer — kun datainnsetting.

