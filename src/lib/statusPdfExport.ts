import autoTable from "jspdf-autotable";
import type { TFunction } from "i18next";
import avisafeLogoUrl from "@/assets/avisafe-logo-text.png";
import { createPdfDocument, getPdfFontName, sanitizeForPdf, setFontStyle } from "@/lib/pdfUtils";
import type { RiskDistributionItem } from "@/lib/statusRiskDistribution";

type NamedValue = { name: string; value: number };
type MonthValue = { month: string; count: number };
type OperationMonth = { month: string; VLOS: number; BVLOS: number; EVLOS: number };
type UnplannedMonth = { month: string; planned: number; unplanned: number };

export interface StatusPdfData {
  companyName: string;
  language: "no" | "en";
  periodLabel: string;
  generatedLabel: string;
  kpis: {
    totalMissions: number;
    completedMissions: number;
    completionRate: string;
    totalFlightHours: number;
    incidentRate: number;
    activeResources: number;
    importedFlights: number;
    unplannedFlights: number;
  };
  missionsByMonth: MonthValue[];
  missionsByStatus: NamedValue[];
  missionsByRisk: RiskDistributionItem[];
  operationTypes: {
    counts: NamedValue[];
    hours: NamedValue[];
    monthly: OperationMonth[];
    totalFlights: number;
    totalMinutes: number;
  };
  unplannedByMonth: UnplannedMonth[];
  incidentsByMonth: MonthValue[];
  incidentsByMainCause: NamedValue[];
  incidentsByContributingCause: NamedValue[];
  incidentsBySeverity: NamedValue[];
  daysSinceLastSevere: number;
  droneStatus: NamedValue[];
  equipmentStatus: NamedValue[];
  flightHoursByDrone: Array<{ name: string; hours: number }>;
  flightTimeByPilot: Array<{ name: string; flights: number; minutes: number }>;
  flownMissionsByType: NamedValue[];
  expiringDocs: { thirtyDays: number; sixtyDays: number; ninetyDays: number };
  deviationEnabled: boolean;
  flightLogsCount: number;
  deviationsByMonth: MonthValue[];
  deviationReports: Array<{
    category_path: string[];
    comment: string | null;
    created_at: string;
    mission_id: string | null;
    reported_by: string | null;
    reporter_name?: string | null;
  }>;
}

type PdfColor = [number, number, number];
type Series = { key: string; label: string; color: PdfColor };

const PDF_COLORS = {
  primary: [30, 93, 184] as PdfColor,
  success: [34, 139, 94] as PdfColor,
  warning: [213, 145, 20] as PdfColor,
  destructive: [205, 65, 65] as PdfColor,
  muted: [113, 122, 134] as PdfColor,
  border: [215, 220, 226] as PdfColor,
  surface: [246, 248, 251] as PdfColor,
  text: [30, 36, 45] as PdfColor,
  onPrimary: [255, 255, 255] as PdfColor,
};

const CHART_COLORS: PdfColor[] = [
  PDF_COLORS.primary,
  PDF_COLORS.success,
  PDF_COLORS.warning,
  PDF_COLORS.destructive,
  PDF_COLORS.muted,
];

const loadImage = (url: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error("Could not load AviSafe logo"));
  image.src = url;
});

const safeText = (value: unknown) => sanitizeForPdf(String(value ?? ""));

export async function generateStatusPdf(data: StatusPdfData, t: TFunction): Promise<Blob> {
  const doc = await createPdfDocument("landscape");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const gap = 8;
  const contentWidth = pageWidth - margin * 2;
  const halfWidth = (contentWidth - gap) / 2;

  const sectionTitle = (title: string, y: number) => {
    doc.setTextColor(...PDF_COLORS.text);
    doc.setFontSize(14);
    setFontStyle(doc, "bold");
    doc.text(safeText(title), margin, y);
  };

  const drawPanel = (x: number, y: number, width: number, height: number) => {
    doc.setFillColor(...PDF_COLORS.surface);
    doc.setDrawColor(...PDF_COLORS.border);
    doc.roundedRect(x, y, width, height, 2, 2, "FD");
  };

  const drawNoData = (x: number, y: number, width: number, height: number) => {
    doc.setTextColor(...PDF_COLORS.muted);
    doc.setFontSize(9);
    setFontStyle(doc, "normal");
    doc.text(t("status.hookMessages.pdf.noData"), x + width / 2, y + height / 2, { align: "center" });
  };

  const drawBarChart = (
    values: NamedValue[],
    x: number,
    y: number,
    width: number,
    height: number,
    title: string,
    color: PdfColor = PDF_COLORS.primary,
  ) => {
    drawPanel(x, y, width, height);
    doc.setTextColor(...PDF_COLORS.text);
    doc.setFontSize(10);
    setFontStyle(doc, "bold");
    doc.text(safeText(title), x + 5, y + 7);
    const chartX = x + 8;
    const chartY = y + 13;
    const chartWidth = width - 14;
    const chartHeight = height - 25;
    if (values.length === 0 || values.every((item) => item.value === 0)) {
      drawNoData(x, chartY, width, chartHeight);
      return;
    }
    const max = Math.max(...values.map((item) => item.value), 1);
    const slot = chartWidth / Math.max(values.length, 1);
    const barWidth = Math.max(2, Math.min(12, slot * 0.56));
    doc.setDrawColor(...PDF_COLORS.border);
    doc.line(chartX, chartY + chartHeight, chartX + chartWidth, chartY + chartHeight);
    values.forEach((item, index) => {
      const barHeight = (item.value / max) * Math.max(1, chartHeight - 8);
      const barX = chartX + slot * index + (slot - barWidth) / 2;
      const barY = chartY + chartHeight - barHeight;
      doc.setFillColor(...color);
      doc.rect(barX, barY, barWidth, barHeight, "F");
      doc.setTextColor(...PDF_COLORS.text);
      doc.setFontSize(7);
      setFontStyle(doc, "bold");
      doc.text(String(item.value), barX + barWidth / 2, Math.max(chartY + 3, barY - 1.5), { align: "center" });
      setFontStyle(doc, "normal");
      const label = doc.splitTextToSize(safeText(item.name), Math.max(slot - 1, 8)).slice(0, 2);
      doc.text(label, barX + barWidth / 2, chartY + chartHeight + 4, { align: "center" });
    });
  };

  const drawRiskChart = (values: RiskDistributionItem[], x: number, y: number, width: number, height: number) => {
    drawPanel(x, y, width, height);
    doc.setTextColor(...PDF_COLORS.text);
    doc.setFontSize(10);
    setFontStyle(doc, "bold");
    doc.text(safeText(t("status.metrics.missionsByRisk")), x + 5, y + 7);
    doc.setFontSize(6.5);
    setFontStyle(doc, "normal");
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(safeText(t("status.metrics.missionsByRiskScale")), x + 5, y + 12);
    const chartX = x + 8;
    const chartY = y + 17;
    const chartWidth = width - 14;
    const chartHeight = height - 30;
    if (values.length === 0 || values.every((item) => item.value === 0)) {
      drawNoData(x, chartY, width, chartHeight);
      return;
    }
    const max = Math.max(...values.map((item) => item.value), 1);
    const slot = chartWidth / Math.max(values.length, 1);
    const barWidth = Math.max(5, Math.min(14, slot * 0.5));
    const colors: Record<RiskDistributionItem["key"], PdfColor> = {
      go: PDF_COLORS.success,
      caution: PDF_COLORS.warning,
      "no-go": PDF_COLORS.destructive,
      "not-assessed": PDF_COLORS.muted,
    };
    doc.setDrawColor(...PDF_COLORS.border);
    doc.line(chartX, chartY + chartHeight, chartX + chartWidth, chartY + chartHeight);
    values.forEach((item, index) => {
      const barHeight = (item.value / max) * Math.max(1, chartHeight - 7);
      const barX = chartX + slot * index + (slot - barWidth) / 2;
      const barY = chartY + chartHeight - barHeight;
      doc.setFillColor(...colors[item.key]);
      doc.rect(barX, barY, barWidth, barHeight, "F");
      doc.setTextColor(...PDF_COLORS.text);
      doc.setFontSize(7);
      setFontStyle(doc, "bold");
      doc.text(String(item.value), barX + barWidth / 2, Math.max(chartY + 3, barY - 1.5), { align: "center" });
      setFontStyle(doc, "normal");
      doc.text(doc.splitTextToSize(safeText(item.name), Math.max(slot - 2, 15)).slice(0, 2), barX + barWidth / 2, chartY + chartHeight + 4, { align: "center" });
    });
  };

  const drawHorizontalBars = (
    values: NamedValue[], x: number, y: number, width: number, height: number, title: string,
    color: PdfColor = PDF_COLORS.primary,
  ) => {
    drawPanel(x, y, width, height);
    doc.setTextColor(...PDF_COLORS.text);
    doc.setFontSize(10);
    setFontStyle(doc, "bold");
    doc.text(safeText(title), x + 5, y + 7);
    const shown = values.slice(0, 10);
    if (shown.length === 0 || shown.every((item) => item.value === 0)) {
      drawNoData(x, y + 10, width, height - 10);
      return;
    }
    const max = Math.max(...shown.map((item) => item.value), 1);
    const labelWidth = Math.min(52, width * 0.42);
    const barWidth = width - labelWidth - 18;
    const rowHeight = Math.min(6.2, (height - 16) / shown.length);
    shown.forEach((item, index) => {
      const rowY = y + 14 + index * rowHeight;
      doc.setFontSize(7.5);
      setFontStyle(doc, "normal");
      const label = safeText(item.name);
      doc.text(label.length > 30 ? `${label.slice(0, 29)}...` : label, x + 5, rowY + 2.5);
      doc.setFillColor(...PDF_COLORS.border);
      doc.rect(x + labelWidth, rowY, barWidth, 3.2, "F");
      doc.setFillColor(...color);
      doc.rect(x + labelWidth, rowY, (item.value / max) * barWidth, 3.2, "F");
      doc.setTextColor(...PDF_COLORS.text);
      doc.text(String(item.value), x + width - 5, rowY + 2.7, { align: "right" });
    });
  };

  const drawDonutChart = (values: NamedValue[], x: number, y: number, width: number, height: number, title: string) => {
    drawPanel(x, y, width, height);
    doc.setTextColor(...PDF_COLORS.text);
    doc.setFontSize(10);
    setFontStyle(doc, "bold");
    doc.text(safeText(title), x + 5, y + 7);
    const visible = values.filter((item) => item.value > 0);
    const total = visible.reduce((sum, item) => sum + item.value, 0);
    if (total === 0) {
      drawNoData(x, y + 10, width, height - 10);
      return;
    }
    const radius = Math.min(19, height / 3.2);
    const centerX = x + 27;
    const centerY = y + height / 2 + 3;
    let angle = -Math.PI / 2;
    visible.forEach((item, index) => {
      const slice = (item.value / total) * Math.PI * 2;
      const color = CHART_COLORS[index % CHART_COLORS.length];
      const segments = Math.max(3, Math.ceil(slice / 0.09));
      doc.setFillColor(...color);
      doc.setDrawColor(...color);
      for (let step = 0; step < segments; step += 1) {
        const a1 = angle + (slice * step) / segments;
        const a2 = angle + (slice * (step + 1)) / segments;
        doc.triangle(centerX, centerY, centerX + radius * Math.cos(a1), centerY + radius * Math.sin(a1), centerX + radius * Math.cos(a2), centerY + radius * Math.sin(a2), "FD");
      }
      angle += slice;
    });
    doc.setFillColor(...PDF_COLORS.surface);
    doc.circle(centerX, centerY, radius * 0.48, "F");
    doc.setTextColor(...PDF_COLORS.text);
    doc.setFontSize(10);
    setFontStyle(doc, "bold");
    doc.text(String(total), centerX, centerY + 1.5, { align: "center" });
    let legendY = y + 15;
    visible.slice(0, 7).forEach((item, index) => {
      const color = CHART_COLORS[index % CHART_COLORS.length];
      doc.setFillColor(...color);
      doc.rect(x + 54, legendY - 2.5, 3.5, 3.5, "F");
      doc.setFontSize(7.5);
      setFontStyle(doc, "normal");
      doc.text(`${safeText(item.name)} (${item.value})`, x + 60, legendY);
      legendY += 6;
    });
  };

  const drawStackedChart = (
    rows: Array<Record<string, string | number>>,
    series: Series[],
    x: number,
    y: number,
    width: number,
    height: number,
    title: string,
  ) => {
    drawPanel(x, y, width, height);
    doc.setTextColor(...PDF_COLORS.text);
    doc.setFontSize(10);
    setFontStyle(doc, "bold");
    doc.text(safeText(title), x + 5, y + 7);
    if (rows.length === 0 || rows.every((row) => series.every((s) => Number(row[s.key] || 0) === 0))) {
      drawNoData(x, y + 10, width, height - 10);
      return;
    }
    const chartX = x + 8;
    const chartY = y + 14;
    const chartWidth = width - 16;
    const chartHeight = height - 28;
    const totals = rows.map((row) => series.reduce((sum, s) => sum + Number(row[s.key] || 0), 0));
    const max = Math.max(...totals, 1);
    const slot = chartWidth / rows.length;
    const barWidth = Math.max(2.5, Math.min(12, slot * 0.58));
    rows.forEach((row, index) => {
      let bottom = chartY + chartHeight;
      series.forEach((item) => {
        const value = Number(row[item.key] || 0);
        const barHeight = (value / max) * chartHeight;
        bottom -= barHeight;
        doc.setFillColor(...item.color);
        doc.rect(chartX + slot * index + (slot - barWidth) / 2, bottom, barWidth, barHeight, "F");
      });
      doc.setTextColor(...PDF_COLORS.text);
      doc.setFontSize(6.5);
      setFontStyle(doc, "normal");
      const label = doc.splitTextToSize(safeText(row.month), Math.max(slot - 1, 8)).slice(0, 2);
      doc.text(label, chartX + slot * index + slot / 2, chartY + chartHeight + 4, { align: "center" });
    });
    let legendX = x + width - 5;
    [...series].reverse().forEach((item) => {
      const labelWidth = doc.getTextWidth(safeText(item.label)) + 9;
      legendX -= labelWidth;
      doc.setFillColor(...item.color);
      doc.rect(legendX, y + 4, 3, 3, "F");
      doc.setFontSize(7);
      doc.text(safeText(item.label), legendX + 4.5, y + 6.5);
    });
  };

  const drawCompactTable = (
    headers: string[],
    rows: Array<Array<string | number>>,
    x: number,
    y: number,
    width: number,
    columnWidths?: number[],
  ) => {
    autoTable(doc, {
      startY: y,
      margin: { left: x, right: pageWidth - x - width },
      tableWidth: width,
      head: [headers.map(safeText)],
      body: rows.map((row) => row.map(safeText)),
      theme: "grid",
      styles: {
        font: getPdfFontName(),
        fontSize: 5.5,
        cellPadding: 0.45,
        minCellHeight: 2.5,
        overflow: "ellipsize",
        textColor: PDF_COLORS.text,
        lineColor: PDF_COLORS.border,
        lineWidth: 0.1,
      },
      headStyles: { fillColor: PDF_COLORS.primary, textColor: PDF_COLORS.onPrimary, fontStyle: "bold", fontSize: 5.5 },
      alternateRowStyles: { fillColor: PDF_COLORS.surface },
      columnStyles: Object.fromEntries((columnWidths || []).map((cellWidth, index) => [index, { cellWidth }])),
      pageBreak: "avoid",
    });
  };

  const addPageHeading = (title: string) => {
    doc.addPage();
    sectionTitle(title, 15);
  };

  // Page 1: brand, report identity and mission overview.
  try {
    const logo = await loadImage(avisafeLogoUrl);
    const logoWidth = 42;
    doc.addImage(logo, "PNG", margin, 8, logoWidth, logoWidth * (613 / 1920));
  } catch (error) {
    console.warn("Could not add AviSafe logo to status PDF:", error);
  }
  doc.setTextColor(...PDF_COLORS.text);
  doc.setFontSize(20);
  setFontStyle(doc, "bold");
  doc.text(safeText(t("status.hookMessages.export.reportTitlePrefix")), pageWidth - margin, 15, { align: "right" });
  doc.setFontSize(10);
  setFontStyle(doc, "normal");
  doc.text(safeText(data.companyName), pageWidth - margin, 23, { align: "right" });
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text(`${safeText(t("status.hookMessages.pdf.periodHeader"))}: ${safeText(data.periodLabel)}`, pageWidth - margin, 29, { align: "right" });
  doc.text(`${safeText(t("status.hookMessages.pdf.generatedLabel"))}: ${safeText(data.generatedLabel)}`, pageWidth - margin, 35, { align: "right" });
  doc.setDrawColor(...PDF_COLORS.primary);
  doc.setLineWidth(0.8);
  doc.line(margin, 41, pageWidth - margin, 41);

  const unplannedPct = data.kpis.importedFlights > 0
    ? Math.round((data.kpis.unplannedFlights / data.kpis.importedFlights) * 100)
    : 0;
  const kpis = [
    [t("status.hookMessages.pdf.totalMissions"), data.kpis.totalMissions],
    [t("status.hookMessages.pdf.completedMissions"), `${data.kpis.completedMissions} (${data.kpis.completionRate}%)`],
    [t("status.hookMessages.pdf.totalFlightHours"), data.kpis.totalFlightHours.toFixed(2)],
    [t("status.hookMessages.pdf.incidentRate"), `${data.kpis.incidentRate.toFixed(2)} / 100 h`],
    [t("status.hookMessages.pdf.activeResources"), data.kpis.activeResources],
    [t("status.metrics.unplannedFlights"), `${data.kpis.unplannedFlights} / ${data.kpis.importedFlights} (${unplannedPct}%)`],
  ];
  const cardWidth = (contentWidth - gap * 2) / 3;
  kpis.forEach(([label, value], index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = margin + col * (cardWidth + gap);
    const y = 47 + row * 22;
    drawPanel(x, y, cardWidth, 17);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.setFontSize(7.5);
    setFontStyle(doc, "normal");
    doc.text(safeText(label), x + 4, y + 5);
    doc.setTextColor(...PDF_COLORS.text);
    doc.setFontSize(13);
    setFontStyle(doc, "bold");
    doc.text(safeText(value), x + 4, y + 13);
  });

  drawBarChart(data.missionsByMonth.map((item) => ({ name: item.month, value: item.count })), margin, 94, contentWidth, 43, t("status.hookMessages.pdf.missionsByMonth"));
  drawDonutChart(data.missionsByStatus, margin, 144, halfWidth, 52, t("status.hookMessages.pdf.missionsByStatus"));
  drawRiskChart(data.missionsByRisk, margin + halfWidth + gap, 144, halfWidth, 52);

  // Page 2: operation types and planning quality.
  addPageHeading(t("status.hookMessages.pdf.operationsHeading"));
  drawDonutChart(data.operationTypes.counts, margin, 23, halfWidth, 47, t("status.metrics.operationTypeDistribution"));
  drawHorizontalBars(data.operationTypes.hours, margin + halfWidth + gap, 23, halfWidth, 47, t("status.metrics.hoursPerOperationType"), PDF_COLORS.success);
  const operationNames = Array.from(new Set([
    ...data.operationTypes.counts.map((item) => item.name),
    ...data.operationTypes.hours.map((item) => item.name),
  ]));
  const operationRows: Array<Array<string | number>> = operationNames.map((name) => [
    name,
    data.operationTypes.counts.find((item) => item.name === name)?.value || 0,
    (data.operationTypes.hours.find((item) => item.name === name)?.value || 0).toFixed(2),
  ]);
  operationRows.push([
    t("status.hookMessages.export.totalForPeriod"),
    data.operationTypes.counts.reduce((sum, item) => sum + item.value, 0),
    data.operationTypes.hours.reduce((sum, item) => sum + item.value, 0).toFixed(2),
  ]);
  drawCompactTable(
    [t("status.hookMessages.export.operationTypeHeader"), t("status.hookMessages.export.countHeader"), t("status.hookMessages.export.accumulatedFlightHoursHeader")],
    operationRows,
    margin,
    74,
    contentWidth,
    [contentWidth * 0.5, contentWidth * 0.25, contentWidth * 0.25],
  );
  drawStackedChart(data.operationTypes.monthly as unknown as Array<Record<string, string | number>>, [
    { key: "VLOS", label: "VLOS", color: PDF_COLORS.success },
    { key: "BVLOS", label: "BVLOS", color: PDF_COLORS.destructive },
    { key: "EVLOS", label: "EVLOS", color: PDF_COLORS.warning },
  ], margin, 96, halfWidth, 43, t("status.metrics.operationTypeByMonth"));
  drawStackedChart(data.unplannedByMonth as unknown as Array<Record<string, string | number>>, [
    { key: "planned", label: t("status.metrics.plannedLegend"), color: PDF_COLORS.success },
    { key: "unplanned", label: t("status.metrics.unplannedLegend"), color: PDF_COLORS.warning },
  ], margin + halfWidth + gap, 96, halfWidth, 43, t("status.metrics.unplannedByMonth"));
  drawCompactTable(
    [t("status.hookMessages.export.monthHeader"), "VLOS", "BVLOS", "EVLOS"],
    data.operationTypes.monthly.map((item) => [item.month, item.VLOS, item.BVLOS, item.EVLOS]),
    margin,
    143,
    halfWidth,
    [halfWidth * 0.4, halfWidth * 0.2, halfWidth * 0.2, halfWidth * 0.2],
  );
  drawCompactTable(
    [t("status.hookMessages.export.monthHeader"), t("status.metrics.plannedLegend"), t("status.metrics.unplannedLegend")],
    data.unplannedByMonth.map((item) => [item.month, item.planned, item.unplanned]),
    margin + halfWidth + gap,
    143,
    halfWidth,
    [halfWidth * 0.46, halfWidth * 0.27, halfWidth * 0.27],
  );
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.muted);
  setFontStyle(doc, "normal");
  doc.text(safeText(t("status.metrics.unplannedExplainer")), margin + 5, 194, { maxWidth: contentWidth - 10 });

  // Page 3: incidents.
  addPageHeading(t("status.hookMessages.pdf.incidentsHeading"));
  drawBarChart(data.incidentsByMonth.map((item) => ({ name: item.month, value: item.count })), margin, 23, halfWidth, 55, t("status.hookMessages.pdf.incidentsByMonth"), PDF_COLORS.destructive);
  drawBarChart(data.incidentsBySeverity, margin + halfWidth + gap, 23, halfWidth, 55, t("status.hookMessages.pdf.incidentsBySeverity"), PDF_COLORS.warning);
  drawHorizontalBars(data.incidentsByMainCause, margin, 85, halfWidth, 78, t("status.hookMessages.pdf.mainCauseDistribution"), PDF_COLORS.destructive);
  drawHorizontalBars(data.incidentsByContributingCause, margin + halfWidth + gap, 85, halfWidth, 78, t("status.hookMessages.pdf.contributingCauses"), PDF_COLORS.warning);
  doc.setFillColor(...PDF_COLORS.success);
  doc.roundedRect(margin, 170, contentWidth, 18, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  setFontStyle(doc, "bold");
  doc.text(
    data.daysSinceLastSevere < 999
      ? t("status.hookMessages.pdf.daysSinceSevere", { days: data.daysSinceLastSevere })
      : t("status.hookMessages.pdf.noSevereIncidents"),
    pageWidth / 2,
    181,
    { align: "center" },
  );

  // Page 4: resources and documentation.
  addPageHeading(t("status.hookMessages.pdf.resourcesHeading"));
  drawDonutChart(data.droneStatus, margin, 23, halfWidth, 55, t("status.hookMessages.pdf.droneStatus"));
  drawDonutChart(data.equipmentStatus, margin + halfWidth + gap, 23, halfWidth, 55, t("status.hookMessages.pdf.equipmentStatus"));
  drawHorizontalBars(data.flightHoursByDrone.map((item) => ({ name: item.name, value: item.hours })), margin, 85, contentWidth, 70, t("status.services.flightHoursByDrone"));
  autoTable(doc, {
    startY: 162,
    margin: { left: margin, right: margin },
    tableWidth: contentWidth,
    head: [[t("status.hookMessages.pdf.expiringDocuments"), t("status.hookMessages.pdf.countHeader")]],
    body: [
      [t("status.hookMessages.export.within30"), String(data.expiringDocs.thirtyDays)],
      [t("status.hookMessages.export.within60"), String(data.expiringDocs.sixtyDays)],
      [t("status.hookMessages.export.within90"), String(data.expiringDocs.ninetyDays)],
    ],
    theme: "grid",
    styles: { font: getPdfFontName(), fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: PDF_COLORS.primary, textColor: PDF_COLORS.onPrimary },
  });

  // Pilots and mission types
  addPageHeading(t("status.pilotTime.pdfHeading"));
  const hm = (m: number) => `${Math.floor(m / 60)}t ${Math.round(m % 60)}m`;
  const pilotRows: Array<Array<string | number>> = data.flightTimeByPilot.map((r) => [r.name, r.flights, hm(r.minutes)]);
  pilotRows.push([t("status.pilotTime.total"), data.flightTimeByPilot.reduce((s, r) => s + r.flights, 0), hm(data.flightTimeByPilot.reduce((s, r) => s + r.minutes, 0))]);
  autoTable(doc, {
    startY: 23,
    margin: { left: margin, right: pageWidth - margin - halfWidth, bottom: 14 },
    tableWidth: halfWidth,
    head: [[t("status.pilotTime.pilot"), t("status.pilotTime.flights"), t("status.pilotTime.flightTime")].map(safeText)],
    body: data.flightTimeByPilot.length ? pilotRows.map((r) => r.map(safeText)) : [[safeText(t("status.pilotTime.empty")), "", ""]],
    theme: "grid",
    styles: { font: getPdfFontName(), fontSize: 7, cellPadding: 1 },
    headStyles: { fillColor: PDF_COLORS.primary, textColor: PDF_COLORS.onPrimary },
    columnStyles: { 1: { halign: "right", cellWidth: 22 }, 2: { halign: "right", cellWidth: 28 } },
  });
  autoTable(doc, {
    startY: 23,
    margin: { left: margin + halfWidth + gap, right: margin, bottom: 14 },
    tableWidth: halfWidth,
    head: [[t("status.missionTypes.typeHeader"), t("status.missionTypes.flownHeader")].map(safeText)],
    body: data.flownMissionsByType.length ? data.flownMissionsByType.map((r) => [safeText(r.name), String(r.value)]) : [[safeText(t("status.missionTypes.empty")), ""]],
    theme: "grid",
    styles: { font: getPdfFontName(), fontSize: 7, cellPadding: 1 },
    headStyles: { fillColor: PDF_COLORS.primary, textColor: PDF_COLORS.onPrimary },
    columnStyles: { 1: { halign: "right", cellWidth: 28 } },
  });

  // Optional page 5: deviations. AI analysis is intentionally excluded.
  if (data.deviationEnabled && data.deviationReports.length > 0) {
    addPageHeading(t("status.hookMessages.pdf.deviationsHeading"));
    const uniqueFlights = new Set(data.deviationReports.map((row) => row.mission_id).filter(Boolean)).size;
    const uniquePilots = new Set(data.deviationReports.map((row) => row.reported_by).filter(Boolean)).size;
    const average = data.flightLogsCount > 0 ? (data.deviationReports.length / data.flightLogsCount).toFixed(2) : "0";
    const deviationKpis = [
      [t("status.incidents.deviation.totalDeviations"), data.deviationReports.length],
      [t("status.incidents.deviation.uniqueFlights"), uniqueFlights],
      [t("status.incidents.deviation.uniquePilots"), uniquePilots],
      [t("status.incidents.deviation.avgPerFlight"), average],
    ];
    const deviationCardWidth = (contentWidth - gap * 3) / 4;
    deviationKpis.forEach(([label, value], index) => {
      const x = margin + index * (deviationCardWidth + gap);
      drawPanel(x, 23, deviationCardWidth, 19);
      doc.setTextColor(...PDF_COLORS.muted);
      doc.setFontSize(7);
      setFontStyle(doc, "normal");
      doc.text(safeText(label), x + 4, 29);
      doc.setTextColor(...PDF_COLORS.text);
      doc.setFontSize(12);
      setFontStyle(doc, "bold");
      doc.text(safeText(value), x + 4, 38);
    });

    const categoryCounts = new Map<string, number>();
    data.deviationReports.forEach((row) => {
      const path = row.category_path.length > 0 ? row.category_path.join(" > ") : t("status.common.unknownCategory");
      categoryCounts.set(path, (categoryCounts.get(path) || 0) + 1);
    });
    drawBarChart(data.deviationsByMonth.map((item) => ({ name: item.month, value: item.count })), margin, 49, halfWidth, 57, t("status.incidents.deviation.perMonth"), PDF_COLORS.warning);
    drawHorizontalBars(Array.from(categoryCounts, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value), margin + halfWidth + gap, 49, halfWidth, 57, t("status.incidents.deviation.subcategoryDistribution"));

    autoTable(doc, {
      startY: 113,
      margin: { left: margin, right: margin, bottom: 14 },
      head: [[
        t("status.hookMessages.pdf.dateHeader"),
        t("status.hookMessages.pdf.pilotHeader"),
        t("status.hookMessages.pdf.categoryHeader"),
        t("status.hookMessages.pdf.commentHeader"),
      ]],
      body: data.deviationReports.map((row) => [
        new Intl.DateTimeFormat(data.language === "en" ? "en-GB" : "nb-NO", { dateStyle: "short", timeStyle: "short" }).format(new Date(row.created_at)),
        safeText(row.reporter_name || t("status.hookMessages.pdf.unknown")),
        safeText(row.category_path.join(" > ")),
        safeText(row.comment || ""),
      ]),
      theme: "striped",
      styles: { font: getPdfFontName(), fontSize: 6.5, cellPadding: 1, overflow: "linebreak", minCellHeight: 4 },
      headStyles: { fillColor: PDF_COLORS.warning },
      columnStyles: { 0: { cellWidth: 32 }, 1: { cellWidth: 42 }, 2: { cellWidth: 75 }, 3: { cellWidth: 120 } },
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...PDF_COLORS.border);
    doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.setFontSize(7);
    setFontStyle(doc, "normal");
    doc.text(safeText(t("status.hookMessages.pdf.footerBrand")), margin, pageHeight - 5);
    doc.text(safeText(t("status.hookMessages.pdf.pageNumber", { page, total: pageCount })), pageWidth - margin, pageHeight - 5, { align: "right" });
  }

  return doc.output("blob");
}