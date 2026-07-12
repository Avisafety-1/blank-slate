import { supabase } from "@/integrations/supabase/client";
import autoTable from "jspdf-autotable";
import { createPdfDocument, setFontStyle, sanitizeForPdf, formatDateForPdf, getPdfFontName } from "@/lib/pdfUtils";
import i18n from "@/i18n";
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
      [i18n.t('pdf.mission.soraBuffer.rows.soraVolume', { ns: 'pdf' }), ""],
      [i18n.t('pdf.mission.soraBuffer.rows.flightGeography', { ns: 'pdf' }), fmtRouteDocNumber(sora.flightGeographyDistance, 0, " m")],
      [i18n.t('pdf.mission.soraBuffer.rows.contingencyBuffer', { ns: 'pdf' }), fmtRouteDocNumber(sora.contingencyDistance, 0, " m")],
      [i18n.t('pdf.mission.soraBuffer.rows.contingencyHeight', { ns: 'pdf' }), fmtRouteDocNumber(sora.contingencyHeight, 0, " m")],
      [i18n.t('pdf.mission.soraBuffer.rows.groundRiskBuffer', { ns: 'pdf' }), fmtRouteDocNumber(sora.groundRiskDistance, 0, " m")],
      [i18n.t('pdf.mission.soraBuffer.rows.flightAltitude', { ns: 'pdf' }), fmtRouteDocNumber(sora.flightAltitude, 0, " m AGL")],
      [i18n.t('pdf.mission.soraBuffer.rows.bufferMode', { ns: 'pdf' }), sora.bufferMode === "convexHull" ? i18n.t('pdf.mission.soraBuffer.rows.convexHull', { ns: 'pdf' }) : i18n.t('pdf.mission.soraBuffer.rows.routeCorridor', { ns: 'pdf' })],
      [i18n.t('pdf.mission.soraBuffer.rows.drone', { ns: 'pdf' }), sora.droneName || (sora.droneId ? i18n.t('pdf.mission.soraBuffer.rows.selectedInRoutePlanner', { ns: 'pdf' }) : i18n.t('pdf.mission.soraBuffer.rows.notSelected', { ns: 'pdf' }))],
      [i18n.t('pdf.mission.soraBuffer.rows.cd', { ns: 'pdf' }), fmtRouteDocNumber(sora.characteristicDimensionM, 2, " m")],
      [i18n.t('pdf.mission.soraBuffer.rows.groundSpeed', { ns: 'pdf' }), fmtRouteDocNumber(sora.groundSpeedMps, 1, " m/s")],
    );
  }

  if (adjacent?.enabled) {
    rows.push(
      [i18n.t('pdf.mission.soraBuffer.rows.adjacentAreas', { ns: 'pdf' }), ""],
      [i18n.t('pdf.mission.soraBuffer.rows.adjacentRadius', { ns: 'pdf' }), fmtRouteDocNumber((adjacent.adjacentRadiusM ?? 0) / 1000, 1, " km")],
      [i18n.t('pdf.mission.soraBuffer.rows.area', { ns: 'pdf' }), fmtRouteDocNumber(adjacent.adjacentAreaKm2, 1, " km2")],
      [i18n.t('pdf.mission.soraBuffer.rows.populationFound', { ns: 'pdf' }), fmtRouteDocNumber(adjacent.totalPopulation, 0)],
      [i18n.t('pdf.mission.soraBuffer.rows.avgDensity', { ns: 'pdf' }), fmtRouteDocNumber(adjacent.avgDensity, 1, " pers/km2")],
      [i18n.t('pdf.mission.soraBuffer.rows.densityCategory', { ns: 'pdf' }), POPULATION_DENSITY_LABELS[adjacent.populationDensityCategory as keyof typeof POPULATION_DENSITY_LABELS] ?? adjacent.populationDensityCategory ?? "-"],
      [i18n.t('pdf.mission.soraBuffer.rows.uaSize', { ns: 'pdf' }), UA_SIZE_LABELS[adjacent.uaSize as keyof typeof UA_SIZE_LABELS] ?? adjacent.uaSize ?? "-"],
      [i18n.t('pdf.mission.soraBuffer.rows.sail', { ns: 'pdf' }), adjacent.sail ? `SAIL ${adjacent.sail}` : "-"],
      [i18n.t('pdf.mission.soraBuffer.rows.outdoorAssemblies', { ns: 'pdf' }), OUTDOOR_ASSEMBLIES_LABELS[adjacent.outdoorAssemblies as keyof typeof OUTDOOR_ASSEMBLIES_LABELS] ?? adjacent.outdoorAssemblies ?? "-"],
      [i18n.t('pdf.mission.soraBuffer.rows.requiredContainment', { ns: 'pdf' }), adjacent.requiredContainment ?? "-"],
      [i18n.t('pdf.mission.soraBuffer.rows.result', { ns: 'pdf' }), adjacent.statusText || (adjacent.pass ? i18n.t('pdf.mission.soraBuffer.rows.withinBasis', { ns: 'pdf' }) : i18n.t('pdf.mission.soraBuffer.rows.requiresFurtherAssessment', { ns: 'pdf' }))],
      [i18n.t('pdf.mission.soraBuffer.rows.calculated', { ns: 'pdf' }), adjacent.calculatedAt ? formatDateForPdf(adjacent.calculatedAt, "dd.MM.yyyy HH:mm") : "-"],
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
    const pdfOpprettetAv = pdfUserProfile?.full_name || i18n.t('pdf.common.unknown', { ns: 'pdf' });

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
    pdf.text(i18n.t('pdf.mission.title', { ns: 'pdf' }), pageWidth / 2, headerY, { align: "center" });
    
    // Mission title
    pdf.setFontSize(14);
    setFontStyle(pdf, "normal");
    pdf.text(sanitizeForPdf(mission.tittel), pageWidth / 2, headerY + 12, { align: "center" });
    
    pdf.setFontSize(10);
    pdf.setTextColor(100);
    pdf.text(i18n.t('pdf.common.exportedAt', { ns: 'pdf', date: formatDateForPdf(new Date(), "dd.MM.yyyy 'kl.' HH:mm") }), pageWidth / 2, headerY + 20, { align: "center" });
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
          pdf.text(i18n.t('pdf.mission.map.title', { ns: 'pdf' }), 15, yPos);
          yPos += 7;

          pdf.addImage(mapDataUrl, "PNG", 15, yPos, 180, 90);
          yPos += 95;

          const soraSettings = (mission.route as any)?.soraSettings;
          pdf.setFontSize(8);
          setFontStyle(pdf, "normal");
          pdf.setTextColor(60);

          type RGB = [number, number, number];
          const legendItems: Array<{ color: RGB; dash?: boolean; label: string }> = [
            { color: [29, 78, 216], dash: true, label: i18n.t('pdf.mission.map.legend.plannedRoute', { ns: 'pdf' }) },
          ];
          if (flightTracks.length > 0) {
            legendItems.push({ color: [249, 115, 22], label: i18n.t('pdf.mission.map.legend.actualRoute', { ns: 'pdf' }) });
          }
          if (soraSettings?.enabled) {
            legendItems.push(
              { color: [34, 197, 94], label: i18n.t('pdf.mission.map.legend.flightGeography', { ns: 'pdf' }) },
              { color: [234, 179, 8], dash: true, label: i18n.t('pdf.mission.map.legend.contingencyArea', { ns: 'pdf' }) },
              { color: [239, 68, 68], dash: true, label: i18n.t('pdf.mission.map.legend.groundRiskBuffer', { ns: 'pdf' }) }
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
      pdf.text(i18n.t('pdf.mission.airspaceWarnings.title', { ns: 'pdf' }), 15, yPos);
      yPos += 7;
      
      const levelLabels: Record<string, string> = {
        warning: i18n.t('pdf.mission.airspaceWarnings.levels.warning', { ns: 'pdf' }),
        WARNING: i18n.t('pdf.mission.airspaceWarnings.levels.warning', { ns: 'pdf' }),
        caution: i18n.t('pdf.mission.airspaceWarnings.levels.caution', { ns: 'pdf' }),
        CAUTION: i18n.t('pdf.mission.airspaceWarnings.levels.caution', { ns: 'pdf' }),
        note: i18n.t('pdf.mission.airspaceWarnings.levels.note', { ns: 'pdf' }),
        NOTE: i18n.t('pdf.mission.airspaceWarnings.levels.note', { ns: 'pdf' }),
      };
      
      const airspaceData = airspaceWarnings.map((w: any) => {
        const level = w.level ?? w.severity ?? "";
        const zoneName = w.zone_name ?? w.z_name ?? "-";
        const isInside = w.is_inside ?? w.route_inside ?? false;
        const distanceM = w.distance_meters ?? w.min_distance ?? NaN;
        const zoneType = w.zone_type ?? w.z_type ?? "";
        const msg = w.message ?? (zoneType ? i18n.t('pdf.mission.airspaceWarnings.zoneTypePrefix', { ns: 'pdf', type: zoneType }) : "-");
        return [
          sanitizeForPdf(levelLabels[level] || level || "-"),
          sanitizeForPdf(zoneName),
          isInside ? i18n.t('pdf.mission.airspaceWarnings.insideZone', { ns: 'pdf' }) : (isNaN(distanceM) ? "-" : i18n.t('pdf.mission.airspaceWarnings.distanceAway', { ns: 'pdf', distance: Math.round(distanceM) })),
          sanitizeForPdf(msg),
        ];
      });
      
      autoTable(pdf, {
        startY: yPos,
        head: [[i18n.t('pdf.mission.airspaceWarnings.headers.level', { ns: 'pdf' }), i18n.t('pdf.mission.airspaceWarnings.headers.zone', { ns: 'pdf' }), i18n.t('pdf.mission.airspaceWarnings.headers.distance', { ns: 'pdf' }), i18n.t('pdf.mission.airspaceWarnings.headers.message', { ns: 'pdf' })]],
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
      pdf.text(i18n.t('pdf.mission.route.title', { ns: 'pdf' }), 15, yPos);
      yPos += 7;
      
      const routeData = mission.route as any;
      const routeInfo = [
        [i18n.t('pdf.mission.route.pointCount', { ns: 'pdf' }), String(routeData.coordinates.length)],
        [i18n.t('pdf.mission.route.totalDistance', { ns: 'pdf' }), `${(routeData.totalDistance || 0).toFixed(2)} km`],
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
        head: [[i18n.t('pdf.mission.route.headers.point', { ns: 'pdf' }), i18n.t('pdf.mission.route.headers.lat', { ns: 'pdf' }), i18n.t('pdf.mission.route.headers.lng', { ns: 'pdf' })]],
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
      pdf.text(i18n.t('pdf.mission.basicInfo.title', { ns: 'pdf' }), 15, yPos);
      yPos += 7;
      
      setFontStyle(pdf, "normal");
      pdf.setFontSize(10);
      
      const basicInfo = [
        [i18n.t('pdf.mission.basicInfo.labels.status', { ns: 'pdf' }), sanitizeForPdf(mission.status)],
        [i18n.t('pdf.mission.basicInfo.labels.riskLevel', { ns: 'pdf' }), sanitizeForPdf(mission.risk_nivå)],
        [i18n.t('pdf.mission.basicInfo.labels.location', { ns: 'pdf' }), sanitizeForPdf(mission.lokasjon)],
        [i18n.t('pdf.mission.basicInfo.labels.dateTime', { ns: 'pdf' }), formatDateForPdf(mission.tidspunkt, "dd. MMMM yyyy HH:mm")],
        ...(mission.slutt_tidspunkt ? [[i18n.t('pdf.mission.basicInfo.labels.endTime', { ns: 'pdf' }), formatDateForPdf(mission.slutt_tidspunkt, "dd. MMMM yyyy HH:mm")]] : []),
        ...(mission.latitude && mission.longitude ? [[i18n.t('pdf.mission.basicInfo.labels.coordinates', { ns: 'pdf' }), `${mission.latitude.toFixed(5)}, ${mission.longitude.toFixed(5)}`]] : [])
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
      pdf.text(i18n.t('pdf.mission.customer.title', { ns: 'pdf' }), 15, yPos);
      yPos += 7;
      
      setFontStyle(pdf, "normal");
      pdf.setFontSize(10);
      
      const customerInfo = [
        [i18n.t('pdf.mission.customer.labels.name', { ns: 'pdf' }), sanitizeForPdf(mission.customers.navn)],
        ...(mission.customers.kontaktperson ? [[i18n.t('pdf.mission.customer.labels.contactPerson', { ns: 'pdf' }), sanitizeForPdf(mission.customers.kontaktperson)]] : []),
        ...(mission.customers.telefon ? [[i18n.t('pdf.mission.customer.labels.phone', { ns: 'pdf' }), sanitizeForPdf(mission.customers.telefon)]] : []),
        ...(mission.customers.epost ? [[i18n.t('pdf.mission.customer.labels.email', { ns: 'pdf' }), sanitizeForPdf(mission.customers.epost)]] : [])
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
      pdf.text(i18n.t('pdf.mission.personnel.title', { ns: 'pdf' }), 15, yPos);
      yPos += 7;
      
      const personnelData = mission.personnel.map((p: any) => [
        sanitizeForPdf(p.profiles?.full_name) || i18n.t('pdf.common.unknown', { ns: 'pdf' })
      ]);
      
      autoTable(pdf, {
        startY: yPos,
        head: [[i18n.t('pdf.mission.personnel.headers.name', { ns: 'pdf' })]],
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
      pdf.text(i18n.t('pdf.mission.drones.title', { ns: 'pdf' }), 15, yPos);
      yPos += 7;
      
      const dronesData = mission.drones.map((d: any) => [
        d.drones?.modell || i18n.t('pdf.common.unknown', { ns: 'pdf' }),
        d.drones?.serienummer || "-"
      ]);
      
      autoTable(pdf, {
        startY: yPos,
        head: [[i18n.t('pdf.mission.drones.headers.model', { ns: 'pdf' }), i18n.t('pdf.mission.drones.headers.serialNumber', { ns: 'pdf' })]],
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
      pdf.text(i18n.t('pdf.mission.equipment.title', { ns: 'pdf' }), 15, yPos);
      yPos += 7;
      
      const equipmentData = mission.equipment.map((e: any) => [
        e.equipment?.navn || i18n.t('pdf.common.unknown', { ns: 'pdf' }),
        e.equipment?.type || "-"
      ]);
      
      autoTable(pdf, {
        startY: yPos,
        head: [[i18n.t('pdf.mission.equipment.headers.name', { ns: 'pdf' }), i18n.t('pdf.mission.equipment.headers.type', { ns: 'pdf' })]],
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
      pdf.text(i18n.t('pdf.mission.soraBuffer.title', { ns: 'pdf' }), 15, yPos);
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
        draft: i18n.t('pdf.mission.sora.status.draft', { ns: 'pdf' }),
        completed: i18n.t('pdf.mission.sora.status.completed', { ns: 'pdf' }),
        approved: i18n.t('pdf.mission.sora.status.approved', { ns: 'pdf' }),
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
      pdf.text(i18n.t('pdf.mission.sora.title', { ns: 'pdf' }), 15, yPos);
      yPos += 7;

      // 1. Oppsummering
      const soraSummary: string[][] = [
        [i18n.t('pdf.mission.sora.labels.status', { ns: 'pdf' }), sanitizeForPdf(soraStatusLabels[sora.sora_status] || sora.sora_status || "-")],
        ...(sora.sail ? [[i18n.t('pdf.mission.sora.labels.sailLevel', { ns: 'pdf' }), sanitizeForPdf(sora.sail)]] : []),
        ...(sora.residual_risk_level ? [[i18n.t('pdf.mission.sora.labels.residualRiskLevel', { ns: 'pdf' }), sanitizeForPdf(sora.residual_risk_level)]] : []),
      ];
      if (sora.prepared_by) {
        const name = soraNameMap[sora.prepared_by] || sora.prepared_by;
        const date = sora.prepared_at ? ` (${formatDateForPdf(sora.prepared_at, "dd.MM.yyyy")})` : "";
        soraSummary.push([i18n.t('pdf.mission.sora.labels.preparedBy', { ns: 'pdf' }), sanitizeForPdf(name + date)]);
      }
      if (sora.approved_by) {
        const name = soraNameMap[sora.approved_by] || sora.approved_by;
        const date = sora.approved_at ? ` (${formatDateForPdf(sora.approved_at, "dd.MM.yyyy")})` : "";
        soraSummary.push([i18n.t('pdf.mission.sora.labels.approvedBy', { ns: 'pdf' }), sanitizeForPdf(name + date)]);
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
        if (sora.environment) envInfo.push([i18n.t('pdf.mission.sora.labels.environment', { ns: 'pdf' }), sanitizeForPdf(sora.environment)]);
        if (sora.conops_summary) envInfo.push([i18n.t('pdf.mission.sora.labels.conopsSummary', { ns: 'pdf' }), sanitizeForPdf(sora.conops_summary)]);

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
        if (sora.igrc != null) grcInfo.push([i18n.t('pdf.mission.sora.labels.igrc', { ns: 'pdf' }), String(sora.igrc)]);
        if (sora.fgrc != null) grcInfo.push([i18n.t('pdf.mission.sora.labels.fgrc', { ns: 'pdf' }), String(sora.fgrc)]);
        if (sora.ground_mitigations) grcInfo.push([i18n.t('pdf.mission.sora.labels.groundMitigations', { ns: 'pdf' }), sanitizeForPdf(sora.ground_mitigations)]);

        autoTable(pdf, {
          startY: yPos,
          head: [[i18n.t('pdf.mission.sora.grcHeader', { ns: 'pdf' }), ""]],
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
        if (sora.arc_initial) arcInfo.push([i18n.t('pdf.mission.sora.labels.initialArc', { ns: 'pdf' }), sanitizeForPdf(sora.arc_initial)]);
        if (sora.arc_residual) arcInfo.push([i18n.t('pdf.mission.sora.labels.residualArc', { ns: 'pdf' }), sanitizeForPdf(sora.arc_residual)]);
        if (sora.airspace_mitigations) arcInfo.push([i18n.t('pdf.mission.sora.labels.airspaceMitigations', { ns: 'pdf' }), sanitizeForPdf(sora.airspace_mitigations)]);

        autoTable(pdf, {
          startY: yPos,
          head: [[i18n.t('pdf.mission.sora.arcHeader', { ns: 'pdf' }), ""]],
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
        if (sora.residual_risk_comment) residualInfo.push([i18n.t('pdf.mission.sora.labels.residualRiskComment', { ns: 'pdf' }), sanitizeForPdf(sora.residual_risk_comment)]);
        if (sora.operational_limits) residualInfo.push([i18n.t('pdf.mission.sora.labels.operationalLimits', { ns: 'pdf' }), sanitizeForPdf(sora.operational_limits)]);

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
        pdf.text(i18n.t('pdf.mission.aiRisk.title', { ns: 'pdf' }), 15, yPos);
        yPos += 7;
        
        const recommendationLabels: Record<string, string> = {
          'proceed': i18n.t('pdf.mission.aiRisk.recommendation.proceed', { ns: 'pdf' }),
          'proceed_with_caution': i18n.t('pdf.mission.aiRisk.recommendation.proceed_with_caution', { ns: 'pdf' }),
          'not_recommended': i18n.t('pdf.mission.aiRisk.recommendation.not_recommended', { ns: 'pdf' })
        };
        
        const recommendation = mission.aiRisk.recommendation || '';
        const overallScore = mission.aiRisk.overall_score;
        const weatherScore = mission.aiRisk.weather_score;
        const airspaceScore = mission.aiRisk.airspace_score;
        const pilotScore = mission.aiRisk.pilot_experience_score;
        const equipmentScore = mission.aiRisk.equipment_score;
        const complexityScore = mission.aiRisk.mission_complexity_score;
        
        const riskInfo: string[][] = [
          [i18n.t('pdf.mission.aiRisk.labels.recommendation', { ns: 'pdf' }), sanitizeForPdf(recommendationLabels[recommendation.toLowerCase()] || recommendation)]
        ];
        
        if (overallScore != null) riskInfo.push([i18n.t('pdf.mission.aiRisk.labels.overallScore', { ns: 'pdf' }), `${Number(overallScore).toFixed(1)}/10`]);
        if (weatherScore != null) riskInfo.push([i18n.t('pdf.mission.aiRisk.labels.weatherScore', { ns: 'pdf' }), `${Number(weatherScore).toFixed(1)}/10`]);
        if (airspaceScore != null) riskInfo.push([i18n.t('pdf.mission.aiRisk.labels.airspaceScore', { ns: 'pdf' }), `${Number(airspaceScore).toFixed(1)}/10`]);
        if (pilotScore != null) riskInfo.push([i18n.t('pdf.mission.aiRisk.labels.pilotScore', { ns: 'pdf' }), `${Number(pilotScore).toFixed(1)}/10`]);
        if (equipmentScore != null) riskInfo.push([i18n.t('pdf.mission.aiRisk.labels.equipmentScore', { ns: 'pdf' }), `${Number(equipmentScore).toFixed(1)}/10`]);
        if (complexityScore != null) riskInfo.push([i18n.t('pdf.mission.aiRisk.labels.complexityScore', { ns: 'pdf' }), `${Number(complexityScore).toFixed(1)}/10`]);
        if (mission.aiRisk.created_at) riskInfo.push([i18n.t('pdf.mission.aiRisk.labels.assessedAt', { ns: 'pdf' }), formatDateForPdf(mission.aiRisk.created_at, "dd.MM.yyyy HH:mm")]);
        
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
          pdf.text(i18n.t('pdf.mission.aiRisk.summaryLabel', { ns: 'pdf' }), 15, yPos);
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
          pdf.text(i18n.t('pdf.mission.aiRisk.recommendationsLabel', { ns: 'pdf' }), 15, yPos);
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
                const priorityLabels: Record<string, string> = { high: i18n.t('pdf.mission.aiRisk.priority.high', { ns: 'pdf' }), medium: i18n.t('pdf.mission.aiRisk.priority.medium', { ns: 'pdf' }), low: i18n.t('pdf.mission.aiRisk.priority.low', { ns: 'pdf' }) };
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
      pdf.text(i18n.t('pdf.mission.incidents.title', { ns: 'pdf' }), 15, yPos);
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
        head: [[i18n.t('pdf.mission.incidents.headers.title', { ns: 'pdf' }), i18n.t('pdf.mission.incidents.headers.severity', { ns: 'pdf' }), i18n.t('pdf.mission.incidents.headers.status', { ns: 'pdf' }), i18n.t('pdf.mission.incidents.headers.rootCause', { ns: 'pdf' }), i18n.t('pdf.mission.incidents.headers.occurredAt', { ns: 'pdf' })]],
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
      pdf.text(i18n.t('pdf.mission.flightLogs.title', { ns: 'pdf' }), 15, yPos);
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
        'none': i18n.t('pdf.mission.flightLogs.safesky.off', { ns: 'pdf' }),
        'advisory': i18n.t('pdf.mission.flightLogs.safesky.advisory', { ns: 'pdf' }),
        'live_uav': i18n.t('pdf.mission.flightLogs.safesky.liveUav', { ns: 'pdf' })
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
          safeskyLabels[log.safesky_mode] || i18n.t('pdf.mission.flightLogs.safesky.off', { ns: 'pdf' }),
          checklistNames
        ];
      });
      
      autoTable(pdf, {
        startY: yPos,
        head: [[i18n.t('pdf.mission.flightLogs.headers.date', { ns: 'pdf' }), i18n.t('pdf.mission.flightLogs.headers.duration', { ns: 'pdf' }), i18n.t('pdf.mission.flightLogs.headers.pilot', { ns: 'pdf' }), i18n.t('pdf.mission.flightLogs.headers.drone', { ns: 'pdf' }), i18n.t('pdf.mission.flightLogs.headers.safesky', { ns: 'pdf' }), i18n.t('pdf.mission.flightLogs.headers.checklists', { ns: 'pdf' })]],
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
        manual: i18n.t('pdf.mission.flightLogsDetailed.source.manual', { ns: 'pdf' }),
        dji: "DJI",
        dronelogapi: "DJI (dronelog)",
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
            i18n.t('pdf.mission.flightLogsDetailed.flightTitle', { ns: 'pdf', index: logIdx + 1, date: format(new Date(log.flight_date), "dd.MM.yyyy HH:mm", { locale: nb }) })
          ),
          15,
          yPos
        );
        yPos += 6;

        const isManual = !log.source || log.source === "manual";
        if (isManual) {
          pdf.setFontSize(8);
          setFontStyle(pdf, "normal");
          pdf.setTextColor(120);
          pdf.text(
            sanitizeForPdf(i18n.t('pdf.mission.flightLogsDetailed.manualDisclaimer', { ns: 'pdf' })),
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
          [i18n.t('pdf.mission.flightLogsDetailed.summaryLabels.pilot', { ns: 'pdf' }), log.pilot?.full_name || "-"],
          [i18n.t('pdf.mission.flightLogsDetailed.summaryLabels.drone', { ns: 'pdf' }), `${log.drones?.modell || log.drone_model || "-"}${log.aircraft_serial ? ` (SN: ${log.aircraft_serial})` : ""}`],
          [i18n.t('pdf.mission.flightLogsDetailed.summaryLabels.source', { ns: 'pdf' }), sourceLabels[log.source || ""] || log.source || "-"],
          [i18n.t('pdf.mission.flightLogsDetailed.summaryLabels.duration', { ns: 'pdf' }), `${log.flight_duration_minutes ?? "-"} min`],
          [i18n.t('pdf.mission.flightLogsDetailed.summaryLabels.departure', { ns: 'pdf' }), log.departure_location || "-"],
          [i18n.t('pdf.mission.flightLogsDetailed.summaryLabels.landing', { ns: 'pdf' }), log.landing_location || "-"],
          [i18n.t('pdf.mission.flightLogsDetailed.summaryLabels.totalDistance', { ns: 'pdf' }), log.total_distance_m != null ? `${Number(log.total_distance_m).toFixed(0)} m` : "-"],
          [i18n.t('pdf.mission.flightLogsDetailed.summaryLabels.maxDistance', { ns: 'pdf' }), log.max_distance_m != null ? `${Number(log.max_distance_m).toFixed(0)} m` : "-"],
          [i18n.t('pdf.mission.flightLogsDetailed.summaryLabels.maxHeight', { ns: 'pdf' }), log.max_height_m != null ? `${Number(log.max_height_m).toFixed(1)} m` : "-"],
          [i18n.t('pdf.mission.flightLogsDetailed.summaryLabels.maxHorizSpeed', { ns: 'pdf' }), log.max_horiz_speed_ms != null ? `${Number(log.max_horiz_speed_ms).toFixed(1)} m/s` : "-"],
          [i18n.t('pdf.mission.flightLogsDetailed.summaryLabels.maxVertSpeed', { ns: 'pdf' }), log.max_vert_speed_ms != null ? `${Number(log.max_vert_speed_ms).toFixed(1)} m/s` : "-"],
          [i18n.t('pdf.mission.flightLogsDetailed.summaryLabels.rthTriggered', { ns: 'pdf' }), log.rth_triggered ? i18n.t('pdf.common.yes', { ns: 'pdf' }) : i18n.t('pdf.common.no', { ns: 'pdf' })],
        ];
        autoTable(pdf, {
          startY: yPos,
          head: [[i18n.t('pdf.mission.flightLogsDetailed.summaryHeaders.summary', { ns: 'pdf' }), i18n.t('pdf.mission.flightLogsDetailed.summaryHeaders.value', { ns: 'pdf' })]],
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
              [i18n.t('pdf.mission.flightLogsDetailed.batteryLabels.batterySn', { ns: 'pdf' }), log.battery_sn || "-"],
              [i18n.t('pdf.mission.flightLogsDetailed.batteryLabels.cycles', { ns: 'pdf' }), log.battery_cycles != null ? String(log.battery_cycles) : "-"],
              [i18n.t('pdf.mission.flightLogsDetailed.batteryLabels.health', { ns: 'pdf' }), log.battery_health_pct != null ? `${Number(log.battery_health_pct).toFixed(0)} %` : "-"],
              [i18n.t('pdf.mission.flightLogsDetailed.batteryLabels.fullCapacity', { ns: 'pdf' }), log.battery_full_capacity_mah != null ? `${log.battery_full_capacity_mah} mAh` : "-"],
              [i18n.t('pdf.mission.flightLogsDetailed.batteryLabels.minVoltage', { ns: 'pdf' }), log.battery_voltage_min_v != null ? `${Number(log.battery_voltage_min_v).toFixed(2)} V` : "-"],
              [i18n.t('pdf.mission.flightLogsDetailed.batteryLabels.maxCellDeviation', { ns: 'pdf' }), log.battery_cell_deviation_max_v != null ? `${Number(log.battery_cell_deviation_max_v).toFixed(3)} V` : "-"],
              [i18n.t('pdf.mission.flightLogsDetailed.batteryLabels.tempMin', { ns: 'pdf' }), log.battery_temp_min_c != null ? `${Number(log.battery_temp_min_c).toFixed(1)} °C` : "-"],
              [i18n.t('pdf.mission.flightLogsDetailed.batteryLabels.tempMax', { ns: 'pdf' }), log.battery_temp_max_c != null ? `${Number(log.battery_temp_max_c).toFixed(1)} °C` : "-"],
            );
          }
          if (log.gps_sat_min != null || log.gps_sat_max != null) {
            techRows.push(
              [i18n.t('pdf.mission.flightLogsDetailed.batteryLabels.gpsSatMin', { ns: 'pdf' }), log.gps_sat_min != null ? String(log.gps_sat_min) : "-"],
              [i18n.t('pdf.mission.flightLogsDetailed.batteryLabels.gpsSatMax', { ns: 'pdf' }), log.gps_sat_max != null ? String(log.gps_sat_max) : "-"],
            );
          }
          autoTable(pdf, {
            startY: yPos,
            head: [[i18n.t('pdf.mission.flightLogsDetailed.batteryGpsHeader', { ns: 'pdf' }), i18n.t('pdf.mission.flightLogsDetailed.summaryHeaders.value', { ns: 'pdf' })]],
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
              { label: i18n.t('pdf.mission.flightLogsDetailed.series.height', { ns: 'pdf' }), color: [37, 99, 235], points: heightPts },
            ];
            if (hasSpeed) {
              // Normalize speed onto same vertical scale as height for display only
              const speedPts = sampled.map(p => ({
                x: (p._t! - t0),
                y: Number(p.speed) || 0,
              }));
              // Render as separate graph below
              if (yPos > 200) { pdf.addPage(); yPos = 20; }
              drawLineGraph(i18n.t('pdf.mission.flightLogsDetailed.graphs.heightOverTime', { ns: 'pdf' }), series, 20, yPos + 4, 170, 35, " m");
              yPos += 50;
              if (yPos > 220) { pdf.addPage(); yPos = 20; }
              drawLineGraph(
                i18n.t('pdf.mission.flightLogsDetailed.graphs.speedOverTime', { ns: 'pdf' }),
                [{ label: i18n.t('pdf.mission.flightLogsDetailed.series.speed', { ns: 'pdf' }), color: [220, 38, 38], points: speedPts }],
                20,
                yPos + 4,
                170,
                35,
                " m/s"
              );
              yPos += 50;
            } else {
              if (yPos > 200) { pdf.addPage(); yPos = 20; }
              drawLineGraph(i18n.t('pdf.mission.flightLogsDetailed.graphs.heightOverTime', { ns: 'pdf' }), series, 20, yPos + 4, 170, 35, " m");
              yPos += 50;
            }
          }

          // Additional graphs: battery %, battery temp, RC sticks, wind
          const tWith: any[] = positions
            .map((p: any) => ({ ...p, _t: parsePtSeconds(p.timestamp) }))
            .filter((p: any) => p._t != null);
          if (tWith.length > 1) {
            const sampled2 = sample(tWith, 200);
            const t0 = sampled2[0]._t;
            const pickNum = (p: any, keys: string[]): number | null => {
              for (const k of keys) {
                const v = p[k];
                if (v != null && !isNaN(Number(v))) return Number(v);
              }
              return null;
            };
            const buildSeries = (label: string, color: [number, number, number], keys: string[]) => {
              const pts = sampled2
                .map((p: any) => ({ x: p._t - t0, y: pickNum(p, keys) }))
                .filter((pt: any) => pt.y != null) as { x: number; y: number }[];
              return pts.length > 1 ? { label, color, points: pts } : null;
            };

            // Battery percentage
            const battSeries: any[] = [];
            const b1 = buildSeries(i18n.t('pdf.mission.flightLogsDetailed.series.battery1', { ns: 'pdf' }), [22, 163, 74], ["battery1"]);
            const b2 = buildSeries(i18n.t('pdf.mission.flightLogsDetailed.series.battery2', { ns: 'pdf' }), [234, 88, 12], ["battery2"]);
            const bMain = buildSeries(i18n.t('pdf.mission.flightLogsDetailed.series.battery', { ns: 'pdf' }), [22, 163, 74], ["battery"]);
            if (b1) battSeries.push(b1);
            if (b2) battSeries.push(b2);
            if (!b1 && !b2 && bMain) battSeries.push(bMain);
            if (battSeries.length) {
              if (yPos > 200) { pdf.addPage(); yPos = 20; }
              drawLineGraph(i18n.t('pdf.mission.flightLogsDetailed.graphs.batteryOverTime', { ns: 'pdf' }), battSeries, 20, yPos + 4, 170, 35, " %");
              yPos += 50;
            }

            // Battery temperature
            const tempSeries: any[] = [];
            const tA = buildSeries(i18n.t('pdf.mission.flightLogsDetailed.series.batteryTemp1', { ns: 'pdf' }), [220, 38, 38], ["temp1"]);
            const tB = buildSeries(i18n.t('pdf.mission.flightLogsDetailed.series.batteryTemp2', { ns: 'pdf' }), [234, 88, 12], ["temp2"]);
            const tMain = buildSeries(i18n.t('pdf.mission.flightLogsDetailed.series.batteryTemp', { ns: 'pdf' }), [220, 38, 38], ["temp"]);
            if (tA) tempSeries.push(tA);
            if (tB) tempSeries.push(tB);
            if (!tA && !tB && tMain) tempSeries.push(tMain);
            if (tempSeries.length) {
              if (yPos > 200) { pdf.addPage(); yPos = 20; }
              drawLineGraph(i18n.t('pdf.mission.flightLogsDetailed.graphs.batteryTempOverTime', { ns: 'pdf' }), tempSeries, 20, yPos + 4, 170, 35, " °C");
              yPos += 50;
            }

            // RC stick inputs
            const rcSeries = [
              buildSeries(i18n.t('pdf.mission.flightLogsDetailed.series.rcThrottle', { ns: 'pdf' }), [37, 99, 235], ["rcThrottle"]),
              buildSeries(i18n.t('pdf.mission.flightLogsDetailed.series.rcElevator', { ns: 'pdf' }), [220, 38, 38], ["rcElevator"]),
              buildSeries(i18n.t('pdf.mission.flightLogsDetailed.series.rcAileron', { ns: 'pdf' }), [22, 163, 74], ["rcAileron"]),
              buildSeries(i18n.t('pdf.mission.flightLogsDetailed.series.rcRudder', { ns: 'pdf' }), [234, 88, 12], ["rcRudder"]),
            ].filter(Boolean) as any[];
            if (rcSeries.length) {
              if (yPos > 200) { pdf.addPage(); yPos = 20; }
              drawLineGraph(i18n.t('pdf.mission.flightLogsDetailed.graphs.rcStickOverTime', { ns: 'pdf' }), rcSeries, 20, yPos + 4, 170, 35, "");
              yPos += 50;
            }

            // Wind speed
            const windSeries: any[] = [];
            const wS = buildSeries(i18n.t('pdf.mission.flightLogsDetailed.series.wind', { ns: 'pdf' }), [2, 132, 199], ["windSpeed"]);
            const wMax = buildSeries(i18n.t('pdf.mission.flightLogsDetailed.series.maxWind', { ns: 'pdf' }), [220, 38, 38], ["maxWindSpeed"]);
            if (wS) windSeries.push(wS);
            if (wMax) windSeries.push(wMax);
            if (windSeries.length) {
              if (yPos > 200) { pdf.addPage(); yPos = 20; }
              drawLineGraph(i18n.t('pdf.mission.flightLogsDetailed.graphs.windSpeedOverTime', { ns: 'pdf' }), windSeries, 20, yPos + 4, 170, 35, " m/s");
              yPos += 50;
            }
          }
        }

        // App warnings
        const warnings: any[] = Array.isArray(log.dronelog_warnings) ? log.dronelog_warnings : [];
        if (!isManual) {
          if (yPos > 250) { pdf.addPage(); yPos = 20; }
          pdf.setFontSize(9);
          setFontStyle(pdf, "bold");
          pdf.text(i18n.t('pdf.mission.flightLogsDetailed.appWarningsTitle', { ns: 'pdf' }), 15, yPos);
          yPos += 5;
          setFontStyle(pdf, "normal");
        }
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
            head: [[i18n.t('pdf.mission.flightLogsDetailed.warningsHeaders.type', { ns: 'pdf' }), i18n.t('pdf.mission.flightLogsDetailed.warningsHeaders.time', { ns: 'pdf' }), i18n.t('pdf.mission.flightLogsDetailed.warningsHeaders.message', { ns: 'pdf' }), i18n.t('pdf.mission.flightLogsDetailed.warningsHeaders.value', { ns: 'pdf' })]],
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
            pdf.text(i18n.t('pdf.mission.flightLogsDetailed.moreWarningsNotShown', { ns: 'pdf', count: warnings.length - maxWarn }), 15, yPos);
            pdf.setTextColor(0);
            yPos += 4;
          }
          yPos += 2;
        } else if (!isManual) {
          pdf.setFontSize(8);
          pdf.setTextColor(100);
          pdf.text(i18n.t('pdf.mission.flightLogsDetailed.noAppWarnings', { ns: 'pdf' }), 15, yPos);
          pdf.setTextColor(0);
          yPos += 6;
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
            head: [[i18n.t('pdf.mission.flightLogsDetailed.sampledCoordinatesTitle', { ns: 'pdf', shown: sampled.length, total: positions.length }), i18n.t('pdf.mission.flightLogsDetailed.coordHeaders.lat', { ns: 'pdf' }), i18n.t('pdf.mission.flightLogsDetailed.coordHeaders.lng', { ns: 'pdf' }), i18n.t('pdf.mission.flightLogsDetailed.coordHeaders.alt', { ns: 'pdf' })]],
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
        pdf.text(i18n.t('pdf.mission.descriptionNotes.descriptionTitle', { ns: 'pdf' }), 15, yPos);
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
        pdf.text(i18n.t('pdf.mission.descriptionNotes.notesTitle', { ns: 'pdf' }), 15, yPos);
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
        tittel: i18n.t('pdf.mission.document.title', { ns: 'pdf', title: mission.tittel }),
        beskrivelse: i18n.t('pdf.mission.document.description', { ns: 'pdf', title: mission.tittel }),
        kategori: 'oppdrag',
        fil_url: filePath,
        fil_navn: fileName,
        fil_storrelse: pdfBlob.size,
        company_id: companyId,
        user_id: userId,
        opprettet_av: pdfOpprettetAv,
      });
    
    if (insertError) throw insertError;
    
    toast.success(i18n.t('pdf.mission.toasts.exportSuccess', { ns: 'pdf' }));
  } catch (error) {
    console.error("Error exporting PDF:", error);
    toast.error(i18n.t('pdf.mission.toasts.exportError', { ns: 'pdf' }));
  }
};
