import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import type { RouteData, SoraSettings } from "@/types/map";
import {
  addPdfHeader,
  addSectionHeader,
  arePdfFontsLoaded,
  checkPageBreak,
  createPdfDocument,
  formatDateForPdf,
  sanitizeFilenameForPdf,
  sanitizeForPdf,
  setFontStyle,
} from "@/lib/pdfUtils";
import {
  OUTDOOR_ASSEMBLIES_LABELS,
  POPULATION_DENSITY_LABELS,
  UA_SIZE_LABELS,
} from "@/lib/adjacentAreaCalculator";

interface CreateSoraDocumentationPdfOptions {
  missionId: string;
  missionTitle: string;
  missionTime?: string | null;
  companyId: string;
  userId: string;
  route: RouteData | null;
}

const fmt = (value: number | undefined, decimals = 0, unit = "") => {
  if (value == null || Number.isNaN(value)) return "-";
  return `${value.toLocaleString("nb-NO", { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}${unit}`;
};

const hasSoraDocumentation = (route: RouteData | null | undefined) =>
  !!route?.soraSettings?.enabled || !!route?.adjacentAreaDocumentation?.enabled;

export async function createSoraDocumentationPdf({
  missionId,
  missionTitle,
  missionTime,
  companyId,
  userId,
  route,
}: CreateSoraDocumentationPdfOptions): Promise<boolean> {
  if (!hasSoraDocumentation(route)) return false;

  const sora = route?.soraSettings as SoraSettings | undefined;
  const adjacent = route?.adjacentAreaDocumentation;

  const [{ data: company }, { data: userProfile }, { data: drone }] = await Promise.all([
    supabase.from("companies").select("navn").eq("id", companyId).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    sora?.droneId
      ? supabase.from("drones").select("modell, serienummer").eq("id", sora.droneId).maybeSingle()
      : Promise.resolve({ data: null } as any),
  ]);

  const doc = await createPdfDocument();
  const fontName = arePdfFontsLoaded() ? "Roboto" : "helvetica";
  const pageWidth = doc.internal.pageSize.getWidth();
  let yPos = addPdfHeader(doc, "SORA BEREGNINGSGRUNNLAG", missionTitle, company?.navn || undefined);

  const summaryRows = [
    ["Oppdrag", sanitizeForPdf(missionTitle)],
    ["Oppdragstidspunkt", missionTime ? formatDateForPdf(missionTime) : "Ikke satt"],
    ["Antall rutepunkter", String(route?.coordinates?.length ?? 0)],
    ["Rutelengde", fmt(route?.totalDistance, 2, " km")],
    ["Dokument generert", formatDateForPdf(new Date())],
  ];

  autoTable(doc, {
    startY: yPos,
    body: summaryRows,
    theme: "grid",
    styles: { fontSize: 9, font: fontName },
    columnStyles: { 0: { cellWidth: 48, fontStyle: "bold" }, 1: { cellWidth: pageWidth - 76 } },
  });
  yPos = (doc as any).lastAutoTable.finalY + 12;

  if (sora?.enabled) {
    yPos = checkPageBreak(doc, yPos, 70);
    yPos = addSectionHeader(doc, "SORA volum", yPos);
    autoTable(doc, {
      startY: yPos,
      body: [
        ["Flight Geography", fmt(sora.flightGeographyDistance, 0, " m")],
        ["Contingency buffer", fmt(sora.contingencyDistance, 0, " m")],
        ["Contingency høyde", fmt(sora.contingencyHeight, 0, " m")],
        ["Ground Risk Buffer", fmt(sora.groundRiskDistance, 0, " m")],
        ["Flyhøyde", fmt(sora.flightAltitude, 0, " m AGL")],
        ["Buffermodus", sora.bufferMode === "convexHull" ? "Konveks" : "Rute-korridor"],
        ["Drone", drone ? `${drone.modell}${drone.serienummer ? ` (${drone.serienummer})` : ""}` : "Ikke valgt"],
        ["CD", fmt(sora.characteristicDimensionM, 2, " m")],
        ["V0 / bakkehastighet", fmt(sora.groundSpeedMps, 1, " m/s")],
      ],
      theme: "grid",
      styles: { fontSize: 9, font: fontName },
      columnStyles: { 0: { cellWidth: 55, fontStyle: "bold" }, 1: { cellWidth: pageWidth - 83 } },
    });
    yPos = (doc as any).lastAutoTable.finalY + 12;
  }

  if (adjacent?.enabled) {
    yPos = checkPageBreak(doc, yPos, 85);
    yPos = addSectionHeader(doc, "Tilstøtende områder", yPos);
    const uaLabel = UA_SIZE_LABELS[adjacent.uaSize as keyof typeof UA_SIZE_LABELS] ?? adjacent.uaSize;
    const densityLabel = POPULATION_DENSITY_LABELS[adjacent.populationDensityCategory as keyof typeof POPULATION_DENSITY_LABELS] ?? adjacent.populationDensityCategory;
    const outdoorLabel = OUTDOOR_ASSEMBLIES_LABELS[adjacent.outdoorAssemblies as keyof typeof OUTDOOR_ASSEMBLIES_LABELS] ?? adjacent.outdoorAssemblies;
    autoTable(doc, {
      startY: yPos,
      body: [
        ["Tilstøtende radius", fmt(adjacent.adjacentRadiusM / 1000, 1, " km")],
        ["Areal", fmt(adjacent.adjacentAreaKm2, 1, " km2")],
        ["Innbyggere funnet", fmt(adjacent.totalPopulation, 0)],
        ["Gj.snitt tetthet", fmt(adjacent.avgDensity, 1, " pers/km2")],
        ["Grense/kategori", densityLabel],
        ["UA Size", uaLabel],
        ["SAIL", `SAIL ${adjacent.sail}`],
        ["Outdoor assemblies", outdoorLabel],
        ["Required containment", adjacent.requiredContainment],
        ["Resultat", adjacent.pass ? "Innenfor beregningsgrunnlaget" : "Utenfor / krever nærmere vurdering"],
        ["Beregnet", adjacent.calculatedAt ? formatDateForPdf(adjacent.calculatedAt) : "Ikke oppgitt"],
      ],
      theme: "grid",
      styles: { fontSize: 9, font: fontName },
      columnStyles: { 0: { cellWidth: 55, fontStyle: "bold" }, 1: { cellWidth: pageWidth - 83 } },
    });
    yPos = (doc as any).lastAutoTable.finalY + 12;
  }

  yPos = checkPageBreak(doc, yPos, 55);
  yPos = addSectionHeader(doc, "Kilder og metode", yPos);
  doc.setFontSize(9);
  setFontStyle(doc, "normal");
  const methodText = sanitizeForPdf(
    "SORA volum beregnes etter JARUS SORA 2.5-prinsipper og CAA Norway sin SORA 2.5-kalkulatorlogikk for contingency volume. Tilstøtende områder vurderes mot CAA Norway sin containment-kalkulator og JARUS SORA 2.5. Befolkningsgrunnlaget hentes fra SSB sitt 250 m befolkningsrutenett via systemets SSB-proxy. Dokumentet lagrer beregningsgrunnlaget slik det forelå da oppdraget/ruten ble lagret."
  );
  const split = doc.splitTextToSize(methodText, pageWidth - 28);
  doc.text(split, 14, yPos);

  const pdfBlob = doc.output("blob");
  const dateStr = new Date().toISOString().slice(0, 10);
  const safeTitle = sanitizeFilenameForPdf(missionTitle || "oppdrag").substring(0, 36);
  const fileName = `sora-beregningsgrunnlag-${safeTitle}-${dateStr}-${Date.now()}.pdf`;
  const filePath = `${companyId}/${fileName}`;

  const { error: uploadError } = await supabase.storage.from("documents").upload(filePath, pdfBlob, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data: insertedDoc, error: insertError } = await supabase
    .from("documents")
    .insert({
      tittel: `SORA beregningsgrunnlag - ${sanitizeForPdf(missionTitle)}`,
      beskrivelse: "Automatisk generert dokumentasjon for SORA volum og/eller tilstøtende områder ved lagring av oppdrag.",
      kategori: "oppdrag",
      fil_url: filePath,
      fil_navn: fileName,
      fil_storrelse: pdfBlob.size,
      company_id: companyId,
      user_id: userId,
      opprettet_av: userProfile?.full_name || "Ukjent",
    })
    .select("id")
    .single();
  if (insertError) throw insertError;

  const { error: linkError } = await supabase.from("mission_documents").insert({
    mission_id: missionId,
    document_id: insertedDoc.id,
  });
  if (linkError) throw linkError;

  return true;
}