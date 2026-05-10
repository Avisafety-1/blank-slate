import type { TourDefinition } from "./types";
import { sleep } from "./tourUtils";

const closeAnyOpenDialog = async () => {
  const open = document.querySelector<HTMLElement>('[role="dialog"][data-state="open"]');
  if (open) {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await sleep(200);
  }
};

const openStartFlightDialog = async () => {
  if (document.querySelector('[data-tour="start-flight-dialog"]')) return;
  (window as any).__avisafeTour?.openStartFlight?.();
  await sleep(450);
};

export const startFlightTour: TourDefinition = {
  id: "start-flight",
  title: "Start flygning",
  description:
    "Lær hvordan du starter en flygning fra dashbordet — med sjekklister, oppdrag, SafeSky-publisering og DroneTag.",
  steps: [
    {
      id: "intro",
      selector: '[data-tour="dashboard-flight-controls"]',
      title: "Start en flygning fra dashbordet",
      description:
        "«Start flygning»-knappen åpner dialogen hvor du velger oppdrag, gjør sjekklister og bestemmer publiseringsmodus før du tar av.",
      side: "top",
      route: "/",
      beforeStep: closeAnyOpenDialog,
      optional: true,
    },
    {
      id: "open-dialog",
      selector: '[data-tour="start-flight-dialog"]',
      title: "Start flygning-dialogen",
      description:
        "Her samler vi alt du trenger før take-off: lufttrafikk, sjekklister, oppdrag, publisering og DroneTag-enhet.",
      side: "left",
      route: "/",
      beforeStep: openStartFlightDialog,
      optional: true,
    },
    {
      id: "traffic",
      selector: '[data-tour="start-flight-traffic"]',
      title: "Lufttrafikk i nærheten",
      description:
        "AviSafe sjekker automatisk nærmeste bemannede trafikk innen 20 km. Rødt = under 5 km, gult = under 15 km. Trafikk over 5 000 ft filtreres bort.",
      side: "left",
      route: "/",
      beforeStep: openStartFlightDialog,
      optional: true,
    },
    {
      id: "checklists",
      selector: '[data-tour="start-flight-checklists"]',
      title: "Sjekklister før flyging",
      description:
        "Selskapets påkrevde sjekklister må gjennomføres før du kan starte. Klikk «Åpne sjekkliste» for å fylle ut. Admin kan koble nye sjekklister.",
      side: "left",
      route: "/",
      beforeStep: openStartFlightDialog,
      optional: true,
    },
    {
      id: "mission",
      selector: '[data-tour="start-flight-mission"]',
      title: "Velg oppdrag",
      description:
        "Knytt flygningen til et planlagt oppdrag. Oppdrag med rute (📍-ikon) gir tilgang til SafeSky Advisory-publisering automatisk.",
      side: "left",
      route: "/",
      beforeStep: openStartFlightDialog,
      optional: true,
    },
    {
      id: "publish-mode",
      selector: '[data-tour="start-flight-publish-mode"]',
      title: "Publiseringsmodus",
      description:
        "Velg om flygningen skal publiseres til SafeSky: «Ingen», «Advisory» (rute-varsling) eller «Live UAV» (sanntidsposisjon via DroneTag). Live UAV anbefales for økt sikkerhet i delt luftrom.",
      side: "left",
      route: "/",
      beforeStep: openStartFlightDialog,
      optional: true,
    },
    {
      id: "dronetag",
      selector: '[data-tour="start-flight-dronetag"]',
      title: "DroneTag-enhet",
      description:
        "For Live UAV må du velge en registrert DroneTag-enhet. Den sender posisjon kontinuerlig til SafeSky og andre operatører ser deg i kartet.",
      side: "left",
      route: "/",
      optional: true,
    },
    {
      id: "submit",
      selector: '[data-tour="start-flight-submit"]',
      title: "Klar til take-off",
      description:
        "Trykk «Start flygning» når alt er på plass. Tiden begynner å telle og flyturen havner i Aktive flygninger på dashbordet.",
      side: "top",
      route: "/",
      beforeStep: openStartFlightDialog,
      optional: true,
    },
  ],
};
