import { supabase } from "@/integrations/supabase/client";
import autoTable from "jspdf-autotable";
import { createPdfDocument, setFontStyle, sanitizeForPdf, formatDateForPdf, getPdfFontName } from "@/lib/pdfUtils";
import { generateMissionMapSnapshot } from "@/lib/mapSnapshotUtils";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { toast } from "sonner";
import {
  OUTDOOR_ASSEMBLIES_LABELS,
  POPULATION_DENSITY_LABELS,
  UA_SIZE_LABELS,
} from "@/lib/adjacentAreaCalculator";

type Mission = any;

const fmtRouteDocNumber = (value: unknown, decimals = 0, unit = "") => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "-";
  return `${n.toLocaleString("nb-NO", { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}${unit}`;
};

const getRouteSoraRows = (route: any): string[][] => {
  const rows: string[][] = [];
  const sora = route?.soraSettings;
  const adjacent = route?.adjacentAreaDocumentation;

  if (sora?.enabled) {
    rows.push(
      ["SORA volum", ""],
      ["Flight Geography", fmtRouteDocNumber(sora.flightGeographyDistance, 0, " m")],
      ["Contingency buffer", fmtRouteDocNumber(sora.contingencyDistance, 0, " m")],
      ["Contingency høyde", fmtRouteDocNumber(sora.contingencyHeight, 0, " m")],
      ["Ground Risk Buffer", fmtRouteDocNumber(sora.groundRiskDistance, 0, " m")],
      ["Flyhøyde", fmtRouteDocNumber(sora.flightAltitude, 0, " m AGL")],
      ["Buffermodus", sora.bufferMode === "convexHull" ? "Konveks" : "Rute-korridor"],
      ["Drone", sora.droneName || (sora.droneId ? "Valgt i ruteplanlegger" : "Ikke valgt")],
      ["CD", fmtRouteDocNumber(sora.characteristicDimensionM, 2, " m")],
      ["V0 / bakkehastighet", fmtRouteDocNumber(sora.groundSpeedMps, 1, " m/s")],
    );
  }

  if (adjacent?.enabled) {
    rows.push(
      ["Tilstøtende områder", ""],
      ["Tilstøtende radius", fmtRouteDocNumber((adjacent.adjacentRadiusM ?? 0) / 1000, 1, " km")],
      ["Areal", fmtRouteDocNumber(adjacent.adjacentAreaKm2, 1, " km2")],
      ["Innbyggere funnet", fmtRouteDocNumber(adjacent.totalPopulation, 0)],
      ["Gj.snitt tetthet", fmtRouteDocNumber(adjacent.avgDensity, 1, " pers/km2")],
      ["Grense/kategori", POPULATION_DENSITY_LABELS[adjacent.populationDensityCategory as keyof typeof POPULATION_DENSITY_LABELS] ?? adjacent.populationDensityCategory ?? "-"],
      ["UA Size", UA_SIZE_LABELS[adjacent.uaSize as keyof typeof UA_SIZE_LABELS] ?? adjacent.uaSize ?? "-"],
      ["SAIL", adjacent.sail ? `SAIL ${adjacent.sail}` : "-"],
      ["Outdoor assemblies", OUTDOOR_ASSEMBLIES_LABELS[adjacent.outdoorAssemblies as keyof typeof OUTDOOR_ASSEMBLIES_LABELS] ?? adjacent.outdoorAssemblies ?? "-"],
      ["Required containment", adjacent.requiredContainment ?? "-"],
      ["Resultat", adjacent.statusText || (adjacent.pass ? "Innenfor beregningsgrunnlaget" : "Krever nærmere vurdering")],
      ["Beregnet", adjacent.calculatedAt ? formatDateForPdf(adjacent.calculatedAt, "dd.MM.yyyy HH:mm") : "-"],
    );
  }

  return rows;
};

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
  flightLogsDetailed: false,
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

    // Fetch company name
    let companyName: string | undefined;
    if (companyId) {
      const { data: companyData } = await supabase
        .from('companies')
        .select('navn')
        .eq('id', companyId)
        .single();
      companyName = companyData?.navn || undefined;
    }

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
    let headerY = 16;
    if (companyName) {
      pdf.setFontSize(10);
      setFontStyle(pdf, "normal");
      pdf.setTextColor(100);
      pdf.text(sanitizeForPdf(companyName), pageWidth / 2, headerY, { align: "center" });
      pdf.setTextColor(0);
      headerY += 8;
    }

    pdf.setFontSize(18);
    setFontStyle(pdf, "bold");
    pdf.text("Oppdragsrapport", pageWidth / 2, headerY, { align: "center" });
    
    // Mission title
    pdf.setFontSize(14);
    setFontStyle(pdf, "normal");
    pdf.text(sanitizeForPdf(mission.tittel), pageWidth / 2, headerY + 12, { align: "center" });
    
    pdf.setFontSize(10);
    pdf.setTextColor(100);
    pdf.text(`Eksportert: ${formatDateForPdf(new Date(), "dd.MM.yyyy 'kl.' HH:mm")}`, pageWidth / 2, headerY + 20, { align: "center" });
    pdf.setTextColor(0);
    
    let yPos = headerY + 28;
    
    // Add map snapshot
    if (sections.map) {
      try {
        // Extract flight tracks from flight logs
        const flightTracks = (mission.flightLogs || [])
          .map((log: any) => log.flight_track)
          .filter((ft: any) => ft?.positions?.length > 0);

        const mapDataUrl = await generateMissionMapSnapshot({
          latitude: effectiveLat,
          longitude: effectiveLng,
          route: mission.route as any,
          flightTracks: flightTracks.length > 0 ? flightTracks : undefined,
        });

        if (mapDataUrl) {
          pdf.setFontSize(12);
          setFontStyle(pdf, "bold");
          pdf.setTextColor(0);
          pdf.text("Kartutsnitt", 15, yPos);
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
          if (flightTracks.length > 0) {
            legendItems.push({ color: [249, 115, 22], label: "Faktisk fløyet rute" });
          }
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
        styles: { fontSize: 8, cellPadding: 2, font: getPdfFontName() },
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
        styles: { fontSize: 9, font: getPdfFontName() },
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
        styles: { fontSize: 8, font: getPdfFontName() },
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
        ["Risikonivå", sanitizeForPdf(mission.risk_nivå)],
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
        styles: { fontSize: 9, font: getPdfFontName() },
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
        styles: { fontSize: 9, font: getPdfFontName() },
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
        styles: { fontSize: 9, font: getPdfFontName() }
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
        styles: { fontSize: 9, font: getPdfFontName() }
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
        styles: { fontSize: 9, font: getPdfFontName() }
      });
      
      yPos = (pdf as any).lastAutoTable.finalY + 10;
    }
    
    // SORA route documentation
    const routeSoraRows = getRouteSoraRows(mission.route as any);
    if (sections.sora && routeSoraRows.length > 0) {
      if (yPos > 230) {
        pdf.addPage();
        yPos = 20;
      }

      pdf.setFontSize(12);
      setFontStyle(pdf, "bold");
      pdf.text("SORA buffer og tilstøtende områder", 15, yPos);
      yPos += 7;

      autoTable(pdf, {
        startY: yPos,
        head: [],
        body: routeSoraRows.map(([label, value]) => [sanitizeForPdf(label), sanitizeForPdf(value)]),
        theme: "grid",
        styles: { fontSize: 9, font: getPdfFontName() },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 55 }, 1: { cellWidth: pageWidth - 85 } }
      });
      yPos = (pdf as any).lastAutoTable.finalY + 10;
    }

    // SORA
    if (sections.sora && mission.sora) {
      if (yPos > 250) {
        pdf.addPage();
        yPos = 20;
      }

      const sora = mission.sora;
      const soraStatusLabels: Record<string, string> = {
        draft: "Utkast",
        completed: "Fullført",
        approved: "Godkjent",
      };

      // Fetch prepared_by / approved_by names
      const soraProfileIds = [sora.prepared_by, sora.approved_by].filter(Boolean);
      let soraNameMap: Record<string, string> = {};
      if (soraProfileIds.length > 0) {
        const { data: soraProfiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', soraProfileIds);
        if (soraProfiles) {
          soraNameMap = Object.fromEntries(soraProfiles.map((p: any) => [p.id, p.full_name]));
        }
      }

      pdf.setFontSize(12);
      setFontStyle(pdf, "bold");
      pdf.text("SORA-analyse", 15, yPos);
      yPos += 7;

      // 1. Oppsummering
      const soraSummary: string[][] = [
        ["Status", sanitizeForPdf(soraStatusLabels[sora.sora_status] || sora.sora_status || "-")],
        ...(sora.sail ? [["SAIL-nivå", sanitizeForPdf(sora.sail)]] : []),
        ...(sora.residual_risk_level ? [["Rest-risikonivå", sanitizeForPdf(sora.residual_risk_level)]] : []),
      ];
      if (sora.prepared_by) {
        const name = soraNameMap[sora.prepared_by] || sora.prepared_by;
        const date = sora.prepared_at ? ` (${formatDateForPdf(sora.prepared_at, "dd.MM.yyyy")})` : "";
        soraSummary.push(["Utarbeidet av", sanitizeForPdf(name + date)]);
      }
      if (sora.approved_by) {
        const name = soraNameMap[sora.approved_by] || sora.approved_by;
        const date = sora.approved_at ? ` (${formatDateForPdf(sora.approved_at, "dd.MM.yyyy")})` : "";
        soraSummary.push(["Godkjent av", sanitizeForPdf(name + date)]);
      }

      autoTable(pdf, {
        startY: yPos,
        head: [],
        body: soraSummary,
        theme: "grid",
        styles: { fontSize: 9, font: getPdfFontName() },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 45 } }
      });
      yPos = (pdf as any).lastAutoTable.finalY + 5;

      // 2. Operasjonsmiljø og ConOps
      if (sora.environment || sora.conops_summary) {
        if (yPos > 250) { pdf.addPage(); yPos = 20; }
        const envInfo: string[][] = [];
        if (sora.environment) envInfo.push(["Miljø", sanitizeForPdf(sora.environment)]);
        if (sora.conops_summary) envInfo.push(["ConOps-beskrivelse", sanitizeForPdf(sora.conops_summary)]);

        autoTable(pdf, {
          startY: yPos,
          head: [],
          body: envInfo,
          theme: "grid",
          styles: { fontSize: 9, font: getPdfFontName() },
          columnStyles: { 0: { fontStyle: "bold", cellWidth: 45 } }
        });
        yPos = (pdf as any).lastAutoTable.finalY + 5;
      }

      // 3. Bakkebasert risiko (GRC)
      if (sora.igrc != null || sora.fgrc != null || sora.ground_mitigations) {
        if (yPos > 250) { pdf.addPage(); yPos = 20; }
        const grcInfo: string[][] = [];
        if (sora.igrc != null) grcInfo.push(["iGRC (grunnrisiko)", String(sora.igrc)]);
        if (sora.fgrc != null) grcInfo.push(["fGRC (endelig)", String(sora.fgrc)]);
        if (sora.ground_mitigations) grcInfo.push(["Bakkemitigeringer", sanitizeForPdf(sora.ground_mitigations)]);

        autoTable(pdf, {
          startY: yPos,
          head: [["Bakkebasert risiko (GRC)", ""]],
          body: grcInfo,
          theme: "grid",
          styles: { fontSize: 9, font: getPdfFontName() },
          columnStyles: { 0: { fontStyle: "bold", cellWidth: 45 } }
        });
        yPos = (pdf as any).lastAutoTable.finalY + 5;
      }

      // 4. Luftromsrisiko (ARC)
      if (sora.arc_initial || sora.arc_residual || sora.airspace_mitigations) {
        if (yPos > 250) { pdf.addPage(); yPos = 20; }
        const arcInfo: string[][] = [];
        if (sora.arc_initial) arcInfo.push(["Initial ARC", sanitizeForPdf(sora.arc_initial)]);
        if (sora.arc_residual) arcInfo.push(["Residual ARC", sanitizeForPdf(sora.arc_residual)]);
        if (sora.airspace_mitigations) arcInfo.push(["Luftromsmitigeringer", sanitizeForPdf(sora.airspace_mitigations)]);

        autoTable(pdf, {
          startY: yPos,
          head: [["Luftromsrisiko (ARC)", ""]],
          body: arcInfo,
          theme: "grid",
          styles: { fontSize: 9, font: getPdfFontName() },
          columnStyles: { 0: { fontStyle: "bold", cellWidth: 45 } }
        });
        yPos = (pdf as any).lastAutoTable.finalY + 5;
      }

      // 5. Rest-risiko og begrensninger
      if (sora.residual_risk_comment || sora.operational_limits) {
        if (yPos > 250) { pdf.addPage(); yPos = 20; }
        const residualInfo: string[][] = [];
        if (sora.residual_risk_comment) residualInfo.push(["Rest-risiko kommentar", sanitizeForPdf(sora.residual_risk_comment)]);
        if (sora.operational_limits) residualInfo.push(["Operative begrensninger", sanitizeForPdf(sora.operational_limits)]);

        autoTable(pdf, {
          startY: yPos,
          head: [],
          body: residualInfo,
          theme: "grid",
          styles: { fontSize: 9, font: getPdfFontName() },
          columnStyles: { 0: { fontStyle: "bold", cellWidth: 45 } }
        });
        yPos = (pdf as any).lastAutoTable.finalY + 5;
      }

      yPos += 5;
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
        if (weatherScore != null) riskInfo.push(["Vær-score", `${Number(weatherScore).toFixed(1)}/10`]);
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
          styles: { fontSize: 9, font: getPdfFontName() },
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
              // Handle RiskRecommendations format: { priority, action, reason, risk_addressed }
              if (rec.action) {
                const priorityLabels: Record<string, string> = { high: 'Høy', medium: 'Medium', low: 'Lav' };
                const pLabel = priorityLabels[rec.priority] || rec.priority || '';
                const reasonText = rec.risk_addressed || rec.reason || '';
                recText = pLabel ? `[${pLabel}] ${rec.action}` : rec.action;
                if (reasonText) recText += ` — ${reasonText}`;
              } else {
                recText = rec.text || rec.title || rec.description || rec.message || rec.content || rec.recommendation || JSON.stringify(rec);
              }
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
        styles: { fontSize: 8, font: getPdfFontName() },
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
        styles: { fontSize: 8, font: getPdfFontName() },
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

    // Detailed flight log report (graphs, warnings, sampled coordinates)
    if (sections.flightLogsDetailed && mission.flightLogs?.length > 0) {
      const parsePtSeconds = (v: any): number | null => {
        if (typeof v === "number") return v;
        if (typeof v !== "string") return null;
        // ISO 8601 duration like "PT8S" / "PT1M5S"
        const m = v.match(/^PT(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/);
        if (m) {
          const min = m[1] ? parseFloat(m[1]) : 0;
          const sec = m[2] ? parseFloat(m[2]) : 0;
          return min * 60 + sec;
        }
        const d = new Date(v).getTime();
        if (Number.isFinite(d)) return d / 1000;
        return null;
      };

      const sample = <T,>(arr: T[], n: number): T[] => {
        if (arr.length <= n) return arr;
        const step = arr.length / n;
        const out: T[] = [];
        for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
        if (out[out.length - 1] !== arr[arr.length - 1]) out.push(arr[arr.length - 1]);
        return out;
      };

      const drawLineGraph = (
        title: string,
        series: { label: string; color: [number, number, number]; points: { x: number; y: number }[] }[],
        x: number,
        y: number,
        w: number,
        h: number,
        yUnit: string
      ) => {
        // Axes background
        pdf.setDrawColor(180);
        pdf.setLineWidth(0.2);
        pdf.rect(x, y, w, h);

        const allPts = series.flatMap(s => s.points);
        if (allPts.length === 0) return;
        const xs = allPts.map(p => p.x);
        const ys = allPts.map(p => p.y);
        const xMin = Math.min(...xs);
        const xMax = Math.max(...xs);
        const yMin = Math.min(...ys);
        const yMax = Math.max(...ys);
        const xRange = xMax - xMin || 1;
        const yRange = yMax - yMin || 1;

        // Title
        pdf.setFontSize(8);
        setFontStyle(pdf, "bold");
        pdf.setTextColor(60);
        pdf.text(sanitizeForPdf(title), x, y - 1);

        // Y axis labels
        setFontStyle(pdf, "normal");
        pdf.setFontSize(6);
        pdf.text(`${yMax.toFixed(0)}${yUnit}`, x - 1, y + 2, { align: "right" });
        pdf.text(`${yMin.toFixed(0)}${yUnit}`, x - 1, y + h, { align: "right" });
        // X axis labels (seconds → mm:ss)
        const fmtT = (sec: number) => {
          const m = Math.floor(sec / 60);
          const s = Math.floor(sec % 60);
          return `${m}:${s.toString().padStart(2, "0")}`;
        };
        pdf.text(fmtT(xMin), x, y + h + 3);
        pdf.text(fmtT(xMax), x + w, y + h + 3, { align: "right" });

        // Plot series
        pdf.setLineWidth(0.3);
        for (const s of series) {
          pdf.setDrawColor(s.color[0], s.color[1], s.color[2]);
          for (let i = 1; i < s.points.length; i++) {
            const p1 = s.points[i - 1];
            const p2 = s.points[i];
            const x1 = x + ((p1.x - xMin) / xRange) * w;
            const y1 = y + h - ((p1.y - yMin) / yRange) * h;
            const x2 = x + ((p2.x - xMin) / xRange) * w;
            const y2 = y + h - ((p2.y - yMin) / yRange) * h;
            pdf.line(x1, y1, x2, y2);
          }
        }

        // Legend
        let lx = x;
        const ly = y + h + 7;
        pdf.setFontSize(7);
        for (const s of series) {
          pdf.setDrawColor(s.color[0], s.color[1], s.color[2]);
          pdf.setLineWidth(1);
          pdf.line(lx, ly, lx + 4, ly);
          pdf.setTextColor(60);
          pdf.text(sanitizeForPdf(s.label), lx + 5, ly + 1);
          lx += pdf.getTextWidth(s.label) + 12;
        }
        pdf.setTextColor(0);
        pdf.setLineWidth(0.2);
      };

      const sourceLabels: Record<string, string> = {
        manual: "Manuell",
        dji: "DJI",
        ardupilot: "ArduPilot",
        dronetag: "DroneTag",
      };

      for (let logIdx = 0; logIdx < mission.flightLogs.length; logIdx++) {
        const log = mission.flightLogs[logIdx];

        if (yPos > 230) {
          pdf.addPage();
          yPos = 20;
        }

        pdf.setFontSize(11);
        setFontStyle(pdf, "bold");
        pdf.text(
          sanitizeForPdf(
            `Flytur ${logIdx + 1}: ${format(new Date(log.flight_date), "dd.MM.yyyy HH:mm", { locale: nb })}`
          ),
          15,
          yPos
        );
        yPos += 6;

        const isManual = !log.source || log.source === "manual";
        if (isManual) {
          pdf.setFontSize(8);
          setFontStyle(pdf, "italic");
          pdf.setTextColor(120);
          pdf.text(
            sanitizeForPdf("Manuelt loggført flytur — telemetri (distanse, høyde, fart, batteri, GPS, koordinater, advarsler) er ikke tilgjengelig. Importer en dronelogg for å få detaljert data."),
            15,
            yPos,
            { maxWidth: 180 }
          );
          pdf.setTextColor(0);
          setFontStyle(pdf, "normal");
          yPos += 8;
        }


        // Summary table
        const summaryRows: string[][] = [
          ["Pilot", log.pilot?.full_name || "-"],
          ["Drone", `${log.drones?.modell || log.drone_model || "-"}${log.aircraft_serial ? ` (SN: ${log.aircraft_serial})` : ""}`],
          ["Kilde", sourceLabels[log.source || ""] || log.source || "-"],
          ["Varighet", `${log.flight_duration_minutes ?? "-"} min`],
          ["Avgang", log.departure_location || "-"],
          ["Landing", log.landing_location || "-"],
          ["Total distanse", log.total_distance_m != null ? `${Number(log.total_distance_m).toFixed(0)} m` : "-"],
          ["Maks avstand", log.max_distance_m != null ? `${Number(log.max_distance_m).toFixed(0)} m` : "-"],
          ["Maks høyde", log.max_height_m != null ? `${Number(log.max_height_m).toFixed(1)} m` : "-"],
          ["Maks horisontal fart", log.max_horiz_speed_ms != null ? `${Number(log.max_horiz_speed_ms).toFixed(1)} m/s` : "-"],
          ["Maks vertikal fart", log.max_vert_speed_ms != null ? `${Number(log.max_vert_speed_ms).toFixed(1)} m/s` : "-"],
          ["RTH utløst", log.rth_triggered ? "Ja" : "Nei"],
        ];
        autoTable(pdf, {
          startY: yPos,
          head: [["Sammendrag", "Verdi"]],
          body: summaryRows,
          theme: "grid",
          styles: { fontSize: 8, font: getPdfFontName() },
          columnStyles: { 0: { cellWidth: 55, fontStyle: "bold" } },
        });
        yPos = (pdf as any).lastAutoTable.finalY + 4;

        // Battery + GPS table
        const hasBattery =
          log.battery_sn ||
          log.battery_cycles != null ||
          log.battery_health_pct != null ||
          log.battery_voltage_min_v != null ||
          log.battery_cell_deviation_max_v != null ||
          log.battery_temp_min_c != null ||
          log.battery_temp_max_c != null ||
          log.battery_full_capacity_mah != null;
        if (hasBattery || log.gps_sat_min != null || log.gps_sat_max != null) {
          if (yPos > 250) { pdf.addPage(); yPos = 20; }
          const techRows: string[][] = [];
          if (hasBattery) {
            techRows.push(
              ["Batteri SN", log.battery_sn || "-"],
              ["Sykluser", log.battery_cycles != null ? String(log.battery_cycles) : "-"],
              ["Helse", log.battery_health_pct != null ? `${Number(log.battery_health_pct).toFixed(0)} %` : "-"],
              ["Full kapasitet", log.battery_full_capacity_mah != null ? `${log.battery_full_capacity_mah} mAh` : "-"],
              ["Min spenning", log.battery_voltage_min_v != null ? `${Number(log.battery_voltage_min_v).toFixed(2)} V` : "-"],
              ["Maks celleavvik", log.battery_cell_deviation_max_v != null ? `${Number(log.battery_cell_deviation_max_v).toFixed(3)} V` : "-"],
              ["Temp min", log.battery_temp_min_c != null ? `${Number(log.battery_temp_min_c).toFixed(1)} °C` : "-"],
              ["Temp maks", log.battery_temp_max_c != null ? `${Number(log.battery_temp_max_c).toFixed(1)} °C` : "-"],
            );
          }
          if (log.gps_sat_min != null || log.gps_sat_max != null) {
            techRows.push(
              ["GPS satellitter min", log.gps_sat_min != null ? String(log.gps_sat_min) : "-"],
              ["GPS satellitter maks", log.gps_sat_max != null ? String(log.gps_sat_max) : "-"],
            );
          }
          autoTable(pdf, {
            startY: yPos,
            head: [["Batteri og GPS", "Verdi"]],
            body: techRows,
            theme: "grid",
            styles: { fontSize: 8, font: getPdfFontName() },
            columnStyles: { 0: { cellWidth: 55, fontStyle: "bold" } },
          });
          yPos = (pdf as any).lastAutoTable.finalY + 4;
        }

        // Graph: height + speed over time
        const positions: any[] = log.flight_track?.positions || [];
        if (positions.length > 1) {
          const withT = positions
            .map(p => ({ ...p, _t: parsePtSeconds(p.timestamp) }))
            .filter(p => p._t != null && (p.alt != null || p.height != null));
          if (withT.length > 1) {
            const sampled = sample(withT, 200);
            const t0 = sampled[0]._t!;
            const heightPts = sampled.map(p => ({
              x: (p._t! - t0),
              y: Number(p.height ?? p.alt) || 0,
            }));
            const hasSpeed = sampled.some(p => p.speed != null);
            const series: { label: string; color: [number, number, number]; points: { x: number; y: number }[] }[] = [
              { label: "Høyde (m)", color: [37, 99, 235], points: heightPts },
            ];
            if (hasSpeed) {
              // Normalize speed onto same vertical scale as height for display only
              const speedPts = sampled.map(p => ({
                x: (p._t! - t0),
                y: Number(p.speed) || 0,
              }));
              // Render as separate graph below
              if (yPos > 200) { pdf.addPage(); yPos = 20; }
              drawLineGraph("Høyde over tid", series, 20, yPos + 4, 170, 35, " m");
              yPos += 50;
              if (yPos > 220) { pdf.addPage(); yPos = 20; }
              drawLineGraph(
                "Hastighet over tid",
                [{ label: "Fart (m/s)", color: [220, 38, 38], points: speedPts }],
                20,
                yPos + 4,
                170,
                35,
                " m/s"
              );
              yPos += 50;
            } else {
              if (yPos > 200) { pdf.addPage(); yPos = 20; }
              drawLineGraph("Høyde over tid", series, 20, yPos + 4, 170, 35, " m");
              yPos += 50;
            }
          }
        }

        // App warnings
        const warnings: any[] = Array.isArray(log.dronelog_warnings) ? log.dronelog_warnings : [];
        if (warnings.length > 0) {
          if (yPos > 240) { pdf.addPage(); yPos = 20; }
          const maxWarn = 50;
          const shown = warnings.slice(0, maxWarn);
          const warnRows = shown.map((w: any) => [
            w.type || w.code || "-",
            w.timestamp ? String(w.timestamp) : (w.time || "-"),
            w.message || w.text || "-",
            w.value != null ? String(w.value) : "-",
          ]);
          autoTable(pdf, {
            startY: yPos,
            head: [["Type", "Tid", "Melding", "Verdi"]],
            body: warnRows,
            theme: "grid",
            styles: { fontSize: 7, font: getPdfFontName() },
            columnStyles: {
              0: { cellWidth: 30 },
              1: { cellWidth: 22 },
              2: { cellWidth: 100 },
              3: { cellWidth: 18 },
            },
          });
          yPos = (pdf as any).lastAutoTable.finalY + 2;
          if (warnings.length > maxWarn) {
            pdf.setFontSize(7);
            pdf.setTextColor(120);
            pdf.text(`+ ${warnings.length - maxWarn} flere advarsler ikke vist`, 15, yPos);
            pdf.setTextColor(0);
            yPos += 4;
          }
          yPos += 2;
        }

        // Sampled coordinates from actual flight track
        if (positions.length > 0) {
          if (yPos > 220) { pdf.addPage(); yPos = 20; }
          const sampled = sample(positions, 50);
          const coordRows = sampled.map((p: any) => {
            const t = parsePtSeconds(p.timestamp);
            return [
              t != null
                ? (() => {
                    const m = Math.floor(t / 60);
                    const s = Math.floor(t % 60);
                    return `${m}:${s.toString().padStart(2, "0")}`;
                  })()
                : (p.timestamp ?? "-"),
              (p.lat != null ? Number(p.lat).toFixed(6) : "-"),
              (p.lng != null ? Number(p.lng).toFixed(6) : "-"),
              (p.alt != null ? `${Number(p.alt).toFixed(1)}` : "-"),
            ];
          });
          autoTable(pdf, {
            startY: yPos,
            head: [[`Koordinater fra fløyet rute (${sampled.length} av ${positions.length} punkter)`, "Lat", "Lng", "Alt (m)"]],
            body: coordRows,
            theme: "grid",
            styles: { fontSize: 7, font: getPdfFontName() },
            columnStyles: {
              0: { cellWidth: 25 },
              1: { cellWidth: 30 },
              2: { cellWidth: 30 },
              3: { cellWidth: 25 },
            },
          });
          yPos = (pdf as any).lastAutoTable.finalY + 8;
        }
      }
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
    
    const { error: insertError } = await supabase
      .from('documents')
      .insert({
        tittel: `Oppdragsrapport - ${mission.tittel}`,
        beskrivelse: `Eksportert rapport for oppdrag ${mission.tittel}`,
        kategori: 'oppdrag',
        fil_url: filePath,
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
