import type { TFunction } from "i18next";
import * as XLSX from "xlsx";
import type { StatusPdfData } from "@/lib/statusPdfExport";

export interface StatusExportSection {
  name: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}

const countBy = (values: string[]) => Array.from(
  values.reduce((counts, value) => counts.set(value, (counts.get(value) || 0) + 1), new Map<string, number>()),
  ([name, count]) => [name, count] as Array<string | number>,
).sort((a, b) => Number(b[1]) - Number(a[1]));

export const buildStatusExportSections = (
  data: StatusPdfData,
  t: TFunction,
): StatusExportSection[] => {
  const imported = data.kpis.importedFlights;
  const unplanned = data.kpis.unplannedFlights;
  const planned = Math.max(0, imported - unplanned);
  const unplannedPercent = imported > 0 ? (unplanned / imported) * 100 : 0;
  const sections: StatusExportSection[] = [
    {
      name: t("status.hookMessages.export.kpiSheet"),
      headers: [t("status.hookMessages.export.metricHeader"), t("status.hookMessages.export.valueHeader")],
      rows: [
        [t("status.hookMessages.export.company"), data.companyName],
        [t("status.hookMessages.export.periodHeader"), data.periodLabel],
        [t("status.hookMessages.pdf.generatedLabel"), data.generatedLabel],
        [t("status.hookMessages.export.totalMissions"), data.kpis.totalMissions],
        [t("status.hookMessages.export.completedMissions"), data.kpis.completedMissions],
        [t("status.hookMessages.export.completionRate"), `${data.kpis.completionRate}%`],
        [t("status.hookMessages.export.totalFlightHours"), data.kpis.totalFlightHours],
        [t("status.hookMessages.export.incidentRate"), data.kpis.incidentRate],
        [t("status.hookMessages.export.activeResources"), data.kpis.activeResources],
        [t("status.hookMessages.export.importedFlights"), imported],
        [t("status.hookMessages.export.plannedFlights"), planned],
        [t("status.hookMessages.export.unplannedFlights"), unplanned],
        [t("status.hookMessages.export.unplannedPercent"), `${unplannedPercent.toFixed(1)}%`],
        [t("status.hookMessages.export.daysSinceSevere"), data.daysSinceLastSevere < 999 ? data.daysSinceLastSevere : t("status.hookMessages.pdf.noSevereIncidents")],
      ],
    },
    {
      name: t("status.hookMessages.export.missionsByMonthSheet"),
      headers: [t("status.hookMessages.export.monthHeader"), t("status.hookMessages.export.missionCountHeader")],
      rows: data.missionsByMonth.map((item) => [item.month, item.count]),
    },
    {
      name: t("status.hookMessages.export.missionsByStatusSheet"),
      headers: [t("status.hookMessages.export.statusHeader"), t("status.hookMessages.export.countHeader")],
      rows: data.missionsByStatus.map((item) => [item.name, item.value]),
    },
    {
      name: t("status.hookMessages.export.missionsByRiskSheet"),
      headers: [t("status.hookMessages.export.riskOutcomeHeader"), t("status.hookMessages.export.scoreRangeHeader"), t("status.hookMessages.export.countHeader")],
      rows: data.missionsByRisk.map((item) => [item.name, item.scoreRange, item.value]),
    },
    {
      name: t("status.hookMessages.export.operationTypesSheet"),
      headers: [t("status.hookMessages.export.operationTypeHeader"), t("status.hookMessages.export.countHeader"), t("status.hookMessages.export.flightHoursHeader")],
      rows: data.operationTypes.counts.map((item) => [
        item.name,
        item.value,
        data.operationTypes.hours.find((hours) => hours.name === item.name)?.value || 0,
      ]),
    },
    {
      name: t("status.hookMessages.export.operationsByMonthSheet"),
      headers: [t("status.hookMessages.export.monthHeader"), "VLOS", "BVLOS", "EVLOS"],
      rows: data.operationTypes.monthly.map((item) => [item.month, item.VLOS, item.BVLOS, item.EVLOS]),
    },
    {
      name: t("status.hookMessages.export.planningByMonthSheet"),
      headers: [t("status.hookMessages.export.monthHeader"), t("status.hookMessages.export.plannedFlights"), t("status.hookMessages.export.unplannedFlights")],
      rows: data.unplannedByMonth.map((item) => [item.month, item.planned, item.unplanned]),
    },
    {
      name: t("status.hookMessages.export.incidentsByMonthSheet"),
      headers: [t("status.hookMessages.export.monthHeader"), t("status.hookMessages.export.incidentCountHeader")],
      rows: data.incidentsByMonth.map((item) => [item.month, item.count]),
    },
    {
      name: t("status.hookMessages.export.mainCausesSheet"),
      headers: [t("status.hookMessages.export.mainCauseHeader"), t("status.hookMessages.export.countHeader")],
      rows: data.incidentsByMainCause.map((item) => [item.name, item.value]),
    },
    {
      name: t("status.hookMessages.export.contributingCausesSheet"),
      headers: [t("status.hookMessages.export.contributingCauseHeader"), t("status.hookMessages.export.countHeader")],
      rows: data.incidentsByContributingCause.map((item) => [item.name, item.value]),
    },
    {
      name: t("status.hookMessages.export.incidentsBySeveritySheet"),
      headers: [t("status.hookMessages.export.severityHeader"), t("status.hookMessages.export.countHeader")],
      rows: data.incidentsBySeverity.map((item) => [item.name, item.value]),
    },
    {
      name: t("status.hookMessages.export.droneStatusSheet"),
      headers: [t("status.hookMessages.export.statusHeader"), t("status.hookMessages.export.countHeader")],
      rows: data.droneStatus.map((item) => [item.name, item.value]),
    },
    {
      name: t("status.hookMessages.export.equipmentStatusSheet"),
      headers: [t("status.hookMessages.export.statusHeader"), t("status.hookMessages.export.countHeader")],
      rows: data.equipmentStatus.map((item) => [item.name, item.value]),
    },
    {
      name: t("status.hookMessages.export.flightHoursSheet"),
      headers: [t("status.hookMessages.export.droneHeader"), t("status.hookMessages.export.flightHoursHeader")],
      rows: data.flightHoursByDrone.map((item) => [item.name, item.hours]),
    },
    {
      name: t("status.hookMessages.export.expiringDocsSheet"),
      headers: [t("status.hookMessages.export.periodHeader"), t("status.hookMessages.export.docCountHeader")],
      rows: [
        [t("status.hookMessages.export.within30"), data.expiringDocs.thirtyDays],
        [t("status.hookMessages.export.within60"), data.expiringDocs.sixtyDays],
        [t("status.hookMessages.export.within90"), data.expiringDocs.ninetyDays],
      ],
    },
  ];

  const hm = (m: number) => `${Math.floor(m / 60)}t ${Math.round(m % 60)}m`;
  sections.push(
    {
      name: t("status.pilotTime.title"),
      headers: [t("status.pilotTime.pilot"), t("status.pilotTime.flights"), t("status.pilotTime.minutes"), t("status.pilotTime.flightTime")],
      rows: [
        ...data.flightTimeByPilot.map((r) => [r.name, r.flights, r.minutes, hm(r.minutes)]),
        [t("status.pilotTime.total"), data.flightTimeByPilot.reduce((s, r) => s + r.flights, 0), data.flightTimeByPilot.reduce((s, r) => s + r.minutes, 0), hm(data.flightTimeByPilot.reduce((s, r) => s + r.minutes, 0))],
      ],
    },
    {
      name: t("status.missionTypes.title"),
      headers: [t("status.missionTypes.typeHeader"), t("status.missionTypes.flownHeader")],
      rows: data.flownMissionsByType.map((r) => [r.name, r.value]),
    },
    {
      name: t("status.missionTypes.monthlySheet"),
      headers: [t("status.hookMessages.export.monthHeader"), ...data.flownMissionsByType.map((tp) => tp.name), t("status.pilotTime.total")],
      rows: [
        ...data.flownMissionsTypeMonthly.map((row) => {
          const vals = data.flownMissionsByType.map((_, i) => Number(row[`t${i}`] || 0));
          return [String(row.month), ...vals, vals.reduce((a, b) => a + b, 0)];
        }),
        [t("status.pilotTime.total"), ...data.flownMissionsByType.map((tp) => tp.value), data.flownMissionsByType.reduce((a, b) => a + b.value, 0)],
      ],
    },
  );

  if (data.deviationEnabled) {
    const fullCategories = data.deviationReports.map((report) => report.category_path.join(" > ") || t("status.hookMessages.export.unknownCategory"));
    const mainCategories = data.deviationReports.map((report) => report.category_path[0] || t("status.hookMessages.export.unknownCategory"));
    sections.push(
      {
        name: t("status.hookMessages.export.deviationSummarySheet"),
        headers: [t("status.hookMessages.export.metricHeader"), t("status.hookMessages.export.valueHeader")],
        rows: [
          [t("status.hookMessages.export.totalDeviations"), data.deviationReports.length],
          [t("status.hookMessages.export.uniqueFlightsWithDeviations"), new Set(data.deviationReports.map((report) => report.mission_id).filter(Boolean)).size],
          [t("status.hookMessages.export.uniquePilots"), new Set(data.deviationReports.map((report) => report.reported_by).filter(Boolean)).size],
          [t("status.hookMessages.export.averageDeviationsPerFlight"), data.flightLogsCount > 0 ? Number((data.deviationReports.length / data.flightLogsCount).toFixed(2)) : 0],
        ],
      },
      {
        name: t("status.hookMessages.export.deviationsByMonthSheet"),
        headers: [t("status.hookMessages.export.monthHeader"), t("status.hookMessages.export.countHeader")],
        rows: data.deviationsByMonth.map((item) => [item.month, item.count]),
      },
      {
        name: t("status.hookMessages.export.deviationCategoriesSheet"),
        headers: [t("status.hookMessages.export.categoryHeader"), t("status.hookMessages.export.countHeader")],
        rows: [
          [t("status.hookMessages.export.mainCategoriesHeading"), ""],
          ...countBy(mainCategories),
          [],
          [t("status.hookMessages.export.fullCategoriesHeading"), ""],
          ...countBy(fullCategories),
        ],
      },
      {
        name: t("status.hookMessages.export.deviationSheet"),
        headers: [t("status.hookMessages.export.dateHeader"), t("status.hookMessages.export.pilotHeader"), t("status.hookMessages.export.categoryHeader"), t("status.hookMessages.export.commentHeader")],
        rows: data.deviationReports.map((report) => [
          new Intl.DateTimeFormat(data.language === "en" ? "en-GB" : "nb-NO", { dateStyle: "short", timeStyle: "short" }).format(new Date(report.created_at)),
          report.reporter_name || t("status.hookMessages.export.unknown"),
          report.category_path.join(" > "),
          report.comment || "",
        ]),
      },
    );
  }

  return sections;
};

export const createStatusWorkbook = (sections: StatusExportSection[]) => {
  const workbook = XLSX.utils.book_new();
  sections.forEach((section) => {
    const sheet = XLSX.utils.aoa_to_sheet([section.headers, ...section.rows]);
    sheet["!cols"] = section.headers.map((_, column) => ({
      wch: Math.min(60, Math.max(12, ...[section.headers, ...section.rows].map((row) => String(row[column] ?? "").length + 2))),
    }));
    sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, section.rows.length), c: section.headers.length - 1 } }) };
    XLSX.utils.book_append_sheet(workbook, sheet, section.name.slice(0, 31));
  });
  return workbook;
};

const escapeCsv = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

export const createStatusCsv = (sections: StatusExportSection[]) => {
  const rows: Array<Array<string | number>> = [];
  sections.forEach((section, index) => {
    if (index > 0) rows.push([]);
    rows.push([section.name], section.headers, ...section.rows);
  });
  return `\uFEFF${rows.map((row) => row.map(escapeCsv).join(";")).join("\r\n")}`;
};