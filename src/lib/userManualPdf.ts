import autoTable from "jspdf-autotable";
import i18n from "@/i18n";
import { createPdfDocument, setFontStyle, sanitizeForPdf, checkPageBreak, getPdfFontName } from "./pdfUtils";

interface Section {
  title: string;
  content: ContentItem[];
}

type ContentItem = 
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'numbered-list'; items: string[] };

const getSections = (): Section[] => {
  const sectionsObj = i18n.t('userManual.sections', { ns: 'pdf', returnObjects: true }) as Record<string, Section>;
  return Object.keys(sectionsObj)
    .sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10))
    .map((key) => sectionsObj[key]);
};

export const generateUserManualPDF = async (): Promise<Blob> => {
  const sections = getSections();
  const doc = await createPdfDocument();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Title page
  doc.setFontSize(32);
  setFontStyle(doc, "bold");
  doc.text(i18n.t('userManual.docTitle', { ns: 'pdf' }), pageWidth / 2, 60, { align: "center" });
  
  doc.setFontSize(18);
  setFontStyle(doc, "normal");
  doc.text(i18n.t('userManual.subtitle', { ns: 'pdf' }), pageWidth / 2, 75, { align: "center" });
  
  doc.setFontSize(14);
  doc.text(i18n.t('userManual.subtitle2', { ns: 'pdf' }), pageWidth / 2, 90, { align: "center" });
  
  doc.setFontSize(10);
  doc.setTextColor(100);
  const today = new Date();
  doc.text(i18n.t('userManual.version', { ns: 'pdf', date: today.toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'nb-NO') }), pageWidth / 2, 110, { align: "center" });
  doc.setTextColor(0);
  
  // Table of contents
  doc.addPage();
  let yPos = 20;
  
  doc.setFontSize(16);
  setFontStyle(doc, "bold");
  doc.text(i18n.t('userManual.toc', { ns: 'pdf' }), 14, yPos);
  yPos += 15;
  
  doc.setFontSize(11);
  setFontStyle(doc, "normal");
  
  sections.forEach((section, index) => {
    doc.text(sanitizeForPdf(section.title), 14, yPos);
    yPos += 7;
  });

  
  // Content pages
  doc.addPage();
  yPos = 20;
  
  for (const section of sections) {
    yPos = checkPageBreak(doc, yPos, 40);
    
    // Section title
    doc.setFontSize(14);
    setFontStyle(doc, "bold");
    doc.text(sanitizeForPdf(section.title), 14, yPos);
    yPos += 10;
    
    for (const item of section.content) {
      yPos = checkPageBreak(doc, yPos, 30);
      
      if (item.type === 'paragraph') {
        doc.setFontSize(10);
        setFontStyle(doc, "normal");
        const lines = doc.splitTextToSize(sanitizeForPdf(item.text), pageWidth - 28);
        doc.text(lines, 14, yPos);
        yPos += lines.length * 5 + 5;
      }
      
      else if (item.type === 'heading') {
        doc.setFontSize(11);
        setFontStyle(doc, "bold");
        doc.text(sanitizeForPdf(item.text), 14, yPos);
        yPos += 8;
      }
      
      else if (item.type === 'list') {
        doc.setFontSize(10);
        setFontStyle(doc, "normal");
        for (const listItem of item.items) {
          yPos = checkPageBreak(doc, yPos, 8);
          const lines = doc.splitTextToSize(sanitizeForPdf(`- ${listItem}`), pageWidth - 32);
          doc.text(lines, 18, yPos);
          yPos += lines.length * 5 + 2;
        }
        yPos += 3;
      }
      
      else if (item.type === 'numbered-list') {
        doc.setFontSize(10);
        setFontStyle(doc, "normal");
        item.items.forEach((listItem, idx) => {
          yPos = checkPageBreak(doc, yPos, 8);
          const lines = doc.splitTextToSize(sanitizeForPdf(`${idx + 1}. ${listItem}`), pageWidth - 32);
          doc.text(lines, 18, yPos);
          yPos += lines.length * 5 + 2;
        });
        yPos += 3;
      }
      
      else if (item.type === 'table') {
        yPos = checkPageBreak(doc, yPos, 40);
        autoTable(doc, {
          startY: yPos,
          head: [item.headers.map(h => sanitizeForPdf(h))],
          body: item.rows.map(row => row.map(cell => sanitizeForPdf(cell))),
          margin: { left: 14, right: 14 },
          styles: { fontSize: 9, cellPadding: 3, font: getPdfFontName() },
          headStyles: { fillColor: [59, 130, 246], textColor: 255 },
          alternateRowStyles: { fillColor: [245, 247, 250] },
        });
        yPos = (doc as any).lastAutoTable.finalY + 10;
      }
    }
    
    yPos += 10;
  }
  
  // Footer on each page
  const pageCount = doc.getNumberOfPages();
  for (let i = 2; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(i18n.t('userManual.footer', { ns: 'pdf', page: i, total: pageCount }), pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: "center" });
  }
  
  return doc.output("blob");
};
