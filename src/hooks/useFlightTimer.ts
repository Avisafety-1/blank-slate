import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const LOCAL_STORAGE_KEY = 'active_flight_start_time';
const LOCAL_STORAGE_MISSION_KEY = 'active_flight_mission_id';
const LOCAL_STORAGE_PUBLISH_MODE_KEY = 'active_flight_publish_mode';

export type PublishMode = 'none' | 'advisory' | 'live_uav';

interface FlightTimerState {
  isActive: boolean;
  startTime: Date | null;
  elapsedSeconds: number;
  missionId: string | null;
  publishMode: PublishMode;
}

export const useFlightTimer = () => {
  const { user, companyId } = useAuth();
  const [state, setState] = useState<FlightTimerState>({
    isActive: false,
    startTime: null,
    elapsedSeconds: 0,
    missionId: null,
    publishMode: 'none',
  });
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastPositionRef = useRef<{ 
    lat: number; 
    lon: number; 
    alt: number;
    speed: number;
    heading: number;
  } | null>(null);
  const startAltitudeRef = useRef<number | null>(null);
  const prevPositionRef = useRef<{ alt: number; timestamp: number } | null>(null);

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

  // Function to publish live UAV position with flight dynamics
  const publishLiveUav = useCallback(async (
    lat: number, 
    lon: number, 
    alt: number,
    speed: number,
    heading: number,
    altitudeDelta: number,
    verticalSpeed: number
  ) => {
    console.log('Publishing live UAV:', { lat, lon, alt, speed, heading, altitudeDelta, verticalSpeed });
    try {
      const { error } = await supabase.functions.invoke('safesky-advisory', {
        body: { 
          action: 'publish_live_uav', 
          lat, 
          lon, 
          alt,
          speed,
          heading,
          altitudeDelta,
          verticalSpeed
        },
      });
      if (error) {
        console.error('Error publishing live UAV position:', error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Failed to publish live UAV position:', err);
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

  // Start GPS watch for live UAV mode
  const startGpsWatch = useCallback(() => {
    // Set initial fallback position (will be updated by GPS if available)
    lastPositionRef.current = { lat: 63.43, lon: 10.39, alt: 50, speed: 0, heading: 0 };
    startAltitudeRef.current = null;
    prevPositionRef.current = null;

    if (!navigator.geolocation) {
      console.warn('Geolocation not supported, using fallback position');
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        const newAlt = position.coords.altitude || 50;
        
        // Set start altitude on first GPS fix
        if (startAltitudeRef.current === null) {
          startAltitudeRef.current = newAlt;
          console.log('Start altitude set:', newAlt);
        }

        lastPositionRef.current = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          alt: newAlt,
          speed: position.coords.speed || 0,
          heading: position.coords.heading || 0,
        };

        // Update previous position for vertical speed calculation
        prevPositionRef.current = { alt: newAlt, timestamp: now };
      },
      (error) => {
        console.error('GPS error, using fallback position:', error);
        // Fallback is already set, keep using it
      },
      { enableHighAccuracy: true, maximumAge: 3000 }
    );
  }, []);

  // Stop GPS watch
  const stopGpsWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    lastPositionRef.current = null;
    startAltitudeRef.current = null;
    prevPositionRef.current = null;
  }, []);

  // Check for active flight on mount
  useEffect(() => {
    const checkActiveFlight = async () => {
      if (!user) return;

      // First check localStorage for offline support
      const localStartTime = localStorage.getItem(LOCAL_STORAGE_KEY);
      const localMissionId = localStorage.getItem(LOCAL_STORAGE_MISSION_KEY);
      const localPublishMode = (localStorage.getItem(LOCAL_STORAGE_PUBLISH_MODE_KEY) as PublishMode) || 'none';
      
      // Then check database for cross-device sync
      const { data: dbFlight } = await supabase
        .from('active_flights')
        .select('*')
        .eq('profile_id', user.id)
        .maybeSingle();

      let startTime: Date | null = null;
      let missionId: string | null = null;
      let publishMode: PublishMode = 'none';

      if (dbFlight) {
        startTime = new Date(dbFlight.start_time);
        missionId = dbFlight.mission_id || null;
        publishMode = (dbFlight.publish_mode as PublishMode) || 'none';
        // Sync to localStorage
        localStorage.setItem(LOCAL_STORAGE_KEY, startTime.toISOString());
        if (missionId) localStorage.setItem(LOCAL_STORAGE_MISSION_KEY, missionId);
        localStorage.setItem(LOCAL_STORAGE_PUBLISH_MODE_KEY, publishMode);
      } else if (localStartTime) {
        startTime = new Date(localStartTime);
        missionId = localMissionId || null;
        publishMode = localPublishMode;
        // Sync to database if not there
        if (companyId) {
          await supabase.from('active_flights').insert({
            profile_id: user.id,
            company_id: companyId,
            start_time: startTime.toISOString(),
            mission_id: missionId,
            publish_mode: publishMode,
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
          publishMode,
        });

        // Restart GPS watch if in live_uav mode
        if (publishMode === 'live_uav') {
          startGpsWatch();
        }
      }
    };

    checkActiveFlight();
  }, [user, companyId, startGpsWatch]);

  // Setup refresh interval for live_uav mode only
  // Advisory mode is now handled by backend cron job (safesky-cron-refresh)
  useEffect(() => {
    // Only run interval for live_uav mode - advisory is handled by backend cron
    if (!state.isActive || state.publishMode !== 'live_uav') {
      return;
    }

    // Refresh every 10 seconds for live UAV position
    refreshIntervalRef.current = setInterval(() => {
      if (lastPositionRef.current) {
        const { lat, lon, alt, speed, heading } = lastPositionRef.current;
        const altitudeDelta = startAltitudeRef.current !== null ? alt - startAltitudeRef.current : 0;
        
        // Calculate vertical speed from previous position
        let verticalSpeed = 0;
        if (prevPositionRef.current) {
          const timeDiff = (Date.now() - prevPositionRef.current.timestamp) / 1000;
          if (timeDiff > 0 && timeDiff < 30) {
            verticalSpeed = (alt - prevPositionRef.current.alt) / timeDiff;
          }
        }
        
        publishLiveUav(lat, lon, alt, speed, heading, altitudeDelta, verticalSpeed);
      }
    }, 10000);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [state.isActive, state.publishMode, publishLiveUav]);

  // Update elapsed time every second when active
  useEffect(() => {
    if (!state.isActive || !state.startTime) return;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - state.startTime!.getTime()) / 1000);
      setState(prev => ({ ...prev, elapsedSeconds: elapsed }));
    }, 1000);

    return () => clearInterval(interval);
  }, [state.isActive, state.startTime]);

  const startFlight = useCallback(async (missionId?: string, publishMode: PublishMode = 'none') => {
    if (!user || !companyId) return false;

    const startTime = new Date();

    // Initialize based on publish mode
    if (publishMode === 'advisory' && missionId) {
      const published = await publishAdvisory(missionId);
      if (!published) {
        console.warn('Failed to publish advisory, continuing without');
      }
    } else if (publishMode === 'live_uav') {
      startGpsWatch();
      // Initial publish after brief delay for GPS to acquire
      setTimeout(async () => {
        if (lastPositionRef.current) {
          const { lat, lon, alt, speed, heading } = lastPositionRef.current;
          // Initial publish - no altitude delta or vertical speed yet
          await publishLiveUav(lat, lon, alt, speed, heading, 0, 0);
        }
      }, 2000);
    }

    // Save to localStorage for offline support
    localStorage.setItem(LOCAL_STORAGE_KEY, startTime.toISOString());
    if (missionId) localStorage.setItem(LOCAL_STORAGE_MISSION_KEY, missionId);
    localStorage.setItem(LOCAL_STORAGE_PUBLISH_MODE_KEY, publishMode);

    // Save to database for cross-device sync
    const { error } = await supabase.from('active_flights').insert([{
      profile_id: user.id,
      company_id: companyId,
      start_time: startTime.toISOString(),
      mission_id: missionId || null,
      publish_mode: publishMode,
    }]);

    if (error) {
      console.error('Error starting flight:', error);
    }

    setState({
      isActive: true,
      startTime,
      elapsedSeconds: 0,
      missionId: missionId || null,
      publishMode,
    });

    return true;
  }, [user, companyId, publishAdvisory, publishLiveUav, startGpsWatch]);

  const endFlight = useCallback(async (): Promise<number | null> => {
    if (!state.isActive || !state.startTime) {
      return null;
    }

    // Stop refresh interval
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }

    // Stop GPS watch if active
    stopGpsWatch();

    // End SafeSky advisory if it was published
    if (state.publishMode === 'advisory' && state.missionId) {
      await endAdvisory(state.missionId);
    }
    // Note: live_uav beacons expire automatically after 60s, no explicit delete needed

    const elapsedSeconds = Math.floor((Date.now() - state.startTime.getTime()) / 1000);
    const elapsedMinutes = Math.ceil(elapsedSeconds / 60);

    // Clear localStorage
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    localStorage.removeItem(LOCAL_STORAGE_MISSION_KEY);
    localStorage.removeItem(LOCAL_STORAGE_PUBLISH_MODE_KEY);

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
      publishMode: 'none',
    });

    return elapsedMinutes;
  }, [state.isActive, state.startTime, state.publishMode, state.missionId, user, endAdvisory, stopGpsWatch]);

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
    publishMode: state.publishMode,
    startFlight,
    endFlight,
    formatElapsedTime,
  };
};
