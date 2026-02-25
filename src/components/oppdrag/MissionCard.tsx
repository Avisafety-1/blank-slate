import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import {
  MapPin, Calendar, Users, Plane, Package, FileText, Download,
  Edit, AlertTriangle, Route, Ruler, Navigation, Clock, Radio,
  ClipboardCheck, Trash2, ShieldCheck, Brain, ChevronDown, Info,
  Send, CheckCircle2, Upload
} from "lucide-react";
import { getResourceConflictsForMission, ResourceConflict } from "@/hooks/useResourceConflicts";
import { ResourceConflictWarning } from "@/components/dashboard/ResourceConflictWarning";
import { MissionStatusDropdown } from "@/components/dashboard/MissionStatusDropdown";
import { DroneWeatherPanel } from "@/components/DroneWeatherPanel";
import { MissionMapPreview } from "@/components/dashboard/MissionMapPreview";
import { AirspaceWarnings } from "@/components/dashboard/AirspaceWarnings";
import { ChecklistBadges } from "@/components/oppdrag/ChecklistBadges";
import {
  statusColors,
  incidentSeverityColors,
  incidentStatusColors,
  getAIRiskBadgeColor,
  getAIRiskLabel,
  formatAIRiskScore,
} from "@/lib/oppdragHelpers";

type Mission = any;

export interface MissionCardProps {
  mission: Mission;
  missions: Mission[];
  isAdmin: boolean;
  importingKml: boolean;
  kmlImportMissionId: string | null;
  onEdit: (mission: Mission) => void;
  onDelete: (mission: Mission) => void;
  onNewRiskAssessment: (mission: Mission) => void;
  onSubmitForApproval: (mission: Mission) => void;
  onExportPdf: (mission: Mission) => void;
  onExportKmz: (mission: Mission) => void;
  onImportKml: (missionId: string) => void;
  onOpenSora: (missionId: string) => void;
  onExpandMap: (mission: Mission) => void;
  onIncidentClick: (incident: any) => void;
  onDocumentClick: (doc: any) => void;
  onChecklistPicker: (mission: Mission) => void;
  onExecuteChecklist: (missionId: string) => void;
  onReportIncident: (mission: Mission) => void;
  fetchMissions: () => void;
  onRiskBadgeClick: (mission: Mission) => void;
}

export const MissionCard = ({
  mission,
  missions,
  isAdmin,
  importingKml,
  kmlImportMissionId,
  onEdit,
  onDelete,
  onNewRiskAssessment,
  onSubmitForApproval,
  onExportPdf,
  onExportKmz,
  onImportKml,
  onOpenSora,
  onExpandMap,
  onIncidentClick,
  onDocumentClick,
  onChecklistPicker,
  onExecuteChecklist,
  onReportIncident,
  fetchMissions,
  onRiskBadgeClick,
}: MissionCardProps) => {
  return (
    <GlassCard className="p-4 sm:p-6 space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:justify-between gap-3 sm:gap-4">
        <div className="space-y-2 flex-1 w-full">
          <h3 className="text-lg sm:text-xl font-semibold text-foreground">{mission.tittel}</h3>
          <div className="flex flex-wrap gap-2">
            <MissionStatusDropdown
              missionId={mission.id}
              currentStatus={mission.status}
              onStatusChanged={fetchMissions}
              statusColors={statusColors}
              className="text-xs"
            />
            {mission.approval_status === 'pending_approval' && (
              <Badge variant="outline" className="text-xs bg-yellow-500/20 text-yellow-900 border-yellow-500/30">
                <Clock className="h-3 w-3 mr-1" />
                Venter på godkjenning
              </Badge>
            )}
            {mission.approval_status === 'approved' && (
              <Badge variant="outline" className="text-xs bg-green-500/20 text-green-900 border-green-500/30">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Godkjent
              </Badge>
            )}
            {mission.approval_status === 'not_approved' && (
              <Badge variant="outline" className="text-xs bg-gray-500/20 text-gray-700 border-gray-500/30">
                Ikke godkjent
              </Badge>
            )}
            {mission.aiRisk && (
              <Badge 
                variant="outline" 
                className={`text-xs ${getAIRiskBadgeColor(mission.aiRisk.recommendation)} cursor-pointer hover:opacity-80 transition-opacity`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRiskBadgeClick(mission);
                }}
              >
                <Brain className="h-3 w-3 mr-1" />
                AI: {getAIRiskLabel(mission.aiRisk.recommendation)} ({formatAIRiskScore(mission.aiRisk.overall_score)})
              </Badge>
            )}
            {mission.sora && (
              <Badge variant="outline" className="text-xs">
                <FileText className="h-3 w-3 mr-1" />
                SORA: {mission.sora.sora_status}
              </Badge>
            )}
            {(mission.checklist_ids?.length > 0) && (
              <Badge
                variant="outline"
                className={`text-xs cursor-pointer hover:opacity-80 transition-opacity ${
                  mission.checklist_ids.every((id: string) =>
                    mission.checklist_completed_ids?.includes(id)
                  )
                    ? 'bg-green-500/20 text-green-900 border-green-500/30'
                    : 'bg-gray-500/20 text-gray-700 border-gray-500/30'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onExecuteChecklist(mission.id);
                }}
              >
                <ClipboardCheck className="h-3 w-3 mr-1" />
                {mission.checklist_ids.every((id: string) =>
                  mission.checklist_completed_ids?.includes(id)
                )
                  ? 'Sjekkliste utført'
                  : 'Utfør sjekkliste/r'}
              </Badge>
            )}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="w-full sm:w-auto">
              <span>Flere valg</span>
              <ChevronDown className="h-4 w-4 ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-popover z-50">
            <DropdownMenuItem onClick={() => onEdit(mission)}>
              <Edit className="h-4 w-4 mr-2" />
              Rediger
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onNewRiskAssessment(mission)}>
              <ShieldCheck className="h-4 w-4 mr-2" />
              Ny risikovurdering
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onChecklistPicker(mission)}>
              <ClipboardCheck className="h-4 w-4 mr-2" />
              Tilknytt sjekkliste
            </DropdownMenuItem>
            {mission.approval_status === 'not_approved' && (
              <DropdownMenuItem onClick={() => onSubmitForApproval(mission)}>
                <Send className="h-4 w-4 mr-2" />
                Send til godkjenning
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onExportPdf(mission)}>
              <Download className="h-4 w-4 mr-2" />
              Eksporter PDF
            </DropdownMenuItem>
            {(mission.route as { coordinates?: any[] } | null)?.coordinates?.length > 0 && (
              <DropdownMenuItem onClick={() => onExportKmz(mission)}>
                <Navigation className="h-4 w-4 mr-2" />
                Eksporter KMZ
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onImportKml(mission.id)} disabled={importingKml}>
              <Upload className="h-4 w-4 mr-2" />
              {importingKml && kmlImportMissionId === mission.id ? 'Importerer…' : 'Importer KML/KMZ'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onReportIncident(mission)}>
              <AlertTriangle className="h-4 w-4 mr-2" />
              Rapporter hendelse
            </DropdownMenuItem>
            {isAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => onDelete(mission)}
                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Slett
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Basic Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div className="flex items-start gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
          <div>
            <p className="text-muted-foreground">Lokasjon</p>
            <p className="text-foreground">{mission.lokasjon}</p>
            {mission.latitude && mission.longitude && (
              <p className="text-xs text-muted-foreground">
                {mission.latitude.toFixed(5)}, {mission.longitude.toFixed(5)}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
          <div>
            <p className="text-muted-foreground">Tidspunkt</p>
            <p className="text-foreground">
              {format(new Date(mission.tidspunkt), "dd. MMMM yyyy HH:mm", { locale: nb })}
            </p>
            {mission.slutt_tidspunkt && (
              <p className="text-xs text-muted-foreground">
                til {format(new Date(mission.slutt_tidspunkt), "dd. MMMM HH:mm", { locale: nb })}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Created By */}
      {mission.created_by_name && (
        <div className="text-sm">
          <span className="text-muted-foreground">Opprettet av: </span>
          <span className="text-foreground">{mission.created_by_name}</span>
        </div>
      )}

      {/* Customer Info */}
      {mission.customers && (
        <div className="pt-2 border-t border-border/50">
          <p className="text-xs font-semibold text-muted-foreground mb-2">KUNDE</p>
          <div className="space-y-1">
            <p className="text-sm text-foreground">{mission.customers.navn}</p>
            {mission.customers.kontaktperson && (
              <p className="text-xs text-muted-foreground">
                Kontakt: {mission.customers.kontaktperson}
              </p>
            )}
            {(mission.customers.telefon || mission.customers.epost) && (
              <p className="text-xs text-muted-foreground">
                {[mission.customers.telefon, mission.customers.epost].filter(Boolean).join(" • ")}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Resources Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-border/50">
        {/* Personnel */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground">PERSONELL</p>
          </div>
          {mission.personnel?.length > 0 ? (
            <ul className="space-y-2">
              {mission.personnel.map((p: any) => {
                const allMissionsForConflict = missions.map((m: any) => ({
                  id: m.id, tittel: m.tittel, tidspunkt: m.tidspunkt,
                  slutt_tidspunkt: m.slutt_tidspunkt, status: m.status,
                  personnel: m.personnel || [], drones: m.drones || [], equipment: m.equipment || [],
                }));
                const conflicts = getResourceConflictsForMission(
                  mission.id, mission.tidspunkt, mission.slutt_tidspunkt,
                  p.profile_id, 'personnel', allMissionsForConflict
                );
                return (
                  <li key={p.profile_id} className="space-y-0.5">
                    <span className="text-sm text-foreground flex items-center gap-1">
                      {p.profiles?.full_name || "Ukjent"}
                      {conflicts.length > 0 && (
                        conflicts.some((c: ResourceConflict) => c.conflictType === 'overlap') 
                          ? <AlertTriangle className="h-3 w-3 text-amber-500" />
                          : <Info className="h-3 w-3 text-blue-500" />
                      )}
                    </span>
                    <ResourceConflictWarning conflicts={conflicts} compact />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Ingen tilknyttet</p>
          )}
        </div>

        {/* Drones */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Plane className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground">DRONER</p>
          </div>
          {mission.drones?.length > 0 ? (
            <ul className="space-y-2">
              {mission.drones.map((d: any) => {
                const allMissionsForConflict = missions.map((m: any) => ({
                  id: m.id, tittel: m.tittel, tidspunkt: m.tidspunkt,
                  slutt_tidspunkt: m.slutt_tidspunkt, status: m.status,
                  personnel: m.personnel || [], drones: m.drones || [], equipment: m.equipment || [],
                }));
                const conflicts = getResourceConflictsForMission(
                  mission.id, mission.tidspunkt, mission.slutt_tidspunkt,
                  d.drone_id, 'drone', allMissionsForConflict
                );
                return (
                  <li key={d.drone_id} className="space-y-0.5">
                    <span className="text-sm text-foreground flex items-center gap-1">
                      {d.drones?.modell} (SN: {d.drones?.serienummer})
                      {conflicts.length > 0 && (
                        conflicts.some((c: ResourceConflict) => c.conflictType === 'overlap') 
                          ? <AlertTriangle className="h-3 w-3 text-amber-500" />
                          : <Info className="h-3 w-3 text-blue-500" />
                      )}
                    </span>
                    <ResourceConflictWarning conflicts={conflicts} compact />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Ingen tilknyttet</p>
          )}
        </div>

        {/* Equipment */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground">UTSTYR</p>
          </div>
          {mission.equipment?.length > 0 ? (
            <ul className="space-y-2">
              {mission.equipment.map((e: any) => {
                const allMissionsForConflict = missions.map((m: any) => ({
                  id: m.id, tittel: m.tittel, tidspunkt: m.tidspunkt,
                  slutt_tidspunkt: m.slutt_tidspunkt, status: m.status,
                  personnel: m.personnel || [], drones: m.drones || [], equipment: m.equipment || [],
                }));
                const conflicts = getResourceConflictsForMission(
                  mission.id, mission.tidspunkt, mission.slutt_tidspunkt,
                  e.equipment_id, 'equipment', allMissionsForConflict
                );
                return (
                  <li key={e.equipment_id} className="space-y-0.5">
                    <span className="text-sm text-foreground flex items-center gap-1">
                      {e.equipment?.navn} ({e.equipment?.type})
                      {conflicts.length > 0 && (
                        conflicts.some((c: ResourceConflict) => c.conflictType === 'overlap') 
                          ? <AlertTriangle className="h-3 w-3 text-amber-500" />
                          : <Info className="h-3 w-3 text-blue-500" />
                      )}
                    </span>
                    <ResourceConflictWarning conflicts={conflicts} compact />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Ingen tilknyttet</p>
          )}
        </div>
      </div>

      {/* Documents */}
      {mission.documents?.length > 0 && (
        <div className="pt-2 border-t border-border/50">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground">DOKUMENTER</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {mission.documents.map((d: any) => {
              const doc = d.documents;
              return (
                <button
                  key={d.document_id}
                  onClick={() => onDocumentClick(doc)}
                  className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <FileText className="h-3.5 w-3.5" />
                  {doc?.tittel}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Route Info */}
      {mission.route && (mission.route as any).coordinates?.length > 0 && (
        <div className="pt-2 border-t border-border/50">
          <div className="flex items-center gap-2 mb-2">
            <Route className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground">PLANLAGT RUTE</p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              <span>{(mission.route as any).coordinates.length} punkter</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{((mission.route as any).totalDistance || 0).toFixed(2)} km</span>
            </div>
          </div>
        </div>
      )}

      {/* Description */}
      {mission.beskrivelse && (
        <div className="pt-2 border-t border-border/50">
          <p className="text-xs font-semibold text-muted-foreground mb-2">BESKRIVELSE</p>
          <p className="text-sm text-foreground whitespace-pre-wrap">{mission.beskrivelse}</p>
        </div>
      )}

      {/* Weather and Map Data */}
      {(() => {
        const routeCoords = (mission.route as any)?.coordinates;
        const effectiveLat = mission.latitude ?? routeCoords?.[0]?.lat;
        const effectiveLng = mission.longitude ?? routeCoords?.[0]?.lng;
        const isCompleted = mission.status === "Fullført";
        const hasWeatherSnapshot = mission.weather_data_snapshot;
        
        if (!effectiveLat || !effectiveLng) return null;
        
        return (
          <div className="pt-2 border-t border-border/50 space-y-3 sm:space-y-4">
            <DroneWeatherPanel
              latitude={effectiveLat}
              longitude={effectiveLng}
              savedWeatherData={isCompleted && hasWeatherSnapshot ? hasWeatherSnapshot : undefined}
            />
            <AirspaceWarnings
              latitude={effectiveLat}
              longitude={effectiveLng}
              routePoints={routeCoords}
            />
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">KART</p>
              <div 
                className="h-[150px] sm:h-[200px] relative overflow-hidden rounded-lg cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                onClick={() => onExpandMap(mission)}
              >
                <MissionMapPreview
                  latitude={effectiveLat}
                  longitude={effectiveLng}
                  route={mission.route as any}
                  flightTracks={
                    mission.flightLogs
                      ?.filter((log: any) => log.flight_track?.positions?.length > 0)
                      .map((log: any) => ({
                        positions: log.flight_track.positions,
                        flightLogId: log.id,
                        flightDate: log.flight_date,
                      })) || null
                  }
                />
                <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
                  <span className="bg-background/90 px-2 py-1 rounded text-xs font-medium">Klikk for å forstørre</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* SORA Analysis */}
      {mission.sora && (
        <div className="pt-2 border-t border-border/50">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground">SORA-ANALYSE</p>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => onOpenSora(mission.id)}
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
              >
                <Edit className="h-3 w-3 mr-1" />
                Rediger
              </Button>
              <Badge variant="outline" className={
                mission.sora.sora_status === "Ferdig" 
                  ? "bg-green-500/20 text-green-300 border-green-500/30"
                  : mission.sora.sora_status === "Pågår"
                  ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
                  : "bg-gray-500/20 text-gray-300 border-gray-500/30"
              }>
                {mission.sora.sora_status}
              </Badge>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {mission.sora.sail && (
              <div>
                <p className="text-xs text-muted-foreground">SAIL</p>
                <p className="font-medium text-foreground">{mission.sora.sail}</p>
              </div>
            )}
            {mission.sora.igrc && (
              <div>
                <p className="text-xs text-muted-foreground">Initial GRC</p>
                <p className="font-medium text-foreground">{mission.sora.igrc}</p>
              </div>
            )}
            {mission.sora.fgrc && (
              <div>
                <p className="text-xs text-muted-foreground">Final GRC</p>
                <p className="font-medium text-foreground">{mission.sora.fgrc}</p>
              </div>
            )}
            {mission.sora.residual_risk_level && (
              <div>
                <p className="text-xs text-muted-foreground">Residual Risk</p>
                <p className="font-medium text-foreground">{mission.sora.residual_risk_level}</p>
              </div>
            )}
          </div>
          {mission.sora.residual_risk_comment && (
            <p className="text-xs text-muted-foreground mt-2">
              {mission.sora.residual_risk_comment}
            </p>
          )}
        </div>
      )}

      {/* Incidents Section */}
      {mission.incidents?.length > 0 && (
        <div className="pt-2 border-t border-border/50">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <p className="text-xs font-semibold text-muted-foreground">
              TILKNYTTEDE HENDELSER ({mission.incidents.length})
            </p>
          </div>
          <div className="space-y-2">
            {mission.incidents.map((incident: any) => (
              <div
                key={incident.id}
                onClick={() => onIncidentClick(incident)}
                className="p-2 bg-card/30 rounded hover:bg-card/50 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm">{incident.tittel}</h4>
                    <div className="flex flex-wrap items-center gap-1 text-xs mt-1">
                      <Badge className={incidentSeverityColors[incident.alvorlighetsgrad] || ""}>
                        {incident.alvorlighetsgrad}
                      </Badge>
                      {incident.hovedaarsak && (
                        <Badge variant="outline" className="bg-amber-500/20 text-amber-900 border-amber-500/30">
                          {incident.hovedaarsak}
                        </Badge>
                      )}
                      <span className="text-muted-foreground">
                        {format(new Date(incident.hendelsestidspunkt), "dd. MMM yyyy", { locale: nb })}
                      </span>
                    </div>
                  </div>
                  <Badge className={incidentStatusColors[incident.status] || ""}>
                    {incident.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Flight Logs Section */}
      {mission.flightLogs?.length > 0 && (
        <div className="pt-2 border-t border-border/50">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-primary" />
            <p className="text-xs font-semibold text-muted-foreground">
              FLYTURER ({mission.flightLogs.length})
            </p>
          </div>
          <div className="space-y-2">
            {mission.flightLogs.map((log: any) => (
              <div
                key={log.id}
                className="p-3 bg-card/30 rounded border border-border/30"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{format(new Date(log.flight_date), "dd. MMMM yyyy HH:mm", { locale: nb })}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{log.flight_duration_minutes} min</span>
                  </div>
                  {log.pilot && (
                    <div className="flex items-center gap-2">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{log.pilot.full_name}</span>
                    </div>
                  )}
                  {log.drones && (
                    <div className="flex items-center gap-2">
                      <Plane className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{log.drones.modell}</span>
                    </div>
                  )}
                </div>
                
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {log.safesky_mode && log.safesky_mode !== 'none' && (
                    <Badge variant="outline" className="text-xs bg-blue-500/20 text-blue-900 border-blue-500/30">
                      <Radio className="h-3 w-3 mr-1" />
                      SafeSky: {log.safesky_mode === 'advisory' ? 'Advisory' : 'Live UAV'}
                    </Badge>
                  )}
                  {log.completed_checklists && log.completed_checklists.length > 0 && (
                    <ChecklistBadges checklistIds={log.completed_checklists} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {mission.merknader && (
        <div className="pt-2 border-t border-border/50">
          <p className="text-xs font-semibold text-muted-foreground mb-2">MERKNADER</p>
          <p className="text-sm text-foreground whitespace-pre-wrap">{mission.merknader}</p>
        </div>
      )}

      {/* Approver Comments */}
      {Array.isArray(mission.approver_comments) && mission.approver_comments.length > 0 && (
        <div className="pt-2 border-t border-border/50">
          <p className="text-xs font-semibold text-muted-foreground mb-2">KOMMENTARER</p>
          <div className="space-y-1.5">
            {mission.approver_comments.map((c: any, i: number) => (
              <div key={i} className="text-sm bg-muted/50 rounded-md p-2">
                <span className="font-medium">Kommentar fra godkjenner {c.author_name}:</span>{' '}
                {c.comment}
                <span className="ml-1 text-xs text-muted-foreground">
                  ({new Date(c.created_at).toLocaleDateString('no-NO', { day: '2-digit', month: 'short', year: 'numeric' })})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </GlassCard>
  );
};
