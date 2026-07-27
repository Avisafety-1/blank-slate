/**
 * Inspection Package Builder
 *
 * Assembles a complete inspection binder (PDF cover + register + attachments)
 * for a company and uploads it as a ZIP to the `documents` bucket under
 * `<company_id>/inspection-packages/<uuid>.zip` (matching existing storage RLS).
 *
 * Data comes from the same audit queries used by the Revisjon UI, so
 * hierarchy/allowlist rules are preserved automatically.
 */
import JSZip from "jszip";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { TFunction } from "i18next";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchAuditKpis,
  fetchCompetencies,
  fetchFleet,
  fetchOperations,
  fetchSafety,
  fetchAuditDocuments,
  fetchAuditReviews,
} from "../queries";
import { evaluateCompliance } from "./ComplianceEngine";
import type { DocumentRow } from "../types";

export interface BuildOptions {
  includeAttachments: boolean;
  includeIncidents: boolean;
  includeReviews: boolean;
  redactPersonalData: boolean;
  period: "12mo" | "24mo" | "all";
  language: "no" | "en";
}

export interface BuildProgress {
  step:
    | "collecting"
    | "buildingPdf"
    | "collectingAttachments"
    | "zipping"
    | "uploading";
}

export interface BuildResult {
  packageId: string;
  storagePath: string;
  signedUrl: string;
  fileName: string;
  sizeBytes: number;
  overallScore: number | null;
}

const MAX_ATTACHMENTS = 100;
const SIGN_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function redactName(name: string, enable: boolean): string {
  if (!enable || !name) return name;
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0]?.toUpperCase() + ".")
    .join(" ");
}

function fmtDate(iso: string | null | undefined, lang: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(lang);
  } catch {
    return iso;
  }
}

function periodStart(period: BuildOptions["period"]): Date | null {
  if (period === "all") return null;
  const d = new Date();
  d.setMonth(d.getMonth() - (period === "12mo" ? 12 : 24));
  return d;
}

interface CompanyRow {
  id: string;
  navn: string | null;
  adresse: string | null;
}

async function fetchCompany(companyId: string): Promise<CompanyRow | null> {
  const { data } = await supabase
    .from("companies")
    .select("id, navn, adresse")
    .eq("id", companyId)
    .maybeSingle();
  return (data as CompanyRow | null) ?? null;
}

async function fetchGeneratedBy(userId: string): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  const p = data as { full_name?: string | null; email?: string | null } | null;
  return p?.full_name || p?.email || userId;
}

// ---- PDF helpers -----------------------------------------------------------

function addHeading(doc: jsPDF, text: string, y: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(20, 20, 20);
  doc.text(text, 40, y);
  doc.setDrawColor(180, 180, 180);
  doc.line(40, y + 4, 555, y + 4);
  return y + 20;
}

function addSection(doc: jsPDF, title: string) {
  doc.addPage();
  const y = 60;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(20, 20, 20);
  doc.text(title, 40, y);
  doc.setDrawColor(80, 80, 80);
  doc.line(40, y + 6, 555, y + 6);
  return y + 26;
}

function statusColor(status: string): [number, number, number] {
  switch (status) {
    case "expired":
    case "fail":
      return [220, 38, 38];
    case "expiring":
    case "warn":
      return [217, 119, 6];
    case "valid":
    case "pass":
      return [22, 163, 74];
    default:
      return [107, 114, 128];
  }
}

// ---- Main builder ----------------------------------------------------------

export async function buildInspectionPackage(params: {
  userId: string;
  companyId: string;
  options: BuildOptions;
  t: TFunction;
  onProgress?: (p: BuildProgress) => void;
}): Promise<BuildResult> {
  const { userId, companyId, options, t, onProgress } = params;
  const progress = (step: BuildProgress["step"]) =>
    onProgress?.({ step });

  // 1. Collect ------------------------------------------------------------
  progress("collecting");
  const [
    company,
    generatedBy,
    kpis,
    competencies,
    documents,
    fleet,
    operations,
    safety,
    reviews,
  ] = await Promise.all([
    fetchCompany(companyId),
    fetchGeneratedBy(userId),
    fetchAuditKpis(userId, companyId),
    fetchCompetencies(userId, companyId),
    fetchAuditDocuments(userId, companyId),
    fetchFleet(userId, companyId),
    fetchOperations(userId, companyId),
    fetchSafety(userId, companyId),
    options.includeReviews ? fetchAuditReviews(userId, companyId) : Promise.resolve([]),
  ]);

  const evaluation = evaluateCompliance({
    competencies,
    documents,
    fleet,
    operations: operations.issues,
    operationsTotal: operations.total,
    safety,
    openAuditActions: kpis.openActions ?? 0,
    overdueAuditActions: 0,
  });

  const fromDate = periodStart(options.period);
  const periodLabel =
    options.period === "all"
      ? t("audit.package.periodAll")
      : `${fmtDate(fromDate?.toISOString() ?? null, options.language)} — ${fmtDate(
          new Date().toISOString(),
          options.language,
        )}`;

  // 2. PDF ----------------------------------------------------------------
  progress("buildingPdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });

  // Cover
  pdf.setFillColor(15, 23, 42);
  pdf.rect(0, 0, 595, 200, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(26);
  pdf.text(t("audit.package.pdf.coverTitle"), 40, 90);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(13);
  pdf.text(
    t("audit.package.pdf.coverSubtitle", { company: company?.navn ?? "—" }),
    40,
    118,
  );
  pdf.setFontSize(10);
  pdf.setTextColor(200, 200, 200);
  pdf.text(
    `${t("audit.package.pdf.generatedAt")}: ${fmtDate(new Date().toISOString(), options.language)}  ·  ${t("audit.package.pdf.generatedBy")}: ${redactName(generatedBy, options.redactPersonalData)}`,
    40,
    148,
  );
  pdf.text(
    `${t("audit.package.pdf.period")}: ${periodLabel}`,
    40,
    166,
  );

  // Overall score
  pdf.setTextColor(20, 20, 20);
  let y = 240;
  y = addHeading(pdf, t("audit.package.pdf.overallScore"), y);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(48);
  const score = evaluation.overall;
  const scoreColor: [number, number, number] =
    score === null
      ? [107, 114, 128]
      : score >= 80
        ? [22, 163, 74]
        : score >= 60
          ? [217, 119, 6]
          : [220, 38, 38];
  pdf.setTextColor(...scoreColor);
  pdf.text(score === null ? "—" : `${score}%`, 40, y + 40);
  pdf.setTextColor(20, 20, 20);

  // TOC
  y = 380;
  y = addHeading(pdf, t("audit.package.pdf.toc"), y);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  const tocItems = [
    "sectionCompany",
    "sectionScore",
    "sectionDocumentation",
    "sectionCompetency",
    "sectionFleet",
    "sectionOperations",
    ...(options.includeIncidents ? ["sectionSafety"] : []),
    ...(options.includeReviews ? ["sectionReviews"] : []),
    ...(options.includeAttachments ? ["sectionAttachments"] : []),
  ];
  for (const key of tocItems) {
    pdf.text(`• ${t(`audit.package.pdf.${key}`)}`, 50, y);
    y += 18;
  }

  // Company section
  y = addSection(pdf, t("audit.package.pdf.sectionCompany"));
  autoTable(pdf, {
    startY: y,
    styles: { font: "helvetica", fontSize: 10, cellPadding: 6 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    body: [
      [t("audit.package.pdf.orgNumber"), company?.id ?? "—"],
      ["Navn / Name", company?.navn ?? "—"],
      [t("audit.package.pdf.address"), company?.adresse ?? "—"],
    ],
  });

  // Category scores
  addSection(pdf, t("audit.package.pdf.sectionScore"));
  autoTable(pdf, {
    startY: 90,
    head: [[t("audit.tabs.overview"), t("audit.package.pdf.colStatus"), "%"]],
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    styles: { font: "helvetica", fontSize: 10, cellPadding: 6 },
    body: (["competence", "documentation", "fleet", "operations", "safety"] as const).map(
      (k) => {
        const c = evaluation.categories[k];
        return [
          t(`audit.categories.${k}`, { defaultValue: k }),
          c.critical > 0
            ? t("audit.categoryScore.openIssues", { count: c.critical + c.warnings })
            : t("audit.categoryScore.noIssues"),
          c.score === null ? "—" : `${c.score}%`,
        ];
      },
    ),
  });

  // Documentation
  addSection(pdf, t("audit.package.pdf.sectionDocumentation"));
  const docRows: DocumentRow[] = documents;
  autoTable(pdf, {
    startY: 90,
    head: [
      [
        t("audit.package.pdf.colTitle"),
        t("audit.package.pdf.colCategory"),
        t("audit.package.pdf.colExpiry"),
        t("audit.package.pdf.colStatus"),
      ],
    ],
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5 },
    body:
      docRows.length === 0
        ? [[t("audit.package.pdf.noRows"), "", "", ""]]
        : docRows.map((d) => [
            d.title,
            d.category,
            fmtDate(d.nextReview, options.language),
            t(`audit.status.${d.status}`, { defaultValue: d.status }),
          ]),
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 3) {
        const row = docRows[data.row.index];
        if (row) {
          data.cell.styles.textColor = statusColor(row.status);
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
  });

  // Competency
  addSection(pdf, t("audit.package.pdf.sectionCompetency"));
  autoTable(pdf, {
    startY: 90,
    head: [
      [
        t("audit.package.pdf.colPilot"),
        t("audit.package.pdf.colCompetency"),
        t("audit.package.pdf.colValidUntil"),
        t("audit.package.pdf.colStatus"),
      ],
    ],
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5 },
    body:
      competencies.length === 0
        ? [[t("audit.package.pdf.noRows"), "", "", ""]]
        : competencies.map((c) => [
            redactName(c.pilotName, options.redactPersonalData),
            c.competency,
            fmtDate(c.validUntil, options.language),
            t(`audit.status.${c.status}`, { defaultValue: c.status }),
          ]),
  });

  // Fleet
  addSection(pdf, t("audit.package.pdf.sectionFleet"));
  autoTable(pdf, {
    startY: 90,
    head: [
      [
        t("audit.package.pdf.colDrone"),
        t("audit.package.pdf.colService"),
        t("audit.package.pdf.colDeviations"),
        t("audit.package.pdf.colStatus"),
      ],
    ],
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5 },
    body:
      fleet.length === 0
        ? [[t("audit.package.pdf.noRows"), "", "", ""]]
        : fleet.map((f) => [
            `${f.droneName}${f.registration ? ` (${f.registration})` : ""}`,
            fmtDate(f.nextInspection, options.language),
            String(f.openDeviations),
            t(`audit.status.${f.service}`, { defaultValue: f.service }),
          ]),
  });

  // Operations
  addSection(pdf, t("audit.package.pdf.sectionOperations"));
  const opsInScope = operations.issues.filter((i) => {
    if (!fromDate) return true;
    return !i.missionDate || new Date(i.missionDate) >= fromDate;
  });
  autoTable(pdf, {
    startY: 90,
    head: [
      [
        t("audit.package.pdf.colMission"),
        t("audit.package.pdf.colDate"),
        t("audit.package.pdf.colIssue"),
      ],
    ],
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5 },
    body:
      opsInScope.length === 0
        ? [[t("audit.package.pdf.noRows"), "", ""]]
        : opsInScope.map((i) => [
            i.missionTitle,
            fmtDate(i.missionDate, options.language),
            t(`audit.operations.codes.${i.code}`, { defaultValue: i.code }),
          ]),
  });

  // Safety (optional)
  if (options.includeIncidents && safety) {
    addSection(pdf, t("audit.package.pdf.sectionSafety"));
    autoTable(pdf, {
      startY: 90,
      styles: { font: "helvetica", fontSize: 10, cellPadding: 6 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      body: [
        [t("audit.package.pdf.totalIncidents"), String(safety.reported)],
        [t("audit.tabs.safety"), `${safety.openIncidents} / ${safety.closedIncidents}`],
        [
          t("audit.package.pdf.closedOnTime"),
          safety.closedOnTimePct === null ? "—" : `${safety.closedOnTimePct}%`,
        ],
        [
          t("audit.package.pdf.avgCloseDays"),
          safety.avgCloseDays === null ? "—" : String(safety.avgCloseDays),
        ],
      ],
    });
  }

  // Reviews (optional)
  if (options.includeReviews) {
    addSection(pdf, t("audit.package.pdf.sectionReviews"));
    autoTable(pdf, {
      startY: 90,
      head: [
        [
          t("audit.package.pdf.colReview"),
          t("audit.package.pdf.colDate"),
          t("audit.package.pdf.colStatus"),
          t("audit.package.pdf.colClosedAt"),
        ],
      ],
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      styles: { font: "helvetica", fontSize: 9, cellPadding: 5 },
      body:
        (reviews as any[]).length === 0
          ? [[t("audit.package.pdf.noRows"), "", "", ""]]
          : (reviews as any[]).map((r) => [
              r.title ?? "—",
              fmtDate(r.review_date, options.language),
              r.status ?? "—",
              fmtDate(r.closed_at, options.language),
            ]),
    });
  }

  // 3. Attachments -------------------------------------------------------
  const zip = new JSZip();
  zip.file("inspection-package.pdf", pdf.output("arraybuffer"));

  const manifest = {
    generatedAt: new Date().toISOString(),
    generatedBy: options.redactPersonalData ? "[redacted]" : generatedBy,
    companyId,
    companyName: company?.navn ?? null,
    period: options.period,
    options,
    counts: {
      documents: documents.length,
      competencies: competencies.length,
      fleet: fleet.length,
      operations: opsInScope.length,
      reviews: (reviews as any[]).length,
    },
    overallScore: evaluation.overall,
    categoryScores: evaluation.categories,
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  if (options.includeAttachments) {
    progress("collectingAttachments");
    const { data: docFiles } = await supabase
      .from("documents")
      .select("id, tittel, fil_url, fil_navn, kategori")
      .eq("company_id", companyId)
      .not("fil_url", "is", null)
      .limit(MAX_ATTACHMENTS);
    const notes: string[] = [];
    for (const f of (docFiles as any[]) ?? []) {
      try {
        const { data, error } = await supabase.storage
          .from("documents")
          .download(f.fil_url);
        if (error || !data) {
          notes.push(`${f.tittel}: ${t("audit.package.attachmentSkipped")}`);
          continue;
        }
        const buf = await data.arrayBuffer();
        const safeCat = (f.kategori ?? "other").replace(/[^\w.-]+/g, "_");
        const safeName = (f.fil_navn ?? `${f.id}`).replace(/[^\w.\- ]+/g, "_");
        zip.file(`attachments/${safeCat}/${safeName}`, buf);
      } catch {
        notes.push(`${f.tittel}: ${t("audit.package.attachmentSkipped")}`);
      }
    }
    if (notes.length > 0) {
      zip.file("attachments/README.txt", notes.join("\n"));
    }
  }

  // 4. Zip & upload -----------------------------------------------------
  progress("zipping");
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });

  progress("uploading");
  const packageId = crypto.randomUUID();
  const storagePath = `${companyId}/inspection-packages/${packageId}.zip`;
  const companySlug = (company?.navn ?? "company")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "company";
  const dateSlug = new Date().toISOString().slice(0, 10);
  const fileName = `inspection-package-${companySlug}-${dateSlug}.zip`;

  const { error: uploadErr } = await supabase.storage
    .from("documents")
    .upload(storagePath, blob, {
      contentType: "application/zip",
      upsert: false,
    });
  if (uploadErr) throw new Error(uploadErr.message);

  const { data: signed, error: signErr } = await supabase.storage
    .from("documents")
    .createSignedUrl(storagePath, SIGN_URL_TTL_SECONDS, { download: fileName });
  if (signErr || !signed) throw new Error(signErr?.message ?? "sign failed");

  // 5. Persist history ------------------------------------------------
  const { data: inserted, error: insertErr } = await supabase
    .from("inspection_packages")
    .insert({
      id: packageId,
      company_id: companyId,
      generated_by: userId,
      period_from: fromDate ? fromDate.toISOString().slice(0, 10) : null,
      period_to: new Date().toISOString().slice(0, 10),
      options: options as any,
      overall_score: evaluation.overall,
      storage_path: storagePath,
      file_size_bytes: blob.size,
    })
    .select("id")
    .single();
  if (insertErr) throw new Error(insertErr.message);

  return {
    packageId: inserted.id,
    storagePath,
    signedUrl: signed.signedUrl,
    fileName,
    sizeBytes: blob.size,
    overallScore: evaluation.overall,
  };
}

/** Refresh a signed download URL for a historic package. */
export async function getPackageSignedUrl(
  storagePath: string,
  downloadFileName?: string,
): Promise<string> {
  const fileName =
    downloadFileName ?? storagePath.split("/").pop() ?? "inspection-package.zip";
  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(storagePath, SIGN_URL_TTL_SECONDS, { download: fileName });
  if (error || !data) throw new Error(error?.message ?? "sign failed");
  return data.signedUrl;
}
