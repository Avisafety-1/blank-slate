import {
  createPdfDocument,
  addPdfHeader,
  addSectionHeader,
  addSignatureToPdf,
  checkPageBreak,
  sanitizeForPdf,
  sanitizeFilenameForPdf,
  setFontStyle,
} from "@/lib/pdfUtils";
import { getCurrentLanguage } from "@/lib/i18nHelpers";
import i18n from "@/i18n";
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

/**
 * Generates and downloads a PDF for a completed evaluation form.
 */
export const exportEvaluationToPdf = async (input: EvaluationPdfInput): Promise<void> => {
  const language = getCurrentLanguage();
  const t = i18n.getFixedT(language);
  const doc = await createPdfDocument();
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - MARGIN * 2;

  let y = addPdfHeader(
    doc,
    input.title,
    input.missionName ?? undefined,
    input.companyName ?? undefined,
    language
  );

  // Header facts
  const facts: Array<[string, string]> = [
    [t("evaluation.pdf.student"), input.studentName || "—"],
    [t("evaluation.pdf.instructor"), input.instructorName || "—"],
    [t("evaluation.pdf.mission"), input.missionName || "—"],
    [t("evaluation.pdf.date"), input.missionTime || input.evaluatedAt || "—"],
  ];

  doc.setFontSize(10);
  facts.forEach(([label, value]) => {
    y = checkPageBreak(doc, y, 12);
    setFontStyle(doc, "bold");
    doc.text(sanitizeForPdf(`${label}:`), MARGIN, y);
    setFontStyle(doc, "normal");
    doc.text(sanitizeForPdf(value), MARGIN + 40, y);
    y += 6;
  });

  if (input.description) {
    y += 2;
    y = checkPageBreak(doc, y, 20);
    doc.setFontSize(10);
    setFontStyle(doc, "normal");
    doc.setTextColor(90);
    const lines = doc.splitTextToSize(sanitizeForPdf(input.description), contentWidth);
    doc.text(lines, MARGIN, y);
    doc.setTextColor(0);
    y += lines.length * 5;
  }

  y += 6;

  // Categories
  input.categories.forEach((category) => {
    y = checkPageBreak(doc, y, 30);
    y = addSectionHeader(doc, category.name, y);

    if (category.description) {
      doc.setFontSize(9);
      doc.setTextColor(110);
      const lines = doc.splitTextToSize(sanitizeForPdf(category.description), contentWidth);
      doc.text(lines, MARGIN, y);
      doc.setTextColor(0);
      y += lines.length * 4.5 + 2;
    }

    category.subcategories.forEach((sub) => {
      y = checkPageBreak(doc, y, 24);
      const score = input.scores?.[sub.id];
      doc.setFontSize(10);
      setFontStyle(doc, "normal");
      const nameLines = doc.splitTextToSize(sanitizeForPdf(sub.name), contentWidth - 30);
      doc.text(nameLines, MARGIN + 2, y);
      setFontStyle(doc, "bold");
      doc.text(
        sanitizeForPdf(score && score > 0 ? `${score}/6` : t("evaluation.pdf.notScored")),
        pageWidth - MARGIN,
        y,
        { align: "right" }
      );
      setFontStyle(doc, "normal");
      y += nameLines.length * 5;

      const comment = input.comments?.[sub.id];
      if (comment && comment.trim()) {
        doc.setFontSize(9);
        doc.setTextColor(110);
        const cLines = doc.splitTextToSize(sanitizeForPdf(comment.trim()), contentWidth - 6);
        y = checkPageBreak(doc, y, cLines.length * 4.5 + 6);
        doc.text(cLines, MARGIN + 4, y);
        doc.setTextColor(0);
        y += cLines.length * 4.5;
      }
      y += 3;
    });

    y += 4;
  });

  // Summary
  y = checkPageBreak(doc, y, 40);
  y = addSectionHeader(doc, t("evaluation.pdf.summary"), y);
  doc.setFontSize(10);
  setFontStyle(doc, "bold");
  doc.text(
    sanitizeForPdf(
      `${t("evaluation.pdf.overallAverage")}: ${
        typeof input.overallAverage === "number" ? input.overallAverage.toFixed(2) : "—"
      }`
    ),
    MARGIN,
    y
  );
  setFontStyle(doc, "normal");
  y += 7;

  if (input.overallComment && input.overallComment.trim()) {
    const lines = doc.splitTextToSize(sanitizeForPdf(input.overallComment.trim()), contentWidth);
    y = checkPageBreak(doc, y, lines.length * 5 + 10);
    doc.setFontSize(10);
    doc.text(lines, MARGIN, y);
    y += lines.length * 5 + 4;
  }

  // Signature
  y = checkPageBreak(doc, y, 50);
  y = addSectionHeader(doc, t("evaluation.pdf.signature"), y);
  if (input.signatureUrl) {
    y = await addSignatureToPdf(
      doc,
      input.signatureUrl,
      y,
      `${t("evaluation.pdf.signedBy")}: ${input.signatureName || input.studentName || ""}`,
      language
    );
    if (input.signedAt) {
      doc.setFontSize(9);
      doc.setTextColor(110);
      doc.text(sanitizeForPdf(`${t("evaluation.pdf.signedAt")}: ${input.signedAt}`), MARGIN, y);
      doc.setTextColor(0);
      y += 6;
    }
  } else {
    doc.setFontSize(10);
    doc.setTextColor(110);
    doc.text(sanitizeForPdf(t("evaluation.pdf.notSigned")), MARGIN, y);
    doc.setTextColor(0);
    y += 8;
  }

  // Visibility footer
  if (input.visibilitySummary?.length) {
    y = checkPageBreak(doc, y, 24);
    doc.setFontSize(9);
    doc.setTextColor(110);
    const lines = doc.splitTextToSize(
      sanitizeForPdf(`${t("evaluation.pdf.visibility")}: ${input.visibilitySummary.join(", ")}`),
      contentWidth
    );
    doc.text(lines, MARGIN, y);
    doc.setTextColor(0);
  }

  doc.save(`${sanitizeFilenameForPdf(input.title || "evaluation")}.pdf`);
};

export default exportEvaluationToPdf;
