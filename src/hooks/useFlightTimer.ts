import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const LOCAL_STORAGE_KEY = 'active_flight_start_time';
const LOCAL_STORAGE_MISSION_KEY = 'active_flight_mission_id';
const LOCAL_STORAGE_SAFESKY_KEY = 'active_flight_safesky_published';

interface FlightTimerState {
  isActive: boolean;
  startTime: Date | null;
  elapsedSeconds: number;
  missionId: string | null;
  safeskyPublished: boolean;
}

export const useFlightTimer = () => {
  const { user, companyId } = useAuth();
  const [state, setState] = useState<FlightTimerState>({
    isActive: false,
    startTime: null,
    elapsedSeconds: 0,
    missionId: null,
    safeskyPublished: false,
  });
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Function to publish/refresh SafeSky advisory
  const publishAdvisory = useCallback(async (missionId: string) => {
    try {
      const { error } = await supabase.functions.invoke('safesky-advisory', {
        body: { action: 'publish_advisory', missionId: missionId },
      });
      if (error) {
        console.error('Error publishing SafeSky advisory:', error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Failed to publish SafeSky advisory:', err);
      return false;
    }
  }, []);

  // Function to end SafeSky advisory
  const endAdvisory = useCallback(async (missionId: string) => {
    try {
      await supabase.functions.invoke('safesky-advisory', {
        body: { action: 'delete_advisory', missionId: missionId },
      });
    } catch (err) {
      console.error('Failed to end SafeSky advisory:', err);
    }
  }, []);

  // Check for active flight on mount
  useEffect(() => {
    const checkActiveFlight = async () => {
      if (!user) return;

      // First check localStorage for offline support
      const localStartTime = localStorage.getItem(LOCAL_STORAGE_KEY);
      const localMissionId = localStorage.getItem(LOCAL_STORAGE_MISSION_KEY);
      const localSafeskyPublished = localStorage.getItem(LOCAL_STORAGE_SAFESKY_KEY) === 'true';
      
      // Then check database for cross-device sync
      const { data: dbFlight } = await supabase
        .from('active_flights')
        .select('*')
        .eq('profile_id', user.id)
        .maybeSingle();

      let startTime: Date | null = null;
      let missionId: string | null = null;
      let safeskyPublished = false;

      if (dbFlight) {
        startTime = new Date(dbFlight.start_time);
        missionId = dbFlight.mission_id || null;
        safeskyPublished = dbFlight.safesky_published || false;
        // Sync to localStorage
        localStorage.setItem(LOCAL_STORAGE_KEY, startTime.toISOString());
        if (missionId) localStorage.setItem(LOCAL_STORAGE_MISSION_KEY, missionId);
        localStorage.setItem(LOCAL_STORAGE_SAFESKY_KEY, String(safeskyPublished));
      } else if (localStartTime) {
        startTime = new Date(localStartTime);
        missionId = localMissionId || null;
        safeskyPublished = localSafeskyPublished;
        // Sync to database if not there
        if (companyId) {
          await supabase.from('active_flights').insert({
            profile_id: user.id,
            company_id: companyId,
            start_time: startTime.toISOString(),
            mission_id: missionId,
            safesky_published: safeskyPublished,
          });
        }
      }

      if (startTime) {
        const elapsed = Math.floor((Date.now() - startTime.getTime()) / 1000);
        setState({
          isActive: true,
          startTime,
          elapsedSeconds: elapsed,
          missionId,
          safeskyPublished,
        });
      }
    };

    checkActiveFlight();
  }, [user, companyId]);

  // Setup SafeSky refresh interval when active and published
  useEffect(() => {
    if (state.isActive && state.safeskyPublished && state.missionId) {
      // Refresh every 10 seconds for testing
      refreshIntervalRef.current = setInterval(() => {
        if (state.missionId) {
          publishAdvisory(state.missionId);
        }
      }, 10000);

      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
          refreshIntervalRef.current = null;
        }
      };
    }
  }, [state.isActive, state.safeskyPublished, state.missionId, publishAdvisory]);

  // Update elapsed time every second when active
  useEffect(() => {
    if (!state.isActive || !state.startTime) return;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - state.startTime!.getTime()) / 1000);
      setState(prev => ({ ...prev, elapsedSeconds: elapsed }));
    }, 1000);

    return () => clearInterval(interval);
  }, [state.isActive, state.startTime]);

  const startFlight = useCallback(async (missionId?: string, publishToSafesky?: boolean) => {
    if (!user || !companyId) return false;

    const startTime = new Date();
    const shouldPublish = publishToSafesky && missionId;

    // Publish to SafeSky if requested
    if (shouldPublish) {
      const published = await publishAdvisory(missionId);
      if (!published) {
        console.warn('Failed to publish to SafeSky, continuing without');
      }
    }

    // Save to localStorage for offline support
    localStorage.setItem(LOCAL_STORAGE_KEY, startTime.toISOString());
    if (missionId) localStorage.setItem(LOCAL_STORAGE_MISSION_KEY, missionId);
    localStorage.setItem(LOCAL_STORAGE_SAFESKY_KEY, String(shouldPublish || false));

    // Save to database for cross-device sync
    const { error } = await supabase.from('active_flights').insert([{
      profile_id: user.id,
      company_id: companyId,
      start_time: startTime.toISOString(),
      mission_id: missionId || null,
      safesky_published: Boolean(shouldPublish),
    }]);

    if (error) {
      console.error('Error starting flight:', error);
    }

    setState({
      isActive: true,
      startTime,
      elapsedSeconds: 0,
      missionId: missionId || null,
      safeskyPublished: Boolean(shouldPublish),
    });

    return true;
  }, [user, companyId, publishAdvisory]);

  const endFlight = useCallback(async (): Promise<number | null> => {
    if (!state.isActive || !state.startTime) {
      return null;
    }

    // Stop SafeSky refresh interval
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }

    // End SafeSky advisory if it was published
    if (state.safeskyPublished && state.missionId) {
      await endAdvisory(state.missionId);
    }

    const elapsedSeconds = Math.floor((Date.now() - state.startTime.getTime()) / 1000);
    const elapsedMinutes = Math.ceil(elapsedSeconds / 60);

    // Clear localStorage
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    localStorage.removeItem(LOCAL_STORAGE_MISSION_KEY);
    localStorage.removeItem(LOCAL_STORAGE_SAFESKY_KEY);

    // Clear database
    if (user) {
      await supabase
        .from('active_flights')
        .delete()
        .eq('profile_id', user.id);
    }

    setState({
      isActive: false,
      startTime: null,
      elapsedSeconds: 0,
      missionId: null,
      safeskyPublished: false,
    });

    return elapsedMinutes;
  }, [state.isActive, state.startTime, state.safeskyPublished, state.missionId, user, endAdvisory]);

  const formatElapsedTime = useCallback((seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    const pad = (n: number) => n.toString().padStart(2, '0');
    
    if (hours > 0) {
      return `${hours}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  }, []);

  return {
    isActive: state.isActive,
    elapsedSeconds: state.elapsedSeconds,
    missionId: state.missionId,
    safeskyPublished: state.safeskyPublished,
    startFlight,
    endFlight,
    formatElapsedTime,
  };
};
