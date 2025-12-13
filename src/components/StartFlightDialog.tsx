import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Radio, MapPin, AlertCircle, Navigation } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [selectedMissionId, setSelectedMissionId] = useState<string>('');
  const [publishMode, setPublishMode] = useState<PublishMode>('none');
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    if (!open) {
      setSelectedMissionId('');
      setPublishMode('none');
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

  const handleStartFlight = async () => {
    setLoading(true);
    try {
      const missionId = selectedMissionId && selectedMissionId !== 'none' ? selectedMissionId : undefined;
      await onStartFlight(missionId, publishMode);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('flight.startFlightTitle')}</DialogTitle>
          <DialogDescription>
            {t('flight.startFlightDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
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
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('actions.cancel')}
          </Button>
          <Button 
            onClick={handleStartFlight} 
            disabled={loading}
            className="bg-green-600 hover:bg-green-700"
          >
            {loading ? t('flight.starting') : t('flight.startFlight')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
