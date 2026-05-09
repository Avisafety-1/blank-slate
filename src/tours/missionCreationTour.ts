import type { TourDefinition } from "./types";

export const missionCreationTour: TourDefinition = {
  id: "mission-creation",
  title: "Opprett oppdrag (kart-flyt)",
  description:
    "Anbefalt arbeidsflyt: planlegg ruten i kartet med SORA-buffer og tilstøtende områder, og lagre — oppdragsdialogen åpnes ferdig utfylt.",
  steps: [
    {
      id: "kart-intro",
      selector: '[data-tour="nav-map"]',
      title: "Start på kartet",
      description:
        "AviSafe sin anbefalte arbeidsflyt for nye oppdrag er å starte i kartet. Da får du ruten, SORA-volumet, befolkning og luftrom riktig fra første stund.",
      side: "bottom",
      route: "/kart",
      optional: true,
    },
    {
      id: "start-route-planner",
      selector: '[data-tour="map-route-planner-trigger"]',
      title: "Planlegg ny rute",
      description:
        "Klikk «Planlegg ny rute» (rute-ikonet) for å åpne ruteplanleggeren. Her tegner du operasjonsområdet direkte i kartet.",
      side: "left",
      route: "/kart",
      optional: true,
    },
    {
      id: "draw-route",
      selector: '[data-tour="map-route-save"]',
      title: "Tegn ruten i kartet",
      description:
        "Klikk i kartet for å legge til rutepunkter. Minst 3 punkter for et område, 2 for en korridor. Når du har minst 2 punkter blir «Lagre»-knappen aktiv. Klikk «Neste» når du er klar.",
      side: "left",
      route: "/kart",
      optional: true,
    },
    {
      id: "sora-toggle",
      selector: '[data-tour="map-sora-toggle"]',
      title: "Skru på SORA-volum",
      description:
        "Aktiver «SORA volum» for å beregne flygeometri, contingency- og ground risk-buffer. Velg drone, hastighet og flyhøyde i panelet — verdiene fylles inn automatisk fra dronemodellen.",
      side: "bottom",
      route: "/kart",
      optional: true,
    },
    {
      id: "adjacent-toggle",
      selector: '[data-tour="map-adjacent-toggle"]',
      title: "Tilstøtende områder",
      description:
        "Skru på «Tilstøtende» for å beregne befolkningstetthet rundt operasjonen. Dette gir deg required containment, SAIL og dokumentasjon for risikovurderingen.",
      side: "bottom",
      route: "/kart",
      optional: true,
    },
    {
      id: "pilot-position",
      selector: '[data-tour="map-pilot-button"]',
      title: "Plasser pilot (valgfritt)",
      description:
        "Klikk «Pilot» og deretter i kartet for å markere pilotposisjon. Brukes for VLOS-sjekk og dokumentasjon.",
      side: "bottom",
      route: "/kart",
      optional: true,
    },
    {
      id: "save-route",
      selector: '[data-tour="map-route-save"]',
      title: "Lagre ruten",
      description:
        "Klikk «Lagre» når ruten og bufferen er klar. Oppdragsdialogen åpnes nå ferdig utfylt med rute, SORA-data, drone og buffer — du trenger bare fylle inn navn, kunde, tid og personell.",
      side: "left",
      route: "/kart",
      optional: true,
    },
    {
      id: "finish",
      selector: '[data-tour="nav-map"]',
      title: "Du er klar!",
      description:
        "Etter lagring fyller du inn resten i oppdragsdialogen og publiserer. Du kan starte denne guiden på nytt fra Min profil → Kompetanse, eller hjelp-knappen i toppen.",
      side: "bottom",
      route: "/kart",
      optional: true,
    },
  ],
};
