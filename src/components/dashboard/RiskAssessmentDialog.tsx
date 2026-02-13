import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Loader2, ShieldCheck, AlertTriangle, History, AlertOctagon } from "lucide-react";
import { RiskScoreCard } from "./RiskScoreCard";
import { RiskRecommendations } from "./RiskRecommendations";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

interface RiskAssessmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mission?: any;
  droneId?: string;
  initialTab?: 'input' | 'result' | 'history';
}

interface PilotInputs {
  flightHeight: number;
  operationType: string;
  isVlos: boolean;
  observerCount: number;
  atcRequired: boolean;
  proximityToPeople: string;
  criticalInfrastructure: boolean;
  backupLandingAvailable: boolean;
  skipWeatherEvaluation: boolean;
}

interface Assessment {
  id: string;
  created_at: string;
  overall_score: number;
  recommendation: string;
  ai_analysis: any;
}

export const RiskAssessmentDialog = ({ open, onOpenChange, mission, droneId, initialTab = 'input' }: RiskAssessmentDialogProps) => {
  const { t } = useTranslation();
  const { companyId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [currentAssessment, setCurrentAssessment] = useState<any>(null);
  const [previousAssessments, setPreviousAssessments] = useState<Assessment[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // Mission selector states
  const [missions, setMissions] = useState<any[]>([]);
  const [selectedMissionId, setSelectedMissionId] = useState<string | undefined>(mission?.id);
  const [loadingMissions, setLoadingMissions] = useState(false);

  const [pilotInputs, setPilotInputs] = useState<PilotInputs>({
    flightHeight: 120,
    operationType: 'inspection',
    isVlos: true,
    observerCount: 0,
    atcRequired: false,
    proximityToPeople: 'none',
    criticalInfrastructure: false,
    backupLandingAvailable: true,
    skipWeatherEvaluation: false,
  });

  // Determine current mission ID (from prop or selected)
  const currentMissionId = mission?.id || selectedMissionId;

  useEffect(() => {
    if (open) {
      // Set active tab based on initialTab prop
      setActiveTab(initialTab);
      // If no mission prop, fetch available missions
      if (!mission && companyId) {
        fetchMissions();
      }
      if (currentMissionId) {
        loadPreviousAssessments();
      }
    }
  }, [open, mission?.id, companyId, currentMissionId, initialTab]);

  // Update selectedMissionId when mission prop changes
  useEffect(() => {
    if (mission?.id) {
      setSelectedMissionId(mission.id);
    }
  }, [mission?.id]);

  const fetchMissions = async () => {
    setLoadingMissions(true);
    try {
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      const { data, error } = await supabase
        .from("missions")
        .select("id, tittel, lokasjon, tidspunkt")
        .neq("status", "Fullført")
        .neq("status", "Avlyst")
        .gte("tidspunkt", oneDayAgo.toISOString())
        .order("tidspunkt", { ascending: true });

      if (error) throw error;
      setMissions(data || []);
    } catch (error) {
      console.error("Error fetching missions:", error);
    } finally {
      setLoadingMissions(false);
    }
  };

  const loadPreviousAssessments = async () => {
    if (!currentMissionId) return;
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('mission_risk_assessments')
        .select('id, created_at, overall_score, recommendation, ai_analysis')
        .eq('mission_id', currentMissionId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setPreviousAssessments(data || []);
    } catch (error) {
      console.error('Error loading assessments:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const runAssessment = async () => {
    if (!currentMissionId) {
      toast.error(t('riskAssessment.selectMissionFirst', 'Velg et oppdrag først'));
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error(t('errors.notLoggedIn', 'Du må være logget inn'));
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-risk-assessment`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            missionId: currentMissionId,
            pilotInputs,
            droneId,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        if (response.status === 429) {
          toast.error(t('riskAssessment.rateLimitError', 'For mange forespørsler, prøv igjen senere'));
        } else if (response.status === 402) {
          toast.error(t('riskAssessment.creditsError', 'AI-kreditter oppbrukt'));
        } else {
          throw new Error(error.error || 'Unknown error');
        }
        return;
      }

      const result = await response.json();
      setCurrentAssessment(result.aiAnalysis);
      setActiveTab('result');
      toast.success(t('riskAssessment.completed', 'Risikovurdering fullført'));
      loadPreviousAssessments();
    } catch (error) {
      console.error('Risk assessment error:', error);
      toast.error(t('riskAssessment.error', 'Kunne ikke utføre risikovurdering'));
    } finally {
      setLoading(false);
    }
  };

  const viewPreviousAssessment = (assessment: Assessment) => {
    setCurrentAssessment(assessment.ai_analysis);
    setActiveTab('result');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            {t('riskAssessment.title', 'AI Risikovurdering')}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'input' | 'result' | 'history')} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="input">
              {t('riskAssessment.inputTab', 'Input')}
            </TabsTrigger>
            <TabsTrigger value="result" disabled={!currentAssessment}>
              {t('riskAssessment.resultTab', 'Resultat')}
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="w-4 h-4 mr-1" />
              {t('riskAssessment.historyTab', 'Historikk')}
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 min-h-0 mt-4">
            <TabsContent value="input" className="h-full m-0">
              <ScrollArea className="h-[calc(90vh-220px)]">
                <div className="space-y-6 pr-4">
                  {/* Mission Selector - only show when no mission prop */}
                  {!mission && (
                    <div className="space-y-4">
                      <h3 className="text-sm font-medium text-muted-foreground">
                        {t('riskAssessment.selectMission', 'Velg oppdrag')}
                      </h3>
                      <Select
                        value={selectedMissionId || ""}
                        onValueChange={(v) => {
                          setSelectedMissionId(v);
                          setPreviousAssessments([]);
                          setCurrentAssessment(null);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={
                            loadingMissions 
                              ? t('common.loading', 'Laster...') 
                              : t('riskAssessment.selectMissionPlaceholder', 'Velg et oppdrag')
                          } />
                        </SelectTrigger>
                        <SelectContent>
                          {missions.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.tittel} - {m.lokasjon}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Flight Parameters */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-muted-foreground">
                      {t('riskAssessment.flightParameters', 'Flygeparametere')}
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>{t('riskAssessment.flightHeight', 'Flyhøyde (m AGL)')}</Label>
                        <Input
                          type="number"
                          value={pilotInputs.flightHeight === 0 ? '' : pilotInputs.flightHeight}
                          onChange={(e) => setPilotInputs(prev => ({ 
                            ...prev, 
                            flightHeight: e.target.value === '' ? 0 : parseInt(e.target.value) 
                          }))}
                        />
                      </div>

                      <div>
                        <Label>{t('riskAssessment.operationType', 'Operasjonstype')}</Label>
                        <Select
                          value={pilotInputs.operationType}
                          onValueChange={(v) => setPilotInputs(prev => ({ ...prev, operationType: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="inspection">{t('riskAssessment.types.inspection', 'Inspeksjon')}</SelectItem>
                            <SelectItem value="mapping">{t('riskAssessment.types.mapping', 'Kartlegging')}</SelectItem>
                            <SelectItem value="filming">{t('riskAssessment.types.filming', 'Filming')}</SelectItem>
                            <SelectItem value="photography">{t('riskAssessment.types.photography', 'Fotografering')}</SelectItem>
                            <SelectItem value="delivery">{t('riskAssessment.types.delivery', 'Levering')}</SelectItem>
                            <SelectItem value="other">{t('common.other', 'Annet')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <Label>{t('riskAssessment.isVlos', 'VLOS-operasjon')}</Label>
                      <Switch
                        checked={pilotInputs.isVlos}
                        onCheckedChange={(v) => setPilotInputs(prev => ({ ...prev, isVlos: v }))}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>{t('riskAssessment.observers', 'Antall observatører')}</Label>
                        <Input
                          type="number"
                          min="0"
                          value={pilotInputs.observerCount === 0 ? '' : pilotInputs.observerCount}
                          onChange={(e) => setPilotInputs(prev => ({ 
                            ...prev, 
                            observerCount: e.target.value === '' ? 0 : parseInt(e.target.value) 
                          }))}
                        />
                      </div>

                      <div>
                        <Label>{t('riskAssessment.proximityLabel', 'Nærhet til mennesker')}</Label>
                        <Select
                          value={pilotInputs.proximityToPeople}
                          onValueChange={(v) => setPilotInputs(prev => ({ ...prev, proximityToPeople: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{t('riskAssessment.proximity.none', 'Ingen')}</SelectItem>
                            <SelectItem value="few">{t('riskAssessment.proximity.few', 'Få')}</SelectItem>
                            <SelectItem value="many">{t('riskAssessment.proximity.many', 'Mange')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <Label>{t('riskAssessment.atcRequired', 'ATC-kontakt nødvendig')}</Label>
                      <Switch
                        checked={pilotInputs.atcRequired}
                        onCheckedChange={(v) => setPilotInputs(prev => ({ ...prev, atcRequired: v }))}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label>{t('riskAssessment.criticalInfrastructure', 'Kritisk infrastruktur i nærheten')}</Label>
                      <Switch
                        checked={pilotInputs.criticalInfrastructure}
                        onCheckedChange={(v) => setPilotInputs(prev => ({ ...prev, criticalInfrastructure: v }))}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label>{t('riskAssessment.backupLanding', 'Backup-landingsplass tilgjengelig')}</Label>
                      <Switch
                        checked={pilotInputs.backupLandingAvailable}
                        onCheckedChange={(v) => setPilotInputs(prev => ({ ...prev, backupLandingAvailable: v }))}
                      />
                    </div>
                  </div>

                  {/* Weather Options */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-muted-foreground">
                      {t('riskAssessment.weatherOptions', 'Væralternativer')}
                    </h3>

                    <div className="flex items-center justify-between">
                      <Label>{t('riskAssessment.skipWeather', 'Ikke vurder vær')}</Label>
                      <Switch
                        checked={pilotInputs.skipWeatherEvaluation}
                        onCheckedChange={(v) => setPilotInputs(prev => ({ ...prev, skipWeatherEvaluation: v }))}
                      />
                    </div>
                  </div>

                  <Button 
                    onClick={runAssessment} 
                    disabled={loading}
                    className="w-full"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {t('riskAssessment.analyzing', 'Analyserer...')}
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4 mr-2" />
                        {t('riskAssessment.runAssessment', 'Kjør risikovurdering')}
                      </>
                    )}
                  </Button>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="result" className="h-full m-0">
              <ScrollArea className="h-[calc(90vh-220px)]">
                {currentAssessment && (
                  <div className="space-y-6 pr-4">
                    {/* AI Disclaimer */}
                    <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-foreground mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-foreground">
                          AI risikovurdering kan brukes som beslutningsstøtte. Det er alltid «pilot-in-command» som selv må vurdere risikoen knyttet til oppdraget.
                        </p>
                      </div>
                    </div>

                    {/* Summary */}
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-sm">{currentAssessment.summary}</p>
                    </div>

                    {/* Score Card with new SMS fields */}
                    <RiskScoreCard
                      overallScore={currentAssessment.overall_score}
                      recommendation={currentAssessment.recommendation}
                      categories={currentAssessment.categories}
                      hardStopTriggered={currentAssessment.hard_stop_triggered}
                      hardStopReason={currentAssessment.hard_stop_reason}
                      missionOverview={currentAssessment.mission_overview}
                      assessmentMethod={currentAssessment.assessment_method}
                    />

                    {/* Recommendations with new SMS fields */}
                    <RiskRecommendations
                      recommendations={currentAssessment.recommendations || []}
                      goConditions={currentAssessment.go_conditions || []}
                      prerequisites={currentAssessment.prerequisites || []}
                      aiDisclaimer={currentAssessment.ai_disclaimer}
                    />
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="history" className="h-full m-0">
              <ScrollArea className="h-[calc(90vh-220px)]">
                <div className="space-y-3 pr-4">
                  {loadingHistory ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : previousAssessments.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      {t('riskAssessment.noHistory', 'Ingen tidligere vurderinger')}
                    </p>
                  ) : (
                    previousAssessments.map((assessment) => (
                      <button
                        key={assessment.id}
                        onClick={() => viewPreviousAssessment(assessment)}
                        className="w-full p-4 rounded-lg border bg-card hover:bg-accent transition-colors text-left"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {assessment.ai_analysis?.hard_stop_triggered && (
                              <AlertOctagon className="w-4 h-4 text-red-500" />
                            )}
                            <div>
                              <p className="text-sm font-medium">
                                {format(new Date(assessment.created_at), "dd. MMM yyyy, HH:mm", { locale: nb })}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {t('riskAssessment.score', 'Score')}: {assessment.overall_score.toFixed(1)}/10
                              </p>
                            </div>
                          </div>
                          <div className={`px-2 py-1 rounded text-xs font-medium ${
                            assessment.recommendation === 'go' 
                              ? 'bg-green-500/20 text-green-700 dark:text-green-300'
                              : assessment.recommendation === 'caution'
                              ? 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300'
                              : 'bg-red-500/20 text-red-700 dark:text-red-300'
                          }`}>
                            {assessment.recommendation.toUpperCase()}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
