import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plane, Clock, MapPin, Radio, User } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

interface ActiveFlight {
  id: string;
  start_time: string;
  publish_mode: string | null;
  pilot_name: string | null;
  mission_id: string | null;
  profile_id: string;
  profileName?: string;
  missionTitle?: string;
}

export const ActiveFlightsSection = ({ onHasFlightsChange }: { onHasFlightsChange?: (has: boolean) => void }) => {
  const { t } = useTranslation();
  const { companyId } = useAuth();
  const navigate = useNavigate();
  const [flights, setFlights] = useState<ActiveFlight[]>([]);
  const [now, setNow] = useState(Date.now());

  const fetchFlights = useCallback(async () => {
    if (!companyId) return;
    const { data, error } = await (supabase as any)
      .from('active_flights')
      .select('id, start_time, publish_mode, pilot_name, mission_id, profile_id, profiles:profile_id(full_name), missions:mission_id(tittel)')
      .eq('company_id', companyId);

    if (error) {
      console.error('Error fetching active flights:', error);
      return;
    }

    const mapped: ActiveFlight[] = (data || []).map((f: any) => ({
      id: f.id,
      start_time: f.start_time,
      publish_mode: f.publish_mode,
      pilot_name: f.pilot_name,
      mission_id: f.mission_id,
      profile_id: f.profile_id,
      profileName: f.profiles?.full_name || null,
      missionTitle: f.missions?.tittel || null,
    }));

    setFlights(mapped);
    onHasFlightsChange?.(mapped.length > 0);
  }, [companyId, onHasFlightsChange]);

  useEffect(() => {
    fetchFlights();

    const channel = supabase
      .channel('active-flights-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'active_flights' }, () => {
        fetchFlights();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchFlights]);

  // Tick elapsed time every second
  useEffect(() => {
    if (flights.length === 0) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [flights.length]);

  const formatElapsed = (startTime: string) => {
    const seconds = Math.max(0, Math.floor((now - new Date(startTime).getTime()) / 1000));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (flights.length === 0) {
    return (
      <GlassCard className="hidden lg:block">
        <div className="flex items-center gap-2 mb-2">
          <Plane className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
          <h2 className="text-sm sm:text-base font-semibold">{t('dashboard.activeFlights.title')}</h2>
        </div>
        <p className="text-sm text-muted-foreground text-center py-4">{t('dashboard.activeFlights.noFlights')}</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <div className="flex items-center gap-2">
          <Plane className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
          <h2 className="text-sm sm:text-base font-semibold">{t('dashboard.activeFlights.title')}</h2>
          <Badge className="bg-green-500/20 text-green-700 dark:text-green-300 text-[10px] sm:text-xs">
            {flights.length}
          </Badge>
        </div>
        <Button size="sm" variant="outline" onClick={() => navigate('/kart')}>
          <MapPin className="w-4 h-4 mr-1" />
          {t('dashboard.activeFlights.viewOnMap')}
        </Button>
      </div>

      <div className="space-y-1.5 sm:space-y-2 max-h-[250px] overflow-y-auto">
        {flights.map((flight) => (
          <div
            key={flight.id}
            onClick={() => navigate('/kart')}
            className="p-2 sm:p-3 bg-card/30 rounded hover:bg-card/50 transition-colors cursor-pointer"
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-xs sm:text-sm truncate">
                  {flight.missionTitle || t('dashboard.activeFlights.freeFlight')}
                </h3>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {flight.publish_mode && flight.publish_mode !== 'none' && (
                  <Radio className="w-3 h-3 text-primary animate-pulse" />
                )}
                <Badge className="bg-green-500/20 text-green-700 dark:text-green-300 text-[10px] sm:text-xs font-mono">
                  <Clock className="w-3 h-3 mr-1" />
                  {formatElapsed(flight.start_time)}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <User className="w-3 h-3" />
              <span className="truncate">{flight.pilot_name || flight.profileName || t('common.unknownName')}</span>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
};