## Mål
Godkjennere skal kunne godkjenne oppdrag direkte fra oppdragskortene (dashboard + /oppdrag), ikke bare fra Profil → Oppfølging.

## Hva som bygges

**1. Ny delt hook `useMissionApproval`**
Trekker ut godkjenningslogikken som i dag ligger inne i `ProfileDialog.tsx` (`handleApproveMission`) slik at den kan gjenbrukes:
- Oppdaterer `missions`: `approval_status = 'approved'`, `approved_by`, `approved_at`, valgfri kommentar i `approval_comment` + `approver_comments`.
- Sender e-postvarsel `notify_mission_approved` til piloter.
- Toast ved suksess/feil.

**2. Ny komponent `ApproveMissionButton`**
Tydelig knapp som vises **kun** når alle er sanne:
- Innlogget bruker har `canApproveMissions`
- Oppdragets `approval_status === 'pending_approval'`
- Oppdragets `company_id` er innenfor brukerens `approvalCompanyIds` (samme scoping som Oppfølging-fanen bruker)

Klikk åpner en liten bekreftelsesdialog med valgfritt kommentarfelt og «Godkjenn». Hvis selskapet har `prevent_self_approval` og brukeren er tildelt personell på oppdraget, vises knappen som deaktivert med forklaringstekst (samme regel som i Oppfølging).

**3. Plassering**
- `src/components/oppdrag/MissionCard.tsx` — knappen øverst i kortet, i badge-raden rett ved «Venter på godkjenning».
- `src/components/dashboard/MissionsSection.tsx` og `src/components/dashboard/MissionDetailDialog.tsx` — samme knapp øverst, over/ved statusbadgene (som på skjermbildene).

Etter godkjenning refetches oppdragslisten (`fetchMissions` / eksisterende query-invalidering) slik at badgen umiddelbart blir «Godkjent».

**4. i18n**
Alle nye strenger via `t()`, nøkler lagt til i både `no.json` og `en.json` (gjenbruker `profile.approval.*` der det passer, ellers nye `pages.missions.card.approveNow*`).

## Teknisk
- Ingen databaseendringer; eksisterende RLS på `missions` styrer allerede hvem som kan oppdatere.
- Personelltildeling for selvgodkjenningssjekken hentes fra dataene kortet allerede har (`mission_personnel` / `personnel`-feltet); hvis feltet mangler på dashboard-kortet, hentes profil-ID-ene ved åpning av bekreftelsesdialogen.
