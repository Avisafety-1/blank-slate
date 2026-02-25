import { supabase } from "@/integrations/supabase/client";
import autoTable from "jspdf-autotable";
import { createPdfDocument, setFontStyle, sanitizeForPdf, formatDateForPdf } from "@/lib/pdfUtils";
import { generateMissionMapSnapshot } from "@/lib/mapSnapshotUtils";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { toast } from "sonner";

type Mission = any;

export const DEFAULT_PDF_SECTIONS = {
  map: true,
  airspaceWarnings: true,
  routeCoordinates: true,
  basicInfo: true,
  customerInfo: true,
  personnel: true,
  drones: true,
  equipment: true,
  sora: true,
  riskAssessment: true,
  incidents: true,
  flightLogs: true,
  descriptionNotes: true,
};

export type PdfSections = typeof DEFAULT_PDF_SECTIONS;

export const exportToPDF = async (
  mission: Mission,
  sections: PdfSections,
  userId: string | undefined,
  companyId: string | undefined
) => {
  try {
    // Fetch user's full name for opprettet_av
    const { data: pdfUserProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .single();
    const pdfOpprettetAv = pdfUserProfile?.full_name || 'Ukjent';

    const pdf = await createPdfDocument();
    const pageWidth = pdf.internal.pageSize.getWidth();
    
    // Fetch airspace warnings if coordinates exist
    let airspaceWarnings: any[] = [];
    const routeCoords = (mission.route as any)?.coordinates || null;
    const effectiveLat = mission.latitude ?? routeCoords?.[0]?.lat;
    const effectiveLng = mission.longitude ?? routeCoords?.[0]?.lng;
    
    if (effectiveLat && effectiveLng) {
      const { data: airspaceData } = await supabase.rpc("check_mission_airspace", {
        p_lat: effectiveLat,
        p_lng: effectiveLng,
        p_route: routeCoords,
      });
      if (airspaceData) {
        const severityOrder: Record<string, number> = { warning: 0, caution: 1, note: 2 };
        airspaceWarnings = (airspaceData as any[]).sort(
          (a, b) => (severityOrder[a.level] || 3) - (severityOrder[b.level] || 3)
        );
      }
    }
    
    // Header
    pdf.setFontSize(18);
    setFontStyle(pdf, "bold");
    pdf.text("Oppdragsrapport", pageWidth / 2, 20, { align: "center" });
    
    // Mission title
    pdf.setFontSize(14);
    setFontStyle(pdf, "normal");
    pdf.text(sanitizeForPdf(mission.tittel), pageWidth / 2, 32, { align: "center" });
    
    pdf.setFontSize(10);
    pdf.setTextColor(100);
    pdf.text(`Eksportert: ${formatDateForPdf(new Date(), "dd.MM.yyyy 'kl.' HH:mm")}`, pageWidth / 2, 40, { align: "center" });
    pdf.setTextColor(0);
    
    let yPos = 50;
    
    // Add map snapshot
    if (sections.map) {
      try {
        const mapDataUrl = await generateMissionMapSnapshot({
          latitude: effectiveLat,
          longitude: effectiveLng,
          route: mission.route as any,
        });

        if (mapDataUrl) {
          pdf.setFontSize(12);
          setFontStyle(pdf, "bold");
          pdf.setTextColor(0);
          pdf.text("Kartutssnitt", 15, yPos);
          yPos += 7;

          pdf.addImage(mapDataUrl, "PNG", 15, yPos, 180, 90);
          yPos += 95;

          const soraSettings = (mission.route as any)?.soraSettings;
          pdf.setFontSize(8);
          setFontStyle(pdf, "normal");
          pdf.setTextColor(60);

          type RGB = [number, number, number];
          const legendItems: Array<{ color: RGB; dash?: boolean; label: string }> = [
            { color: [29, 78, 216], dash: true, label: "Planlagt flyrute" },
          ];
          if (soraSettings?.enabled) {
            legendItems.push(
              { color: [34, 197, 94], label: "Flight Geography (SORA)" },
              { color: [234, 179, 8], dash: true, label: "Contingency Area (SORA)" },
              { color: [239, 68, 68], dash: true, label: "Ground Risk Buffer (SORA)" }
            );
          }

          let lx = 15;
          for (const item of legendItems) {
            pdf.setDrawColor(item.color[0], item.color[1], item.color[2]);
            if (item.dash) {
              pdf.setLineDashPattern([1, 1], 0);
              pdf.setLineWidth(0.8);
            } else {
              pdf.setLineDashPattern([], 0);
              pdf.setLineWidth(1.5);
            }
            pdf.line(lx, yPos + 2, lx + 8, yPos + 2);
            pdf.setTextColor(60);
            pdf.text(item.label, lx + 10, yPos + 3.5);
            lx += 10 + pdf.getTextWidth(item.label) + 6;
            if (lx > 175) {
              lx = 15;
              yPos += 7;
            }
          }
          pdf.setLineDashPattern([], 0);
          pdf.setTextColor(0);
          yPos += 10;
        }
      } catch (mapError) {
        console.error("Error generating map snapshot for PDF:", mapError);
      }
    }
    
    // Airspace Warnings
    if (sections.airspaceWarnings && airspaceWarnings.length > 0) {
      pdf.setFontSize(12);
      setFontStyle(pdf, "bold");
      pdf.text("Luftromsadvarsler", 15, yPos);
      yPos += 7;
      
      const levelLabels: Record<string, string> = {
        warning: "ADVARSEL",
        WARNING: "ADVARSEL",
        caution: "FORSIKTIGHET",
        CAUTION: "FORSIKTIGHET",
        note: "INFORMASJON",
        NOTE: "INFORMASJON",
      };
      
      const airspaceData = airspaceWarnings.map((w: any) => {
        const level = w.level ?? w.severity ?? "";
        const zoneName = w.zone_name ?? w.z_name ?? "-";
        const isInside = w.is_inside ?? w.route_inside ?? false;
        const distanceM = w.distance_meters ?? w.min_distance ?? NaN;
        const zoneType = w.zone_type ?? w.z_type ?? "";
        const msg = w.message ?? (zoneType ? `Sone type: ${zoneType}` : "-");
        return [
          sanitizeForPdf(levelLabels[level] || level || "-"),
          sanitizeForPdf(zoneName),
          isInside ? "Innenfor sone" : (isNaN(distanceM) ? "-" : `${Math.round(distanceM)}m unna`),
          sanitizeForPdf(msg),
        ];
      });
      
      autoTable(pdf, {
        startY: yPos,
        head: [["Nivå", "Sone", "Avstand", "Melding"]],
        body: airspaceData,
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
          0: { fontStyle: "bold", cellWidth: 25 },
          1: { cellWidth: 35 },
          2: { cellWidth: 25 },
          3: { cellWidth: 95 }
        }
      });
      
      yPos = (pdf as any).lastAutoTable.finalY + 10;
    }
    
    // Route info
    if (sections.routeCoordinates && mission.route && (mission.route as any).coordinates?.length > 0) {
      pdf.setFontSize(12);
      setFontStyle(pdf, "bold");
      pdf.text("Planlagt flyrute", 15, yPos);
      yPos += 7;
      
      const routeData = mission.route as any;
      const routeInfo = [
        ["Antall punkter", String(routeData.coordinates.length)],
        ["Total avstand", `${(routeData.totalDistance || 0).toFixed(2)} km`],
      ];
      
      autoTable(pdf, {
        startY: yPos,
        head: [],
        body: routeInfo,
        theme: "grid",
        styles: { fontSize: 9 },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 40 } }
      });
      
      yPos = (pdf as any).lastAutoTable.finalY + 5;
      
      const coordData = routeData.coordinates.map((coord: any, index: number) => [
        String(index + 1),
        coord.lat.toFixed(6),
        coord.lng.toFixed(6)
      ]);
      
      autoTable(pdf, {
        startY: yPos,
        head: [["Punkt", "Breddegrad", "Lengdegrad"]],
        body: coordData,
        theme: "grid",
        styles: { fontSize: 8 },
        columnStyles: { 
          0: { cellWidth: 20 },
          1: { cellWidth: 50 },
          2: { cellWidth: 50 }
        }
      });
      
      yPos = (pdf as any).lastAutoTable.finalY + 10;
    }
    
    // Basic info
    if (sections.basicInfo) {
      pdf.setFontSize(12);
      setFontStyle(pdf, "bold");
      pdf.text("Grunnleggende informasjon", 15, yPos);
      yPos += 7;
      
      setFontStyle(pdf, "normal");
      pdf.setFontSize(10);
      
      const basicInfo = [
        ["Status", sanitizeForPdf(mission.status)],
        ["Risikonivia", sanitizeForPdf(mission.risk_nivå)],
        ["Lokasjon", sanitizeForPdf(mission.lokasjon)],
        ["Dato/tid", formatDateForPdf(mission.tidspunkt, "dd. MMMM yyyy HH:mm")],
        ...(mission.slutt_tidspunkt ? [["Sluttid", formatDateForPdf(mission.slutt_tidspunkt, "dd. MMMM yyyy HH:mm")]] : []),
        ...(mission.latitude && mission.longitude ? [["Koordinater", `${mission.latitude.toFixed(5)}, ${mission.longitude.toFixed(5)}`]] : [])
      ];
      
      autoTable(pdf, {
        startY: yPos,
        head: [],
        body: basicInfo,
        theme: "grid",
        styles: { fontSize: 9 },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 40 } }
      });
      
      yPos = (pdf as any).lastAutoTable.finalY + 10;
    }

    // Customer info
    if (sections.customerInfo && mission.customers) {
      pdf.setFontSize(12);
      setFontStyle(pdf, "bold");
      pdf.text("Kundeinformasjon", 15, yPos);
      yPos += 7;
      
      setFontStyle(pdf, "normal");
      pdf.setFontSize(10);
      
      const customerInfo = [
        ["Navn", sanitizeForPdf(mission.customers.navn)],
        ...(mission.customers.kontaktperson ? [["Kontaktperson", sanitizeForPdf(mission.customers.kontaktperson)]] : []),
        ...(mission.customers.telefon ? [["Telefon", sanitizeForPdf(mission.customers.telefon)]] : []),
        ...(mission.customers.epost ? [["E-post", sanitizeForPdf(mission.customers.epost)]] : [])
      ];
      
      autoTable(pdf, {
        startY: yPos,
        head: [],
        body: customerInfo,
        theme: "grid",
        styles: { fontSize: 9 },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 40 } }
      });
      
      yPos = (pdf as any).lastAutoTable.finalY + 10;
    }
    
    // Personnel
    if (sections.personnel && mission.personnel?.length > 0) {
      pdf.setFontSize(12);
      setFontStyle(pdf, "bold");
      pdf.text("Personell", 15, yPos);
      yPos += 7;
      
      const personnelData = mission.personnel.map((p: any) => [
        sanitizeForPdf(p.profiles?.full_name) || "Ukjent"
      ]);
      
      autoTable(pdf, {
        startY: yPos,
        head: [["Navn"]],
        body: personnelData,
        theme: "grid",
        styles: { fontSize: 9 }
      });
      
      yPos = (pdf as any).lastAutoTable.finalY + 10;
    }
    
    // Drones
    if (sections.drones && mission.drones?.length > 0) {
      pdf.setFontSize(12);
      setFontStyle(pdf, "bold");
      pdf.text("Droner", 15, yPos);
      yPos += 7;
      
      const dronesData = mission.drones.map((d: any) => [
        d.drones?.modell || "Ukjent",
        d.drones?.serienummer || "-"
      ]);
      
      autoTable(pdf, {
        startY: yPos,
        head: [["Modell", "Serienummer"]],
        body: dronesData,
        theme: "grid",
        styles: { fontSize: 9 }
      });
      
      yPos = (pdf as any).lastAutoTable.finalY + 10;
    }
    
    // Equipment
    if (sections.equipment && mission.equipment?.length > 0) {
      if (yPos > 250) {
        pdf.addPage();
        yPos = 20;
      }
      
      pdf.setFontSize(12);
      setFontStyle(pdf, "bold");
      pdf.text("Utstyr", 15, yPos);
      yPos += 7;
      
      const equipmentData = mission.equipment.map((e: any) => [
        e.equipment?.navn || "Ukjent",
        e.equipment?.type || "-"
      ]);
      
      autoTable(pdf, {
        startY: yPos,
        head: [["Navn", "Type"]],
        body: equipmentData,
        theme: "grid",
        styles: { fontSize: 9 }
      });
      
      yPos = (pdf as any).lastAutoTable.finalY + 10;
    }
    
    // SORA
    if (sections.sora && mission.sora) {
      if (yPos > 250) {
        pdf.addPage();
        yPos = 20;
      }
      
      pdf.setFontSize(12);
      setFontStyle(pdf, "bold");
      pdf.text("SORA-analyse", 15, yPos);
      yPos += 7;
      
      const soraInfo = [
        ["Status", mission.sora.sora_status || "-"],
        ...(mission.sora.sail ? [["SAIL", mission.sora.sail]] : []),
        ...(mission.sora.fgrc ? [["Final GRC", mission.sora.fgrc.toString()]] : []),
        ...(mission.sora.residual_risk_level ? [["Residual Risk", mission.sora.residual_risk_level]] : [])
      ];
      
      autoTable(pdf, {
        startY: yPos,
        head: [],
        body: soraInfo,
        theme: "grid",
        styles: { fontSize: 9 },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 40 } }
      });
      
      yPos = (pdf as any).lastAutoTable.finalY + 10;
    }
    
    // AI Risk Assessment
    if (sections.riskAssessment && mission.aiRisk) {
      try {
        if (yPos > 200) {
          pdf.addPage();
          yPos = 20;
        }
        
        pdf.setFontSize(12);
        setFontStyle(pdf, "bold");
        pdf.text("AI Risikovurdering", 15, yPos);
        yPos += 7;
        
        const recommendationLabels: Record<string, string> = {
          'proceed': 'Anbefalt',
          'proceed_with_caution': 'Forsiktighet anbefalt',
          'not_recommended': 'Ikke anbefalt'
        };
        
        const recommendation = mission.aiRisk.recommendation || '';
        const overallScore = mission.aiRisk.overall_score;
        const weatherScore = mission.aiRisk.weather_score;
        const airspaceScore = mission.aiRisk.airspace_score;
        const pilotScore = mission.aiRisk.pilot_experience_score;
        const equipmentScore = mission.aiRisk.equipment_score;
        const complexityScore = mission.aiRisk.mission_complexity_score;
        
        const riskInfo: string[][] = [
          ["Anbefaling", sanitizeForPdf(recommendationLabels[recommendation.toLowerCase()] || recommendation)]
        ];
        
        if (overallScore != null) riskInfo.push(["Total score", `${Number(overallScore).toFixed(1)}/10`]);
        if (weatherScore != null) riskInfo.push(["Vaer-score", `${Number(weatherScore).toFixed(1)}/10`]);
        if (airspaceScore != null) riskInfo.push(["Luftrom-score", `${Number(airspaceScore).toFixed(1)}/10`]);
        if (pilotScore != null) riskInfo.push(["Pilot-score", `${Number(pilotScore).toFixed(1)}/10`]);
        if (equipmentScore != null) riskInfo.push(["Utstyr-score", `${Number(equipmentScore).toFixed(1)}/10`]);
        if (complexityScore != null) riskInfo.push(["Kompleksitet-score", `${Number(complexityScore).toFixed(1)}/10`]);
        if (mission.aiRisk.created_at) riskInfo.push(["Vurdert", formatDateForPdf(mission.aiRisk.created_at, "dd.MM.yyyy HH:mm")]);
        
        autoTable(pdf, {
          startY: yPos,
          head: [],
          body: riskInfo,
          theme: "grid",
          styles: { fontSize: 9 },
          columnStyles: { 0: { fontStyle: "bold", cellWidth: 45 } }
        });
        
        yPos = (pdf as any).lastAutoTable.finalY + 5;
        
        const aiAnalysis = mission.aiRisk.ai_analysis as any;
        if (aiAnalysis?.summary) {
          pdf.setFontSize(10);
          setFontStyle(pdf, "bold");
          pdf.text("Oppsummering:", 15, yPos);
          yPos += 5;
          
          setFontStyle(pdf, "normal");
          pdf.setFontSize(9);
          const sanitizedSummary = sanitizeForPdf(aiAnalysis.summary);
          const splitSummary = pdf.splitTextToSize(sanitizedSummary, pageWidth - 30);
          pdf.text(splitSummary, 15, yPos);
          yPos += splitSummary.length * 4 + 5;
        }
        
        if (aiAnalysis?.recommendations && Array.isArray(aiAnalysis.recommendations) && aiAnalysis.recommendations.length > 0) {
          if (yPos > 250) {
            pdf.addPage();
            yPos = 20;
          }
          
          pdf.setFontSize(10);
          setFontStyle(pdf, "bold");
          pdf.text("Anbefalinger:", 15, yPos);
          yPos += 5;
          
          setFontStyle(pdf, "normal");
          pdf.setFontSize(9);
          
          aiAnalysis.recommendations.forEach((rec: any, index: number) => {
            if (yPos > 270) {
              pdf.addPage();
              yPos = 20;
            }
            let recText = '';
            if (typeof rec === 'string') {
              recText = rec;
            } else if (rec && typeof rec === 'object') {
              recText = rec.text || rec.title || rec.description || rec.message || rec.content || rec.recommendation || JSON.stringify(rec);
            }
            const sanitizedRec = sanitizeForPdf(recText);
            const bulletText = `${index + 1}. ${sanitizedRec}`;
            const splitRec = pdf.splitTextToSize(bulletText, pageWidth - 35);
            pdf.text(splitRec, 18, yPos);
            yPos += splitRec.length * 4 + 2;
          });
          
          yPos += 5;
        }
        
        yPos += 5;
      } catch (riskError) {
        console.error("Error adding risk assessment to PDF:", riskError);
      }
    }
    
    // Incidents
    if (sections.incidents && mission.incidents?.length > 0) {
      if (yPos > 220) {
        pdf.addPage();
        yPos = 20;
      }
      
      pdf.setFontSize(12);
      setFontStyle(pdf, "bold");
      pdf.text("Tilknyttede hendelser", 15, yPos);
      yPos += 7;
      
      const incidentData = mission.incidents.map((incident: any) => [
        incident.tittel,
        incident.alvorlighetsgrad,
        incident.status,
        incident.hovedaarsak || "-",
        formatDateForPdf(new Date(incident.hendelsestidspunkt), "dd.MM.yyyy HH:mm")
      ]);
      
      autoTable(pdf, {
        startY: yPos,
        head: [["Tittel", "Alvorlighet", "Status", "Hovedårsak", "Tidspunkt"]],
        body: incidentData,
        theme: "grid",
        styles: { fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 50 },
          1: { cellWidth: 25 },
          2: { cellWidth: 30 },
          3: { cellWidth: 35 },
          4: { cellWidth: 35 }
        }
      });
      
      yPos = (pdf as any).lastAutoTable.finalY + 10;
    }
    
    // Flight Logs
    if (sections.flightLogs && mission.flightLogs?.length > 0) {
      if (yPos > 220) {
        pdf.addPage();
        yPos = 20;
      }
      
      pdf.setFontSize(12);
      setFontStyle(pdf, "bold");
      pdf.text("Flyturer", 15, yPos);
      yPos += 7;
      
      const allChecklistIds = mission.flightLogs
        .flatMap((log: any) => log.completed_checklists || [])
        .filter((id: string, index: number, self: string[]) => self.indexOf(id) === index);
      
      let checklistNameMap: Record<string, string> = {};
      if (allChecklistIds.length > 0) {
        const { data: checklistData } = await supabase
          .from('documents')
          .select('id, tittel')
          .in('id', allChecklistIds);
        
        if (checklistData) {
          checklistNameMap = Object.fromEntries(
            checklistData.map(d => [d.id, d.tittel])
          );
        }
      }
      
      const safeskyLabels: Record<string, string> = {
        'none': 'Av',
        'advisory': 'Advisory (rute)',
        'live_uav': 'Live posisjon'
      };
      
      const flightData = mission.flightLogs.map((log: any) => {
        const checklistNames = (log.completed_checklists || [])
          .map((id: string) => checklistNameMap[id])
          .filter(Boolean)
          .join(', ') || '-';
        
        return [
          format(new Date(log.flight_date), "dd.MM.yyyy", { locale: nb }),
          `${log.flight_duration_minutes} min`,
          log.pilot?.full_name || '-',
          log.drones?.modell || '-',
          safeskyLabels[log.safesky_mode] || 'Av',
          checklistNames
        ];
      });
      
      autoTable(pdf, {
        startY: yPos,
        head: [["Dato", "Flytid", "Pilot", "Drone", "SafeSky", "Sjekklister"]],
        body: flightData,
        theme: "grid",
        styles: { fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 32 },
          1: { cellWidth: 18 },
          2: { cellWidth: 30 },
          3: { cellWidth: 30 },
          4: { cellWidth: 28 },
          5: { cellWidth: 42 }
        }
      });
      
      yPos = (pdf as any).lastAutoTable.finalY + 10;
    }
    
    // Description & Notes
    if (sections.descriptionNotes && (mission.beskrivelse || mission.merknader)) {
      if (yPos > 240) {
        pdf.addPage();
        yPos = 20;
      }
      
      if (mission.beskrivelse) {
        pdf.setFontSize(12);
        setFontStyle(pdf, "bold");
        pdf.text("Beskrivelse", 15, yPos);
        yPos += 7;
        
        setFontStyle(pdf, "normal");
        pdf.setFontSize(9);
        const splitDescription = pdf.splitTextToSize(mission.beskrivelse, pageWidth - 30);
        pdf.text(splitDescription, 15, yPos);
        yPos += splitDescription.length * 5 + 10;
      }
      
      if (mission.merknader) {
        if (yPos > 250) {
          pdf.addPage();
          yPos = 20;
        }
        
        pdf.setFontSize(12);
        setFontStyle(pdf, "bold");
        pdf.text("Merknader", 15, yPos);
        yPos += 7;
        
        setFontStyle(pdf, "normal");
        pdf.setFontSize(9);
        const splitNotes = pdf.splitTextToSize(mission.merknader, pageWidth - 30);
        pdf.text(splitNotes, 15, yPos);
      }
    }
    
    // Generate PDF as blob and upload to documents
    const pdfBlob = pdf.output('blob');
    const fileName = `oppdrag-${mission.tittel.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-${Date.now()}.pdf`;
    const filePath = `${companyId}/${fileName}`;
    
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, pdfBlob, {
        contentType: 'application/pdf',
        upsert: false
      });
    
    if (uploadError) throw uploadError;
    
    const { data: { publicUrl } } = supabase.storage
      .from('documents')
      .getPublicUrl(filePath);
    
    const { error: insertError } = await supabase
      .from('documents')
      .insert({
        tittel: `Oppdragsrapport - ${mission.tittel}`,
        beskrivelse: `Eksportert rapport for oppdrag ${mission.tittel}`,
        kategori: 'oppdrag',
        fil_url: publicUrl,
        fil_navn: fileName,
        fil_storrelse: pdfBlob.size,
        company_id: companyId,
        user_id: userId,
        opprettet_av: pdfOpprettetAv,
      });
    
    if (insertError) throw insertError;
    
    toast.success("PDF eksportert og lagret i dokumenter");
  } catch (error) {
    console.error("Error exporting PDF:", error);
    toast.error("Kunne ikke eksportere PDF");
  }
};
