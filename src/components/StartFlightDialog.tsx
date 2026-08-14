import { getCachedData, setCachedData } from "@/lib/offlineCache";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useSoraApprovalEnabled } from "@/hooks/useSoraApprovalEnabled";
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
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRoleCheck } from '@/hooks/useRoleCheck';
import { Radio, MapPin, AlertCircle, Navigation, ClipboardCheck, Check, AlertTriangle, Plus, X, Ruler, Plane, Info, ShieldCheck, ChevronsUpDown } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
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
  latitude?: number | null;
  longitude?: number | null;
  ninox_approved?: boolean;
}

interface DronetagDevice {
  id: string;
  name: string | null;
  callsign: string | null;
  drone_id: string | null;
}

interface StartFlightDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartFlight: (
    missionId?: string, 
    publishMode?: PublishMode, 
    completedChecklistIds?: string[],
    startPosition?: { lat: number; lng: number },
    pilotName?: string,
    dronetagDeviceId?: string
  ) => void;
}

export function StartFlightDialog({ open, onOpenChange, onStartFlight }: StartFlightDialogProps) {
  const { user, companyId, companyName } = useAuth();
  const { isAdmin } = useRoleCheck();
  const { t } = useTranslation();
  const { checklists } = useChecklists();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [selectedMissionId, setSelectedMissionId] = useState<string>('');
  const [missionPopoverOpen, setMissionPopoverOpen] = useState(false);
  const [publishMode, setPublishMode] = useState<PublishMode>('advisory');
  const [userPickedMode, setUserPickedMode] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Company-level linked checklists (persisted)
  const [companyChecklistIds, setCompanyChecklistIds] = useState<string[]>([]);
  // Session-level completion tracking
  const [completedChecklistIds, setCompletedChecklistIds] = useState<string[]>([]);
  const [activeChecklistId, setActiveChecklistId] = useState<string | null>(null);
  const [showChecklistWarning, setShowChecklistWarning] = useState(false);
  const [checklistPopoverOpen, setChecklistPopoverOpen] = useState(false);
  const [checklistSearch, setChecklistSearch] = useState('');

  // Mission-level checklist state
  const [missionChecklistIds, setMissionChecklistIds] = useState<string[]>([]);
  const [missionCompletedChecklistIds, setMissionCompletedChecklistIds] = useState<string[]>([]);
  const [showMissionChecklistWarning, setShowMissionChecklistWarning] = useState(false);
  const [isFetchingMissionChecklists, setIsFetchingMissionChecklists] = useState(false);
  const [activeMissionChecklistId, setActiveMissionChecklistId] = useState<string | null>(null);
  const [missionChecklistTitles, setMissionChecklistTitles] = useState<Record<string, string>>({});
  
  // Large advisory warning (50-150 km²)
  const [showLargeAdvisoryWarning, setShowLargeAdvisoryWarning] = useState(false);
  // Too large advisory error (>150 km²)
  const [showAdvisoryTooLarge, setShowAdvisoryTooLarge] = useState(false);
  const [advisoryAreaKm2, setAdvisoryAreaKm2] = useState<number | null>(null);
  const [pendingFlightStart, setPendingFlightStart] = useState(false);
  
  // GPS position for live_uav mode
  const [gpsPosition, setGpsPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [pilotName, setPilotName] = useState<string>('');
  
  // DroneTag device selection for telemetry tracking
  const [dronetagDevices, setDronetagDevices] = useState<DronetagDevice[]>([]);
  const [selectedDronetagId, setSelectedDronetagId] = useState<string>('');
  const [autoSelectedDronetag, setAutoSelectedDronetag] = useState(false);
  
  // Nearest air traffic info
  const [nearestTraffic, setNearestTraffic] = useState<{
    callsign: string;
    type: string;
    distanceKm: number;
    altitudeFt: number | null;
  } | null>(null);
  const [trafficLoading, setTrafficLoading] = useState(false);

  // Ninox approval state
  const [missionIn5kmZone, setMissionIn5kmZone] = useState(false);
  const [ninoxApproved, setNinoxApproved] = useState(false);
  const [ninoxChecking, setNinoxChecking] = useState(false);
  const [showNinoxConfirm, setShowNinoxConfirm] = useState(false);

  // DroneTag enabled flag for the company
  const [dronetagEnabled, setDronetagEnabled] = useState(false);
  // FH2 live source available (webhook enabled + safesky_forward on)
  const [fh2LiveEnabled, setFh2LiveEnabled] = useState(false);
  // FH2 webhook enabled but safesky_forward off (live still works for internal tracking, no SafeSky broadcast)
  const [fh2InternalOnly, setFh2InternalOnly] = useState(false);
  // Combined: any live position source available
  const liveAvailable = dronetagEnabled || fh2LiveEnabled || fh2InternalOnly;

  // Live drone-position freshness ("mottar vi posisjon nå?")
  // Polls latest FH2 / DroneTag position for the company while the live mode is active.
  const [livePosFreshness, setLivePosFreshness] = useState<{ hasData: boolean; ageSec: number | null; source: 'fh2' | 'dronetag' | null }>({ hasData: false, ageSec: null, source: null });

  // Phone in remarks for advisory mode (hidden until SafeSky supports it)
  const [profilePhone, setProfilePhone] = useState<string>('');
  const [includePhoneInRemarks, setIncludePhoneInRemarks] = useState<boolean>(false);
  const [manualPhone, setManualPhone] = useState<string>('');

  // Fetch the pilot's phone number from their profile
  useEffect(() => {
    if (!user || !open) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('telefon')
        .eq('id', user.id)
        .maybeSingle();
      setProfilePhone((data?.telefon || '').trim());
    })();
  }, [user, open]);

  // SORA requirement check
  const companySettings = useCompanySettings();
  const soraApprovalEnabled = useSoraApprovalEnabled();
  const [missingSora, setMissingSora] = useState(false);

  // Fetch company-level checklist settings
  useEffect(() => {
    const fetchCompanyChecklists = async () => {
      if (!companyId || !open) return;

      const { data } = await supabase
        .from('companies')
        .select('before_takeoff_checklist_ids, dronetag_enabled')
        .eq('id', companyId)
        .maybeSingle();

      if (data?.before_takeoff_checklist_ids) {
        setCompanyChecklistIds(data.before_takeoff_checklist_ids);
      } else {
        setCompanyChecklistIds([]);
      }
      setDronetagEnabled(data?.dronetag_enabled ?? false);

      // Check FH2 webhook config for this company - live is available if webhook is enabled AND positions are forwarded to SafeSky
      const { data: fh2Cfg } = await supabase
        .from('flighthub2_webhook_config')
        .select('enabled, safesky_forward')
        .eq('company_id', companyId)
        .maybeSingle();
      setFh2LiveEnabled(!!(fh2Cfg?.enabled && fh2Cfg?.safesky_forward));
      setFh2InternalOnly(!!(fh2Cfg?.enabled && !fh2Cfg?.safesky_forward));
    };

    fetchCompanyChecklists();
  }, [companyId, open]);

  // Fetch missions
  useEffect(() => {
    const fetchMissions = async () => {
      if (!companyId || !open) return;

      try {
        const { data, error } = await supabase
          .from('missions')
          .select('id, tittel, lokasjon, route, latitude, longitude, ninox_approved')
          .eq('company_id', companyId)
          .in('status', ['Planlagt', 'Pågående'])
          .order('tidspunkt', { ascending: true });

        if (error) throw error;

        if (data) {
          setMissions(data);
          setCachedData(`offline_startflight_missions_${companyId}`, data);
        }
      } catch (err) {
        console.error('Error fetching missions for StartFlightDialog:', err);
        if (!navigator.onLine) {
          const cached = getCachedData<Mission[]>(`offline_startflight_missions_${companyId}`);
          if (cached) setMissions(cached);
        }
      }
    };

    fetchMissions();
  }, [companyId, open]);

  // Fetch DroneTag devices for live_uav mode
  useEffect(() => {
    const fetchDronetagDevices = async () => {
      if (!companyId || !open) return;

      try {
        const { data, error } = await supabase
          .from('dronetag_devices')
          .select('id, name, callsign, drone_id')
          .eq('company_id', companyId)
          .not('callsign', 'is', null);

        if (error) throw error;

        if (data) {
          setDronetagDevices(data);
          setCachedData(`offline_startflight_dronetags_${companyId}`, data);
        }
      } catch (err) {
        console.error('Error fetching dronetag devices:', err);
        if (!navigator.onLine) {
          const cached = getCachedData<DronetagDevice[]>(`offline_startflight_dronetags_${companyId}`);
          if (cached) setDronetagDevices(cached);
        }
      }
    };

    fetchDronetagDevices();
  }, [companyId, open]);

  // Live position freshness poll — runs while dialog open + live_uav selected
  useEffect(() => {
    if (!open || !companyId || publishMode !== 'live_uav') {
      setLivePosFreshness({ hasData: false, ageSec: null, source: null });
      return;
    }

    let cancelled = false;
    const checkPosition = async () => {
      try {
        // Try FH2 first if enabled
        let latest: { ts: string; source: 'fh2' | 'dronetag' } | null = null;

        if (fh2LiveEnabled) {
          const { data } = await supabase
            .from('flighthub2_positions')
            .select('time_stamp')
            .eq('company_id', companyId)
            .order('time_stamp', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (data?.time_stamp) latest = { ts: data.time_stamp, source: 'fh2' };
        }

        // Fallback / supplement: DroneTag telemetry for company drones
        if (!latest && dronetagEnabled) {
          const { data: droneRows } = await supabase
            .from('drones')
            .select('id')
            .eq('company_id', companyId);
          const droneIds = (droneRows ?? []).map((d) => d.id);
          if (droneIds.length > 0) {
            const { data } = await supabase
              .from('drone_telemetry')
              .select('created_at')
              .in('drone_id', droneIds)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (data?.created_at) latest = { ts: data.created_at, source: 'dronetag' };
          }
        }

        if (cancelled) return;
        if (latest) {
          const ageSec = Math.round((Date.now() - new Date(latest.ts).getTime()) / 1000);
          setLivePosFreshness({ hasData: true, ageSec, source: latest.source });
        } else {
          setLivePosFreshness({ hasData: false, ageSec: null, source: null });
        }
      } catch (err) {
        if (!cancelled) setLivePosFreshness({ hasData: false, ageSec: null, source: null });
      }
    };

    checkPosition();
    const interval = setInterval(checkPosition, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [open, companyId, publishMode, fh2LiveEnabled, dronetagEnabled]);
  useEffect(() => {
    if (!selectedMissionId || selectedMissionId === 'none') {
      setMissionChecklistIds([]);
      setMissionCompletedChecklistIds([]);
      setIsFetchingMissionChecklists(false);
      return;
    }
    const fetchChecklistState = async () => {
      setIsFetchingMissionChecklists(true);
      try {
        const { data } = await supabase
          .from('missions')
          .select('checklist_ids, checklist_completed_ids')
          .eq('id', selectedMissionId)
          .single();
        if (data) {
          const checklistIds: string[] = (data as any).checklist_ids || [];
          setMissionChecklistIds(checklistIds);
          setMissionCompletedChecklistIds((data as any).checklist_completed_ids || []);
          // Fetch titles for mission checklists
          if (checklistIds.length > 0) {
            const { data: docs } = await supabase
              .from('documents').select('id, tittel').in('id', checklistIds);
            const titles: Record<string, string> = {};
            docs?.forEach(d => { titles[d.id] = d.tittel; });
            setMissionChecklistTitles(titles);
          } else {
            setMissionChecklistTitles({});
          }
        } else {
          setMissionChecklistIds([]);
          setMissionCompletedChecklistIds([]);
          setMissionChecklistTitles({});
        }
      } finally {
        setIsFetchingMissionChecklists(false);
      }
    };
    fetchChecklistState();
  }, [selectedMissionId]);

  // Auto-select dronetag when a mission is selected (based on mission → drone → dronetag link)
  useEffect(() => {
    if (!selectedMissionId || selectedMissionId === 'none') return;

    const autoSelectDronetag = async () => {
      const { data: missionDrones } = await supabase
        .from('mission_drones')
        .select('drone_id')
        .eq('mission_id', selectedMissionId);

      if (!missionDrones || missionDrones.length === 0) return;

      const droneIds = missionDrones.map(md => md.drone_id);

      const matchingDevice = dronetagDevices.find(
        device => device.drone_id && droneIds.includes(device.drone_id)
      );

      if (matchingDevice) {
        setSelectedDronetagId(matchingDevice.id);
        setAutoSelectedDronetag(true);
      }
    };

    autoSelectDronetag();
  }, [selectedMissionId, dronetagDevices]);

  // Reset session state when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedMissionId('');
      setPublishMode('none');
      setUserPickedMode(false);
      setCompletedChecklistIds([]);
      setActiveChecklistId(null);
      setGpsPosition(null);
      setGpsError(null);
      setGpsLoading(false);
      setPilotName('');
      setSelectedDronetagId('');
      setAutoSelectedDronetag(false);
      setShowLargeAdvisoryWarning(false);
      setShowAdvisoryTooLarge(false);
      setAdvisoryAreaKm2(null);
      setPendingFlightStart(false);
      setNearestTraffic(null);
      setTrafficLoading(false);
      setMissionChecklistIds([]);
      setMissionCompletedChecklistIds([]);
      setShowMissionChecklistWarning(false);
      setIsFetchingMissionChecklists(false);
      setActiveMissionChecklistId(null);
      setMissionChecklistTitles({});
      setMissionIn5kmZone(false);
      setNinoxApproved(false);
      setNinoxChecking(false);
      setShowNinoxConfirm(false);
      setMissingSora(false);
      setIncludePhoneInRemarks(false);
      setManualPhone('');
    }
  }, [open]);

  // Check SORA requirement for selected mission
  useEffect(() => {
    if (!selectedMissionId || selectedMissionId === 'none' || !companySettings.require_sora_on_missions || soraApprovalEnabled) {
      setMissingSora(false);
      return;
    }
    (async () => {
      const { count } = await supabase
        .from('mission_risk_assessments')
        .select('id', { count: 'exact', head: true })
        .eq('mission_id', selectedMissionId);
      setMissingSora((count ?? 0) < companySettings.require_sora_steps);
    })();
  }, [selectedMissionId, companySettings.require_sora_on_missions, companySettings.require_sora_steps, soraApprovalEnabled]);

  // Preview of the SafeSky callsign that will be published (mirrors safesky-advisory logic)
  useEffect(() => {
    if (!open || !companyId || publishMode !== 'advisory') {
      setCallsignPreview(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data: company } = await supabase
          .from('companies')
          .select('navn, parent_company_id, safesky_callsign_prefix, safesky_callsign_variable, safesky_callsign_test_mode')
          .eq('id', companyId)
          .maybeSingle();

        let companyName = company?.navn || 'avisafe';
        let prefix = company?.safesky_callsign_prefix as string | null | undefined;
        let variable = (company?.safesky_callsign_variable as string | undefined) || 'counter';

        if (company?.parent_company_id) {
          const { data: parentCompany } = await supabase
            .from('companies')
            .select('navn, safesky_callsign_prefix, safesky_callsign_variable')
            .eq('id', company.parent_company_id)
            .maybeSingle();
          if (parentCompany?.navn) companyName = parentCompany.navn;
          if (!prefix && parentCompany?.safesky_callsign_prefix) prefix = parentCompany.safesky_callsign_prefix;
          if (!company?.safesky_callsign_variable && parentCompany?.safesky_callsign_variable) {
            variable = parentCompany.safesky_callsign_variable;
          }
        }

        const rawPrefix = (prefix && prefix.trim()) ? prefix.trim() : companyName.toLowerCase();
        const sanitized = rawPrefix.replace(/[^a-zA-Z0-9_-]/g, '') || 'avisafe';

        let suffix = '01';
        if (variable === 'none') {
          suffix = '';
        } else if (variable === 'drone_registration') {
          suffix = '01';
          if (selectedMissionId && selectedMissionId !== 'none') {
            const { data: missionDrone } = await supabase
              .from('mission_drones')
              .select('drone_id')
              .eq('mission_id', selectedMissionId)
              .limit(1)
              .maybeSingle();
            if (missionDrone?.drone_id) {
              const { data: drone } = await supabase
                .from('drones')
                .select('registration_number, serienummer')
                .eq('id', missionDrone.drone_id)
                .maybeSingle();
              const cleaned = (drone?.registration_number || drone?.serienummer || '').replace(/[^a-zA-Z0-9_-]/g, '');
              if (cleaned) suffix = cleaned;
            }
          }
        } else {
          const parentId = company?.parent_company_id || companyId;
          const { data: siblingCompanies } = await supabase
            .from('companies')
            .select('id')
            .eq('parent_company_id', parentId);
          const hierarchyIds = [parentId, ...(siblingCompanies || []).map(c => c.id)];
          const { count } = await supabase
            .from('active_flights')
            .select('mission_id', { count: 'exact', head: true })
            .in('company_id', hierarchyIds)
            .eq('publish_mode', 'advisory');
          suffix = String((count ?? 0) + 1).padStart(2, '0');
        }

        if (!cancelled) setCallsignPreview(sanitized + suffix);
      } catch {
        if (!cancelled) setCallsignPreview(null);
      }
    })();
    return () => { cancelled = true; };
  }, [open, companyId, publishMode, selectedMissionId]);

  // Check if selected mission is in a 5km zone
  useEffect(() => {
    if (!selectedMissionId || selectedMissionId === 'none') {
      setMissionIn5kmZone(false);
      setNinoxApproved(false);
      return;
    }
    const m = missions.find(mi => mi.id === selectedMissionId);
    if (!m) return;
    
    setNinoxApproved(!!m.ninox_approved);
    
    const lat = m.latitude ?? (m.route as any)?.coordinates?.[0]?.lat;
    const lng = m.longitude ?? (m.route as any)?.coordinates?.[0]?.lng;
    if (!lat || !lng) {
      setMissionIn5kmZone(false);
      return;
    }
    
    setNinoxChecking(true);
    const routePoints = (m.route as any)?.coordinates || null;
    
    supabase.rpc("check_mission_airspace", {
      p_lat: lat,
      p_lng: lng,
      p_route: routePoints ? JSON.parse(JSON.stringify(routePoints)) : null,
    }).then(({ data, error }) => {
      if (error) { setNinoxChecking(false); return; }
      const rawArray = (data as any[]) || [];
      // Only block if route is actually INSIDE the 5KM zone — RPC also returns
      // nearby 5KM zones (route_inside=false) for proximity warnings.
      const has5km = rawArray.some((r: any) => r.z_type === '5KM' && r.route_inside === true);
      setMissionIn5kmZone(has5km);
      setNinoxChecking(false);
    });
  }, [selectedMissionId, missions]);

  // Fetch nearest air traffic when GPS position is available
  useEffect(() => {
    if (!open || !gpsPosition) return;

    const fetchNearestTraffic = async () => {
      setTrafficLoading(true);
      try {
        const toRad = (d: number) => d * Math.PI / 180;
        const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
          const R = 6371;
          const dLat = toRad(lat2 - lat1);
          const dLon = toRad(lon2 - lon1);
          const a = Math.sin(dLat/2)**2 + 
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
            Math.sin(dLon/2)**2;
          return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        };

        // Candidates: { callsign, type, lat, lng, altitudeFt }
        const candidates: Array<{ callsign: string; type: string; lat: number; lng: number; altitudeFt: number | null }> = [];

        // 1. SafeSky beacons (bounding box ~20 km to avoid 1000-row limit)
        const delta = 0.18;
        const { data: beacons } = await supabase
          .from('safesky_beacons')
          .select('id, callsign, beacon_type, latitude, longitude, altitude')
          .gte('latitude', gpsPosition.lat - delta)
          .lte('latitude', gpsPosition.lat + delta)
          .gte('longitude', gpsPosition.lng - delta)
          .lte('longitude', gpsPosition.lng + delta);

        if (beacons) {
          const MAX_ALT_M = 1524; // 5000ft
          for (const b of beacons) {
            if (b.latitude != null && b.longitude != null && (b.altitude == null || b.altitude <= MAX_ALT_M)) {
              candidates.push({
                callsign: b.callsign || 'Ukjent',
                type: b.beacon_type || 'Ukjent',
                lat: b.latitude,
                lng: b.longitude,
                altitudeFt: b.altitude != null ? Math.round(b.altitude * 3.28084) : null,
              });
            }
          }
        }

        // 2. Company's own active flights (advisory & live tracks)
        const { data: activeFlights } = await supabase
          .from('active_flights')
          .select('id, profile_id, pilot_name, publish_mode, start_lat, start_lng, route_data, mission_id');

        if (activeFlights) {
          for (const flight of activeFlights) {
            // Skip own flight
            if (flight.profile_id === user?.id) continue;

            const mode = flight.publish_mode || 'none';

            if ((mode === 'live_uav' || mode === 'none') && flight.start_lat != null && flight.start_lng != null) {
              candidates.push({
                callsign: flight.pilot_name || 'Pilot',
                type: 'Live UAV',
                lat: flight.start_lat,
                lng: flight.start_lng,
                altitudeFt: null,
              });
            }

            if (mode === 'advisory' && flight.route_data) {
              // Use route centroid as approximate position
              const rd = flight.route_data as { coordinates?: Array<{ lat: number; lng: number }> };
              if (rd.coordinates && rd.coordinates.length > 0) {
                const coords = rd.coordinates;
                const centLat = coords.reduce((s, c) => s + c.lat, 0) / coords.length;
                const centLng = coords.reduce((s, c) => s + c.lng, 0) / coords.length;
                candidates.push({
                  callsign: flight.pilot_name || 'Advisory',
                  type: 'Advisory',
                  lat: centLat,
                  lng: centLng,
                  altitudeFt: null,
                });
              }
            }
          }
        }

        if (candidates.length === 0) {
          setNearestTraffic(null);
          setTrafficLoading(false);
          return;
        }

        // Find nearest
        let nearest = candidates[0];
        let minDist = Infinity;

        for (const c of candidates) {
          const dist = haversine(gpsPosition.lat, gpsPosition.lng, c.lat, c.lng);
          if (dist < minDist) {
            minDist = dist;
            nearest = c;
          }
        }

        const MAX_DISTANCE_KM = 20;
        if (minDist > MAX_DISTANCE_KM) {
          setNearestTraffic(null);
        } else {
          setNearestTraffic({
            callsign: nearest.callsign,
            type: nearest.type,
            distanceKm: minDist,
            altitudeFt: nearest.altitudeFt,
          });
        }
      } catch (err) {
        console.error('Error fetching nearest traffic:', err);
      } finally {
        setTrafficLoading(false);
      }
    };

    fetchNearestTraffic();
  }, [open, gpsPosition, user?.id]);

  // Fetch pilot name when dialog opens
  useEffect(() => {
    if (!open || !user) return;

    const fetchPilotName = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();
      if (data?.full_name) {
        setPilotName(data.full_name);
      }
    };
    fetchPilotName();
  }, [open, user]);

  // Always fetch GPS position when dialog opens (for all modes, to auto-fill departure)
  useEffect(() => {
    if (!open) return;

    setGpsLoading(true);
    setGpsError(null);
    
    if (!navigator.geolocation) {
      setGpsError(t('flight.gpsNotSupported'));
      setGpsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGpsPosition({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setGpsLoading(false);
      },
      (error) => {
        console.error('GPS error:', error);
        setGpsError(t('flight.gpsError'));
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [open, t]);

  const selectedMission = selectedMissionId && selectedMissionId !== 'none' 
    ? missions.find(m => m.id === selectedMissionId) 
    : null;
  const routeCoordsCount = selectedMission?.route &&
    typeof selectedMission.route === 'object' &&
    selectedMission.route !== null &&
    'coordinates' in selectedMission.route &&
    Array.isArray((selectedMission.route as { coordinates: unknown[] }).coordinates)
      ? (selectedMission.route as { coordinates: unknown[] }).coordinates.length
      : 0;
  const hasRoute = routeCoordsCount > 0;
  // SafeSky krever minst 3 rutepunkter for å publisere et advisory
  const hasAdvisoryRoute = routeCoordsCount >= 3;

  // Auto-bytt SafeSky-modus basert på om advisory-rute er tilgjengelig:
  // - Uten gyldig rute (<3 punkter): tving 'none'
  // - Med gyldig rute: default til 'advisory' når brukeren ikke aktivt har valgt
  useEffect(() => {
    if (!hasAdvisoryRoute && publishMode === 'advisory') {
      setPublishMode('none');
    } else if (hasAdvisoryRoute && publishMode === 'none' && !userPickedMode) {
      setPublishMode('advisory');
    }
  }, [hasAdvisoryRoute, publishMode, userPickedMode]);


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

  const validateMissionChecklists = (): boolean => {
    if (!selectedMissionId || selectedMissionId === 'none') return true;
    const hasIncomplete = missionChecklistIds.some(id => !missionCompletedChecklistIds.includes(id));
    if (hasIncomplete) {
      setShowMissionChecklistWarning(true);
      return false;
    }
    return true;
  };

  const handleStartFlightClick = () => {
    if (hasIncompleteChecklists) {
      setShowChecklistWarning(true);
      return;
    }
    if (isFetchingMissionChecklists) {
      toast.info('Laster sjekkliste-status, prøv igjen...');
      return;
    }
    handleStartFlight();
  };

  const handleStartFlight = async (forcePublish = false) => {
    setLoading(true);
    setShowChecklistWarning(false);
    setShowLargeAdvisoryWarning(false);
    setShowAdvisoryTooLarge(false);
    
    try {
      const missionId = selectedMissionId && selectedMissionId !== 'none' ? selectedMissionId : undefined;

      // Validate mission checklists using local state
      const checklistsOk = validateMissionChecklists();
      if (!checklistsOk) {
        setLoading(false);
        return;
      }
      
      // For advisory mode, check for large advisory warning first
      if (publishMode === 'advisory' && missionId && !forcePublish) {
        const phoneToSend = includePhoneInRemarks ? (profilePhone || manualPhone).trim() : '';
        const { data, error } = await supabase.functions.invoke('safesky-advisory', {
          body: { action: 'publish_advisory', missionId, forcePublish: false, includePhoneInRemarks, phoneNumber: phoneToSend || null },
        });
        
        // Handle error responses
        if (error) {
          console.log('Advisory pre-check error:', error.message);
          toast.error(t('flight.advisoryPublishError'));
          setLoading(false);
          return;
        }
        
        // Check for too few route points - clearer message
        if (data?.error === 'route_too_few_points') {
          toast.error('Ruten har for få punkter til å publisere advisory', {
            description: `Et advisory krever en rute med minst 3 punkter (denne ruten har ${data.pointCount ?? 0}). Legg til flere veipunkter på oppdraget, eller velg "Ingen" / "Live UAV" for å starte flyturen uten advisory.`,
            duration: 10000,
          });
          setLoading(false);
          return;
        }

        // Check for advisory_too_large (>150 km²) - show info dialog
        if (data?.error === 'advisory_too_large') {
          setAdvisoryAreaKm2(data.areaKm2);
          setShowAdvisoryTooLarge(true);
          setLoading(false);
          return;
        }
        
        // Check if advisory requires confirmation (50-150 km²) - show confirmation dialog
        if (data?.requiresConfirmation && data?.warning === 'large_advisory') {
          setAdvisoryAreaKm2(data.areaKm2);
          setShowLargeAdvisoryWarning(true);
          setPendingFlightStart(true);
          setLoading(false);
          return;
        }
      }
      
      // Always pass GPS position for departure auto-fill, pilot name and DroneTag for live_uav
      const startPosition = gpsPosition ? gpsPosition : undefined;
      const pilot = (publishMode === 'advisory' || publishMode === 'live_uav') && companyName
        ? `Pilot – ${companyName}`
        : pilotName ? pilotName : undefined;
      const dronetagId = publishMode === 'live_uav' && selectedDronetagId && selectedDronetagId !== 'none' 
        ? selectedDronetagId 
        : undefined;
      
      await onStartFlight(missionId, publishMode, completedChecklistIds, startPosition, pilot, dronetagId);
      onOpenChange(false);
    } finally {
      setLoading(false);
      setPendingFlightStart(false);
    }
  };

  const handleConfirmLargeAdvisory = async () => {
    // Re-call onStartFlight with forcePublish flag
    setShowLargeAdvisoryWarning(false);
    setLoading(true);
    
    try {
      const missionId = selectedMissionId && selectedMissionId !== 'none' ? selectedMissionId : undefined;
      
      // Force publish the advisory
      if (missionId) {
        const phoneToSend = includePhoneInRemarks ? (profilePhone || manualPhone).trim() : '';
        const { error } = await supabase.functions.invoke('safesky-advisory', {
          body: { action: 'publish_advisory', missionId, forcePublish: true, includePhoneInRemarks, phoneNumber: phoneToSend || null },
        });
        
        if (error) {
          console.error('Advisory publish error:', error);
          toast.error(t('flight.advisoryPublishError'));
          setLoading(false);
          return;
        }
      }
      
      const startPosition = gpsPosition ? gpsPosition : undefined;
      const pilot = companyName
        ? `Pilot – ${companyName}`
        : pilotName ? pilotName : undefined;
      const dronetagId = publishMode === 'live_uav' && selectedDronetagId && selectedDronetagId !== 'none'
        ? selectedDronetagId 
        : undefined;
      
      await onStartFlight(missionId, publishMode, completedChecklistIds, startPosition, pilot, dronetagId);
      onOpenChange(false);
    } finally {
      setLoading(false);
      setPendingFlightStart(false);
    }
  };

  const handleChecklistComplete = () => {
    if (activeChecklistId) {
      setCompletedChecklistIds(prev => [...prev, activeChecklistId]);
    }
    setActiveChecklistId(null);
  };

  const handleMissionChecklistComplete = async (checklistId: string) => {
    if (!selectedMissionId || selectedMissionId === 'none') return;
    const newCompleted = [...missionCompletedChecklistIds, checklistId];
    await supabase
      .from('missions')
      .update({ checklist_completed_ids: newCompleted } as any)
      .eq('id', selectedMissionId);
    setMissionCompletedChecklistIds(newCompleted);
    setActiveMissionChecklistId(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent data-tour="start-flight-dialog" className="w-[95vw] max-w-md max-h-[calc(90vh_-_env(safe-area-inset-top))] flex flex-col mt-[env(safe-area-inset-top)]">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>{t('flight.startFlightTitle')}</DialogTitle>
            <DialogDescription>
              {t('flight.startFlightDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto -mx-6 px-6" style={{ maxHeight: 'calc(90vh - 180px - env(safe-area-inset-top, 0px))' }}>
            <div className="space-y-6 py-4 pb-6">
            {/* Nearest air traffic info - shown above checklists */}
            {(trafficLoading || nearestTraffic !== null) && (
              <div data-tour="start-flight-traffic" className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
                nearestTraffic && nearestTraffic.distanceKm < 5 
                  ? 'bg-destructive/10' 
                  : nearestTraffic && nearestTraffic.distanceKm < 15 
                    ? 'bg-amber-500/10' 
                    : 'bg-muted'
              }`}>
                <Plane className={`h-4 w-4 mt-0.5 ${
                  nearestTraffic && nearestTraffic.distanceKm < 5 
                    ? 'text-destructive' 
                    : nearestTraffic && nearestTraffic.distanceKm < 15 
                      ? 'text-amber-500' 
                      : 'text-muted-foreground'
                }`} />
                <div className="space-y-0.5">
                  {trafficLoading ? (
                    <p className="text-muted-foreground">Sjekker lufttrafikk i nærheten...</p>
                  ) : nearestTraffic ? (
                    <>
                      <p className="font-medium">
                        Nærmeste trafikk: {nearestTraffic.distanceKm < 1 
                          ? `${Math.round(nearestTraffic.distanceKm * 1000)} m` 
                          : `${nearestTraffic.distanceKm.toFixed(1)} km`}
                      </p>
                      <p className="text-muted-foreground">
                        {nearestTraffic.callsign} ({nearestTraffic.type})
                        {nearestTraffic.altitudeFt != null && ` • ${nearestTraffic.altitudeFt} ft`}
                      </p>
                      <p className="text-xs text-muted-foreground italic">
                        Trafikk over 5 000 ft er filtrert bort
                      </p>
                    </>
                  ) : null}
                </div>
              </div>
            )}

            {!trafficLoading && nearestTraffic === null && gpsPosition && (
              <div className="flex items-start gap-2 rounded-lg bg-muted p-3 text-sm">
                <Plane className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <p className="text-muted-foreground">
                  Ingen lufttrafikk innen 20 km
                </p>
              </div>
            )}

            {/* Linked Checklists Section */}
            {checklists.length > 0 && (
              <div data-tour="start-flight-checklists" className="space-y-3">
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
                  <Popover open={checklistPopoverOpen} onOpenChange={(open) => { setChecklistPopoverOpen(open); if (!open) setChecklistSearch(''); }}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1">
                        <Plus className="h-4 w-4" />
                        {t('flight.linkChecklist')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-2" align="start">
                      <Input
                        placeholder="Søk sjekklister…"
                        value={checklistSearch}
                        onChange={(e) => setChecklistSearch(e.target.value)}
                        className="mb-2 h-8 text-sm"
                      />
                      <div
                        ref={(el) => {
                          if (!el) return;
                          const handler = (e: WheelEvent) => {
                            const { scrollTop, scrollHeight, clientHeight } = el;
                            const isScrollable = scrollHeight > clientHeight;
                            if (!isScrollable) return;
                            const atTop = scrollTop === 0 && e.deltaY < 0;
                            const atBottom = Math.abs(scrollTop + clientHeight - scrollHeight) < 1 && e.deltaY > 0;
                            if (!atTop && !atBottom) {
                              e.preventDefault();
                              e.stopPropagation();
                              el.scrollTop += e.deltaY;
                            }
                          };
                          el.addEventListener('wheel', handler, { passive: false });
                        }}
                        className="max-h-48 overflow-y-auto overflow-x-hidden [touch-action:pan-y] overscroll-contain"
                        onTouchMove={(e) => e.stopPropagation()}
                        style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
                      >
                        <div className="space-y-1">
                          {availableChecklists
                            .filter((c) => c.tittel.toLowerCase().includes(checklistSearch.toLowerCase()))
                            .map((checklist) => (
                              <Button
                                key={checklist.id}
                                variant="ghost"
                                className="w-full justify-start text-sm"
                                onClick={() => linkChecklist(checklist.id)}
                              >
                                {checklist.tittel}
                              </Button>
                            ))}
                          {availableChecklists.filter((c) => c.tittel.toLowerCase().includes(checklistSearch.toLowerCase())).length === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-2">Ingen treff</p>
                          )}
                        </div>
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

            <div data-tour="start-flight-mission" className="space-y-2">
              <Label htmlFor="mission-select">{t('flight.selectMission')}</Label>
              {(() => {
                const selected = selectedMissionId && selectedMissionId !== 'none'
                  ? missions.find((m) => m.id === selectedMissionId)
                  : null;
                const isNone = selectedMissionId === 'none';
                const selectedHasRoute = selected?.route &&
                  typeof selected.route === 'object' &&
                  selected.route !== null &&
                  'coordinates' in (selected.route as any);
                return (
                  <Popover open={missionPopoverOpen} onOpenChange={setMissionPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id="mission-select"
                        variant="outline"
                        role="combobox"
                        aria-expanded={missionPopoverOpen}
                        className={cn(
                          "w-full justify-between font-normal text-left whitespace-normal h-auto min-h-10 py-2",
                          !selected && !isNone && "text-muted-foreground"
                        )}
                      >
                        <span className="flex items-start gap-2 flex-1 min-w-0 break-words">
                          {selected ? (
                            <>
                              {selectedHasRoute && <MapPin className="h-3 w-3 text-primary shrink-0 mt-1" />}
                              <span className="flex flex-col sm:flex-row sm:items-center sm:gap-2 min-w-0 break-words">
                                <span className="font-medium break-words">{selected.tittel}</span>
                                {selected.lokasjon && (
                                  <span className="text-xs text-muted-foreground break-words">- {selected.lokasjon}</span>
                                )}
                              </span>
                            </>
                          ) : isNone ? (
                            <span>{t('flight.noMission')}</span>
                          ) : (
                            <span>{t('flight.noMissionSelected')}</span>
                          )}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[--radix-popover-trigger-width] p-0 max-w-[calc(100vw-2rem)]"
                      align="start"
                    >
                      <Command>
                        <CommandInput placeholder={t('flight.searchMission')} />
                        <CommandList className="max-h-[min(24rem,45vh)]">
                          <CommandEmpty>{t('flight.noMissionsFound')}</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="__none__ ingen no mission"
                              onSelect={() => {
                                setSelectedMissionId('none');
                                setMissionPopoverOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", isNone ? "opacity-100" : "opacity-0")} />
                              {t('flight.noMission')}
                            </CommandItem>
                            {missions.map((mission) => {
                              const missionHasRoute = mission.route &&
                                typeof mission.route === 'object' &&
                                mission.route !== null &&
                                'coordinates' in (mission.route as any);
                              return (
                                <CommandItem
                                  key={mission.id}
                                  value={`${mission.tittel} ${mission.lokasjon ?? ''}`}
                                  onSelect={() => {
                                    setSelectedMissionId(mission.id);
                                    setMissionPopoverOpen(false);
                                  }}
                                  className="items-start"
                                >
                                  <Check className={cn("mr-2 h-4 w-4 mt-1 shrink-0", selectedMissionId === mission.id ? "opacity-100" : "opacity-0")} />
                                  <div className="flex items-start gap-2 flex-1 min-w-0">
                                    {missionHasRoute && <MapPin className="h-3 w-3 text-primary shrink-0 mt-1" />}
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 min-w-0 flex-1">
                                      <span className="font-medium break-words">{mission.tittel}</span>
                                      {mission.lokasjon && (
                                        <span className="text-xs text-muted-foreground break-words">- {mission.lokasjon}</span>
                                      )}
                                    </div>
                                  </div>
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                );
              })()}

            {missionChecklistIds.length > 0 && (
              <div className="space-y-2 mt-2">
                <Label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ClipboardCheck className="h-3.5 w-3.5" />
                  Oppdragssjekklister
                </Label>
                {missionChecklistIds.map(id => {
                  const done = missionCompletedChecklistIds.includes(id);
                  return (
                    <div key={id} className="flex items-center justify-between gap-2 rounded-lg border bg-card p-3">
                      <span className="text-sm font-medium truncate flex-1">
                        {missionChecklistTitles[id] || '…'}
                      </span>
                      {done ? (
                        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                          <Check className="h-3 w-3" />
                          {t('common.completed')}
                        </span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setActiveMissionChecklistId(id)}
                        >
                          {t('flight.openChecklist')}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            </div>

            <div data-tour="start-flight-publish-mode" className="space-y-3">
              <Label>{t('flight.safeskyPublishing')}</Label>
              <RadioGroup value={publishMode} onValueChange={(val) => { setUserPickedMode(true); setPublishMode(val as PublishMode); }}>
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
                  className={`flex items-start space-x-3 rounded-lg border p-3 transition-colors ${!hasAdvisoryRoute ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/50'}`}
                >
                  <RadioGroupItem value="advisory" id="mode-advisory" disabled={!hasAdvisoryRoute} className="mt-0.5" />
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Radio className="h-4 w-4 text-primary" />
                      <span className="font-medium">{t('flight.safeskyAdvisory')}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {hasAdvisoryRoute
                        ? t('flight.safeskyAdvisoryDesc')
                        : hasRoute
                          ? `SafeSky-advisory krever en rute med minst 3 rutepunkter (denne ruten har ${routeCoordsCount}). Legg til flere veipunkter på oppdraget for å kunne publisere advisory.`
                          : t('flight.safeskyAdvisoryRequiresRoute')}
                    </p>
                  </div>
                </label>

                <label 
                  htmlFor="mode-live" 
                  className={`flex items-start space-x-3 rounded-lg border p-3 transition-colors ${!liveAvailable ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/50'}`}
                >
                  <RadioGroupItem value="live_uav" id="mode-live" disabled={!liveAvailable} className="mt-0.5" />
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Navigation className="h-4 w-4 text-green-500" />
                      <span className="font-medium">{t('flight.safeskyLivePosition')}</span>
                      {fh2LiveEnabled && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-500/15 text-green-600 dark:text-green-400">
                          DJI FlightHub 2
                        </span>
                      )}
                      {dronetagEnabled && !fh2LiveEnabled && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                          DroneTag
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {liveAvailable
                        ? (fh2LiveEnabled
                            ? 'Sender live-posisjon automatisk via FlightHub 2-integrasjonen.'
                            : t('flight.safeskyLivePositionDesc'))
                        : 'Krever DroneTag-integrasjon eller aktivert FlightHub 2-webhook med SafeSky-deling under "Mitt selskap".'}
                    </p>
                  </div>
                </label>
              </RadioGroup>
            </div>

            {publishMode === 'advisory' && hasRoute && false && (
              <div className="space-y-2">
                <div className="flex items-start gap-2 rounded-lg bg-primary/10 p-3 text-sm">
                  <AlertCircle className="h-4 w-4 text-primary mt-0.5" />
                  <p className="text-muted-foreground">
                    {t('flight.safeskyAdvisoryInfo')}
                  </p>
                </div>

                <div className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="publish-phone-remarks"
                      checked={includePhoneInRemarks}
                      onCheckedChange={(v) => setIncludePhoneInRemarks(v === true)}
                      className="mt-0.5"
                    />
                    <div className="space-y-1 flex-1">
                      <Label htmlFor="publish-phone-remarks" className="text-sm font-medium cursor-pointer">
                        {t('flight.publishPhoneInRemarks', 'Publiser telefonnummer i remarks')}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {t('flight.publishPhoneInRemarksHint', 'Andre operatører kan kontakte deg ved konflikt i luftrommet.')}
                      </p>
                    </div>
                  </div>

                  {includePhoneInRemarks && profilePhone && (
                    <p className="text-xs text-muted-foreground pl-6">
                      {t('flight.phoneFromProfile', 'Bruker telefonnummer fra profil')}: <span className="font-medium text-foreground">{profilePhone}</span>
                    </p>
                  )}

                  {includePhoneInRemarks && !profilePhone && (
                    <div className="pl-6 space-y-1">
                      <Label htmlFor="manual-phone" className="text-xs">
                        {t('flight.phoneManualEntry', 'Telefonnummer')}
                      </Label>
                      <Input
                        id="manual-phone"
                        type="tel"
                        inputMode="tel"
                        value={manualPhone}
                        onChange={(e) => setManualPhone(e.target.value)}
                        placeholder="+47 ..."
                        className="h-8 text-sm"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        {t('flight.phoneManualEntryHint', 'Tips: lagre telefonnummeret på profil-siden for å slippe å fylle ut hver gang.')}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {publishMode === 'live_uav' && (
              <div className="space-y-3">
                {/* Drone live-position freshness indicator */}
                {(() => {
                  const fresh = livePosFreshness.hasData && livePosFreshness.ageSec !== null && livePosFreshness.ageSec <= 30;
                  const stale = livePosFreshness.hasData && livePosFreshness.ageSec !== null && livePosFreshness.ageSec > 30;
                  const sourceLabel = livePosFreshness.source === 'fh2' ? 'DJI FlightHub 2' : 'DroneTag';
                  return (
                    <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${
                      fresh ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'
                    }`}>
                      <span className={`relative flex h-2.5 w-2.5 flex-shrink-0`}>
                        {fresh && (
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                        )}
                        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${fresh ? 'bg-green-500' : 'bg-red-500'}`} />
                      </span>
                      <div className="flex-1">
                        {fresh && (
                          <p className="text-green-700 dark:text-green-400 font-medium">
                            Mottar droneposisjon · {sourceLabel} ({livePosFreshness.ageSec}s siden)
                          </p>
                        )}
                        {stale && (
                          <p className="text-red-700 dark:text-red-400 font-medium">
                            Ingen fersk posisjon · siste {sourceLabel}-punkt for {livePosFreshness.ageSec}s siden
                          </p>
                        )}
                        {!livePosFreshness.hasData && (
                          <p className="text-red-700 dark:text-red-400 font-medium">
                            Ingen droneposisjon mottatt enda – sjekk at drona er koblet til {fh2LiveEnabled ? 'DJI FlightHub 2' : 'DroneTag'}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })()}

                <div className="flex items-start gap-2 rounded-lg bg-green-500/10 p-3 text-sm">
                  <Navigation className="h-4 w-4 text-green-500 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-muted-foreground">
                      {fh2LiveEnabled
                        ? t('flight.safeskyLiveInfoFh2')
                        : t('flight.safeskyLiveInfoDronetag')}
                    </p>
                    {fh2LiveEnabled && (
                      <p className="text-xs text-green-700 dark:text-green-400">
                        ✓ Drona deles til SafeSky så lenge denne flygingen er aktiv. Stopp deling ved å avslutte flyging.
                      </p>
                    )}
                    {fh2InternalOnly && (
                      <p className="text-xs text-muted-foreground">
                        ℹ Live-modus brukes kun til intern sporing — selskapet deler ikke til SafeSky (slå på «Del posisjon med SafeSky» under Mitt selskap for å dele).
                      </p>
                    )}
                    {gpsLoading && (
                      <p className="text-xs text-muted-foreground">{t('flight.gpsAcquiring')}</p>
                    )}
                    {gpsError && (
                      <p className="text-xs text-destructive">{gpsError}</p>
                    )}
                    {gpsPosition && (
                      <p className="text-xs text-green-600 dark:text-green-400">
                        ✓ {t('flight.gpsPositionOk', 'Posisjon OK')}
                      </p>
                    )}
                  </div>
                </div>
                
                {/* DroneTag device selector — only when DroneTag is the active live source */}
                {dronetagEnabled && !fh2LiveEnabled && (
                  <div data-tour="start-flight-dronetag" className="space-y-2 pl-1">
                    <Label className="text-sm">{t('flight.dronetagDevice')} *</Label>
                    {dronetagDevices.length > 0 ? (
                      <>
                        <Select
                          value={selectedDronetagId}
                          onValueChange={(val) => {
                            setSelectedDronetagId(val);
                            setAutoSelectedDronetag(false);
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder={t('flight.selectDronetag')} />
                          </SelectTrigger>
                          <SelectContent>
                            {dronetagDevices.map((device) => (
                              <SelectItem key={device.id} value={device.id}>
                                {device.name || device.callsign} {device.callsign && `(${device.callsign})`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {autoSelectedDronetag ? (
                          <p className="flex items-center gap-1 text-xs text-primary">
                            <Info className="h-3 w-3" />
                            Automatisk valgt fra oppdragets drone
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            {t('flight.dronetagInfo')}
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>Ingen Dronetag-enheter registrert. Legg til en under Ressurser.</span>
                      </div>
                    )}
                  </div>
                )}
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

            {/* SORA requirement warning */}
            {missingSora && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm">
                <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5" />
                <p className="text-amber-600 dark:text-amber-400">
                  SORA-analyse mangler. Gjennomfør SORA før du starter flyging.
                </p>
              </div>
            )}

            {/* Ninox approval warning */}
            {missionIn5kmZone && !ninoxApproved && !ninoxChecking && (
              <div className="flex items-start gap-2 rounded-lg bg-red-500/10 p-3 text-sm">
                <ShieldCheck className="h-4 w-4 text-red-500 mt-0.5" />
                <div className="flex-1 space-y-2">
                  <p className="font-medium text-red-700 dark:text-red-300">
                    Oppdraget er i en 5 km RPAS-sone. Ninox-godkjenning er påkrevd.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-500/30 hover:bg-red-500/10"
                    onClick={() => setShowNinoxConfirm(true)}
                  >
                    <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                    Bekreft Ninox-godkjenning
                  </Button>
                </div>
              </div>
            )}
            {missionIn5kmZone && ninoxApproved && (
              <div className="flex items-start gap-2 rounded-lg bg-green-500/10 p-3 text-sm">
                <ShieldCheck className="h-4 w-4 text-green-500 mt-0.5" />
                <p className="text-green-700 dark:text-green-300">Ninox-godkjenning bekreftet ✓</p>
              </div>
            )}
            </div>
          </div>

          <DialogFooter className="flex-shrink-0 gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('actions.cancel')}
            </Button>
            <Button 
              data-tour="start-flight-submit"
              onClick={handleStartFlightClick} 
              disabled={loading || missingSora || isFetchingMissionChecklists || ninoxChecking || (missionIn5kmZone && !ninoxApproved) || (missionChecklistIds.length > 0 && missionChecklistIds.some(id => !missionCompletedChecklistIds.includes(id))) || (publishMode === 'live_uav' && (gpsLoading || !gpsPosition)) || (publishMode === 'live_uav' && dronetagEnabled && !fh2LiveEnabled && (!selectedDronetagId || selectedDronetagId === 'none'))}
              className="bg-green-600 hover:bg-green-700"
            >
              {isFetchingMissionChecklists ? 'Laster...' : (loading ? t('flight.starting') : (publishMode === 'live_uav' && gpsLoading ? t('flight.gpsAcquiring') : t('flight.startFlight')))}
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
              onClick={() => handleStartFlight()}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {t('flight.startAnyway')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Large Advisory Warning Dialog */}
      <AlertDialog open={showLargeAdvisoryWarning} onOpenChange={setShowLargeAdvisoryWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Ruler className="h-5 w-5 text-amber-500" />
              {t('flight.largeAdvisoryTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                {t('flight.largeAdvisoryDesc', { area: advisoryAreaKm2?.toFixed(2) || '?' })}
              </p>
              <p className="text-sm text-muted-foreground">
                {t('flight.largeAdvisoryHint')}
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmLargeAdvisory}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {t('flight.publishAnyway')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Advisory Too Large Dialog (>150 km²) */}
      <AlertDialog open={showAdvisoryTooLarge} onOpenChange={setShowAdvisoryTooLarge}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              {t('flight.advisoryTooLargeTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                {t('flight.advisoryTooLargeDesc', { area: advisoryAreaKm2?.toFixed(2) || '?' })}
              </p>
              <p className="text-sm text-muted-foreground">
                {t('flight.advisoryTooLargeHint')}
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowAdvisoryTooLarge(false)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* Checklist Execution Dialog (company-level) */}
      {activeChecklistId && (
        <ChecklistExecutionDialog
          open={!!activeChecklistId}
          onOpenChange={(open) => !open && setActiveChecklistId(null)}
          checklistId={activeChecklistId}
          itemName={checklists.find(c => c.id === activeChecklistId)?.tittel || ''}
          onComplete={handleChecklistComplete}
        />
      )}

      {/* Checklist Execution Dialog (mission-level) */}
      {activeMissionChecklistId && (
        <ChecklistExecutionDialog
          open={!!activeMissionChecklistId}
          onOpenChange={(open) => !open && setActiveMissionChecklistId(null)}
          checklistId={activeMissionChecklistId}
          itemName={missionChecklistTitles[activeMissionChecklistId] || ''}
          onComplete={handleMissionChecklistComplete}
        />
      )}

      {/* Ninox Approval Confirm Dialog */}
      <AlertDialog open={showNinoxConfirm} onOpenChange={setShowNinoxConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-amber-500" />
              Ninox-godkjenning påkrevd
            </AlertDialogTitle>
            <AlertDialogDescription>
              Ditt oppdrag krever godkjenning i Ninox. Bekreft at du har innhentet dette.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (!selectedMissionId || selectedMissionId === 'none') return;
              const { error } = await supabase
                .from('missions')
                .update({ ninox_approved: true } as any)
                .eq('id', selectedMissionId);
              if (!error) {
                setNinoxApproved(true);
                // Update local missions list
                setMissions(prev => prev.map(m => m.id === selectedMissionId ? { ...m, ninox_approved: true } : m));
                toast.success('Ninox-godkjenning bekreftet');
              }
              setShowNinoxConfirm(false);
            }}>
              Bekreft godkjenning
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
