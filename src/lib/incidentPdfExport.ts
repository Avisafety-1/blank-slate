import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";

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
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 20;

    // Header
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("HENDELSESRAPPORT", pageWidth / 2, yPos, { align: "center" });
    yPos += 10;

    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.text(incident.tittel, pageWidth / 2, yPos, { align: "center" });
    yPos += 10;

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Eksportert: ${format(new Date(), "dd.MM.yyyy 'kl.' HH:mm", { locale: nb })}`, pageWidth / 2, yPos, { align: "center" });
    doc.setTextColor(0);
    yPos += 15;

    // Detaljer
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("DETALJER", 14, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    const details: [string, string][] = [
      ["Status", incident.status],
      ["Alvorlighetsgrad", incident.alvorlighetsgrad],
      ["Kategori", incident.kategori || "Ikke spesifisert"],
      ["Hovedårsak", incident.hovedaarsak || "Ikke spesifisert"],
      ["Medvirkende årsak", incident.medvirkende_aarsak || "Ikke spesifisert"],
      ["Hendelsestidspunkt", format(new Date(incident.hendelsestidspunkt), "dd.MM.yyyy HH:mm", { locale: nb })],
      ["Lokasjon", incident.lokasjon || "Ikke spesifisert"],
      ["Rapportert av", incident.rapportert_av || "Ikke spesifisert"],
      ["Oppfølgingsansvarlig", oppfolgingsansvarligName || "Ikke tildelt"],
    ];

    if (relatedMissionTitle) {
      details.push(["Knyttet oppdrag", relatedMissionTitle]);
    }

    details.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold");
      doc.text(`${label}:`, 14, yPos);
      doc.setFont("helvetica", "normal");
      doc.text(value, 60, yPos);
      yPos += 6;
    });

    yPos += 10;

    // Beskrivelse
    if (incident.beskrivelse) {
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("BESKRIVELSE", 14, yPos);
      yPos += 8;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      const splitDescription = doc.splitTextToSize(incident.beskrivelse, pageWidth - 28);
      doc.text(splitDescription, 14, yPos);
      yPos += splitDescription.length * 5 + 10;
    }

    // Kommentarer
    if (comments.length > 0) {
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("KOMMENTARER", 14, yPos);
      yPos += 8;

      autoTable(doc, {
        startY: yPos,
        head: [["Dato", "Av", "Kommentar"]],
        body: comments.map(c => [
          format(new Date(c.created_at), "dd.MM.yyyy HH:mm", { locale: nb }),
          c.created_by_name,
          c.comment_text
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
    const safeTitle = incident.tittel
      .trim()
      .toLowerCase()
      .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a')
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 30);
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
        tittel: `Hendelsesrapport - ${incident.tittel} - ${format(new Date(), "dd.MM.yyyy", { locale: nb })}`,
        kategori: 'rapporter',
        fil_url: filePath,
        fil_navn: fileName,
        company_id: companyId,
        user_id: userId,
        beskrivelse: `Automatisk generert rapport for hendelse: ${incident.tittel}`
      });

    if (docError) throw docError;

    return true;
  } catch (error) {
    console.error("Error exporting PDF:", error);
    return false;
  }
};
