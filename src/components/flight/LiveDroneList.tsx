import { useTranslation } from 'react-i18next';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { FRESH_THRESHOLD_SEC, type LiveDrone } from '@/hooks/useLiveDroneSources';
import { cn } from '@/lib/utils';

interface LiveDroneListProps {
  drones: LiveDrone[];
  loading: boolean;
  selectedKey: string | null;
  onSelect: (drone: LiveDrone) => void;
  autoSelected: boolean;
  emptyHint?: string;
}

function formatAge(sec: number, t: (k: string, d?: string) => string) {
  if (sec < 60) return `${sec}${t('flight.liveAgeSecondsShort', 's')} ${t('flight.liveAgeAgo', 'siden')}`;
  const min = Math.floor(sec / 60);
  return `${min}${t('flight.liveAgeMinutesShort', 'min')} ${t('flight.liveAgeAgo', 'siden')}`;
}

export function LiveDroneList({
  drones,
  loading,
  selectedKey,
  onSelect,
  autoSelected,
  emptyHint,
}: LiveDroneListProps) {
  const { t } = useTranslation();

  if (loading && drones.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('flight.liveDronesSearching', 'Søker etter live droner …')}
      </div>
    );
  }

  if (drones.length === 0) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
        <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <span>{emptyHint ?? t('flight.liveDronesEmpty', 'Ingen droner sender posisjon akkurat nå.')}</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {drones.map((drone) => {
        const fresh = drone.ageSec <= FRESH_THRESHOLD_SEC;
        const selected = drone.key === selectedKey;
        const details = [
          drone.identifier,
          drone.heightM != null ? `${Math.round(drone.heightM)} m` : null,
          drone.batteryPct != null ? `${Math.round(drone.batteryPct)} %` : null,
          drone.source === 'fh2' ? 'FlightHub 2' : 'DroneTag',
        ].filter(Boolean) as string[];

        return (
          <button
            key={drone.key}
            type="button"
            onClick={() => onSelect(drone)}
            className={cn(
              'w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50',
              selected ? 'border-primary bg-primary/5' : 'border-border',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <span className="relative mt-1.5 flex h-2.5 w-2.5 flex-shrink-0">
                  {fresh && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                  )}
                  <span
                    className={cn(
                      'relative inline-flex h-2.5 w-2.5 rounded-full',
                      fresh ? 'bg-green-500' : 'bg-amber-500',
                    )}
                  />
                </span>
                <div className="min-w-0">
                  <p className="font-medium truncate">{drone.name}</p>
                  <p className="text-xs text-muted-foreground break-words">{details.join(' · ')}</p>
                </div>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {formatAge(drone.ageSec, t as (k: string, d?: string) => string)}
              </span>
            </div>
          </button>
        );
      })}
      {autoSelected && (
        <p className="text-xs text-primary">
          {t('flight.liveDroneAutoSelected', 'Automatisk valgt fra oppdragets drone')}
        </p>
      )}
    </div>
  );
}
