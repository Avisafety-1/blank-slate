import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import {
  createPdfDocument,
  setFontStyle,
  sanitizeForPdf,
  sanitizeFilenameForPdf,
  formatDateForPdf,
  addPdfHeader,
  addSectionHeader,
  checkPageBreak,
  arePdfFontsLoaded,
} from "./pdfUtils";

interface RiskExportOptions {
  assessment: any;
  missionTitle: string;
  categoryComments: Record<string, string>;
  companyId: string;
  userId: string;
  createdAt?: string;
}

export const exportRiskAssessmentPDF = async ({
  assessment,
  missionTitle,
  categoryComments,
  companyId,
  userId,
  createdAt,
}: RiskExportOptions): Promise<boolean> => {
  try {
    const doc = await createPdfDocument();
    const pageWidth = doc.internal.pageSize.getWidth();
    const fontName = arePdfFontsLoaded() ? "Roboto" : "helvetica";

    // Header
    let yPos = addPdfHeader(doc, "RISIKOVURDERING", sanitizeForPdf(missionTitle));

    if (createdAt) {
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(
        `Vurdert: ${formatDateForPdf(createdAt, "dd.MM.yyyy 'kl.' HH:mm")}`,
        pageWidth / 2,
        yPos - 5,
        { align: "center" }
      );
      doc.setTextColor(0);
      yPos += 3;
    }

    // Mission overview
    if (assessment.mission_overview) {
      yPos = addSectionHeader(doc, "OPPDRAGSOVERSIKT", yPos);
      doc.setFontSize(10);
      setFontStyle(doc, "normal");
      const overviewLines = doc.splitTextToSize(
        sanitizeForPdf(assessment.mission_overview),
        pageWidth - 28
      );
      doc.text(overviewLines, 14, yPos);
      yPos += overviewLines.length * 5 + 8;
    }

    // Assessment method
    if (assessment.assessment_method) {
      yPos = checkPageBreak(doc, yPos, 30);
      yPos = addSectionHeader(doc, "VURDERINGSMETODE", yPos);
      doc.setFontSize(10);
      setFontStyle(doc, "normal");
      const methodLines = doc.splitTextToSize(
        sanitizeForPdf(assessment.assessment_method),
        pageWidth - 28
      );
      doc.text(methodLines, 14, yPos);
      yPos += methodLines.length * 5 + 8;
    }

    // Overall score
    yPos = checkPageBreak(doc, yPos, 30);
    yPos = addSectionHeader(doc, "SAMLET VURDERING", yPos);
    doc.setFontSize(10);
    setFontStyle(doc, "bold");
    const recLabel =
      assessment.recommendation === "go"
        ? "GO"
        : assessment.recommendation === "caution"
        ? "BETINGET GO"
        : "NO-GO";
    doc.text(
      `Score: ${assessment.overall_score?.toFixed(1) || "N/A"}/10 - ${recLabel}`,
      14,
      yPos
    );
    yPos += 8;

    if (assessment.hard_stop_triggered && assessment.hard_stop_reason) {
      setFontStyle(doc, "normal");
      doc.setTextColor(200, 0, 0);
      const stopLines = doc.splitTextToSize(
        `HARD STOP: ${sanitizeForPdf(assessment.hard_stop_reason)}`,
        pageWidth - 28
      );
      doc.text(stopLines, 14, yPos);
      doc.setTextColor(0);
      yPos += stopLines.length * 5 + 5;
    }

    // Summary
    if (assessment.summary) {
      yPos = checkPageBreak(doc, yPos, 30);
      setFontStyle(doc, "normal");
      doc.setFontSize(10);
      const summaryLines = doc.splitTextToSize(
        sanitizeForPdf(assessment.summary),
        pageWidth - 28
      );
      doc.text(summaryLines, 14, yPos);
      yPos += summaryLines.length * 5 + 10;
    }

    // Category scores table
    if (assessment.categories && assessment.categories.length > 0) {
      yPos = checkPageBreak(doc, yPos, 50);
      yPos = addSectionHeader(doc, "KATEGORISCORER", yPos);

      const tableBody = assessment.categories.map((cat: any) => [
        sanitizeForPdf(cat.name || cat.category || ""),
        `${cat.score?.toFixed(1) || "N/A"}/10`,
        cat.go_decision ? "GO" : "IKKE GO",
        sanitizeForPdf(categoryComments[cat.name || cat.category] || ""),
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [["Kategori", "Score", "Beslutning", "Pilotkommentar"]],
        body: tableBody,
        styles: { fontSize: 9, font: fontName },
        headStyles: { fillColor: [59, 130, 246], font: fontName },
        columnStyles: {
          0: { cellWidth: 40 },
          1: { cellWidth: 22 },
          2: { cellWidth: 25 },
          3: { cellWidth: "auto" },
        },
      });

      yPos = (doc as any).lastAutoTable?.finalY + 10 || yPos + 40;

      // Category details (factors/concerns)
      for (const cat of assessment.categories) {
        const catName = cat.name || cat.category || "";
        const hasFactors =
          cat.positive_factors?.length > 0 || cat.concerns?.length > 0;
        if (!hasFactors) continue;

        yPos = checkPageBreak(doc, yPos, 30);
        doc.setFontSize(10);
        setFontStyle(doc, "bold");
        doc.text(sanitizeForPdf(catName), 14, yPos);
        yPos += 6;

        setFontStyle(doc, "normal");
        doc.setFontSize(9);

        if (cat.positive_factors?.length > 0) {
          for (const factor of cat.positive_factors) {
            yPos = checkPageBreak(doc, yPos, 8);
            doc.text(`+ ${sanitizeForPdf(factor)}`, 18, yPos);
            yPos += 5;
          }
        }
        if (cat.concerns?.length > 0) {
          for (const concern of cat.concerns) {
            yPos = checkPageBreak(doc, yPos, 8);
            doc.text(`- ${sanitizeForPdf(concern)}`, 18, yPos);
            yPos += 5;
          }
        }
        yPos += 4;
      }
    }

    // Recommendations
    if (assessment.recommendations?.length > 0) {
      yPos = checkPageBreak(doc, yPos, 40);
      yPos = addSectionHeader(doc, "ANBEFALTE TILTAK", yPos);
      doc.setFontSize(9);
      setFontStyle(doc, "normal");

      const priorityOrder = ["high", "medium", "low"];
      const priorityLabels: Record<string, string> = {
        high: "Hoy",
        medium: "Medium",
        low: "Lav",
      };

      for (const priority of priorityOrder) {
        const items = assessment.recommendations.filter(
          (r: any) => r.priority === priority
        );
        if (items.length === 0) continue;

        yPos = checkPageBreak(doc, yPos, 15);
        setFontStyle(doc, "bold");
        doc.text(`${priorityLabels[priority] || priority} prioritet:`, 14, yPos);
        yPos += 6;
        setFontStyle(doc, "normal");

        for (const item of items) {
          yPos = checkPageBreak(doc, yPos, 8);
          const lines = doc.splitTextToSize(
            `- ${sanitizeForPdf(item.action || item.text || item)}`,
            pageWidth - 32
          );
          doc.text(lines, 18, yPos);
          yPos += lines.length * 5;
        }
        yPos += 3;
      }
    }

    // Prerequisites / go conditions
    if (assessment.prerequisites?.length > 0 || assessment.go_conditions?.length > 0) {
      yPos = checkPageBreak(doc, yPos, 30);
      yPos = addSectionHeader(doc, "FORUTSETNINGER", yPos);
      doc.setFontSize(9);
      setFontStyle(doc, "normal");

      const items = [
        ...(assessment.prerequisites || []),
        ...(assessment.go_conditions || []),
      ];
      for (const item of items) {
        yPos = checkPageBreak(doc, yPos, 8);
        const text = typeof item === "string" ? item : item.text || item.condition || "";
        const lines = doc.splitTextToSize(
          `- ${sanitizeForPdf(text)}`,
          pageWidth - 32
        );
        doc.text(lines, 18, yPos);
        yPos += lines.length * 5;
      }
      yPos += 5;
    }

    // AI disclaimer
    yPos = checkPageBreak(doc, yPos, 30);
    doc.setFontSize(8);
    doc.setTextColor(100);
    setFontStyle(doc, "normal");
    const disclaimer =
      assessment.ai_disclaimer ||
      "AI risikovurdering kan brukes som beslutningsstotte. Det er alltid pilot-in-command som selv ma vurdere risikoen knyttet til oppdraget.";
    const disclaimerLines = doc.splitTextToSize(
      sanitizeForPdf(disclaimer),
      pageWidth - 28
    );
    doc.text(disclaimerLines, 14, yPos);
    doc.setTextColor(0);

    // Generate and upload
    const dateStr = format(new Date(), "yyyy-MM-dd");
    const safeTitle = sanitizeFilenameForPdf(missionTitle).substring(0, 30);
    const fileName = `risikovurdering-${safeTitle}-${dateStr}.pdf`;
    const pdfBlob = doc.output("blob");
    const filePath = `${companyId}/${fileName}`;

    const { data: userProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .single();
    const opprettetAv = userProfile?.full_name || "Ukjent";

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(filePath, pdfBlob, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { error: docError } = await supabase.from("documents").insert({
      tittel: `Risikovurdering - ${sanitizeForPdf(missionTitle)} - ${formatDateForPdf(new Date(), "dd.MM.yyyy")}`,
      kategori: "risikovurderinger",
      fil_url: filePath,
      fil_navn: fileName,
      company_id: companyId,
      user_id: userId,
      opprettet_av: opprettetAv,
      beskrivelse: `Automatisk generert risikovurdering for oppdrag: ${sanitizeForPdf(missionTitle)}`,
    });

    if (docError) throw docError;

    return true;
  } catch (error) {
    console.error("Error exporting risk assessment PDF:", error);
    return false;
  }
};
