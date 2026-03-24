

## Plan: Bevar selskapsvelger-tilgang ved hierarkisk bytte

### Problem
Den nye triggeren `sync_user_companies_on_company_change` sletter `user_companies`-raden når `profiles.company_id` oppdateres. Men `switchCompany` bruker nettopp denne mekanismen for å bytte kontekst — så en morselskaps-admin som bytter til en avdeling mister selskapsvelgeren og kan ikke navigere tilbake.

### Årsak
Triggeren skiller ikke mellom:
1. **Kontekstbytte** (admin bytter mellom mor/barn via selskapsvelgeren) — skal beholde tilgang
2. **Permanent overflytting** (admin blir flyttet til et helt annet selskap) — skal miste tilgang

### Løsning — Oppdater triggeren

Legg til en sjekk i starten av triggeren: hvis gammelt og nytt selskap er i samme hierarki (forelder/barn-relasjon), gjør ingenting:

```sql
-- Hvis byttet er innenfor samme hierarki, ikke rør user_companies
IF EXISTS (
  SELECT 1 FROM companies 
  WHERE id = NEW.company_id AND parent_company_id = OLD.company_id
) OR EXISTS (
  SELECT 1 FROM companies 
  WHERE id = OLD.company_id AND parent_company_