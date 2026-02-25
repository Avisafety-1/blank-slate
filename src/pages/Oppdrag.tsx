import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRoleCheck } from "@/hooks/useRoleCheck";
import { useChecklists } from "@/hooks/useChecklists";
import { useOppdragData } from "@/hooks/useOppdragData";
import { RouteData } from "@/components/dashboard/AddMissionDialog";
import { GlassCard } from "@/components/GlassCard";
import { Loader2 } from "lucide-react";
import droneBackground from "@/assets/drone-background.png";
import { exportToKMZ } from "@/lib/oppdragKmzExport";
import { exportToPDF, DEFAULT_PDF_SECTIONS, PdfSections } from "@/lib/oppdragPdfExport";
import { OppdragFilterBar } from "@/components/oppdrag/OppdragFilterBar";
import { MissionCard } from "@/components/oppdrag/MissionCard";
import { OppdragDialogs } from "@/components/oppdrag/dialogs/OppdragDialogs";

type Mission = any;

const Oppdrag = () => {
  const { isAdmin } = useRoleCheck();
  const { checklists } = useChecklists();
  const data = useOppdragData();

  // Search/filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [customerFilter, setCustomerFilter] = useState("alle");
  const [pilotFilter, setPilotFilter] = useState("alle");
  const [droneFilter, setDroneFilter] = useState("alle");

  // Dialog state
  const [editingMission, setEditingMission] = useState<Mission | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [soraDialogOpen, setSoraDialogOpen] = useState(false);
  const [soraEditingMissionId, setSoraEditingMissionId] = useState<string | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<any>(null);
  const [incidentDialogOpen, setIncidentDialogOpen] = useState(false);
  const [expandedMapMission, setExpandedMapMission] = useState<Mission | null>(null);
  const [deletingMission, setDeletingMission] = useState<Mission | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false);
  const [riskTypeDialogOpen, setRiskTypeDialogOpen] = useState(false);
  const [riskDialogOpen, setRiskDialogOpen] = useState(false);
  const [riskAssessmentMission, setRiskAssessmentMission] = useState<Mission | null>(null);
  const [riskDialogShowHistory, setRiskDialogShowHistory] = useState(false);
  const [exportPdfMission, setExportPdfMission] = useState<Mission | null>(null);
  const [exportPdfDialogOpen, setExportPdfDialogOpen] = useState(false);
  const [pdfSections, setPdfSections] = useState<PdfSections>(DEFAULT_PDF_SECTIONS);
  const [reportIncidentMission, setReportIncidentMission] = useState<Mission | null>(null);
  const [reportIncidentDialogOpen, setReportIncidentDialogOpen] = useState(false);
  const [checklistMission, setChecklistMission] = useState<Mission | null>(null);
  const [checklistPickerOpen, setChecklistPickerOpen] = useState(false);
  const [executingChecklistMissionId, setExecutingChecklistMissionId] = useState<string | null>(null);

  // Route planner navigation state
  const [initialRouteData, setInitialRouteData] = useState<RouteData | null>(null);
  const [initialFormData, setInitialFormData] = useState<any>(null);
  const [initialSelectedPersonnel, setInitialSelectedPersonnel] = useState<string[]>([]);
  const [initialSelectedEquipment, setInitialSelectedEquipment] = useState<string[]>([]);
  const [initialSelectedDrones, setInitialSelectedDrones] = useState<string[]>([]);
  const [initialSelectedCustomer, setInitialSelectedCustomer] = useState<string>("");

  // Handle navigation state from route planner
  useEffect(() => {
    const state = data.location.state as any;
    if (state?.routeData || state?.formData || state?.openDialog) {
      setInitialRouteData(state.routeData || null);
      setInitialFormData(state.formData || null);
      setInitialSelectedPersonnel(state.selectedPersonnel || []);
      setInitialSelectedEquipment(state.selectedEquipment || []);
      setInitialSelectedDrones(state.selectedDrones || []);
      setInitialSelectedCustomer(state.selectedCustomer || "");
      
      if (state.missionId) {
        const fetchMission = async () => {
          const { data: missionData } = await supabase
            .from('missions')
            .select('*')
            .eq('id', state.missionId)
            .maybeSingle();
          
          if (missionData) {
            setEditingMission(missionData);
            setEditDialogOpen(true);
          }
        };
        fetchMission();
      } else {
        setAddDialogOpen(true);
      }
      
      data.navigate(data.location.pathname, { replace: true, state: null });
    }
  }, [data.location.state]);

  // Computed filter options
  const uniqueCustomers = [...new Set(data.missions.map(m => m.customers?.navn).filter(Boolean))].sort();
  const uniquePilots = [...new Set(data.missions.flatMap(m => (m.personnel || []).map((p: any) => p.profiles?.full_name).filter(Boolean)))].sort();
  const uniqueDrones = [...new Set(data.missions.flatMap(m => (m.drones || []).map((d: any) => d.drones?.modell).filter(Boolean)))].sort();

  const filteredMissions = data.missions.filter((mission) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!(mission.tittel?.toLowerCase().includes(q) || mission.lokasjon?.toLowerCase().includes(q) || mission.beskrivelse?.toLowerCase().includes(q))) return false;
    }
    if (customerFilter !== "alle" && mission.customers?.navn !== customerFilter) return false;
    if (pilotFilter !== "alle") {
      const hasPilot = (mission.personnel || []).some((p: any) => p.profiles?.full_name === pilotFilter);
      if (!hasPilot) return false;
    }
    if (droneFilter !== "alle") {
      const hasDrone = (mission.drones || []).some((d: any) => d.drones?.modell === droneFilter);
      if (!hasDrone) return false;
    }
    return true;
  });

  // Handlers
  const clearInitialData = () => {
    setInitialRouteData(null);
    setInitialFormData(null);
    setInitialSelectedPersonnel([]);
    setInitialSelectedEquipment([]);
    setInitialSelectedDrones([]);
    setInitialSelectedCustomer("");
  };

  const handleEditMission = (mission: Mission) => {
    setEditingMission(mission);
    setEditDialogOpen(true);
  };

  const handleMissionUpdated = () => {
    data.fetchMissions();
    setEditDialogOpen(false);
    setEditingMission(null);
  };

  const handleMissionAdded = () => {
    data.fetchMissions();
    setAddDialogOpen(false);
  };

  const handleEditSora = (missionId: string) => {
    setSoraEditingMissionId(missionId);
    setSoraDialogOpen(true);
  };

  const handleSoraSaved = () => {
    data.fetchMissions();
    setSoraDialogOpen(false);
    setSoraEditingMissionId(null);
  };

  const handleNewRiskAssessment = (mission: Mission) => {
    setRiskAssessmentMission(mission);
    setRiskTypeDialogOpen(true);
  };

  const handleSelectAI = () => {
    setRiskTypeDialogOpen(false);
    setRiskDialogOpen(true);
  };

  const handleSelectSORA = () => {
    setRiskTypeDialogOpen(false);
    if (riskAssessmentMission) {
      setSoraEditingMissionId(riskAssessmentMission.id);
      setSoraDialogOpen(true);
    }
  };

  const handleExportPdfClick = (mission: Mission) => {
    setExportPdfMission(mission);
    setPdfSections(DEFAULT_PDF_SECTIONS);
    setExportPdfDialogOpen(true);
  };

  const handleConfirmExportPdf = async () => {
    if (!exportPdfMission) return;
    setExportPdfDialogOpen(false);
    await exportToPDF(exportPdfMission, pdfSections, data.user?.id, data.companyId);
  };

  const handleDeleteMission = async () => {
    await data.handleDeleteMission(deletingMission);
    setDeletingMission(null);
  };

  const handleToggleMissionChecklist = async (checklistId: string) => {
    const newIds = await data.handleToggleMissionChecklist(checklistMission, checklistId);
    if (newIds !== null) {
      setChecklistMission(prev => prev ? { ...prev, checklist_ids: newIds } : null);
    }
  };

  const handleMissionChecklistComplete = async (checklistId: string) => {
    await data.handleMissionChecklistComplete(checklistId, executingChecklistMissionId);
  };

  if (data.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-foreground">Laster...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative w-full overflow-x-hidden">
      <div
        className="fixed inset-0 z-0"
        style={{
          backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.5)), url(${droneBackground})`,
          backgroundSize: "cover",
          backgroundPosition: "center center",
          backgroundRepeat: "no-repeat"
        }}
      />

      <div className="relative z-10 w-full">
        <main className="w-full px-3 sm:px-4 py-3 sm:py-5">
          <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl sm:text-4xl font-bold text-foreground">Oppdrag</h1>
            </div>

            <OppdragFilterBar
              filterTab={data.filterTab}
              onFilterTabChange={data.setFilterTab}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              customerFilter={customerFilter}
              onCustomerFilterChange={setCustomerFilter}
              pilotFilter={pilotFilter}
              onPilotFilterChange={setPilotFilter}
              droneFilter={droneFilter}
              onDroneFilterChange={setDroneFilter}
              uniqueCustomers={uniqueCustomers}
              uniquePilots={uniquePilots}
              uniqueDrones={uniqueDrones}
              onAddMission={() => setAddDialogOpen(true)}
            />

            {data.isLoading ? (
              <GlassCard className="p-8 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </GlassCard>
            ) : filteredMissions.length === 0 ? (
              <GlassCard className="p-8 text-center">
                <p className="text-muted-foreground">
                  {searchQuery ? "Ingen oppdrag funnet" : "Ingen oppdrag"}
                </p>
              </GlassCard>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {filteredMissions.map((mission) => (
                  <MissionCard
                    key={mission.id}
                    mission={mission}
                    missions={data.missions}
                    isAdmin={isAdmin}
                    importingKml={data.importingKml}
                    kmlImportMissionId={data.kmlImportMissionId}
                    onEdit={handleEditMission}
                    onDelete={setDeletingMission}
                    onNewRiskAssessment={handleNewRiskAssessment}
                    onSubmitForApproval={data.handleSubmitForApproval}
                    onExportPdf={handleExportPdfClick}
                    onExportKmz={(m) => exportToKMZ(m, data.user?.id, data.companyId)}
                    onImportKml={(missionId) => {
                      data.setKmlImportMissionId(missionId);
                      setTimeout(() => data.kmlInputRef.current?.click(), 0);
                    }}
                    onOpenSora={handleEditSora}
                    onExpandMap={setExpandedMapMission}
                    onIncidentClick={(incident) => {
                      setSelectedIncident(incident);
                      setIncidentDialogOpen(true);
                    }}
                    onDocumentClick={(doc) => {
                      setSelectedDocument(doc);
                      setDocumentDialogOpen(true);
                    }}
                    onChecklistPicker={(m) => {
                      setChecklistMission(m);
                      setChecklistPickerOpen(true);
                    }}
                    onExecuteChecklist={setExecutingChecklistMissionId}
                    onReportIncident={(m) => {
                      setReportIncidentMission(m);
                      setReportIncidentDialogOpen(true);
                    }}
                    fetchMissions={data.fetchMissions}
                    onRiskBadgeClick={(m) => {
                      setRiskAssessmentMission(m);
                      setRiskDialogShowHistory(true);
                      setRiskDialogOpen(true);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </main>

        <OppdragDialogs
          addDialogOpen={addDialogOpen}
          setAddDialogOpen={setAddDialogOpen}
          onMissionAdded={handleMissionAdded}
          initialRouteData={initialRouteData}
          initialFormData={initialFormData}
          initialSelectedPersonnel={initialSelectedPersonnel}
          initialSelectedEquipment={initialSelectedEquipment}
          initialSelectedDrones={initialSelectedDrones}
          initialSelectedCustomer={initialSelectedCustomer}
          clearInitialData={clearInitialData}
          editDialogOpen={editDialogOpen}
          setEditDialogOpen={setEditDialogOpen}
          onMissionUpdated={handleMissionUpdated}
          editingMission={editingMission}
          soraDialogOpen={soraDialogOpen}
          setSoraDialogOpen={setSoraDialogOpen}
          soraEditingMissionId={soraEditingMissionId}
          onSoraSaved={handleSoraSaved}
          incidentDialogOpen={incidentDialogOpen}
          setIncidentDialogOpen={setIncidentDialogOpen}
          selectedIncident={selectedIncident}
          expandedMapMission={expandedMapMission}
          setExpandedMapMission={setExpandedMapMission}
          fetchMissions={data.fetchMissions}
          deletingMission={deletingMission}
          setDeletingMission={setDeletingMission}
          onDeleteMission={handleDeleteMission}
          replaceRouteConfirmOpen={data.replaceRouteConfirmOpen}
          setReplaceRouteConfirmOpen={data.setReplaceRouteConfirmOpen}
          pendingKmlFile={data.pendingKmlFile}
          kmlImportMissionId={data.kmlImportMissionId}
          onConfirmKmlReplace={() => {
            if (data.pendingKmlFile && data.kmlImportMissionId) data.doImportKml(data.pendingKmlFile, data.kmlImportMissionId);
            data.setReplaceRouteConfirmOpen(false);
          }}
          onCancelKmlReplace={() => {
            data.setPendingKmlFile(null);
            if (data.kmlInputRef.current) data.kmlInputRef.current.value = '';
          }}
          kmlInputRef={data.kmlInputRef}
          onKmlFileSelected={data.handleKmlFileSelected}
          documentDialogOpen={documentDialogOpen}
          setDocumentDialogOpen={setDocumentDialogOpen}
          selectedDocument={selectedDocument}
          riskTypeDialogOpen={riskTypeDialogOpen}
          setRiskTypeDialogOpen={setRiskTypeDialogOpen}
          onSelectAI={handleSelectAI}
          onSelectSORA={handleSelectSORA}
          riskDialogOpen={riskDialogOpen}
          setRiskDialogOpen={setRiskDialogOpen}
          riskAssessmentMission={riskAssessmentMission}
          setRiskAssessmentMission={setRiskAssessmentMission}
          riskDialogShowHistory={riskDialogShowHistory}
          setRiskDialogShowHistory={setRiskDialogShowHistory}
          exportPdfDialogOpen={exportPdfDialogOpen}
          setExportPdfDialogOpen={setExportPdfDialogOpen}
          exportPdfMission={exportPdfMission}
          pdfSections={pdfSections}
          setPdfSections={setPdfSections}
          onConfirmExportPdf={handleConfirmExportPdf}
          reportIncidentDialogOpen={reportIncidentDialogOpen}
          setReportIncidentDialogOpen={setReportIncidentDialogOpen}
          reportIncidentMission={reportIncidentMission}
          setReportIncidentMission={setReportIncidentMission}
          checklistPickerOpen={checklistPickerOpen}
          setChecklistPickerOpen={setChecklistPickerOpen}
          checklistMission={checklistMission}
          setChecklistMission={setChecklistMission}
          checklists={checklists}
          onToggleMissionChecklist={handleToggleMissionChecklist}
          executingChecklistMissionId={executingChecklistMissionId}
          setExecutingChecklistMissionId={setExecutingChecklistMissionId}
          activeMissions={data.activeMissions}
          completedMissions={data.completedMissions}
          onMissionChecklistComplete={handleMissionChecklistComplete}
        />
      </div>
    </div>
  );
};

export default Oppdrag;
