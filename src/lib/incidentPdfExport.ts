import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { createPdfDocument, setFontStyle, sanitizeForPdf, sanitizeFilenameForPdf, formatDateForPdf, addPdfHeader, addSectionHeader, checkPageBreak } from "./pdfUtils";

type Incident = {
  id: string;
  tittel: string;
  beskrivelse: string | null;
  hendelsestidspunkt: string;
  alvorlighetsgrad: string;
  status: string;
  kategori: string | null;
  lokasjon: string | null;
  rapportert_av: string | null;
  hovedaarsak: string | null;
  medvirkende_aarsak: string | null;
};

type IncidentComment = {
  id: string;
  comment_text: string;
  created_by_name: string;
  created_at: string;
};

interface ExportOptions {
  incident: Incident;
  comments: IncidentComment[];
  oppfolgingsansvarligName: string | null;
  relatedMissionTitle: string | null;
  companyId: string;
  userId: string;
}

export const exportIncidentPDF = async ({
  incident,
  comments,
  oppfolgingsansvarligName,
  relatedMissionTitle,
  companyId,
  userId,
}: ExportOptions): Promise<boolean> => {
  try {
    const doc = await createPdfDocument();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    let yPos = addPdfHeader(doc, "HENDELSESRAPPORT", incident.tittel);

    // Detaljer
    yPos = addSectionHeader(doc, "DETALJER", yPos);

    doc.setFontSize(10);
    setFontStyle(doc, "normal");

    const details: [string, string][] = [
      ["Status", sanitizeForPdf(incident.status)],
      ["Alvorlighetsgrad", sanitizeForPdf(incident.alvorlighetsgrad)],
      ["Kategori", sanitizeForPdf(incident.kategori) || "Ikke spesifisert"],
      ["Hovedarsak", sanitizeForPdf(incident.hovedaarsak) || "Ikke spesifisert"],
      ["Medvirkende arsak", sanitizeForPdf(incident.medvirkende_aarsak) || "Ikke spesifisert"],
      ["Hendelsestidspunkt", formatDateForPdf(incident.hendelsestidspunkt)],
      ["Lokasjon", sanitizeForPdf(incident.lokasjon) || "Ikke spesifisert"],
      ["Rapportert av", sanitizeForPdf(incident.rapportert_av) || "Ikke spesifisert"],
      ["Oppfolgingsansvarlig", sanitizeForPdf(oppfolgingsansvarligName) || "Ikke tildelt"],
    ];

    if (relatedMissionTitle) {
      details.push(["Knyttet oppdrag", sanitizeForPdf(relatedMissionTitle)]);
    }

    details.forEach(([label, value]) => {
      setFontStyle(doc, "bold");
      doc.text(`${label}:`, 14, yPos);
      setFontStyle(doc, "normal");
      doc.text(value, 60, yPos);
      yPos += 6;
    });

    yPos += 10;

    // Beskrivelse
    if (incident.beskrivelse) {
      yPos = checkPageBreak(doc, yPos, 40);
      yPos = addSectionHeader(doc, "BESKRIVELSE", yPos);

      doc.setFontSize(10);
      setFontStyle(doc, "normal");
      const sanitizedDescription = sanitizeForPdf(incident.beskrivelse);
      const splitDescription = doc.splitTextToSize(sanitizedDescription, pageWidth - 28);
      doc.text(splitDescription, 14, yPos);
      yPos += splitDescription.length * 5 + 10;
    }

    // Kommentarer
    if (comments.length > 0) {
      yPos = checkPageBreak(doc, yPos, 50);
      yPos = addSectionHeader(doc, "KOMMENTARER", yPos);

      autoTable(doc, {
        startY: yPos,
        head: [["Dato", "Av", "Kommentar"]],
        body: comments.map(c => [
          formatDateForPdf(c.created_at),
          sanitizeForPdf(c.created_by_name),
          sanitizeForPdf(c.comment_text)
        ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [59, 130, 246] },
        columnStyles: {
          0: { cellWidth: 35 },
          1: { cellWidth: 35 },
          2: { cellWidth: 'auto' }
        }
      });
    }

    // Generer filnavn og blob
    const dateStr = format(new Date(), "yyyy-MM-dd");
    const safeTitle = sanitizeFilenameForPdf(incident.tittel).substring(0, 30);
    const fileName = `hendelsesrapport-${safeTitle}-${dateStr}.pdf`;
    
    const pdfBlob = doc.output('blob');
    const filePath = `${companyId}/${fileName}`;

    // Last opp til Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, pdfBlob, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) throw uploadError;

    // Opprett dokumentoppføring
    const { error: docError } = await supabase
      .from('documents')
      .insert({
        tittel: `Hendelsesrapport - ${sanitizeForPdf(incident.tittel)} - ${formatDateForPdf(new Date(), "dd.MM.yyyy")}`,
        kategori: 'rapporter',
        fil_url: filePath,
        fil_navn: fileName,
        company_id: companyId,
        user_id: userId,
        beskrivelse: `Automatisk generert rapport for hendelse: ${sanitizeForPdf(incident.tittel)}`
      });

    if (docError) throw docError;

    return true;
  } catch (error) {
    console.error("Error exporting PDF:", error);
    return false;
  }
};
