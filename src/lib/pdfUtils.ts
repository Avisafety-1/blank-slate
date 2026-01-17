import jsPDF from "jspdf";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

/**
 * Sanitizes text for PDF output by replacing Norwegian characters
 * with ASCII equivalents. This prevents encoding issues in PDFs
 * that use the default Helvetica font.
 */
export const sanitizeForPdf = (text: string | null | undefined): string => {
  if (!text) return '';
  return text
    // Norwegian characters
    .replace(/æ/g, 'ae').replace(/Æ/g, 'Ae')
    .replace(/ø/g, 'o').replace(/Ø/g, 'O')
    .replace(/å/g, 'a').replace(/Å/g, 'A')
    // Other Nordic/European characters
    .replace(/ä/g, 'ae').replace(/Ä/g, 'Ae')
    .replace(/ö/g, 'o').replace(/Ö/g, 'O')
    .replace(/ü/g, 'u').replace(/Ü/g, 'U')
    .replace(/ß/g, 'ss')
    .replace(/é/g, 'e').replace(/É/g, 'E')
    .replace(/è/g, 'e').replace(/È/g, 'E')
    .replace(/ê/g, 'e').replace(/Ê/g, 'E')
    .replace(/ë/g, 'e').replace(/Ë/g, 'E')
    .replace(/à/g, 'a').replace(/À/g, 'A')
    .replace(/á/g, 'a').replace(/Á/g, 'A')
    .replace(/â/g, 'a').replace(/Â/g, 'A')
    .replace(/ñ/g, 'n').replace(/Ñ/g, 'N')
    .replace(/ç/g, 'c').replace(/Ç/g, 'C')
    // Special punctuation that can cause issues
    .replace(/–/g, '-').replace(/—/g, '-')
    .replace(/'/g, "'").replace(/'/g, "'")
    .replace(/"/g, '"').replace(/"/g, '"')
    .replace(/…/g, '...')
    .replace(/•/g, '-')
    // Remove any remaining non-ASCII characters that might cause issues
    .replace(/[^\x00-\x7F]/g, '');
};

/**
 * Creates a safe filename for PDF export by removing special characters
 * and Norwegian characters.
 */
export const sanitizeFilenameForPdf = (name: string): string => {
  return name
    .trim()
    .toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
};

/**
 * Formats a date for display in PDFs using Norwegian locale.
 */
export const formatDateForPdf = (date: Date | string, formatStr: string = "dd.MM.yyyy HH:mm"): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return sanitizeForPdf(format(dateObj, formatStr, { locale: nb }));
};

/**
 * Adds a signature image to a PDF document.
 * @returns The new Y position after adding the signature.
 */
export const addSignatureToPdf = async (
  doc: jsPDF,
  signatureUrl: string,
  yPos: number,
  label: string = "Signatur:"
): Promise<number> => {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load signature"));
      img.src = signatureUrl;
    });
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(sanitizeForPdf(label), 14, yPos);
    
    // Calculate proportional dimensions
    const maxWidth = 60;
    const maxHeight = 30;
    const ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
    const width = img.width * ratio;
    const height = img.height * ratio;
    
    doc.addImage(img, "PNG", 14, yPos + 5, width, height);
    doc.setTextColor(0);
    
    return yPos + 5 + height + 10;
  } catch (err) {
    console.warn("Could not add signature to PDF:", err);
    return yPos;
  }
};

/**
 * Formats a duration in minutes to a human-readable string.
 */
export const formatDurationForPdf = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours} t`;
  return `${hours} t ${mins} min`;
};

/**
 * Creates a standard PDF header with title and export date.
 * @returns The Y position after the header.
 */
export const addPdfHeader = (
  doc: jsPDF,
  title: string,
  subtitle?: string
): number => {
  const pageWidth = doc.internal.pageSize.getWidth();
  let yPos = 20;
  
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(sanitizeForPdf(title), pageWidth / 2, yPos, { align: "center" });
  yPos += 10;
  
  if (subtitle) {
    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.text(sanitizeForPdf(subtitle), pageWidth / 2, yPos, { align: "center" });
    yPos += 10;
  }
  
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Eksportert: ${formatDateForPdf(new Date(), "dd.MM.yyyy 'kl.' HH:mm")}`, pageWidth / 2, yPos, { align: "center" });
  doc.setTextColor(0);
  yPos += 15;
  
  return yPos;
};

/**
 * Adds a section header to the PDF.
 * @returns The new Y position after the header.
 */
export const addSectionHeader = (
  doc: jsPDF,
  title: string,
  yPos: number
): number => {
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(sanitizeForPdf(title), 14, yPos);
  return yPos + 8;
};

/**
 * Checks if we need a new page and adds one if necessary.
 * @returns The adjusted Y position (either same or reset to top of new page).
 */
export const checkPageBreak = (
  doc: jsPDF,
  yPos: number,
  requiredSpace: number = 50
): number => {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (yPos + requiredSpace > pageHeight - 20) {
    doc.addPage();
    return 20;
  }
  return yPos;
};
