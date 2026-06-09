# Oppdatering av AviSafe – Sikkerhetsdokumentasjon

Jeg lager en ny versjon av dokumentet (`AviSafe_-_Sikkerhetsdokumentasjon_v2.docx`) basert på originalen du lastet opp, men korrigert mot dagens faktiske oppsett. Originalen beholdes urørt så du kan sammenligne.

Språket holdes ikke-teknisk: ingen kodeeksempler, ingen tabellnavn, ingen funksjonsnavn — kun forklaringer en revisor eller kunde kan lese. Frontend-plattformen omtales generisk som "vår utviklings- og driftsplattform" uten å nevne leverandøren ved navn.

## Hovedendringer

### Dette fjernes
- **Kapittel 8 "Domene-separasjon"** — separasjonen mellom innloggings- og applikasjonsdomene er fjernet i praksis. All bruk skjer på ett domene, og det gamle innloggingsdomenet videresender kun til hovedapplikasjonen.
- **Kapittel 13 "Offline-støtte og PWA"** — reell offline-bruk fungerer ikke i dag og er misvisende. Erstattes av en kort note om at applikasjonen kan installeres som app-ikon på hjemskjerm, men at funksjonalitet krever nettforbindelse.
- Setninger om offline-bruk under sesjonshåndtering og tilgjengelighet ryddes bort.

### Dette oppdateres
- **Infrastruktur**: legger til at vi bruker en sentralisert feilrapporterings­tjeneste (Sentry) og en egen leverandør for transaksjons-e-post (Resend), i tillegg til databasen og serverless-funksjonene som ligger hos Supabase.
- **Autentisering**: legger til passnøkler (passkeys/WebAuthn), tofaktor­autentisering, automatisk synkronisering av innlogging mellom faner, og presisering av inaktiv-utlogging (varsel etter 55 min, utlogging etter 60 min).
- **Roller og tilgangsstyring**: presisere de tre rollene (bruker, administrator, superadmin), forklare hierarkisk tilgang for selskaper med under­avdelinger uten å gå inn i implementasjonsdetaljer.
- **Kryptering**: presisere at utvalgte sensitive felter (tredjeparts­tokens for blant annet flylogger og hendelses­rapportering) krypteres i databasen i tillegg til standard disk- og transport­kryptering.
- **Hemmeligheter og API-nøkler**: oppdatert liste over hvilke typer nøkler som lagres sikkert i bakgrunns­miljøet (betaling, e-post, push-varsler, AI, lufttrafikk, sosiale medier osv.) uten å liste opp variabelnavn.
- **Backend-funksjoner**: oppdatert antall og kategorisering (e-post, planlagte jobber, AI, integrasjoner, betaling, publisering, push, datasynkronisering).
- **Fillagring**: nevne både dokument-lagring og bildelagring (logbok), samt at filer er adskilt per organisasjon og tilgjengelige via tidsbegrensede lenker.
- **Push-varsler**: standardbasert push-løsning, opprydding av utgåtte abonnement, varsler avgrenset til riktig organisasjon.
- **Eksterne integrasjoner** (utvidet liste):
  - Stripe (abonnement og fakturering)
  - Resend (transaksjons-e-post og mottakerlister)
  - LinkedIn (publisering)
  - BarentsWatch (skipstrafikk-data)
  - DJI FlightHub 2 (sanntids dronesposisjon via signert webhook)
  - ArduPilot- og DJI-loggparsing (separate bakgrunns­tjenester)
  - NVE (kraftlinjer)
  - Kartverket (norske kartfliser)
  - CAA Norge og dansk Trafikstyrelsen (dronesoner)
  - NOAA (romvær / Kp-indeks)
  - NOTAM (luftrom-varsler)
  - SSB, Eurostat, Miljødirektoratet, MET, Open-Meteo (offentlige data)
- **Logging og overvåkning**: legger til ekstern feilrapportering, plattform­aktivitetslogg og fullt revisjonsspor for hendelser og myndighets­rapportering.
- **Datatyper lagret**: legger til abonnement- og fakturerings­data, passnøkkel-legitimasjon, push-abonnement, og krypterte tredjeparts­tokens.
- **GDPR og personvern**: presisere at brukersletting bevarer operasjonell historikk (av hensyn til flysikkerhets­dokumentasjon) ved at personlige data fjernes mens referansene i logger og oppdrag anonymiseres.
- **Tilgjengelighet og sikkerhetskopier**: fjerne påstander om offline-modus, beholde redundans, daglige sikkerhets­kopier og point-in-time recovery.
- **Versjon**: oppgraderes til **1.1** med dato **juni 2026**.

### Format og leveranse
- Beholder visuell stil (AviSafe-logo i topp, bunntekst med organisasjonsnummer, samme kapittel­nummerering og typografi).
- Innholdsfortegnelsen renummereres etter at to kapitler fjernes (totalt 21 kapitler i stedet for 23).
- Levert som `/mnt/documents/AviSafe_-_Sikkerhetsdokumentasjon_v2.docx` slik at du kan laste ned og se gjennom.

## Hva som IKKE endres
- Kjernebeskrivelse av multi-tenancy, kryptering under transport, JWT-sesjoner og databasens rad-nivå sikkerhet (forklart i klartekst, ikke som kode).
- GDPR juridisk grunnlag og rettighets­tabell.
- Kontaktinformasjon og selskapsdetaljer.
