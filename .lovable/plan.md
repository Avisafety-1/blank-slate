# Hvorfor Tensio-brukere ikke får åpnet sjekklistefilene

## Hva som faktisk skjer (verifisert i databasen)

Selve sjekklisten (raden) er synlig — derfor vises fanene «Nødsjekklister» og «Normale sjekklister DJI Matrice-Mavic». Det som feiler er henting av selve PDF-filen fra fillageret.

Årsaken er en mismatch mellom hvilken avdeling dokumentet tilhører og hvilken avdelings mappe filen ligger i:

- «Nødsjekklister» og «Normale sjekklister DJI Matrice-Mavic» tilhører **Tensio Nord**, men filene ligger i **Tensio** (morselskapet) sin mappe.
- Reglene for fillageret gir kun tilgang når mappenavnet er eget selskap eller en avdeling under deg, eller når dokumentet er globalt / delt nedover fra morselskapet. Disse dokumentene treffer ingen av delene.
- Reglene for fillageret tar heller ikke hensyn til eksplisitt avdelingsdeling (den delingen som styrer om dokumentraden er synlig). Begge dokumentene er eksplisitt delt, men delingen gjelder bare raden — ikke filen.

Resultat: brukeren ser sjekklisten i lista, men får «Kunne ikke laste sjekklistefilen».

Dette gjelder ikke bare disse to: 16 dokumenter i systemet har fil lagret i en annen avdelings mappe enn dokumentet tilhører (blant annet flere Tensio Nord-prosedyrer, SORA-dokumenter og sjekklister).

## Løsning

### 1. Tilgangsregelen for filer skal følge dokumentet, ikke mappenavnet

Ny SECURITY DEFINER-hjelpefunksjon som svarer «kan innlogget bruker lese dokumentet som peker på denne filen?» — med samme logikk som allerede gjelder for dokumentraden: eget/synlige selskap, globalt synlig, delt nedover fra morselskap, og eksplisitt avdelingsdeling.

Lesepolicyen for `documents`-fillageret utvides med denne funksjonen i tillegg til dagens mappebaserte regel (bakoverkompatibelt — ingen mister tilgang). Funksjonen får eksplisitt `REVOKE EXECUTE ... FROM anon, authenticated, PUBLIC` og kun de GRANTs som trengs, per prosjektregelen. Skrive-/slettepolicyene røres ikke — de skal fortsatt være mappebaserte.

### 2. Tydeligere feilmelding

Feilteksten i sjekklistedialogen er hardkodet på norsk. Den flyttes til `no.json`/`en.json` og formuleres presist: filen finnes, men du mangler tilgang — kontakt admin.

## Verifisering

- Spørring som en Tensio Nord-bruker: bekreft at signert lenke for begge sjekklistene nå lages uten feil.
- Bekreft at en bruker i et urelatert selskap fortsatt ikke får tilgang til de samme filene.
- Åpne «Utfør sjekkliste» i forhåndsvisningen og se at PDF-en vises.

## Teknisk

- Migrasjon: `can_read_document_file(_object_name text)` (SECURITY DEFINER, `search_path = public`), ny/oppdatert SELECT-policy på `storage.objects` for `bucket_id = 'documents'`.
- `src/components/resources/ChecklistExecutionDialog.tsx`: erstatt hardkodede feilstrenger med `t()`-nøkler.
- Ingen endring i opplastingsstien eller i eksisterende dokumentrader.
