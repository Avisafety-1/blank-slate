import type { TourDefinition } from "./types";
import { sleep } from "./tourUtils";

const clickTab = async (selector: string) => {
  const el = document.querySelector(selector) as HTMLElement | null;
  el?.click();
  await sleep(350);
};

export const adminTour: TourDefinition = {
  id: "admin",
  title: "Administrasjon — full gjennomgang",
  description: "Grundig tour gjennom admin-siden: brukere, kunder, e-post, SORA, mitt selskap og opplæring. Krever administrator-tilgang.",
  steps: [
    // ---------- INTRO ----------
    {
      id: "intro",
      route: "/admin",
      selector: "main",
      title: "Velkommen til administrasjon",
      description:
        "Admin-siden er kontrollpanelet for selskapet. Her godkjenner du brukere, styrer roller, sender invitasjoner, redigerer e-postmaler, definerer SORA-grenser og holder orden på avdelinger og opplæring. Du må være administrator for å kjøre denne touren.",
      side: "bottom",
      requiresAdmin: true,
    },
    {
      id: "tabs",
      selector: '[data-tour="admin-tabs"]',
      title: "Faner",
      description:
        "Innholdet er delt i faner: Brukere, Kunder, E-post, SORA (krever tillegg), Mitt selskap og Opplæring. Vi går gjennom én og én — noen faner kan være skjult avhengig av abonnement og tilleggsmoduler.",
      side: "bottom",
      requiresAdmin: true,
      beforeStep: () => clickTab('[data-tour="admin-tab-users"]'),
    },

    // ---------- USERS TAB ----------
    {
      id: "tab-users",
      selector: '[data-tour="admin-tab-users"]',
      title: "Brukere",
      description: "Hovedfanen for brukerstyring. Her godkjenner du nye brukere, tildeler roller og styrer hvem som kan godkjenne oppdrag, være hendelsesansvarlig osv.",
      side: "bottom",
      requiresAdmin: true,
    },
    {
      id: "registration-code",
      selector: '[data-tour="admin-registration-code"]',
      title: "Registreringskode",
      description: "Koden nye brukere oppgir når de registrerer seg, slik at de havner i ditt selskap. Trykk «Kopier» for å dele den.",
      side: "bottom",
      requiresAdmin: true,
      optional: true,
    },
    {
      id: "invite",
      selector: '[data-tour="admin-invite"]',
      title: "Inviter ny bruker",
      description: "Send en invitasjons-e-post med registreringskode og lenke. Har selskapet flere avdelinger, kan du velge hvilken avdeling brukeren skal havne i.",
      side: "bottom",
      requiresAdmin: true,
    },
    {
      id: "pending",
      selector: '[data-tour="admin-pending"]',
      title: "Ventende godkjenninger",
      description: "Nye brukere må godkjennes før de får tilgang. Trykk «Godkjenn» for å aktivere kontoen — eller papirkurv-ikonet for å avvise og slette. Husk at hver godkjent bruker øker antall seter på abonnementet.",
      side: "top",
      requiresAdmin: true,
      optional: true,
    },
    {
      id: "approved",
      selector: '[data-tour="admin-approved"]',
      title: "Godkjente brukere",
      description: "Listen over alle aktive brukere. Du kan kopiere mailliste, åpne hver bruker for å sette rolle (administrator/bruker), styre om de kan godkjenne oppdrag, om de er teknisk ansvarlig, hendelsesansvarlig, har ECCAIRS-tilgang, er under opplæring og hvilken avdeling de tilhører. Slett-knappen sletter brukeren permanent (operativ historikk beholdes).",
      side: "top",
      requiresAdmin: true,
    },

    // ---------- CUSTOMERS ----------
    {
      id: "tab-customers",
      selector: '[data-tour="admin-tab-customers"]',
      title: "Kunder",
      description: "Fanen «Kunder» — registrer eksterne oppdragsgivere. Disse kan kobles til oppdrag og brukes som intern POC på tvers av avdelinger.",
      side: "bottom",
      requiresAdmin: true,
      beforeStep: () => clickTab('[data-tour="admin-tab-customers"]'),
    },
    {
      id: "customers-content",
      selector: '[data-tour="admin-content-customers"]',
      title: "Kundelisten",
      description: "Legg til, rediger og arkiver kunder. Hvis selskapet er en avdeling, ser du også kunder som er delt fra morselskapet.",
      side: "top",
      requiresAdmin: true,
      optional: true,
    },

    // ---------- EMAIL ----------
    {
      id: "tab-email",
      selector: '[data-tour="admin-tab-email"]',
      title: "E-post",
      description: "Her redigerer du e-postmaler (velkomst, godkjenning, varsler), endrer avsenderinnstillinger og sender masse-e-poster.",
      side: "bottom",
      requiresAdmin: true,
      beforeStep: () => clickTab('[data-tour="admin-tab-email"]'),
    },
    {
      id: "email-content",
      selector: '[data-tour="admin-content-email"]',
      title: "Maler og bulk-utsending",
      description: "Øverst: rediger maler og åpne e-postinnstillinger. Nederst: send bulk-e-post til valgte mottakere — historikken vises rett under skjemaet.",
      side: "top",
      requiresAdmin: true,
      optional: true,
    },

    // ---------- SORA (gated by addon, optional so it skips silently) ----------
    {
      id: "tab-sora",
      selector: '[data-tour="admin-tab-sora"]',
      title: "SORA-innstillinger",
      description: "Krever SORA-tillegg. Her setter du selskapsspesifikke standarder for AI-risikovurdering: flygeområde, høydegrenser og krav til avbøtende tiltak.",
      side: "bottom",
      requiresAdmin: true,
      optional: true,
      beforeStep: () => clickTab('[data-tour="admin-tab-sora"]'),
    },
    {
      id: "sora-content",
      selector: '[data-tour="admin-content-sora"]',
      title: "SORA-konfigurasjon",
      description: "Standardene brukes som utgangspunkt på alle nye SORA-oppdrag. Pilot kan justere på enkeltoppdrag, men disse verdiene styrer auto-utfylling og terskler.",
      side: "top",
      requiresAdmin: true,
      optional: true,
    },

    // ---------- MITT SELSKAP ----------
    {
      id: "tab-child",
      selector: '[data-tour="admin-tab-child"]',
      title: "Mitt selskap",
      description: "Selskapsoppsett: navn, terminologi (droneoperatør/flyselskap), avdelinger/datterselskap, sjekklister, integrasjoner og propagering av innstillinger.",
      side: "bottom",
      requiresAdmin: true,
      beforeStep: () => clickTab('[data-tour="admin-tab-child"]'),
    },
    {
      id: "child-content",
      selector: '[data-tour="admin-content-child"]',
      title: "Selskap, avdelinger og innstillinger",
      description: "Opprett underliggende avdelinger, koble på FH2/ECCAIRS-tokens, redigere standardsjekklister og styre granulært hvilke innstillinger som propageres ned til avdelinger.",
      side: "top",
      requiresAdmin: true,
      optional: true,
    },

    // ---------- TRAINING ----------
    {
      id: "tab-training",
      selector: '[data-tour="admin-tab-training"]',
      title: "Opplæring",
      description: "Kursbygger og tildeling. Lag kurs (manuelt eller med AI), tildel til brukere, følg status og lås opp moduler basert på beståtte kurs.",
      side: "bottom",
      requiresAdmin: true,
      beforeStep: () => clickTab('[data-tour="admin-tab-training"]'),
    },
    {
      id: "training-content",
      selector: '[data-tour="admin-content-training"]',
      title: "Kurs, tildeling og status",
      description: "Bygg kurs som kombinasjon av video, tekst, PDF-slides og guidede tourer. Tildel til personer eller hele avdelinger og følg gjennomføring/score under «Status».",
      side: "top",
      requiresAdmin: true,
      optional: true,
    },

    // ---------- DONE ----------
    {
      id: "done",
      selector: "main",
      title: "Du har sett admin-siden",
      description:
        "Husk: roller og godkjenninger her påvirker tilganger i hele appen umiddelbart (RLS). Vær varsom med sletting — brukere fjernes permanent, men deres operative historikk beholdes (oppdrag, flytider, hendelser).",
      side: "bottom",
      requiresAdmin: true,
      beforeStep: () => clickTab('[data-tour="admin-tab-users"]'),
    },
  ],
};
