## Mål

Generere én grundig opplærings-PDF per modul i AviSafe. PDF-ene skal **ikke** være tilgjengelige i selve appen for noen brukere — de leveres som filer i `/mnt/documents/` slik at du kan laste dem ned fra Filer-panelet.

## Moduler (13 PDF-er)

1. **Oppdrag** — planlegging, ruteplanlegging, SORA-kobling, FH2-eksport, godkjenningsflyt, Ninox-blokkering i 5 km-soner
2. **Kart** — luftromslag (CTR/TIZ/P/R/D), 5 km-soner, NSM, NOTAM, vær, Kp-indeks, AIS, natur, kraftlinjer, ADS-B, SafeSky
3. **SORA** — Steg 0–9, ALOS, fGRC, ARC, SAIL, buffer (Corridor/Convex), tilstøtende område, auto-godkjenning ≤10
4. **Flylogging & Loggbok** — Start/stopp flytur, publiseringsmodus (Ingen/Advisory/Live UAV), DJI/ArduPilot-import, Pending DJI logs, batteri-celleavvik
5. **Ressurser** — droner, utstyr, DroneTag, personell, vedlikeholdsintervall, kompetanse-utløp, avdelingssynlighet
6. **Dokumenter** — kategorier, mappehierarki, sjekklister, utløpsvarsler, signerte URL-er
7. **Hendelser** — rapportering, anonymitet, kategorier, ECCAIRS-mapping (VL390), oppfølgingsansvar
8. **Kalender** — planlagte oppdrag, vedlikehold, dokumentutløp, iCal-eksport
9. **Status & Statistikk** — KPI, grafer, perioder, Excel/PDF-eksport
10. **Profil & Innstillinger** — signatur, kompetanser, MFA/passkey, varslingsinnstillinger, idle timeout
11. **Administrasjon** — brukere, roller, kunder, e-postmaler, selskapshierarki, propagering, registreringskode
12. **Integrasjoner** — FH2, ECCAIRS, SafeSky, DroneTag, BarentsWatch AIS, NOTAM RSS, LinkedIn, Resend, Sentry
13. **Sikkerhet & Pålogging** — registrering, auto-godkjenning ny bedrift, MFA-guards, multi-tab sync, PWA-resumption, RLS-prinsipper

## Innhold per PDF (mal)

For konsistent opplæringskvalitet følger hver PDF samme struktur:

1. **Forside** — modulnavn, undertittel, versjon, dato
2. **Innholdsfortegnelse**
3. **Formål & når brukes modulen**
4. **Hovedfunksjoner** — hver med:
   - Hva den gjør
   - Steg-for-steg (nummerert)
   - Hvor i UI (knapp/meny/dialog)
5. **Logikk under panseret** — automatiske beregninger og regler (f.eks. SORA-buffer, vedlikeholdsterskler dager/timer/oppdrag, Kp ≥ 5 trekker score, dugg-diff <1/3/5, batteri <20%, høyde >120 m, NOTAM 25 NM, AIS zoom ≥ 8)
6. **Sammenhenger med andre moduler** — tabell "Når X skjer her → Y skjer i modul Z" (Flylogg→Ressurser timer, Oppdrag→Kalender, Hendelse→ECCAIRS, Sjekkliste→Pre-flight blokk)
7. **Roller & tilganger** — operatør, saksbehandler, admin, superadmin
8. **Tips & triks** — snarveier, beste praksis, vanlige fallgruver
9. **Feilsøking** — typiske feil og løsninger
10. **Sjekkliste for opplæring** — hva en ny bruker skal kunne etter modulen

## Teknisk tilnærming

- Genereres som **engangsskript** via `code--exec` (Python + ReportLab eller `docx`-skill) — **ingen kode legges inn i appen**.
- Innholdet skrives modul-for-modul basert på:
  - Eksisterende kode (sider/komponenter/hooks/edge-funksjoner)
  - Memory-filer (`mem://features/...`, `mem://integrations/...`) som allerede dokumenterer logikk og sammenhenger
  - `docs/`-mappen
- Hver PDF får AviSafe-branding (mørk forside, primærfarge på overskrifter), sidefot med "AviSafe Opplæring – [Modul] – Side X av Y".
- Output: `/mnt/documents/avisafe-opplaering/<modul>.pdf` + en samlet `AviSafe-Opplaering-Komplett.pdf` som bonus.

## Leveranse-rekkefølge

For å holde kvalitet høy uten en kjempe-leveranse:

- **Pulje 1 (kjerne):** Oppdrag, Kart, SORA, Flylogging
- **Pulje 2 (drift):** Ressurser, Dokumenter, Hendelser, Kalender
- **Pulje 3 (admin/øvrig):** Status, Profil, Administrasjon, Integrasjoner, Sikkerhet

Hver pulje QA-es visuelt (PDF → bilder → inspeksjon) før levering.

## Spørsmål

1. OK med 13 PDF-er som listet, eller vil du slå sammen noen (f.eks. Status+Statistikk, eller én samlet "Integrasjoner")?
2. Skal jeg starte med **Pulje 1** etter godkjenning, eller levere alle 13 i én runde?
3. Språk: kun **norsk**, eller også engelsk versjon?
