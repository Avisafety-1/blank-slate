import type {
  AuditDocument,
  AuditCompetency,
  AuditFleetRow,
  OpsImprovement,
  SafetyTrendPoint,
  InternalAudit,
} from "../types";

export const mockDocuments: AuditDocument[] = [
  { id: "d1", title: "Operasjonsmanual", status: "ok", nextReview: "2027-03-15", responsible: "Administrator" },
  { id: "d2", title: "SMS Manual", status: "ok", nextReview: "2026-11-01", responsible: "Safety Manager" },
  { id: "d3", title: "SOP", status: "warning", nextReview: "2026-08-20", responsible: "Operativ leder" },
  { id: "d4", title: "Beredskapsplan", status: "ok", nextReview: "2027-01-10", responsible: "Administrator" },
  { id: "d5", title: "Forsikring", status: "warning", nextReview: "2026-09-30", responsible: "Administrator" },
  { id: "d6", title: "Organisasjonskart", status: "ok", nextReview: "2027-06-01", responsible: "Administrator" },
  { id: "d7", title: "Endringslogg", status: "info", nextReview: "2026-12-31", responsible: "Administrator" },
];

export const mockCompetencies: AuditCompetency[] = [
  { id: "c1", pilot: "Ola Hansen", competency: "A2", validUntil: "2027-08-15", status: "ok" },
  { id: "c2", pilot: "Kari Olsen", competency: "STS", validUntil: "2026-09-01", status: "warning" },
  { id: "c3", pilot: "Per Nordmann", competency: "CRM", validUntil: "2027-02-10", status: "ok" },
  { id: "c4", pilot: "Ola Hansen", competency: "Medical", validUntil: "2026-07-15", status: "warning" },
  { id: "c5", pilot: "Kari Olsen", competency: "Internkurs Termografi", validUntil: "2025-12-01", status: "danger" },
];

export const mockFleet: AuditFleetRow[] = [
  { id: "f1", drone: "DJI Mavic 3 Enterprise", firmware: "ok", service: "warning", remoteId: "ok", batteryHealth: "ok", calibration: "ok" },
  { id: "f2", drone: "DJI Matrice 300 RTK", firmware: "ok", service: "ok", remoteId: "ok", batteryHealth: "warning", calibration: "ok" },
  { id: "f3", drone: "DJI Matrice 4D", firmware: "warning", service: "ok", remoteId: "danger", batteryHealth: "ok", calibration: "warning" },
];

export const mockOpsStats = {
  flights: 342,
  riskAssessments: 128,
  checklists: 298,
  incidents: 7,
  debriefs: 91,
};

export const mockOpsImprovements: OpsImprovement[] = [
  { id: "o1", mission: "Mission 124", issue: "Manglet debrief" },
  { id: "o2", mission: "Mission 126", issue: "Ingen risikovurdering" },
  { id: "o3", mission: "Mission 130", issue: "Ingen sjekkliste" },
];

export const mockSafetyKpi = {
  reported: 12,
  nearMiss: 4,
  openActions: 3,
  closedActions: 21,
  avgCloseDays: 8.4,
  safetyScore: 88,
};

export const mockSafetyTrend: SafetyTrendPoint[] = [
  { month: "Des", incidents: 2, nearMiss: 1 },
  { month: "Jan", incidents: 1, nearMiss: 0 },
  { month: "Feb", incidents: 3, nearMiss: 1 },
  { month: "Mar", incidents: 0, nearMiss: 0 },
  { month: "Apr", incidents: 2, nearMiss: 1 },
  { month: "Mai", incidents: 1, nearMiss: 0 },
  { month: "Jun", incidents: 0, nearMiss: 0 },
  { month: "Jul", incidents: 1, nearMiss: 1 },
  { month: "Aug", incidents: 2, nearMiss: 0 },
  { month: "Sep", incidents: 0, nearMiss: 0 },
  { month: "Okt", incidents: 0, nearMiss: 0 },
  { month: "Nov", incidents: 0, nearMiss: 0 },
];

export const mockOverviewKpi = {
  activePilots: 12,
  activeDrones: 6,
  flights12mo: 342,
  openFindings: 5,
  openActions: 3,
  internalAuditsDone: 2,
};

export const mockAuditReadiness = [
  { key: "opsManual", label: "Operasjonsmanual", status: "ok" as const },
  { key: "sop", label: "SOP", status: "ok" as const },
  { key: "docsExpiring", label: "Dokumenter som utløper", status: "warning" as const },
  { key: "missingReview", label: "Manglende gjennomgang", status: "warning" as const },
  { key: "competencyExpiring", label: "Kompetanse utløper", status: "warning" as const },
  { key: "serviceDue", label: "Service forfaller", status: "warning" as const },
];

export const mockInternalAudits: InternalAudit[] = [
  {
    id: "ia1",
    title: "Årlig internrevisjon 2026",
    date: "2026-04-12",
    responsible: "Per Johansen",
    status: "closed",
    findings: [
      {
        id: "af1",
        category: "Dokumentasjon",
        description: "SOP mangler oppdatering for nattflyvning",
        responsible: "Operativ leder",
        deadline: "2026-06-01",
        status: "closed",
        actions: [
          { id: "aa1", description: "Oppdater SOP kap. 4", responsible: "Operativ leder", deadline: "2026-05-20", status: "closed" },
        ],
      },
    ],
    sections: {
      organization: { checked: [true, true, true], comment: "", status: "ok" },
      documentation: { checked: [true, false, true], comment: "SOP oppdateres", status: "warning" },
      competency: { checked: [true, true], comment: "", status: "ok" },
      operations: { checked: [true, true, true], comment: "", status: "ok" },
      technical: { checked: [true, true], comment: "", status: "ok" },
      safety: { checked: [true, true], comment: "", status: "ok" },
    },
  },
  {
    id: "ia2",
    title: "Halvårsrevisjon høst 2026",
    date: "2026-10-05",
    responsible: "Kari Nordmann",
    status: "in_progress",
    findings: [],
    sections: {
      organization: { checked: [false, false, false], comment: "", status: "info" },
      documentation: { checked: [false, false, false], comment: "", status: "info" },
      competency: { checked: [false, false], comment: "", status: "info" },
      operations: { checked: [false, false, false], comment: "", status: "info" },
      technical: { checked: [false, false], comment: "", status: "info" },
      safety: { checked: [false, false], comment: "", status: "info" },
    },
  },
];

export const inspectionPackageContents = [
  "Operasjonsmanual",
  "SOP",
  "Kompetanseregister",
  "Droneoversikt",
  "Hendelseslogg",
  "Risikovurderinger",
  "Internrevisjoner",
  "Tiltaksplan",
];
