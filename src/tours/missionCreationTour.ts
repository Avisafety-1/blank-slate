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
      selector: '[data-tour="map-container"]',
      title: "Tegn ruten i kartet",
      description:
        "Klikk i kartet for å legge til rutepunkter. Minst 3 punkter for et område, 2 for en korridor. Når du har minst 2 punkter blir «Lagre»-knappen aktiv. Klikk «Neste» når du er klar.",
      side: "top",
      route: "/kart",
      beforeStep: async () => {
        if (!document.querySelector('[data-tour="map-route-save"]')) {
          document.querySelector<HTMLElement>('[data-tour="map-route-planner-trigger"]')?.click();
          await new Promise((resolve) => window.setTimeout(resolve, 250));
        }
      },
      allowMapInteraction: true,
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
      allowMapInteraction: true,
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
      id: "kml-import",
      selector: '[data-tour="map-route-kml"]',
      title: "Importer KML/KMZ",
      description:
        "Last opp en KML- eller KMZ-fil (f.eks. eksportert fra DJI Pilot, Google Earth eller andre verktøy) for å fylle inn ruten automatisk i stedet for å tegne manuelt.",
      side: "bottom",
      route: "/kart",
      optional: true,
    },
    {
      id: "ippc-link",
      selector: '[data-tour="map-route-ippc"]',
      title: "IPPC – sjekk NOTAM",
      description:
        "Åpner ippc.no i ny fane slik at du kan sjekke aktive NOTAM for området før du flyr. Husk å vurdere relevante NOTAM som en del av risikovurderingen.",
      side: "bottom",
      route: "/kart",
      optional: true,
    },
    {
      id: "sensor-link",
      selector: '[data-tour="map-route-sensor"]',
      title: "Sensor – NSM-søknad",
      description:
        "Åpner NSM sin portal for søknad om flyging med sensor i sensorforbudssoner. Bruk denne hvis ruten din berører en slik sone.",
      side: "bottom",
      route: "/kart",
      optional: true,
    },
    {
      id: "fh2-send",
      selector: '[data-tour="map-route-fh2"]',
      title: "Send til DJI FlightHub 2",
      description:
        "Synlig hvis selskapet har koblet til FlightHub 2-token og ruten har minst 2 punkter. Sender ruten og SORA-korridoren rett til FH2 som en oppgave for piloten.",
      side: "bottom",
      route: "/kart",
      requiresModule: "missions",
      optional: true,
    },
    {
      id: "undo-point",
      selector: '[data-tour="map-route-undo"]',
      title: "Angre siste punkt",
      description:
        "Fjerner det sist plasserte rutepunktet. Bruk hvis du klikket feil – ruten oppdateres umiddelbart.",
      side: "top",
      route: "/kart",
      optional: true,
    },
    {
      id: "clear-route",
      selector: '[data-tour="map-route-clear"]',
      title: "Nullstill rute",
      description:
        "Sletter alle rutepunkter, men beholder ruteplanleggeren åpen så du kan starte på nytt uten å lukke panelet.",
      side: "top",
      route: "/kart",
      optional: true,
    },
    {
      id: "cancel-route",
      selector: '[data-tour="map-route-cancel"]',
      title: "Avbryt ruteplanlegging",
      description:
        "Lukker ruteplanleggeren og forkaster gjeldende rute uten å lagre. Bruk hvis du ikke ønsker å opprette et oppdrag likevel.",
      side: "top",
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
