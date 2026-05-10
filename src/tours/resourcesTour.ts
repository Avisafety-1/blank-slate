import type { TourDefinition } from "./types";
import { sleep } from "./tourUtils";

const bridge = () => (window as any).__avisafeResourcesTour;

const closeAnyOpenDialog = async () => {
  // Lukk åpne dialoger via Escape (Radix lytter på Escape)
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  // Sikre at Resources-broen får ryddet opp i sin state
  bridge()?.closeAll?.();
  await sleep(300);
};

const openFirstDrone = async () => {
  await closeAnyOpenDialog();
  bridge()?.openFirstDrone?.();
  await sleep(450);
};

const openDroneLogbook = async () => {
  bridge()?.openDroneLogbook?.();
  await sleep(450);
};

const closeDroneLogbook = async () => {
  bridge()?.closeDroneLogbook?.();
  await sleep(300);
};

const openAddDrone = async () => {
  await closeAnyOpenDialog();
  bridge()?.openAddDrone?.();
  await sleep(450);
};

const openFirstEquipment = async () => {
  await closeAnyOpenDialog();
  bridge()?.openFirstEquipment?.();
  await sleep(450);
};

const openEquipmentLogbook = async () => {
  bridge()?.openEquipmentLogbook?.();
  await sleep(450);
};

const closeEquipmentLogbook = async () => {
  bridge()?.closeEquipmentLogbook?.();
  await sleep(300);
};

const openAddEquipment = async () => {
  await closeAnyOpenDialog();
  bridge()?.openAddEquipment?.();
  await sleep(450);
};

const openAddDronetag = async () => {
  await closeAnyOpenDialog();
  bridge()?.openAddDronetag?.();
  await sleep(450);
};

const openFirstPerson = async () => {
  await closeAnyOpenDialog();
  bridge()?.openFirstPerson?.();
  await sleep(450);
};

const openAddCompetency = async () => {
  await closeAnyOpenDialog();
  bridge()?.openAddCompetency?.();
  await sleep(450);
};

export const resourcesTour: TourDefinition = {
  id: "resources",
  title: "Ressurser — droner, utstyr og personell",
  description: "Lang gjennomgang av hele Ressurser-modulen. Vi går grundig gjennom alle tre seksjoner og dykker inn i dialogene for redigering, loggbok og kompetanse.",
  steps: [
    // ---------- INTRO ----------
    {
      id: "intro",
      route: "/ressurser",
      selector: "main",
      title: "Velkommen til Ressurser",
      description: "Her holder du oversikt over hele flåten: dronene/luftfartøyene dine, utstyret som henger på dem og personellet med kompetanse. Siden er delt i tre kolonner — vi går gjennom hver av dem.",
      side: "bottom",
    },

    // ---------- DRONER ----------
    {
      id: "drone-section",
      route: "/ressurser",
      selector: '[data-tour="resources-drone-section"]',
      title: "Droner / luftfartøy",
      description: "Den første kolonnen viser alle dronene/luftfartøyene som er tilgjengelige for selskapet ditt — inkludert dem som er delt fra et morselskap.",
      side: "right",
      beforeStep: closeAnyOpenDialog,
    },
    {
      id: "drone-add",
      selector: '[data-tour="resources-drone-add"]',
      title: "Legg til ny drone",
      description: "Trykk «+» for å registrere en ny drone. Du kan velge fra dronekatalogen (M4D, M400 osv.) — da fylles vekt, payload og klasse inn automatisk.",
      side: "left",
    },
    {
      id: "drone-search",
      selector: '[data-tour="resources-drone-search"]',
      title: "Søk i dronene",
      description: "Søk etter modellnavn, registreringsnummer eller serienummer. Resultatene oppdateres mens du skriver.",
      side: "bottom",
    },
    {
      id: "drone-filters",
      selector: '[data-tour="resources-drone-filters"]',
      title: "Filtre og sortering",
      description: "Filtrer på modell og status (grønn/gul/rød), eller sorter på «Sist flydd» for å finne dronen du brukte sist.",
      side: "bottom",
    },
    {
      id: "drone-card",
      selector: '[data-tour="resources-drone-card"]',
      title: "Dronekort",
      description: "Hvert kort viser modell, pilot, registreringsnummer, sist flydd, totale flyvetimer og neste inspeksjon. Statusfargen øverst til høyre summerer vedlikehold + advarsler.",
      side: "left",
    },

    // ---------- DRONE DETAIL ----------
    {
      id: "drone-detail",
      selector: '[data-tour="drone-detail-dialog"]',
      title: "Dronedetaljer",
      description: "Klikk på et kort for å åpne detaljvisningen. Her ser du all teknisk info: modell, serienummer, klasse, vekt, payload, kjøpsdato, neste inspeksjon, tilkoblet utstyr og personell.",
      side: "over",
      beforeStep: openFirstDrone,
      optional: false,
    },
    {
      id: "drone-detail-logbok",
      selector: '[data-tour="drone-detail-logbok"]',
      title: "Åpne loggboken",
      description: "Loggbok-knappen viser hele historikken til dronen: alle flyginger, vedlikehold, inspeksjoner, hendelser og merknader.",
      side: "bottom",
    },

    // ---------- DRONE LOGBOK ----------
    {
      id: "drone-logbook",
      selector: '[data-tour="drone-logbook-dialog"]',
      title: "Loggboken",
      description: "Loggboken samler alle hendelser kronologisk: oppdrag (autogenerert fra fullførte missions), manuell flytid, vedlikeholdsoppføringer, hendelser og merknader.",
      side: "over",
      beforeStep: openDroneLogbook,
      optional: false,
    },
    {
      id: "drone-logbook-add",
      selector: '[data-tour="drone-logbook-add"]',
      title: "Legg til oppføring",
      description: "Her registrerer du manuelt en merknad, hendelse, reparasjon eller annet. Du kan legge ved bilde, knytte til drone og angi dato.",
      side: "right",
    },
    {
      id: "drone-logbook-export",
      selector: '[data-tour="drone-logbook-export"]',
      title: "Eksporter til PDF",
      description: "Eksporter hele loggboken som PDF — den lagres samtidig under «Dokumenter» på dronen, slik at du har en versjonert papirspor for myndigheter eller revisjon.",
      side: "left",
    },

    // ---------- BACK TO DRONE DETAIL ----------
    {
      id: "drone-detail-back",
      selector: '[data-tour="drone-detail-dialog"]',
      title: "Tilbake til drone",
      description: "Vi lukker loggboken og er tilbake i dronedetaljene. Her kan du også registrere vedlikehold/inspeksjon utført, koble på utstyr, knytte personell og endre tilhørende sjekklister.",
      side: "over",
      beforeStep: closeDroneLogbook,
    },
    {
      id: "drone-detail-edit",
      selector: '[data-tour="drone-detail-edit"]',
      title: "Rediger drone",
      description: "Trykk «Rediger» for å endre modell, serienummer, klasse, vekt, payload, intern serie, registreringsnummer, status, vedlikeholds-/inspeksjonsintervaller og tilknyttede sjekklister.",
      side: "left",
    },

    // ---------- ADD DRONE DIALOG ----------
    {
      id: "add-drone",
      selector: '[data-tour="add-drone-dialog"]',
      title: "Registrer ny drone",
      description: "Velg en modell fra dronekatalogen så fylles vekt, payload, klasse og merknader inn automatisk — eller velg «Angi manuelt». Sett serienummer, internt serienummer og kjøpsdato.",
      side: "over",
      beforeStep: openAddDrone,
      optional: false,
    },
    {
      id: "add-drone-inspection",
      selector: '[data-tour="add-drone-dialog"]',
      title: "Inspeksjonsplan",
      description: "Sett inspeksjons-startdato og -intervall (dager) for å automatisk regne ut neste inspeksjonsdato. Velg sjekkliste som må fullføres før inspeksjonen kan kvitteres ut.",
      side: "over",
    },

    // ---------- UTSTYR ----------
    {
      id: "equipment-section",
      selector: '[data-tour="resources-equipment-section"]',
      title: "Utstyr",
      description: "Andre kolonne er utstyr — kameraer, gimbals, batterier, sensorer og annet. Du kan også legge til DroneTag-enheter (Remote ID).",
      side: "left",
      beforeStep: closeAnyOpenDialog,
    },
    {
      id: "equipment-add",
      selector: '[data-tour="resources-equipment-add"]',
      title: "Legg til utstyr",
      description: "Registrer et nytt stykke utstyr: navn, type, serienummer, vekt og vedlikeholdsregler (dager / flyvetimer / antall oppdrag).",
      side: "left",
    },
    {
      id: "equipment-dronetag",
      selector: '[data-tour="resources-equipment-dronetag"]',
      title: "DroneTag",
      description: "Egen knapp for DroneTag-enheter (live posisjonering / Remote ID). Disse vises også i listen og kan kobles til en drone for «Live UAV».",
      side: "left",
    },
    {
      id: "equipment-filters",
      selector: '[data-tour="resources-equipment-filters"]',
      title: "Søk og filtre",
      description: "Filtrer på kategori og status, eller søk etter navn, type, serienummer eller merknad.",
      side: "bottom",
    },
    {
      id: "equipment-card",
      selector: '[data-tour="resources-equipment-card"]',
      title: "Utstyrskort",
      description: "Hvert kort viser type, serienummer, neste vedlikehold og status. Trykk for å åpne detaljvisningen.",
      side: "left",
    },

    // ---------- EQUIPMENT DETAIL ----------
    {
      id: "equipment-detail",
      selector: '[data-tour="equipment-detail-dialog"]',
      title: "Utstyrsdetaljer",
      description: "Detaljvisningen for utstyr viser navn, type, serienumre, vekt, totale flyvetimer, status, advarsler og hvilke droner det er montert på.",
      side: "over",
      beforeStep: openFirstEquipment,
      optional: false,
    },
    {
      id: "equipment-detail-logbok",
      selector: '[data-tour="equipment-detail-logbok"]',
      title: "Utstyrsloggbok",
      description: "Loggbok-knappen viser hendelser, vedlikehold og reparasjoner på dette utstyret — uavhengig av hvilken drone det satt på.",
      side: "bottom",
    },
    {
      id: "equipment-logbook",
      selector: '[data-tour="equipment-logbook-dialog"]',
      title: "Loggbok for utstyr",
      description: "Samme oppsett som dronelogboken: legg til oppføringer, last ved bilde, eksporter PDF. Flyvetimer akkumuleres automatisk hver gang utstyret er med på et fullført oppdrag.",
      side: "over",
      beforeStep: openEquipmentLogbook,
      optional: false,
    },

    // ---------- ADD EQUIPMENT ----------
    {
      id: "add-equipment",
      selector: '[data-tour="add-equipment-dialog"]',
      title: "Registrer nytt utstyr",
      description: "Sett navn, type/kategori, serienummer og vekt. Vedlikehold kan styres på dager, flyvetimer eller antall oppdrag — sett varsel-grenser så får du gult lys før det forfaller.",
      side: "over",
      beforeStep: async () => {
        await closeEquipmentLogbook();
        await closeAnyOpenDialog();
        await openAddEquipment();
      },
      optional: false,
    },

    // ---------- DRONETAG ----------
    {
      id: "add-dronetag",
      selector: '[data-tour="add-dronetag-dialog"]',
      title: "Legg til DroneTag",
      description: "DroneTag-enheter krever at du oppgir device-ID. Etter registrering kan enheten kobles til en drone og brukes til live posisjonering under flyging.",
      side: "over",
      beforeStep: openAddDronetag,
      optional: false,
    },

    // ---------- PERSONELL ----------
    {
      id: "personnel-section",
      selector: '[data-tour="resources-personnel-section"]',
      title: "Personell",
      description: "Tredje kolonne viser personell i selskapet (og personell delt fra over-/underliggende selskaper). Hver person har en kompetanseliste med utløpsdatoer og status.",
      side: "left",
      beforeStep: closeAnyOpenDialog,
    },
    {
      id: "personnel-add",
      selector: '[data-tour="resources-personnel-add"]',
      title: "Legg til kompetanse",
      description: "Knappen åpner et skjema der du kan tildele en kompetanse til én eller flere personer på én gang — f.eks. STS-kurs eller medisinsk attest.",
      side: "left",
    },
    {
      id: "personnel-filters",
      selector: '[data-tour="resources-personnel-filters"]',
      title: "Søk, rolle og status",
      description: "Søk etter navn eller kompetansenavn, og filtrer på rolle/tittel og status. Røde personer har utløpt kompetanse som påvirker status.",
      side: "bottom",
    },
    {
      id: "personnel-card",
      selector: '[data-tour="resources-personnel-card"]',
      title: "Personellkort",
      description: "Hvert kort viser navn, rolle, antall ventende kurs (om noen), og en kompakt visning av kompetanser. Røde merker = utløpt, gule = utløper innen 30 dager.",
      side: "left",
    },

    // ---------- PERSON DIALOG ----------
    {
      id: "person-dialog",
      selector: '[data-tour="person-dialog"]',
      title: "Persondetaljer",
      description: "Detaljvisningen for en person viser alle kompetanser, tilgjengelige kurs, og lar deg legge til nye kompetanser direkte.",
      side: "over",
      beforeStep: openFirstPerson,
      optional: false,
    },
    {
      id: "person-logbok",
      selector: '[data-tour="person-logbok"]',
      title: "Personlig loggbok",
      description: "«Loggbok» åpner personens flyloggbok — alle oppdrag og flyvetimer som er logget på vedkommende.",
      side: "bottom",
    },
    {
      id: "person-competencies",
      selector: '[data-tour="person-competencies"]',
      title: "Kompetanser",
      description: "Hver kompetanse kan redigeres, slettes, lastes ned (PDF), og du kan styre om den «påvirker status» (rød/gul ved utløp). Klikk på en kompetanse for å redigere type, navn, datoer og last opp dokument.",
      side: "top",
    },
    {
      id: "person-courses",
      selector: '[data-tour="person-courses"]',
      title: "Tilgjengelige kurs",
      description: "Tildelte kurs og selvbetjente kurs (tilgjengelig for alle) vises her. Trykk «Ta kurs» for å starte gjennomføring direkte fra denne dialogen.",
      side: "top",
      optional: true,
    },
    {
      id: "person-add-competency",
      selector: '[data-tour="person-add-competency"]',
      title: "Legg til kompetanse på person",
      description: "Skjema nederst i dialogen lar deg raskt legge til en ny kompetanse på akkurat denne personen — type, navn, utstedt/utløpsdato og evt. dokument.",
      side: "top",
    },

    // ---------- ADD COMPETENCY ----------
    {
      id: "add-competency",
      selector: '[data-tour="add-competency-dialog"]',
      title: "Tildel kompetanse til flere",
      description: "Denne dialogen brukes når du vil tildele samme kompetanse til mange personer samtidig. Velg type, navn, datoer og personene — så opprettes én rad per person.",
      side: "over",
      beforeStep: openAddCompetency,
      optional: false,
    },

    // ---------- DONE ----------
    {
      id: "done",
      selector: "main",
      title: "Du har sett hele Ressurser-modulen",
      description: "Husk: status grønn/gul/rød oppdateres automatisk basert på kompetanseutløp, vedlikeholdsfrister, advarsler og payload. Hold listene rene, så får du et levende dashboard over flåten.",
      side: "bottom",
      beforeStep: closeAnyOpenDialog,
    },
  ],
};
