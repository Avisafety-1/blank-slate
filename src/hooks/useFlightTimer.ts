import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const LOCAL_STORAGE_KEY = 'active_flight_start_time';

interface FlightTimerState {
  isActive: boolean;
  startTime: Date | null;
  elapsedSeconds: number;
}

export const useFlightTimer = () => {
  const { user, companyId } = useAuth();
  const [state, setState] = useState<FlightTimerState>({
    isActive: false,
    startTime: null,
    elapsedSeconds: 0,
  });

  // Check for active flight on mount
  useEffect(() => {
    const checkActiveFlight = async () => {
      if (!user) return;

      // First check localStorage for offline support
      const localStartTime = localStorage.getItem(LOCAL_STORAGE_KEY);
      
      // Then check database for cross-device sync
      const { data: dbFlight } = await supabase
        .from('active_flights')
        .select('*')
        .eq('profile_id', user.id)
        .maybeSingle();

      let startTime: Date | null = null;

      if (dbFlight) {
        startTime = new Date(dbFlight.start_time);
        // Sync to localStorage
        localStorage.setItem(LOCAL_STORAGE_KEY, startTime.toISOString());
      } else if (localStartTime) {
        startTime = new Date(localStartTime);
        // Sync to database if not there
        if (companyId) {
          await supabase.from('active_flights').insert({
            profile_id: user.id,
            company_id: companyId,
            start_time: startTime.toISOString(),
          });
        }
      }

      if (startTime) {
        const elapsed = Math.floor((Date.now() - startTime.getTime()) / 1000);
        setState({
          isActive: true,
          startTime,
          elapsedSeconds: elapsed,
        });
      }
    };

    checkActiveFlight();
  }, [user, companyId]);

  // Update elapsed time every second when active
  useEffect(() => {
    if (!state.isActive || !state.startTime) return;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - state.startTime!.getTime()) / 1000);
      setState(prev => ({ ...prev, elapsedSeconds: elapsed }));
    }, 1000);

    return () => clearInterval(interval);
  }, [state.isActive, state.startTime]);

  const startFlight = useCallback(async () => {
    if (!user || !companyId) return false;

    const startTime = new Date();

    // Save to localStorage for offline support
    localStorage.setItem(LOCAL_STORAGE_KEY, startTime.toISOString());

    // Save to database for cross-device sync
    const { error } = await supabase.from('active_flights').insert({
      profile_id: user.id,
      company_id: companyId,
      start_time: startTime.toISOString(),
    });

    if (error) {
      console.error('Error starting flight:', error);
      // Still continue with localStorage
    }

    setState({
      isActive: true,
      startTime,
      elapsedSeconds: 0,
    });

    return true;
  }, [user, companyId]);

  const endFlight = useCallback(async (): Promise<number | null> => {
    if (!state.isActive || !state.startTime) {
      return null;
    }

    const elapsedSeconds = Math.floor((Date.now() - state.startTime.getTime()) / 1000);
    const elapsedMinutes = Math.ceil(elapsedSeconds / 60); // Round up to nearest minute

    // Clear localStorage
    localStorage.removeItem(LOCAL_STORAGE_KEY);

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
    });

    return elapsedMinutes;
  }, [state.isActive, state.startTime, user]);

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
    startFlight,
    endFlight,
    formatElapsedTime,
  };
};
