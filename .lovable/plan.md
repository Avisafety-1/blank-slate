

# Legg til UAS operatornummer i profilen

## Hva skal gjores

Legge til et felt for UAS operatornummer (f.eks. NOR87astrdge12k) i "Min profil"-dialogen, slik at brukere kan registrere sitt operatornummer fra Luftfartstilsynets flydrone-tjeneste.

## Endringer

### 1. Database: Ny kolonne i `profiles`-tabellen
Legge til en ny nullable tekstkolonne `uas_operator_number` i `profiles`-tabellen via migrering.

### 2. Profilside: `src/components/ProfileDialog.tsx`
- Utvide `Profile`-interfacet med `uas_operator_number: string | null`
- Legge til et nytt felt i profilskjemaet (i "Basic Info"-grid-seksjonen, etter adresse-feltet) med label "UAS operatornummer"
- Feltet skal vare redigerbart i redigeringsmodus og vise verdien i visningsmodus
- Legge til en kort hjelpetekst under feltet som forklarer at dette er nummeret fra Luftfartstilsynets flydrone-tjeneste, og at de siste sifrene er hemmelige og ikke skal tas med i merkingen
- Inkludere `uas_operator_number` i `handleSaveProfile`-funksjonen sin update-kall

### Tekniske detaljer

**SQL-migrering:**
```sql
ALTER TABLE profiles ADD COLUMN uas_operator_number text;
```

**UI-plassering:** Feltet plasseres etter adresse-seksjonen og for signatur-seksjonen i profil-fanen, med en `Separator` mellom.

**Lagring:** Feltet inkluderes i det eksisterende `supabase.from("profiles").update(...)` kallet i `handleSaveProfile`.

