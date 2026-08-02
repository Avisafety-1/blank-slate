## Mål

En visuelt sterk, norsk PowerPoint-CV (9 slides) for søknaden til TUR Digital — med tydelige nøkkeltall først og teknologi/verktøy i fokus, ikke luftfart.

## Kontaktinfo

Gard Haug-Hansen · Hauggard@gmail.com · avisafe.no · app.avisafe.no (demo på forespørsel). Ingen LinkedIn.

## Visuell retning

- Forside: opplastet blå nettverksgrafikk som fullbleed bakgrunn, navn/tittel venstrestilt i lys tekst.
- Resten: lys/mørk "sandwich" — lyse innholdsslides, mørk navy avslutning.
- Palett (matcher AviSafe dark/glass-uttrykk): navy `0B1B33`, elektrisk blå `2E9BFF`, isblå `CADCFC`, off-white `F7F9FC`.
- Font: Arial Black i titler, Calibri i brødtekst. Motiv som går igjen: tynne kort med blå venstrekant + tall-callouts.
- Ingen streker under titler, ingen rene tekstslides — hver slide har kort, ikonsirkler, KPI-blokker eller kolonner.

## Slide-struktur

1. **Forside** — Navn, "AI Product Engineer · Systemarkitekt · AI-assistert utvikler", kontaktlinje, blå bakgrunn.
2. **Nøkkeltall / KPI** — 6 store tall: 6 711 AI-dialoger, 3 371 AI-kodeendringer, ~22 prompts/dag siden nov 2025, Top 10 % Builder på Lovable, 1 SaaS fra idé til produksjon, 10 år jagerfly + 2,5 år Safety Manager.
3. **Profil** — kort avsnitt + 4 kjennetegn. Inkluderer sitatet "Ja – så lenge vi klarer å definere problemet godt nok."
4. **AI-drevet utviklingsmetode** — hvordan AI brukes gjennom hele løpet (arkitektur, DB-design, refaktorering, test, dok, prompt engineering) + verktøy: Lovable, ChatGPT, Claude, MCP.
5. **Teknisk stack** — kolonner: Frontend (React, TypeScript, Tailwind, shadcn, React Query, PWA, i18n) · Backend (PostgreSQL, Supabase, Edge Functions, RLS, RPC, cron, realtime, webhooks) · Auth/Sikkerhet (OAuth, OIDC, JWT, Passkeys, TOTP, RBAC, kryptering) · Infra (Fly.io, Docker, GitHub, Sentry, Postman).
6. **Systemarkitektur i praksis** — multi-tenant SaaS, hierarkisk selskapsmodell med RLS-isolasjon, feature flags, audit trail, eventdrevne flyter, offline-first PWA med køsystem, ytelsesoptimalisering (indekser, viewport-fetching).
7. **Integrasjoner** — gruppert i 4 kort: Betaling & kommunikasjon (Stripe, Vipps, GatewayAPI SMS, Resend, Web Push), Kart & geodata (Leaflet, WFS/WMTS, ArcGIS, OpenStreetMap/Overpass, Eurostat, nasjonale luftromskilder i 6+ land), Drone & operasjon (DJI FlightHub 2, ArduPilot-parser på Fly.io, SafeSky, DroneTag), Rapportering & marked (ECCAIRS 2, Meta Graph API, LinkedIn API).
8. **Utvalgte leveranser** — 6 konkrete moduler med resultat: AI-risikovurdering, Audit & Compliance Center, intern meldingsplattform med push/SMS/broadcast, kart- og luftromsmotor for Europa, MCP-server + OIDC for AI-klienter, flyloggsanalyse med 3D-visualisering.
9. **Erfaring & egenskaper (mørk avslutning)** — AviSafe AS (produktutvikler/systemarkitekt), Safety Manager 2,5 år, Jagerflyger 10 år, kort egenskapsliste + kontaktinfo gjentatt.

## Teknisk gjennomføring

- Bygges med `pptxgenjs` i et Node-script under `/tmp`, bilder embeddes som base64.
- Innhold hentes fra en faktisk gjennomgang av prosjektet (edge functions, integrasjoner, migrasjoner, minnefiler) slik at listene reflekterer det som faktisk er bygget — ikke bare ChatGPT-utkastet.
- Ingen oppdiktede tall: kun KPI-ene du selv har oppgitt (6 711 / 3 371 / Top 10 %) og verifiserbare fakta fra kodebasen.
- Leveres til `/mnt/documents/CV_Gard_Haug-Hansen.pptx`.

## Kvalitetssikring

Validering med `validate_document.py`, konvertering til PDF/bilder og visuell inspeksjon av alle 9 slides (overflow, kontrast, marger, overlapp) med minst én fiks-og-verifiser-runde før levering.
