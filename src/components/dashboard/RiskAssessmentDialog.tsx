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
import { toast } from "sonner";
import { Loader2, ShieldCheck, AlertTriangle, History } from "lucide-react";
import { RiskScoreCard } from "./RiskScoreCard";
import { RiskRecommendations } from "./RiskRecommendations";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

interface RiskAssessmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mission: any;
  droneId?: string;
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
  preflightCheckDone: boolean;
  backupBatteries: boolean;
  emergencyProceduresReviewed: boolean;
}

interface Assessment {
  id: string;
  created_at: string;
  overall_score: number;
  recommendation: string;
  ai_analysis: any;
}

export const RiskAssessmentDialog = ({ open, onOpenChange, mission, droneId }: RiskAssessmentDialogProps) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('input');
  const [currentAssessment, setCurrentAssessment] = useState<any>(null);
  const [previousAssessments, setPreviousAssessments] = useState<Assessment[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [pilotInputs, setPilotInputs] = useState<PilotInputs>({
    flightHeight: 120,
    operationType: 'inspection',
    isVlos: true,
    observerCount: 0,
    atcRequired: false,
    proximityToPeople: 'none',
    criticalInfrastructure: false,
    backupLandingAvailable: true,
    preflightCheckDone: false,
    backupBatteries: true,
    emergencyProceduresReviewed: false,
  });

  useEffect(() => {
    if (open && mission?.id) {
      loadPreviousAssessments();
    }
  }, [open, mission?.id]);

  const loadPreviousAssessments = async () => {
    if (!mission?.id) return;
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('mission_risk_assessments')
        .select('id, created_at, overall_score, recommendation, ai_analysis')
        .eq('mission_id', mission.id)
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
    if (!mission?.id) return;

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
            missionId: mission.id,
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

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
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
                          value={pilotInputs.flightHeight}
                          onChange={(e) => setPilotInputs(prev => ({ 
                            ...prev, 
                            flightHeight: parseInt(e.target.value) || 0 
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
                          value={pilotInputs.observerCount}
                          onChange={(e) => setPilotInputs(prev => ({ 
                            ...prev, 
                            observerCount: parseInt(e.target.value) || 0 
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

                  {/* Preparations */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-muted-foreground">
                      {t('riskAssessment.preparations', 'Forberedelser')}
                    </h3>

                    <div className="flex items-center justify-between">
                      <Label>{t('riskAssessment.preflightCheck', 'Pre-flight sjekk utført')}</Label>
                      <Switch
                        checked={pilotInputs.preflightCheckDone}
                        onCheckedChange={(v) => setPilotInputs(prev => ({ ...prev, preflightCheckDone: v }))}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label>{t('riskAssessment.backupBatteries', 'Backup-batterier tilgjengelig')}</Label>
                      <Switch
                        checked={pilotInputs.backupBatteries}
                        onCheckedChange={(v) => setPilotInputs(prev => ({ ...prev, backupBatteries: v }))}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label>{t('riskAssessment.emergencyProcedures', 'Nødprosedyrer gjennomgått')}</Label>
                      <Switch
                        checked={pilotInputs.emergencyProceduresReviewed}
                        onCheckedChange={(v) => setPilotInputs(prev => ({ ...prev, emergencyProceduresReviewed: v }))}
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
                    {/* Summary */}
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-sm">{currentAssessment.summary}</p>
                    </div>

                    {/* Score Card */}
                    <RiskScoreCard
                      overallScore={currentAssessment.overall_score}
                      recommendation={currentAssessment.recommendation}
                      categories={currentAssessment.categories}
                    />

                    {/* Recommendations */}
                    <RiskRecommendations
                      recommendations={currentAssessment.recommendations || []}
                      goConditions={currentAssessment.go_conditions || []}
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
                          <div>
                            <p className="text-sm font-medium">
                              {format(new Date(assessment.created_at), "dd. MMM yyyy, HH:mm", { locale: nb })}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t('riskAssessment.score', 'Score')}: {assessment.overall_score.toFixed(1)}/10
                            </p>
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
