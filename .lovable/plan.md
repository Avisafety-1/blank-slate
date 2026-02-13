

# Fikse "Utsteder"-feltet i dokumenter

## Problem
Når systemgenererte dokumenter (PDF-rapporter, KMZ-eksporter, statistikkrapporter) opprettes, settes `opprettet_av`-feltet til brukerens UUID (`user?.id`) i stedet for brukerens navn. Dokumentwidgeten viser dette feltet som "Utsteder", noe som gir et kryptisk UUID i stedet for et lesbart personnavn.

## Berørte filer og endringer

### 1. `src/pages/Oppdrag.tsx` (2 steder)
- **Linje ~604**: KMZ-eksport -- endre `opprettet_av: user?.id` til brukerens fulle navn
- **Linje ~1239**: PDF-eksport -- samme endring

For begge steder: hent brukerens `full_name` fra `profiles`-tabellen og bruk det i stedet for UUID-en.

### 2. `src/pages/Status.tsx` (2 steder)
- **Linje ~554**: Excel-rapport eksport
- **Linje ~953**: PDF-rapport eksport

Samme fix: bruk `full_name` fra profilen i stedet for `user?.id`.

### 3. `src/lib/incidentPdfExport.ts`
- Denne filen setter ikke `opprettet_av` i det hele tatt ved dokument-insert (linje ~140-155). Legge til `opprettet_av` med brukerens navn. Siden funksjonen allerede mottar `userId`, hentes `full_name` fra profiltabellen.

## Teknisk tilnærming

I hver fil der `opprettet_av: user?.id` brukes, gjøres følgende:
1. Spør `profiles`-tabellen med `supabase.from('profiles').select('full_name').eq('id', userId).single()`
2. Bruk `profile?.full_name || user?.email || 'Ukjent'` som fallback-kjede
3. Sett `opprettet_av` til dette navnet

Dette følger eksisterende mønster i kodebasen (f.eks. `StartFlightDialog.tsx` linje 339-346 gjør allerede dette).

## Eksisterende dokumenter
Dokumenter som allerede er opprettet med UUID vil fortsatt vise UUID. For å fikse disse kan man eventuelt kjøre en engangs SQL-oppdatering, men det er valgfritt.

