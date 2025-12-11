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
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Radio, MapPin, AlertCircle } from 'lucide-react';

interface Mission {
  id: string;
  tittel: string;
  lokasjon: string;
  route: unknown;
}

interface StartFlightDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartFlight: (missionId?: string, publishToSafesky?: boolean) => void;
}

export function StartFlightDialog({ open, onOpenChange, onStartFlight }: StartFlightDialogProps) {
  const { companyId } = useAuth();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [selectedMissionId, setSelectedMissionId] = useState<string>('');
  const [publishToSafesky, setPublishToSafesky] = useState(true);
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
      setPublishToSafesky(true);
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

  const handleStartFlight = async () => {
    setLoading(true);
    try {
      const missionId = selectedMissionId && selectedMissionId !== 'none' ? selectedMissionId : undefined;
      await onStartFlight(
        missionId,
        publishToSafesky && hasRoute ? true : false
      );
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start flytur</DialogTitle>
          <DialogDescription>
            Velg oppdrag og publiser til SafeSky for økt sikkerhet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="mission-select">Velg oppdrag (valgfritt)</Label>
            <Select value={selectedMissionId} onValueChange={setSelectedMissionId}>
              <SelectTrigger id="mission-select">
                <SelectValue placeholder="Ingen oppdrag valgt" />
              </SelectTrigger>
            <SelectContent>
                <SelectItem value="none">Ingen oppdrag</SelectItem>
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

          <div className="flex items-center justify-between space-x-4 rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <Radio className="h-5 w-5 text-primary" />
              <div className="space-y-0.5">
                <Label htmlFor="safesky-toggle" className="cursor-pointer">
                  Publiser til SafeSky
                </Label>
                <p className="text-xs text-muted-foreground">
                  {hasRoute 
                    ? 'Din planlagte rute blir synlig for andre luftfartsaktører'
                    : selectedMissionId 
                      ? 'Oppdraget har ingen planlagt rute'
                      : 'Velg et oppdrag med rute for å publisere'}
                </p>
              </div>
            </div>
            <Switch
              id="safesky-toggle"
              checked={publishToSafesky}
              onCheckedChange={setPublishToSafesky}
              disabled={!hasRoute}
            />
          </div>

          {publishToSafesky && hasRoute && (
            <div className="flex items-start gap-2 rounded-lg bg-primary/10 p-3 text-sm">
              <AlertCircle className="h-4 w-4 text-primary mt-0.5" />
              <p className="text-muted-foreground">
                SafeSky-advisoryen oppdateres automatisk hvert minutt og avsluttes når du avslutter flyturen.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button 
            onClick={handleStartFlight} 
            disabled={loading}
            className="bg-green-600 hover:bg-green-700"
          >
            {loading ? 'Starter...' : 'Start flytur'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
