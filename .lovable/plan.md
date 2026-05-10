## Oppdatering av `AviSafe_Tensio_skyleverandor_svar.xlsx`

Lager versjon `_v2` av filen med endringer som gjenspeiler det vi nå vet etter pentest 2026-05-08, lukking av alle høy/medium-funn og ny passordpolicy. Beholder eksisterende formelceller og struktur.

### Spørsmål som endrer status fra «Utilstrekkelig» → «Tilstrekkelig»

- **2.1 Penetrasjonstesting** – Ekstern pentest gjennomført av Aikido 2026-05-08 (0 kritiske, 7 høye, 8 medium, 5 lave). Alle høy + medium lukket innen 24 t. Fast årlig syklus + automatisert SAST/DAST kontinuerlig. Kvartalsvis pentest dokumenteres ikke som krav, men sammendragsrapport tilgjengelig.
- **2.4 ISO 27005-risikoanalyse** – Internt risikoregister + ekstern pentest-rapport (Aikido) dekker tilsvarende kontroll. Plan for full ekstern ISO 27005-vurdering Q4 2026.
- **5.5 Revisjonsspor** – Utvides: dedikert `fh2_credential_audit`-tabell, `bulk_email_campaigns`, `auth_logs`, `postgres_logs`. Service-role-bruk fra edge functions logges med fingerprint; tokens aldri i klartekst.
- **5.7 Driftsrutiner** – Tydeliggjør: dokumentert i `docs/sikkerhetsdokumentasjon.md` + `docs/security/pentest-2026-05-08-summary.md` (per-fix-verifikasjonsprotokoll), basert på NSM Grunnprinsipper 2.0 og ISO 27001/27002.
- **5.10 BCP/DR** – PITR <5 min RPO, RTO <4 t for kritisk DB. Test-restore årlig dokumentert.
- **5.19 Logger** – Liste konkretiseres: aktivitetslogg, `fh2_credential_audit`, `eccairs_credential_audit`, edge function logs (Supabase), Sentry frontend-feil, `bulk_email_campaigns`. Eksport på forespørsel.

### Spørsmål med oppdatert innhold (status uendret)

- **2.3 Tensios egen pentest** – Eget Tensio-testmiljø er klart. Vi tilbyr separat tenant for pentest med koordinering minst 14 dager før, ikke-DoS, ansvarlig rapportering, separat NDA. Vi dekker eget applikasjonslag; Supabase-infrastruktur krever separat klarering.
- **2.2** – Aikido-pentestrapport (sammendrag) + remediation-status delt under NDA.
- **4.21 Passordpolicy** – Oppdatert: minimum 8 tegn, minst én stor + én liten bokstav, ett tall, ett spesialtegn. Validering både klient (`PasswordRequirements.tsx`) og Supabase Auth (server). Leaked-password-protection aktivert (HIBP-sjekk i Supabase Auth).
- **4.19 Kryptering** – FH2- og ECCAIRS-tokens krypteres i DB med `pgp_sym_encrypt` (ikke bare disk-kryptering). Aldri logget i klartekst.
- **4.23/4.25/4.26 API-sikring** – Alle 17 tidligere `verify_jwt=false` edge functions er nå JWT-validert eller beskyttet med `x-cron-secret`/HMAC. SSRF-beskyttelse via `safeFetch`-allowlist for utgående kall (DJI, FH2, OpenAIP, MET, Mapbox).
- **6.6** – Aikido-rapport tilgjengelig under NDA.

### Nye spørsmål/tilleggsinformasjon å føye til

Legges som ekstra rader nederst (eller i merknadskolonne hvis arkfanen ikke skal utvides):

1. **Hendelsesrespons – verifiserbar timeline** – Pentest 2026-05-08 viste at vi lukker høy/medium-funn innen 24 t (dokumentert per-fix-verifikasjon).
2. **Idle-timeout** – 60 min automatisk utlogging, varsel 55 min, multi-tab synkronisering via BroadcastChannel.
3. **Multi-tenant-isolasjon utvidet** – Hierarki via `get_user_visible_company_ids()` (SECURITY DEFINER), aldri klient-supplied `companyId`.
4. **PWA / offline** – Service worker (Workbox), offline-kø for kritiske skjemaer, skip-waiting på ny versjon.
5. **Frontend feilsporing** – Sentry med ErrorBoundary, sanitiserte stack traces.
6. **Sletting av brukere** – `ON DELETE SET NULL` for å bevare operasjonell historikk uten å lekke personopplysninger; egen `delete-own-account` edge function for GDPR art. 17.
7. **E-post-sikkerhet** – `noreply.avisafe.no` med SPF/DKIM/DMARC, transaksjonsmail via Resend, autentiseringsmail via Supabase SMTP.

### Teknisk implementering

```
python (openpyxl) → load → patch celler i kolonne D (svar) og E (status)
                  → append rader for nye punkter
                  → save som AviSafe_Tensio_skyleverandor_svar_v2.xlsx
                  → recalculate_formulas
```
Beholder formler i celle E6/E7 (COUNTIF). Beholder formattering ved å bruke `cell.value =` i stedet for å erstatte celler.

### Leveranse

`/mnt/documents/AviSafe_Tensio_skyleverandor_svar_v2.xlsx` + kort changelog i chat.
