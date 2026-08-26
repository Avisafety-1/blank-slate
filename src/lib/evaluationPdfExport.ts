import {
  createPdfDocument,
  addSignatureToPdf,
  sanitizeForPdf,
  sanitizeFilenameForPdf,
  setFontStyle,
  formatDateForPdf,
} from "@/lib/pdfUtils";
import { getCurrentLanguage, getFixedT } from "@/lib/i18nHelpers";
import type { EvaluationCategory } from "@/hooks/useEvaluationTemplates";

export interface EvaluationPdfInput {
  title: string;
  description?: string | null;
  categories: EvaluationCategory[];
  scores: Record<string, number>;
  comments: Record<string, string>;
  overallComment?: string | null;
  overallAverage?: number | null;
  studentName?: string | null;
  instructorName?: string | null;
  missionName?: string | null;
  missionTime?: string | null;
  evaluatedAt?: string | null;
  companyName?: string | null;
  signatureUrl?: string | null;
  signatureName?: string | null;
  signedAt?: string | null;
  /** Human readable list of who can see this evaluation in Avisafe. */
  visibilitySummary?: string[];
}

const MARGIN = 14;
const SCALE = [1, 2, 3, 4, 5, 6];

/** Colors mirroring the in-app evaluation design tokens. */
const C = {
  banner: [26, 41, 62] as [number, number, number],
  bannerAccent: [40, 60, 86] as [number, number, number],
  bannerMuted: [163, 178, 197] as [number, number, number],
  onBanner: [246, 249, 252] as [number, number, number],
  primary: [14, 74, 129] as [number, number, number],
  border: [222, 228, 236] as [number, number, number],
  surface: [255, 255, 255] as [number, number, number],
  surfaceMuted: [244, 247, 250] as [number, number, number],
  text: [24, 30, 38] as [number, number, number],
  textMuted: [110, 122, 136] as [number, number, number],
};

/**
 * Generates a PDF for a completed evaluation form and returns it as a file.
 * The layout mirrors the in-app evaluation template (dark banners, category
 * cards, 1-6 score chips) so the export looks like what the user sees.
 */
export const exportEvaluationToPdf = async (
  input: EvaluationPdfInput
): Promise<{ blob: Blob; fileName: string }> => {
  const language = getCurrentLanguage();
  const t = getFixedT(language);
  const doc = await createPdfDocument();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;

  let y = MARGIN;

  const fill = (c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
  const stroke = (c: [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2]);
  const color = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);

  const ensure = (needed: number) => {
    if (y + needed > pageHeight - 18) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const lines = (text: string, width: number, size: number, bold = false) => {
    doc.setFontSize(size);
    setFontStyle(doc, bold ? "bold" : "normal");
    return doc.splitTextToSize(sanitizeForPdf(text), width) as string[];
  };

  const fmt = (v: number | null | undefined) =>
    typeof v === "number" && !Number.isNaN(v) ? v.toFixed(1) : "–";

  // ---------- Header banner ----------
  {
    const titleLines = lines(input.title || t("evaluation.untitled"), contentWidth - 12, 16, true);
    const descLines = input.description?.trim()
      ? lines(input.description.trim(), contentWidth - 12, 9.5)
      : [];
    const h = 14 + titleLines.length * 7 + (descLines.length ? descLines.length * 4.5 + 2 : 0);

    fill(C.banner);
    doc.roundedRect(MARGIN, y, contentWidth, h, 3, 3, "F");

    let ty = y + 8;
    doc.setFontSize(7.5);
    setFontStyle(doc, "bold");
    color(C.bannerMuted);
    doc.text(sanitizeForPdf(t("evaluation.formLabel").toUpperCase()), MARGIN + 6, ty);
    ty += 6;

    doc.setFontSize(16);
    setFontStyle(doc, "bold");
    color(C.onBanner);
    doc.text(titleLines, MARGIN + 6, ty);
    ty += titleLines.length * 7;

    if (descLines.length) {
      doc.setFontSize(9.5);
      setFontStyle(doc, "normal");
      color(C.bannerMuted);
      doc.text(descLines, MARGIN + 6, ty);
    }

    if (input.companyName) {
      doc.setFontSize(8);
      setFontStyle(doc, "normal");
      color(C.bannerMuted);
      doc.text(sanitizeForPdf(input.companyName), pageWidth - MARGIN - 6, y + 8, { align: "right" });
    }

    y += h + 6;
  }

  // ---------- Facts grid ----------
  {
    const facts: Array<[string, string]> = [
      [t("evaluation.fields.instructor"), input.instructorName || "—"],
      [t("evaluation.fields.student"), input.studentName || "—"],
      [t("evaluation.fields.mission"), input.missionName || "—"],
      [t("evaluation.fields.missionTime"), input.missionTime || "—"],
      [t("evaluation.fields.evaluatedAt"), input.evaluatedAt || "—"],
    ];

    const colW = (contentWidth - 4) / 2;
    const cellH = 13;
    const rows = Math.ceil(facts.length / 2);
    ensure(rows * (cellH + 3));

    facts.forEach(([label, value], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const isLastOdd = i === facts.length - 1 && facts.length % 2 === 1;
      const x = MARGIN + col * (colW + 4);
      const w = isLastOdd ? contentWidth : colW;
      const cy = y + row * (cellH + 3);

      fill(C.surfaceMuted);
      stroke(C.border);
      doc.roundedRect(x, cy, w, cellH, 2, 2, "FD");

      doc.setFontSize(7);
      setFontStyle(doc, "bold");
      color(C.textMuted);
      doc.text(sanitizeForPdf(label.toUpperCase()), x + 3.5, cy + 5);

      doc.setFontSize(10);
      setFontStyle(doc, "normal");
      color(C.text);
      const v = lines(value, w - 7, 10)[0] ?? "";
      doc.text(v, x + 3.5, cy + 10.5);
    });

    y += rows * (cellH + 3) + 4;
  }

  // ---------- Categories ----------
  input.categories.forEach((category, catIndex) => {
    const catScores = category.subcategories
      .map((s) => input.scores?.[s.id])
      .filter((v): v is number => typeof v === "number" && v > 0);
    const catAvg = catScores.length
      ? catScores.reduce((a, b) => a + b, 0) / catScores.length
      : null;

    // Category banner
    const nameLines = lines(category.name || "—", contentWidth - 46, 13, true);
    const catDescLines = category.description?.trim()
      ? lines(category.description.trim(), contentWidth - 46, 8.5)
      : [];
    const bannerH = 12 + nameLines.length * 6 + (catDescLines.length ? catDescLines.length * 4 : 0);

    ensure(bannerH + 26);

    fill(C.banner);
    doc.roundedRect(MARGIN, y, contentWidth, bannerH, 2.5, 2.5, "F");

    let by = y + 7;
    doc.setFontSize(7);
    setFontStyle(doc, "bold");
    color(C.bannerMuted);
    doc.text(
      sanitizeForPdf(
        t("evaluation.preview.categoryIndex", { index: catIndex + 1 }).toUpperCase()
      ),
      MARGIN + 5,
      by
    );
    by += 5.5;
    doc.setFontSize(13);
    setFontStyle(doc, "bold");
    color(C.onBanner);
    doc.text(nameLines, MARGIN + 5, by);
    by += nameLines.length * 6;
    if (catDescLines.length) {
      doc.setFontSize(8.5);
      setFontStyle(doc, "normal");
      color(C.bannerMuted);
      doc.text(catDescLines, MARGIN + 5, by);
    }

    // Average pill
    const pillW = 22;
    const pillX = pageWidth - MARGIN - 5 - pillW;
    doc.setFontSize(6.5);
    setFontStyle(doc, "bold");
    color(C.bannerMuted);
    doc.text(sanitizeForPdf(t("evaluation.preview.average").toUpperCase()), pillX + pillW, y + 7, {
      align: "right",
    });
    fill(C.bannerAccent);
    doc.roundedRect(pillX, y + 9, pillW, 8, 4, 4, "F");
    doc.setFontSize(11);
    setFontStyle(doc, "bold");
    color(C.onBanner);
    doc.text(fmt(catAvg), pillX + pillW / 2, y + 14.6, { align: "center" });

    y += bannerH + 3;

    // Subcategory cards
    category.subcategories.forEach((sub) => {
      const cardW = contentWidth;
      const textW = cardW - 10;
      const subNameLines = lines(sub.name || "—", textW, 10, true);
      const subDescLines = sub.description?.trim()
        ? lines(sub.description.trim(), textW, 8.5)
        : [];
      const comment = (input.comments?.[sub.id] ?? "").trim();
      const commentLines = comment ? lines(comment, textW - 6, 9) : [];

      const chipsH = 9;
      const commentH = commentLines.length ? commentLines.length * 4.6 + 6 : 0;
      const cardH =
        6 +
        subNameLines.length * 5 +
        (subDescLines.length ? subDescLines.length * 4 + 1 : 0) +
        3 +
        chipsH +
        (commentH ? commentH + 3 : 0) +
        5;

      ensure(cardH + 4);

      fill(C.surface);
      stroke(C.border);
      doc.roundedRect(MARGIN, y, cardW, cardH, 2.5, 2.5, "FD");

      let sy = y + 6;
      doc.setFontSize(10);
      setFontStyle(doc, "bold");
      color(C.text);
      doc.text(subNameLines, MARGIN + 5, sy);
      sy += subNameLines.length * 5;

      if (subDescLines.length) {
        doc.setFontSize(8.5);
        setFontStyle(doc, "normal");
        color(C.textMuted);
        doc.text(subDescLines, MARGIN + 5, sy);
        sy += subDescLines.length * 4 + 1;
      }

      // Score chips 1-6
      sy += 3;
      const score = input.scores?.[sub.id];
      const chipW = 9;
      const gap = 2;
      const chipsTotal = SCALE.length * chipW + (SCALE.length - 1) * gap;
      let cx = MARGIN + 5;
      SCALE.forEach((value) => {
        const active = score === value;
        if (active) {
          fill(C.primary);
          stroke(C.primary);
        } else {
          fill(C.surfaceMuted);
          stroke(C.border);
        }
        doc.roundedRect(cx, sy, chipW, chipsH, 2, 2, "FD");
        doc.setFontSize(9);
        setFontStyle(doc, active ? "bold" : "normal");
        color(active ? C.onBanner : C.textMuted);
        doc.text(String(value), cx + chipW / 2, sy + chipsH / 2 + 1.6, { align: "center" });
        cx += chipW + gap;
      });

      if (!score) {
        doc.setFontSize(8);
        setFontStyle(doc, "normal");
        color(C.textMuted);
        doc.text(
          sanitizeForPdf(t("evaluation.pdf.notScored")),
          MARGIN + 5 + chipsTotal + 4,
          sy + chipsH / 2 + 1.4
        );
      }
      sy += chipsH;

      if (commentLines.length) {
        sy += 3;
        fill(C.surfaceMuted);
        doc.roundedRect(MARGIN + 5, sy, cardW - 10, commentH, 2, 2, "F");
        doc.setFontSize(9);
        setFontStyle(doc, "normal");
        color(C.text);
        doc.text(commentLines, MARGIN + 8, sy + 5);
      }

      y += cardH + 3;
    });

    y += 3;
  });

  // ---------- Summary ----------
  {
    const overall = input.overallComment?.trim();
    const overallLines = overall ? lines(overall, contentWidth - 12, 10) : [];
    const h = 20 + (overallLines.length ? overallLines.length * 5 + 3 : 0);
    ensure(h + 4);

    fill(C.surfaceMuted);
    stroke(C.border);
    doc.roundedRect(MARGIN, y, contentWidth, h, 2.5, 2.5, "FD");

    doc.setFontSize(10);
    setFontStyle(doc, "bold");
    color(C.text);
    doc.text(sanitizeForPdf(t("evaluation.fields.overallComment")), MARGIN + 6, y + 8);

    const label = `${t("evaluation.preview.totalAverage")}: ${fmt(input.overallAverage)}`;
    doc.setFontSize(9);
    setFontStyle(doc, "bold");
    const labelW = doc.getTextWidth(sanitizeForPdf(label)) + 8;
    fill(C.primary);
    doc.roundedRect(pageWidth - MARGIN - 6 - labelW, y + 3.5, labelW, 7.5, 3.75, 3.75, "F");
    color(C.onBanner);
    doc.text(sanitizeForPdf(label), pageWidth - MARGIN - 6 - labelW / 2, y + 8.6, {
      align: "center",
    });

    if (overallLines.length) {
      doc.setFontSize(10);
      setFontStyle(doc, "normal");
      color(C.text);
      doc.text(overallLines, MARGIN + 6, y + 16);
    } else {
      doc.setFontSize(9);
      setFontStyle(doc, "normal");
      color(C.textMuted);
      doc.text("—", MARGIN + 6, y + 16);
    }

    y += h + 5;
  }

  // ---------- Signature ----------
  {
    ensure(46);
    doc.setFontSize(10);
    setFontStyle(doc, "bold");
    color(C.text);
    doc.text(sanitizeForPdf(t("evaluation.pdf.signature")), MARGIN, y + 4);
    y += 8;

    if (input.signatureUrl) {
      color(C.textMuted);
      y = await addSignatureToPdf(
        doc,
        input.signatureUrl,
        y,
        `${t("evaluation.pdf.signedBy")}: ${input.signatureName || input.studentName || ""}`,
        language
      );
      if (input.signedAt) {
        doc.setFontSize(9);
        setFontStyle(doc, "normal");
        color(C.textMuted);
        doc.text(sanitizeForPdf(`${t("evaluation.pdf.signedAt")}: ${input.signedAt}`), MARGIN, y);
        y += 6;
      }
    } else {
      stroke(C.border);
      doc.setLineWidth(0.3);
      doc.line(MARGIN, y + 12, MARGIN + 70, y + 12);
      doc.setFontSize(9);
      setFontStyle(doc, "normal");
      color(C.textMuted);
      doc.text(sanitizeForPdf(t("evaluation.pdf.notSigned")), MARGIN, y + 17);
      y += 22;
    }
  }

  // ---------- Footer on every page ----------
  const pageCount = doc.getNumberOfPages();
  const exportedAt = formatDateForPdf(new Date(), "dd.MM.yyyy HH:mm", language);
  const visibility = input.visibilitySummary?.length
    ? `${t("evaluation.pdf.visibility")}: ${input.visibilitySummary.join(", ")}`
    : "";
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    stroke(C.border);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, pageHeight - 13, pageWidth - MARGIN, pageHeight - 13);
    doc.setFontSize(7.5);
    setFontStyle(doc, "normal");
    color(C.textMuted);
    const footerLeft = visibility ? `${visibility}  ·  ${exportedAt}` : exportedAt;
    doc.text(
      lines(footerLeft, contentWidth - 20, 7.5)[0] ?? "",
      MARGIN,
      pageHeight - 8.5
    );
    doc.text(`${p} / ${pageCount}`, pageWidth - MARGIN, pageHeight - 8.5, { align: "right" });
  }

  const fileName = `${sanitizeFilenameForPdf(input.title || "evaluation")}.pdf`;
  return { blob: doc.output("blob") as Blob, fileName };
};

export default exportEvaluationToPdf;
