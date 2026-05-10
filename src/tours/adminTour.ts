import type { TourDefinition } from "./types";
import { sleep } from "./tourUtils";

const clickTab = async (selector: string) => {
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return;
  // Radix Tabs aktiveres på pointerdown — vanlig .click() er ikke alltid nok
  const opts: PointerEventInit = { bubbles: true, cancelable: true, composed: true, pointerType: "mouse", button: 0 };
  try {
    el.dispatchEvent(new PointerEvent("pointerdown", opts));
    el.dispatchEvent(new PointerEvent("pointerup", opts));
  } catch {
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0 }));
  }
  el.click();
  // Vent til Radix faktisk har satt fanen til aktiv
  for (let i = 0; i < 20; i++) {
    if (el.getAttribute("data-state") === "active") break;
    await sleep(25);
  }
  await sleep(250);
};

export const adminTour: TourDefinition = {
  id: "admin",
  title: "Administrasjon — full gjennomgang",
  description:
    "Grundig tour gjennom admin-siden: brukere, kunder, e-post, SORA, mitt selskap og opplæring. Krever administrator-tilgang. Superadmin-funksjoner (Selskaper, NOTAM, Kalkulator) er ikke en del av denne touren.",
  steps: [
    // ---------- INTRO ----------
    {
      id: "intro",
      route: "/admin",
      selector: "main",
      title: "Velkommen til administrasjon",
      description:
        "Admin-siden er kontrollpanelet for selskapet ditt. Her godkjenner du brukere, styrer roller og avdelingstilhørighet, sender invitasjoner, redigerer e-postmaler, definerer SORA-grenser og holder orden på avdelinger og opplæring. Du må være administrator for å kjøre denne touren.",
      side: "bottom",
      requiresAdmin: true,
    },
    {
      id: "tabs",
      selector: '[data-tour="admin-tabs"]',
      title: "Faner",
      description:
        "Innholdet er delt i faner: <b>Brukere</b>, <b>Kunder</b>, <b>E-post</b>, <b>SORA</b> (krever tillegg), <b>Mitt selskap</b> og <b>Opplæring</b>. Vi går grundig gjennom hver fane. Noen faner kan være skjult avhengig av abonnement og tilleggsmoduler.",
      side: "bottom",
      requiresAdmin: true,
      beforeStep: () => clickTab('[data-tour="admin-tab-users"]'),
    },

    // ====================================================
    // BRUKERE (8 steg)
    // ====================================================
    {
      id: "users-tab",
      selector: '[data-tour="admin-tab-users"]',
      title: "Brukere — oversikt",
      description:
        "Hovedfanen for brukerstyring. Her finner du registreringskoden, sender invitasjoner, godkjenner ventende brukere og styrer rollene til godkjente brukere.",
      side: "bottom",
      requiresAdmin: true,
      beforeStep: () => clickTab('[data-tour="admin-tab-users"]'),
    },
    {
      id: "registration-code",
      selector: '[data-tour="admin-registration-code"]',
      title: "Registreringskode",
      description:
        "Den unike koden ansatte oppgir når de registrerer seg, slik at de havner i ditt selskap. Trykk «Kopier» for å dele den. Hver avdeling har sin egen kode — sjekk under «Mitt selskap» for avdelingskoder.",
      side: "bottom",
      requiresAdmin: true,
      optional: true,
    },
    {
      id: "invite",
      selector: '[data-tour="admin-invite"]',
      title: "Inviter ny bruker",
      description:
        "Send en invitasjons-e-post med registreringskoden og en lenke. Har selskapet flere avdelinger, kan du velge hvilken avdeling brukeren skal havne i før utsending. Brukeren får en ferdig invitasjon og dukker opp under «Ventende» når kontoen er opprettet.",
      side: "bottom",
      requiresAdmin: true,
    },
    {
      id: "pending",
      selector: '[data-tour="admin-pending"]',
      title: "Ventende godkjenninger",
      description:
        "Nye brukere må godkjennes før de får tilgang til appen. Trykk <b>«Godkjenn»</b> for å aktivere kontoen — eller papirkurv-ikonet for å avvise og slette. Hver godkjent bruker øker antall seter på abonnementet, så husk å avvise spam-registreringer.",
      side: "top",
      requiresAdmin: true,
      optional: true,
    },
    {
      id: "approved-actions",
      selector: '[data-tour="admin-approved-actions"]',
      title: "Mailliste og masse-utsending",
      description:
        "Knapperaden gir deg <b>Vis mailliste</b> (viser alle e-poster i et tekstfelt) og <b>Kopier mailliste</b> (kopierer alle adresser komma-separert til utklippstavlen). Praktisk for nyhetsbrev eller eksterne kommunikasjonsverktøy.",
      side: "bottom",
      requiresAdmin: true,
    },
    {
      id: "approved-list",
      selector: '[data-tour="admin-approved"]',
      title: "Godkjente brukere — kort",
      description:
        "Listen over alle aktive brukere i selskapet (og avdelinger om du er morselskap). På desktop ser du brytere direkte i raden; på mobil åpner du kortet for å redigere. Hver bruker viser navn, e-post og avdelings-badge.",
      side: "top",
      requiresAdmin: true,
    },
    {
      id: "user-roles-switches",
      selector: '[data-tour="admin-approved"]',
      title: "Roller og brytere per bruker",
      description:
        "For hver bruker styrer du: <b>Rolle</b> (administrator/bruker), <b>Avdeling</b>, <b>Teknisk ansvarlig</b> (mottar drone-vedlikeholdsvarsler), <b>Kan godkjenne oppdrag</b> (med valg av hvilke avdelinger), <b>Oppfølgingsansvarlig hendelser</b>, og <b>ECCAIRS-tilgang</b> (hvis aktivert). Endringer trer i kraft umiddelbart via RLS.",
      side: "top",
      requiresAdmin: true,
    },
    {
      id: "user-training-delete",
      selector: '[data-tour="admin-approved"]',
      title: "Opplæring og sletting",
      description:
        "Bryteren <b>«Under opplæring»</b> låser brukeren til kun moduler du selv velger via Opplærings-pickeren — perfekt for nyansatte. <b>Slett</b>-knappen fjerner brukeren permanent fra Auth, men <i>operativ historikk beholdes</i> (oppdrag, flytider, hendelser blir bevart med navnet anonymisert).",
      side: "top",
      requiresAdmin: true,
    },

    // ====================================================
    // KUNDER (3 steg)
    // ====================================================
    {
      id: "tab-customers",
      selector: '[data-tour="admin-tab-customers"]',
      title: "Kunder — fane",
      description:
        "Registrer og administrer eksterne oppdragsgivere. Disse kan kobles til oppdrag og brukes som intern POC på tvers av avdelinger.",
      side: "bottom",
      requiresAdmin: true,
      beforeStep: () => clickTab('[data-tour="admin-tab-customers"]'),
    },
    {
      id: "customers-add",
      selector: '[data-tour="admin-content-customers"]',
      title: "Legg til ny kunde",
      description:
        "Bruk «Ny kunde»-knappen øverst for å registrere kontaktinformasjon, fakturadetaljer og standard intern POC. Kunder kan tildeles ansvarlige personer som vises automatisk på oppdrag.",
      side: "top",
      requiresAdmin: true,
      optional: true,
    },
    {
      id: "customers-list",
      selector: '[data-tour="admin-content-customers"]',
      title: "Kundeliste og delte kunder",
      description:
        "Klikk på en kunde for å redigere eller arkivere. Hvis selskapet er en avdeling under et morselskap, ser du også <b>delte kunder</b> fra morselskapet markert med badge — disse er felleseie og kan brukes på dine oppdrag.",
      side: "top",
      requiresAdmin: true,
      optional: true,
    },

    // ====================================================
    // E-POST (4 steg)
    // ====================================================
    {
      id: "tab-email",
      selector: '[data-tour="admin-tab-email"]',
      title: "E-post — fane",
      description:
        "Her redigerer du e-postmaler (velkomst, godkjenning, varsler), endrer avsenderinnstillinger og sender masse-e-poster til brukere/kunder.",
      side: "bottom",
      requiresAdmin: true,
      beforeStep: () => clickTab('[data-tour="admin-tab-email"]'),
    },
    {
      id: "email-templates",
      selector: '[data-tour="admin-content-email"]',
      title: "E-postmaler",
      description:
        "Øverst finner du alle redigerbare maler: <b>velkomst</b>, <b>godkjenning</b>, <b>invitasjon</b>, <b>varsler</b> osv. Klikk en mal for å redigere emnefelt og innhold med variabler som <code>{{userName}}</code> og <code>{{companyName}}</code>.",
      side: "top",
      requiresAdmin: true,
      optional: true,
    },
    {
      id: "email-settings",
      selector: '[data-tour="admin-content-email"]',
      title: "Avsenderinnstillinger",
      description:
        "Knappen <b>«E-postinnstillinger»</b> åpner dialogen hvor du setter avsendernavn, svar-til-adresse og eventuelt egen domene-konfigurasjon. Standard avsender er <code>noreply@avisafe.no</code> via Resend.",
      side: "top",
      requiresAdmin: true,
      optional: true,
    },
    {
      id: "email-bulk",
      selector: '[data-tour="admin-content-email"]',
      title: "Masse-utsending og historikk",
      description:
        "Nederst finner du <b>bulk-e-post</b>-skjemaet: velg mottakere (alle brukere, alle kunder, eller egen liste), skriv emne og innhold, og send. Historikken under skjemaet viser alle tidligere kampanjer med status og åpningsstatistikk.",
      side: "top",
      requiresAdmin: true,
      optional: true,
    },

    // ====================================================
    // SORA (4 steg, optional via addon)
    // ====================================================
    {
      id: "tab-sora",
      selector: '[data-tour="admin-tab-sora"]',
      title: "SORA-innstillinger",
      description:
        "Krever <b>SORA-tillegg</b>. Her setter du selskapsspesifikke standarder som AI-risikovurderingen og pilotene bygger oppdrag på.",
      side: "bottom",
      requiresAdmin: true,
      optional: true,
      beforeStep: () => clickTab('[data-tour="admin-tab-sora"]'),
    },
    {
      id: "sora-flightgeo",
      selector: '[data-tour="admin-content-sora"]',
      title: "Standard flygeområde",
      description:
        "Definer standard <b>Flight Geography Area</b> som auto-fylles på nye SORA-oppdrag (typisk meter-radius rundt take-off). Pilot kan justere på enkeltoppdrag, men dette er utgangspunktet.",
      side: "top",
      requiresAdmin: true,
      optional: true,
    },
    {
      id: "sora-altitude",
      selector: '[data-tour="admin-content-sora"]',
      title: "Høydegrenser",
      description:
        "Sett selskapets standard <b>maks AGL-høyde</b>. Brukes både som auto-fyll og som terskel i risikovurdering — overstiges grensen, flagges oppdraget for ekstra vurdering.",
      side: "top",
      requiresAdmin: true,
      optional: true,
    },
    {
      id: "sora-mitigations",
      selector: '[data-tour="admin-content-sora"]',
      title: "Avbøtende tiltak og standarder",
      description:
        "Forhåndsvalgte avbøtende tiltak (M1/M2-tiltak, prosedyrer) som dukker opp på alle SORA-oppdrag. Reduserer manuelt arbeid for piloten og sikrer at selskapets standarder følges.",
      side: "top",
      requiresAdmin: true,
      optional: true,
    },

    // ====================================================
    // MITT SELSKAP (5 steg)
    // ====================================================
    {
      id: "tab-child",
      selector: '[data-tour="admin-tab-child"]',
      title: "Mitt selskap — fane",
      description:
        "Selskapsoppsett: navn, terminologi, avdelinger/datterselskap, sjekklister, integrasjoner og styring av hvilke innstillinger som propageres ned til avdelinger.",
      side: "bottom",
      requiresAdmin: true,
      beforeStep: () => clickTab('[data-tour="admin-tab-child"]'),
    },
    {
      id: "child-info",
      selector: '[data-tour="admin-content-child"]',
      title: "Selskapsinfo og terminologi",
      description:
        "Rediger navn, logo og <b>terminologi</b> — droneoperatør vs. flyselskap. Terminologien bytter ord i hele appen (f.eks. «pilot» vs. «fartøysjef»).",
      side: "top",
      requiresAdmin: true,
      optional: true,
    },
    {
      id: "child-departments",
      selector: '[data-tour="admin-content-child"]',
      title: "Avdelinger / datterselskap",
      description:
        "Opprett underliggende avdelinger med egen registreringskode. Hver avdeling får isolerte data via RLS, men morselskapet ser alt via hierarkisk visning. Brukere kan tilhøre én avdeling om gangen.",
      side: "top",
      requiresAdmin: true,
      optional: true,
    },
    {
      id: "child-checklists",
      selector: '[data-tour="admin-content-child"]',
      title: "Standard sjekklister",
      description:
        "Rediger standardsjekklister for pre-flight, post-flight og vedlikehold. Disse fungerer som maler for alle oppdrag og resurser i selskapet — pilot kan legge til oppdragsspesifikke punkter underveis.",
      side: "top",
      requiresAdmin: true,
      optional: true,
    },
    {
      id: "child-integrations-propagation",
      selector: '[data-tour="admin-content-child"]',
      title: "Integrasjoner og propagering",
      description:
        "Koble på <b>FlightHub 2</b>, <b>ECCAIRS</b> og <b>DroneTag</b> med tokens (krypteres i database). Lengre nede styrer du <b>granulær propagering</b>: hver innstillingstype (sjekklister, kunder, e-postmaler …) kan velges ut/inn for hver avdeling.",
      side: "top",
      requiresAdmin: true,
      optional: true,
    },

    // ====================================================
    // OPPLÆRING (5 steg)
    // ====================================================
    {
      id: "tab-training",
      selector: '[data-tour="admin-tab-training"]',
      title: "Opplæring — fane",
      description:
        "Kursbygger og tildeling. Lag kurs (manuelt eller med AI), tildel til brukere, følg status og lås opp moduler basert på beståtte kurs.",
      side: "bottom",
      requiresAdmin: true,
      beforeStep: () => clickTab('[data-tour="admin-tab-training"]'),
    },
    {
      id: "training-courses",
      selector: '[data-tour="admin-content-training"]',
      title: "Kursbygger (manuell)",
      description:
        "Bygg kurs som en sekvens av moduler: <b>video</b> (YouTube/Vimeo), <b>tekst</b> (rik formatering), <b>PDF-slides</b>, og <b>guidede tourer</b> som peker rett inn i appen. Sett krav til bestått %, antall forsøk og hvilke moduler kurset låser opp ved fullføring.",
      side: "top",
      requiresAdmin: true,
      optional: true,
    },
    {
      id: "training-ai",
      selector: '[data-tour="admin-content-training"]',
      title: "AI-kursgenerator",
      description:
        "<b>«Generer med AI»</b> bygger et komplett kurs fra et tema og målgruppe — den foreslår struktur, finner relevante YouTube-klipp, skriver tekst og lager quiz. Du kan redigere alt i etterkant før publisering.",
      side: "top",
      requiresAdmin: true,
      optional: true,
    },
    {
      id: "training-assign",
      selector: '[data-tour="admin-content-training"]',
      title: "Tildeling",
      description:
        "Tildel kurs til <b>enkeltpersoner</b> eller <b>hele avdelinger</b> samtidig. Sett frist for fullføring; brukeren får varsel og ser kurset under «Mine kurs» på profilsiden.",
      side: "top",
      requiresAdmin: true,
      optional: true,
    },
    {
      id: "training-status",
      selector: '[data-tour="admin-content-training"]',
      title: "Status og score",
      description:
        "<b>Status</b>-fliken viser alle pågående og fullførte tildelinger med score, antall forsøk og tidsbruk. Beståtte kurs <i>låser opp</i> moduler i appen automatisk for brukeren.",
      side: "top",
      requiresAdmin: true,
      optional: true,
    },

    // ====================================================
    // AVSLUTNING
    // ====================================================
    {
      id: "done",
      selector: "main",
      title: "Du har sett admin-siden",
      description:
        "Husk: <b>roller og godkjenninger</b> her påvirker tilganger i hele appen umiddelbart via RLS. <b>Slett</b>-knappen fjerner brukeren permanent fra Auth, men beholder operativ historikk (oppdrag, flytider, hendelser) for revisjon. Trenger du å gjenåpne touren senere finner du den under <b>«Veiledet tour»</b> i menyen.",
      side: "bottom",
      requiresAdmin: true,
      beforeStep: () => clickTab('[data-tour="admin-tab-users"]'),
    },
  ],
};
