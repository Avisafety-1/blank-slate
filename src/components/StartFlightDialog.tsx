import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRoleCheck } from '@/hooks/useRoleCheck';
import { Radio, MapPin, AlertCircle, Navigation, ClipboardCheck, Check, AlertTriangle, Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useChecklists } from '@/hooks/useChecklists';
import { ChecklistExecutionDialog } from '@/components/resources/ChecklistExecutionDialog';
import { toast } from 'sonner';

type PublishMode = 'none' | 'advisory' | 'live_uav';

interface Mission {
  id: string;
  tittel: string;
  lokasjon: string;
  route: unknown;
}

interface StartFlightDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartFlight: (missionId?: string, publishMode?: PublishMode) => void;
}

export function StartFlightDialog({ open, onOpenChange, onStartFlight }: StartFlightDialogProps) {
  const { companyId } = useAuth();
  const { isAdmin } = useRoleCheck();
  const { t } = useTranslation();
  const { checklists } = useChecklists();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [selectedMissionId, setSelectedMissionId] = useState<string>('');
  const [publishMode, setPublishMode] = useState<PublishMode>('none');
  const [loading, setLoading] = useState(false);
  
  // Company-level linked checklists (persisted)
  const [companyChecklistIds, setCompanyChecklistIds] = useState<string[]>([]);
  // Session-level completion tracking
  const [completedChecklistIds, setCompletedChecklistIds] = useState<string[]>([]);
  const [activeChecklistId, setActiveChecklistId] = useState<string | null>(null);
  const [showChecklistWarning, setShowChecklistWarning] = useState(false);
  const [checklistPopoverOpen, setChecklistPopoverOpen] = useState(false);

  // Fetch company-level checklist settings
  useEffect(() => {
    const fetchCompanyChecklists = async () => {
      if (!companyId || !open) return;

      const { data } = await supabase
        .from('companies')
        .select('before_takeoff_checklist_ids')
        .eq('id', companyId)
        .maybeSingle();

      if (data?.before_takeoff_checklist_ids) {
        setCompanyChecklistIds(data.before_takeoff_checklist_ids);
      } else {
        setCompanyChecklistIds([]);
      }
    };

    fetchCompanyChecklists();
  }, [companyId, open]);

  // Fetch missions
  useEffect(() => {
    const fetchMissions = async () => {
      if (!companyId || !open) return;

      const { data } = await supabase
        .from('missions')
        .select('id, tittel, lokasjon, route')
        .eq('company_id', companyId)
        .in('status', ['Planlagt', 'Pågående'])
        .order('tidspunkt', { ascending: true });

      if (data) {
        setMissions(data);
      }
    };

    fetchMissions();
  }, [companyId, open]);

  // Reset session state when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedMissionId('');
      setPublishMode('none');
      setCompletedChecklistIds([]);
      setActiveChecklistId(null);
    }
  }, [open]);

  const selectedMission = selectedMissionId && selectedMissionId !== 'none' 
    ? missions.find(m => m.id === selectedMissionId) 
    : null;
  const hasRoute = selectedMission?.route && 
    typeof selectedMission.route === 'object' && 
    selectedMission.route !== null &&
    'coordinates' in selectedMission.route &&
    Array.isArray((selectedMission.route as { coordinates: unknown[] }).coordinates) &&
    (selectedMission.route as { coordinates: unknown[] }).coordinates.length > 0;

  // Reset publishMode to 'none' if advisory was selected but no route available
  useEffect(() => {
    if (publishMode === 'advisory' && !hasRoute) {
      setPublishMode('none');
    }
  }, [hasRoute, publishMode]);

  // Admin functions to link/unlink checklists (persisted to company)
  const linkChecklist = async (checklistId: string) => {
    if (!companyId || !isAdmin) return;
    
    const newIds = [...companyChecklistIds, checklistId];
    const { error } = await supabase
      .from('companies')
      .update({ before_takeoff_checklist_ids: newIds })
      .eq('id', companyId);

    if (error) {
      toast.error(t('errors.saveFailed'));
      return;
    }
    
    setCompanyChecklistIds(newIds);
    setChecklistPopoverOpen(false);
  };

  const unlinkChecklist = async (checklistId: string) => {
    if (!companyId || !isAdmin) return;
    
    const newIds = companyChecklistIds.filter(id => id !== checklistId);
    const { error } = await supabase
      .from('companies')
      .update({ before_takeoff_checklist_ids: newIds })
      .eq('id', companyId);

    if (error) {
      toast.error(t('errors.saveFailed'));
      return;
    }
    
    setCompanyChecklistIds(newIds);
    setCompletedChecklistIds(prev => prev.filter(id => id !== checklistId));
  };

  const availableChecklists = checklists.filter(c => !companyChecklistIds.includes(c.id));
  const hasIncompleteChecklists = companyChecklistIds.some(id => !completedChecklistIds.includes(id));

  const handleStartFlightClick = () => {
    if (hasIncompleteChecklists) {
      setShowChecklistWarning(true);
      return;
    }
    handleStartFlight();
  };

  const handleStartFlight = async () => {
    setLoading(true);
    setShowChecklistWarning(false);
    try {
      const missionId = selectedMissionId && selectedMissionId !== 'none' ? selectedMissionId : undefined;
      await onStartFlight(missionId, publishMode);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const handleChecklistComplete = () => {
    if (activeChecklistId) {
      setCompletedChecklistIds(prev => [...prev, activeChecklistId]);
    }
    setActiveChecklistId(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>{t('flight.startFlightTitle')}</DialogTitle>
            <DialogDescription>
              {t('flight.startFlightDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto -mx-6 px-6" style={{ maxHeight: 'calc(90vh - 180px)' }}>
            <div className="space-y-6 py-4 pb-6">
            {/* Linked Checklists Section */}
            {checklists.length > 0 && (
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4" />
                  {t('flight.linkedChecklists')} ({t('common.optional')})
                </Label>
                
                {/* Linked checklist cards */}
                {companyChecklistIds.length > 0 && (
                  <div className="space-y-2">
                    {companyChecklistIds.map((checklistId) => {
                      const checklist = checklists.find(c => c.id === checklistId);
                      if (!checklist) return null;
                      const isCompleted = completedChecklistIds.includes(checklistId);
                      
                      return (
                        <div 
                          key={checklistId} 
                          className="flex items-center justify-between gap-2 rounded-lg border bg-card p-3"
                        >
                          <span className="text-sm font-medium truncate flex-1">
                            {checklist.tittel}
                          </span>
                          <div className="flex items-center gap-2">
                            {isCompleted ? (
                              <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                                <Check className="h-3 w-3" />
                                {t('common.completed')}
                              </span>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setActiveChecklistId(checklistId)}
                              >
                                {t('flight.openChecklist')}
                              </Button>
                            )}
                            {isAdmin && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => unlinkChecklist(checklistId)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Link checklist button - only for admins */}
                {isAdmin && availableChecklists.length > 0 && (
                  <Popover open={checklistPopoverOpen} onOpenChange={setChecklistPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1">
                        <Plus className="h-4 w-4" />
                        {t('flight.linkChecklist')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-2" align="start">
                      <div className="space-y-1">
                        {availableChecklists.map((checklist) => (
                          <Button
                            key={checklist.id}
                            variant="ghost"
                            className="w-full justify-start text-sm"
                            onClick={() => linkChecklist(checklist.id)}
                          >
                            {checklist.tittel}
                          </Button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}

                {/* Info for non-admins when no checklists are linked */}
                {!isAdmin && companyChecklistIds.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t('flight.noChecklistsLinked')}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="mission-select">{t('flight.selectMission')}</Label>
              <Select value={selectedMissionId} onValueChange={setSelectedMissionId}>
                <SelectTrigger id="mission-select">
                  <SelectValue placeholder={t('flight.noMissionSelected')} />
                </SelectTrigger>
              <SelectContent>
                  <SelectItem value="none">{t('flight.noMission')}</SelectItem>
                  {missions.map((mission) => {
                    const missionHasRoute = mission.route && 
                      typeof mission.route === 'object' && 
                      mission.route !== null &&
                      'coordinates' in mission.route;
                    return (
                      <SelectItem key={mission.id} value={mission.id}>
                        <div className="flex items-center gap-2">
                          {missionHasRoute && <MapPin className="h-3 w-3 text-primary" />}
                          <span>{mission.tittel}</span>
                          <span className="text-muted-foreground text-xs">- {mission.lokasjon}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>{t('flight.safeskyPublishing')}</Label>
              <RadioGroup value={publishMode} onValueChange={(val) => setPublishMode(val as PublishMode)}>
                <label 
                  htmlFor="mode-none" 
                  className="flex items-start space-x-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <RadioGroupItem value="none" id="mode-none" className="mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="font-medium">{t('flight.safeskyOff')}</span>
                    <p className="text-xs text-muted-foreground">
                      {t('flight.safeskyOffDesc')}
                    </p>
                  </div>
                </label>

                <label 
                  htmlFor="mode-advisory" 
                  className={`flex items-start space-x-3 rounded-lg border p-3 transition-colors ${!hasRoute ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/50'}`}
                >
                  <RadioGroupItem value="advisory" id="mode-advisory" disabled={!hasRoute} className="mt-0.5" />
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Radio className="h-4 w-4 text-primary" />
                      <span className="font-medium">{t('flight.safeskyAdvisory')}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {hasRoute 
                        ? t('flight.safeskyAdvisoryDesc')
                        : t('flight.safeskyAdvisoryRequiresRoute')}
                    </p>
                  </div>
                </label>

                <label 
                  htmlFor="mode-live" 
                  className="flex items-start space-x-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <RadioGroupItem value="live_uav" id="mode-live" className="mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Navigation className="h-4 w-4 text-green-500" />
                      <span className="font-medium">{t('flight.safeskyLivePosition')}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('flight.safeskyLivePositionDesc')}
                    </p>
                  </div>
                </label>
              </RadioGroup>
            </div>

            {publishMode === 'advisory' && hasRoute && (
              <div className="flex items-start gap-2 rounded-lg bg-primary/10 p-3 text-sm">
                <AlertCircle className="h-4 w-4 text-primary mt-0.5" />
                <p className="text-muted-foreground">
                  {t('flight.safeskyAdvisoryInfo')}
                </p>
              </div>
            )}

            {publishMode === 'live_uav' && (
              <div className="flex items-start gap-2 rounded-lg bg-green-500/10 p-3 text-sm">
                <Navigation className="h-4 w-4 text-green-500 mt-0.5" />
                <p className="text-muted-foreground">
                  {t('flight.safeskyLiveInfo')}
                </p>
              </div>
            )}

            {hasIncompleteChecklists && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm">
                <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5" />
                <p className="text-amber-600 dark:text-amber-400">
                  {t('flight.checklistNotCompleted')}
                </p>
              </div>
            )}
            </div>
          </div>

          <DialogFooter className="flex-shrink-0 gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('actions.cancel')}
            </Button>
            <Button 
              onClick={handleStartFlightClick} 
              disabled={loading}
              className="bg-green-600 hover:bg-green-700"
            >
              {loading ? t('flight.starting') : t('flight.startFlight')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Checklist Warning Dialog */}
      <AlertDialog open={showChecklistWarning} onOpenChange={setShowChecklistWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {t('flight.checklistWarningTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('flight.checklistWarningDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleStartFlight}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {t('flight.startAnyway')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Checklist Execution Dialog */}
      {activeChecklistId && (
        <ChecklistExecutionDialog
          open={!!activeChecklistId}
          onOpenChange={(open) => !open && setActiveChecklistId(null)}
          checklistId={activeChecklistId}
          itemName={checklists.find(c => c.id === activeChecklistId)?.tittel || ''}
          onComplete={handleChecklistComplete}
        />
      )}
    </>
  );
}
