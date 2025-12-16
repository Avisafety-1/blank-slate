import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';

// User-specific localStorage keys to prevent cross-user state sharing
const getStorageKey = (userId: string) => `active_flight_start_time_${userId}`;
const getMissionKey = (userId: string) => `active_flight_mission_id_${userId}`;
const getPublishModeKey = (userId: string) => `active_flight_publish_mode_${userId}`;
const getChecklistsKey = (userId: string) => `active_flight_checklists_${userId}`;

// Legacy keys for cleanup
const LEGACY_KEYS = ['active_flight_start_time', 'active_flight_mission_id', 'active_flight_publish_mode', 'active_flight_checklists'];

export type PublishMode = 'none' | 'advisory' | 'live_uav';

interface FlightTimerState {
  isActive: boolean;
  startTime: Date | null;
  elapsedSeconds: number;
  missionId: string | null;
  publishMode: PublishMode;
  completedChecklistIds: string[];
}

export const useFlightTimer = () => {
  const { user, companyId } = useAuth();
  const [state, setState] = useState<FlightTimerState>({
    isActive: false,
    startTime: null,
    elapsedSeconds: 0,
    missionId: null,
    publishMode: 'none',
    completedChecklistIds: [],
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

      // Clean up legacy non-user-specific keys
      LEGACY_KEYS.forEach(key => localStorage.removeItem(key));

      // Use user-specific localStorage keys
      const userStorageKey = getStorageKey(user.id);
      const userMissionKey = getMissionKey(user.id);
      const userPublishModeKey = getPublishModeKey(user.id);
      const userChecklistsKey = getChecklistsKey(user.id);

      // First check localStorage for offline support
      const localStartTime = localStorage.getItem(userStorageKey);
      const localMissionId = localStorage.getItem(userMissionKey);
      const localPublishMode = (localStorage.getItem(userPublishModeKey) as PublishMode) || 'none';
      const localChecklists = JSON.parse(localStorage.getItem(userChecklistsKey) || '[]') as string[];
      
      // Then check database for cross-device sync
      const { data: dbFlight } = await supabase
        .from('active_flights')
        .select('*')
        .eq('profile_id', user.id)
        .maybeSingle();

      let startTime: Date | null = null;
      let missionId: string | null = null;
      let publishMode: PublishMode = 'none';
      let completedChecklistIds: string[] = [];

      if (dbFlight) {
        startTime = new Date(dbFlight.start_time);
        missionId = dbFlight.mission_id || null;
        publishMode = (dbFlight.publish_mode as PublishMode) || 'none';
        completedChecklistIds = localChecklists; // Get from localStorage (not stored in DB)
        // Sync to user-specific localStorage
        localStorage.setItem(userStorageKey, startTime.toISOString());
        if (missionId) localStorage.setItem(userMissionKey, missionId);
        localStorage.setItem(userPublishModeKey, publishMode);
      } else if (localStartTime) {
        startTime = new Date(localStartTime);
        missionId = localMissionId || null;
        publishMode = localPublishMode;
        completedChecklistIds = localChecklists;
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
          completedChecklistIds,
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

  // Function to publish Point advisory for live_uav mode (100m radius around start position)
  const publishPointAdvisory = useCallback(async (lat: number, lng: number, pilotName: string) => {
    try {
      const { error } = await supabase.functions.invoke('safesky-advisory', {
        body: { 
          action: 'publish_point_advisory', 
          lat, 
          lng, 
          pilotName 
        },
      });
      if (error) {
        console.error('Error publishing Point advisory:', error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Failed to publish Point advisory:', err);
      return false;
    }
  }, []);

  const startFlight = useCallback(async (
    missionId?: string, 
    publishMode: PublishMode = 'none', 
    completedChecklistIds: string[] = [],
    startPosition?: { lat: number; lng: number },
    pilotName?: string,
    dronetagDeviceId?: string
  ) => {
    if (!user || !companyId) return false;

    const startTime = new Date();
    let routeData = null;

    // Fetch route data from mission if advisory mode is selected
    if (publishMode === 'advisory' && missionId) {
      const { data: mission } = await supabase
        .from('missions')
        .select('route')
        .eq('id', missionId)
        .single();
      
      if (mission?.route) {
        routeData = mission.route;
      }

      const published = await publishAdvisory(missionId);
      if (!published) {
        console.warn('Failed to publish advisory, continuing without');
      }
    } else if (publishMode === 'live_uav') {
      startGpsWatch();
      
      // Publish Point advisory with start position (100m radius)
      if (startPosition && pilotName) {
        const published = await publishPointAdvisory(startPosition.lat, startPosition.lng, pilotName);
        if (!published) {
          console.warn('Failed to publish Point advisory, continuing without');
        }
      }
      
      // Initial UAV beacon publish after brief delay for GPS to acquire
      setTimeout(async () => {
        if (lastPositionRef.current) {
          const { lat, lon, alt, speed, heading } = lastPositionRef.current;
          await publishLiveUav(lat, lon, alt, speed, heading, 0, 0);
        }
      }, 2000);
    }

    // Save to user-specific localStorage for offline support
    localStorage.setItem(getStorageKey(user.id), startTime.toISOString());
    if (missionId) localStorage.setItem(getMissionKey(user.id), missionId);
    localStorage.setItem(getPublishModeKey(user.id), publishMode);
    localStorage.setItem(getChecklistsKey(user.id), JSON.stringify(completedChecklistIds));

    // Save to database for cross-device sync, including route_data copy and live_uav start position
    const { error } = await supabase.from('active_flights').insert([{
      profile_id: user.id,
      company_id: companyId,
      start_time: startTime.toISOString(),
      mission_id: missionId || null,
      publish_mode: publishMode,
      route_data: routeData,
      start_lat: startPosition?.lat || null,
      start_lng: startPosition?.lng || null,
      pilot_name: pilotName || null,
      dronetag_device_id: dronetagDeviceId || null,
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
      completedChecklistIds,
    });

    return true;
  }, [user, companyId, publishAdvisory, publishLiveUav, publishPointAdvisory, startGpsWatch]);

  // Fetch flight track from DroneTag positions
  const fetchFlightTrack = useCallback(async (
    dronetagDeviceId: string,
    startTime: Date,
    endTime: Date
  ): Promise<Array<{ lat: number; lng: number; alt: number; timestamp: string }>> => {
    try {
      // Fetch dronetag device to get the device_id (text identifier)
      const { data: device } = await supabase
        .from('dronetag_devices')
        .select('device_id')
        .eq('id', dronetagDeviceId)
        .single();

      if (!device) return [];

      const { data: positions } = await supabase
        .from('dronetag_positions')
        .select('lat, lng, alt_agl, timestamp')
        .eq('device_id', device.device_id)
        .gte('timestamp', startTime.toISOString())
        .lte('timestamp', endTime.toISOString())
        .order('timestamp', { ascending: true });

      if (!positions || positions.length === 0) return [];

      return positions
        .filter(p => p.lat && p.lng)
        .map(p => ({
          lat: p.lat!,
          lng: p.lng!,
          alt: p.alt_agl || 0,
          timestamp: p.timestamp
        }));
    } catch (error) {
      console.error('Error fetching flight track:', error);
      return [];
    }
  }, []);

  // Reverse geocode coordinates to address
  const reverseGeocode = useCallback(async (lat: number, lng: number): Promise<string> => {
    try {
      const response = await fetch(
        `https://ws.geonorge.no/adresser/v1/punktsok?lat=${lat}&lon=${lng}&radius=100&treffPerSide=1`
      );
      const data = await response.json();
      if (data.adresser && data.adresser.length > 0) {
        const addr = data.adresser[0];
        return `${addr.adressetekst}, ${addr.postnummer} ${addr.poststed}`;
      }
    } catch (error) {
      console.error('Reverse geocode error:', error);
    }
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }, []);

  const endFlight = useCallback(async (): Promise<{
    elapsedMinutes: number;
    missionId: string | null;
    flightTrack: Array<{ lat: number; lng: number; alt: number; timestamp: string }>;
    dronetagDeviceId: string | null;
  } | null> => {
    if (!state.isActive || !state.startTime) {
      return null;
    }

    const endTime = new Date();

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

    const elapsedSeconds = Math.floor((endTime.getTime() - state.startTime.getTime()) / 1000);
    const elapsedMinutes = Math.ceil(elapsedSeconds / 60);

    // Fetch active flight to get dronetag_device_id
    let dronetagDeviceId: string | null = null;
    let flightTrack: Array<{ lat: number; lng: number; alt: number; timestamp: string }> = [];
    let missionIdToUse = state.missionId;

    if (user) {
      const { data: activeFlight } = await supabase
        .from('active_flights')
        .select('dronetag_device_id, start_lat, start_lng, pilot_name')
        .eq('profile_id', user.id)
        .maybeSingle();

      if (activeFlight?.dronetag_device_id) {
        dronetagDeviceId = activeFlight.dronetag_device_id;
        // Fetch flight track from DroneTag positions
        flightTrack = await fetchFlightTrack(dronetagDeviceId, state.startTime, endTime);
      }

      // If no mission was selected, create one automatically
      if (!missionIdToUse && companyId) {
        // Determine location from track or start position
        let lat = activeFlight?.start_lat || flightTrack[0]?.lat;
        let lng = activeFlight?.start_lng || flightTrack[0]?.lng;
        let lokasjon = 'Ukjent lokasjon';

        if (lat && lng) {
          lokasjon = await reverseGeocode(lat, lng);
        }

        // Create auto-generated mission
        const { data: newMission, error: missionError } = await supabase
          .from('missions')
          .insert({
            tittel: `Flytur ${format(state.startTime, 'dd.MM.yyyy HH:mm')}`,
            lokasjon,
            latitude: lat || null,
            longitude: lng || null,
            tidspunkt: state.startTime.toISOString(),
            slutt_tidspunkt: endTime.toISOString(),
            status: 'Fullført',
            risk_nivå: 'Lav',
            beskrivelse: `Automatisk generert fra flytur uten valgt oppdrag.\nPilot: ${activeFlight?.pilot_name || 'Ukjent'}`,
            company_id: companyId,
            user_id: user.id,
          })
          .select('id')
          .single();

        if (!missionError && newMission) {
          missionIdToUse = newMission.id;
        }
      }
    }

    // Clear user-specific localStorage
    if (user) {
      localStorage.removeItem(getStorageKey(user.id));
      localStorage.removeItem(getMissionKey(user.id));
      localStorage.removeItem(getPublishModeKey(user.id));
      localStorage.removeItem(getChecklistsKey(user.id));
    }

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
      completedChecklistIds: [],
    });

    return {
      elapsedMinutes,
      missionId: missionIdToUse,
      flightTrack,
      dronetagDeviceId,
    };
  }, [state.isActive, state.startTime, state.publishMode, state.missionId, user, companyId, endAdvisory, stopGpsWatch, fetchFlightTrack, reverseGeocode]);

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
    completedChecklistIds: state.completedChecklistIds,
    startFlight,
    endFlight,
    formatElapsedTime,
  };
};
