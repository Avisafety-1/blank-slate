import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Upload, FileText, AlertTriangle, CheckCircle, Loader2, MapPin, Clock, Battery, Zap, LogIn, LogOut, CloudDownload, ArrowLeft, Plane, Thermometer, Satellite, Mountain, Route, Info, Heart, Ruler, PlusCircle, ChevronDown, BookOpen, User, Wrench, X, RefreshCw } from "lucide-react";
import { AddEquipmentDialog, EquipmentDefaultValues } from "@/components/resources/AddEquipmentDialog";
import { AddDroneDialog, DroneDefaultValues } from "@/components/resources/AddDroneDialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { PendingDjiLogsSection } from "@/components/PendingDjiLogsSection";
import { useTranslation } from "react-i18next";
import { useTerminology } from "@/hooks/useTerminology";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

const parseFlightDate = (raw: string): Date | null => {
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d;
  const m = raw.match(
    /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*T?\s*(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?\s*(AM|PM)?/i
  );
  if (m) {
    const [, month, day, year, hours, mins, secs, , ampm] = m;
    let h = parseInt(hours);
    if (ampm?.toUpperCase() === 'PM' && h < 12) h += 12;
    if (ampm?.toUpperCase() === 'AM' && h === 12) h = 0;
    return new Date(`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}T${String(h).padStart(2,'0')}:${mins}:${secs}Z`);
  }
  return null;
};

// ── Types ──

interface DroneLogEvent {
  type: string;
  message: string;
  t_offset_ms: number | null;
  raw_field: string;
  raw_value: string;
}

interface DroneLogResult {
  positions: Array<{ lat: number; lng: number; alt: number; height: number; timestamp: string }>;
  durationMinutes: number;
  durationMs: number;
  maxSpeed: number;
  minBattery: number;
  batteryReadings: number[];
  startPosition: { lat: number; lng: number } | null;
  endPosition: { lat: number; lng: number } | null;
  totalRows: number;
  sampledPositions: number;
  warnings: Array<{ type: string; message: string; value?: number }>;
  startTime: string | null;
  endTimeUtc: string | null;
  aircraftName: string | null;
  aircraftSN: string | null;
  aircraftSerial: string | null;
  droneType: string | null;
  totalDistance: number | null;
  maxAltitude: number | null;
  detailsMaxSpeed: number | null;
  batteryTemperature: number | null;
  batteryTempMin: number | null;
  batteryMinVoltage: number | null;
  batteryCycles: number | null;
  minGpsSatellites: number | null;
  maxGpsSatellites: number | null;
  batterySN: string | null;
  batteryHealth: number | null;
  batteryFullCapacity: number | null;
  batteryCurrentCapacity: number | null;
  batteryStatus: string | null;
  batteryCellDeviationMax: number | null;
  maxDistance: number | null;
  maxVSpeed: number | null;
  totalTimeSeconds: number | null;
  sha256Hash: string | null;
  guid: string | null;
  rthTriggered: boolean;
  events: DroneLogEvent[];
}

interface MatchedFlightLog {
  id: string;
  flight_date: string;
  flight_duration_minutes: number;
  drone_id: string | null;
  departure_location: string;
  landing_location: string;
  mission_id: string | null;
  missions?: { tittel: string } | null;
}

interface Drone {
  id: string;
  modell: string;
  serienummer: string;
  internal_serial: string | null;
}

interface Personnel {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface EquipmentItem {
  id: string;
  navn: string;
  serienummer: string;
  internal_serial: string | null;
  type: string;
}

interface DjiLog {
  id: string;
  date: string;
  duration: number;
  aircraft: string;
  fileName?: string;
  totalDistance?: number;
  maxHeight?: number;
  url?: string;
}

interface BulkResult {
  fileName: string;
  status: 'pending' | 'processing' | 'done' | 'error' | 'duplicate';
  error?: string;
  droneModel?: string;
  durationMinutes?: number;
}

type Step = 'method' | 'upload' | 'dji-login' | 'dji-logs' | 'result' | 'bulk-result';

interface UploadDroneLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ── Helper: call edge function with JSON ──

async function callDronelogAction(action: string, payload: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const res = await fetch(`https://${projectId}.supabase.co/functions/v1/process-dronelog`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, ...payload }),
  });

  const data = await res.json();
  if (!res.ok) {
    // Attach upstream status info for richer error handling
    const err: any = new Error(data.error || data.message || "Request failed");
    err.upstreamStatus = data.upstreamStatus || res.status;
    err.retryAfter = data.retryAfter;
    err.remaining = data.remaining;
    throw err;
  }
  return data;
}

const getDronelogErrorMessage = (error: any): { message: string; type: 'warning' | 'error' } => {
  const status = error?.upstreamStatus || 0;
  if (status === 429) {
    const remaining = error?.remaining;
    // Only show quota exhausted when API explicitly says remaining = 0
    if (remaining !== null && remaining !== undefined && Number(remaining) === 0) {
      return { message: 'DroneLog API-kvoten er brukt opp for denne måneden. Oppgrader abonnementet eller prøv igjen neste måned.', type: 'warning' };
    }
    // Default: temporary rate limit
    return { message: 'For mange forespørsler akkurat nå. Vent noen sekunder og prøv igjen.', type: 'warning' };
  }
  if (status === 401 || status === 403) {
    return { message: 'Ugyldig eller utløpt DroneLog API-nøkkel. Kontakt administrator.', type: 'error' };
  }
  return { message: error?.message || 'Ukjent feil', type: 'error' };
};

const isApiLimitError = (error: any): boolean => {
  const status = error?.upstreamStatus || 0;
  if (status === 429) return true;
  const msg = (error?.message || '').toLowerCase();
  return msg.includes('limit reached') || msg.includes('429') || msg.includes('api limit') || msg.includes('too many requests');
};

// ── Component ──

export const UploadDroneLogDialog = ({ open, onOpenChange }: UploadDroneLogDialogProps) => {
  const { t } = useTranslation();
  const { user, companyId } = useAuth();
  const terminology = useTerminology();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingLogsRef = useRef<{ refresh: () => void }>(null);

  const [step, setStep] = useState<Step>('method');
  const [file, setFile] = useState<File | null>(null);
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([]);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [selectedDroneId, setSelectedDroneId] = useState("");
  const [drones, setDrones] = useState<Drone[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingLogId, setProcessingLogId] = useState<string | null>(null);
  const [result, setResult] = useState<DroneLogResult | null>(null);
  const [matchedLog, setMatchedLog] = useState<MatchedFlightLog | null>(null);
  const [matchCandidates, setMatchCandidates] = useState<MatchedFlightLog[]>([]);
  const [matchedMissions, setMatchedMissions] = useState<Array<{ id: string; tittel: string; tidspunkt: string; status: string; lokasjon: string }>>([]);
  const [selectedMissionId, setSelectedMissionId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // DJI login state
  const [djiEmail, setDjiEmail] = useState("");
  const [djiPassword, setDjiPassword] = useState("");
  const [djiAccountId, setDjiAccountId] = useState("");
  const [djiLogs, setDjiLogs] = useState<DjiLog[]>([]);
  const [djiHasMore, setDjiHasMore] = useState(false);
  const [isDjiLoading, setIsDjiLoading] = useState(false);
  const [saveCredentials, setSaveCredentials] = useState(false);
  const [enableAutoSync, setEnableAutoSync] = useState(false);
  const [hasSavedCredentials, setHasSavedCredentials] = useState(false);
  const [savedDjiEmail, setSavedDjiEmail] = useState("");
  const [isAutoLoggingIn, setIsAutoLoggingIn] = useState(false);
  const [syncJustTriggered, setSyncJustTriggered] = useState(false);

  // Logbook state
  const [pilotId, setPilotId] = useState("");
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [equipmentList, setEquipmentList] = useState<EquipmentItem[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [logToLogbooks, setLogToLogbooks] = useState(true);
  const [logbookOpen, setLogbookOpen] = useState(true);
  const [warningActions, setWarningActions] = useState<Record<number, { saveToLog: boolean; newStatus: string; targetLogbooks: string[] }>>({});
  const [oldPilotIds, setOldPilotIds] = useState<string[]>([]);
  const [unmatchedBatterySN, setUnmatchedBatterySN] = useState<string | null>(null);
  const [showAddEquipmentDialog, setShowAddEquipmentDialog] = useState(false);
  const [oldEquipmentIds, setOldEquipmentIds] = useState<string[]>([]);
  const [oldDroneId, setOldDroneId] = useState<string | null>(null);
   const [unmatchedDroneSN, setUnmatchedDroneSN] = useState<string | null>(null);
   const [showAddDroneDialog, setShowAddDroneDialog] = useState(false);
   const [linkBatteryToExisting, setLinkBatteryToExisting] = useState(false);
   const [linkDroneToExisting, setLinkDroneToExisting] = useState(false);

  useEffect(() => {
    if (open && companyId) {
      fetchDrones();
      fetchPersonnel();
      fetchEquipment();
      checkSavedCredentials();
      resetState();
    }
  }, [open, companyId]);

  // Auto-set pilot to current user
  useEffect(() => {
    if (user && personnel.length > 0 && !pilotId) {
      const me = personnel.find(p => p.id === user.id);
      if (me) setPilotId(me.id);
    }
  }, [user, personnel]);

  // Initialize warning actions when result changes
  useEffect(() => {
    if (result && result.warnings.length > 0) {
      const initial: Record<number, { saveToLog: boolean; newStatus: string; targetLogbooks: string[] }> = {};
      result.warnings.forEach((w, i) => {
        const isSevere = ['low_battery', 'cell_deviation', 'low_battery_health', 'rth'].includes(w.type);
        const isBatteryRelated = ['low_battery', 'cell_deviation', 'low_battery_health'].includes(w.type);
        // Default targets: battery warnings → selected equipment; others → drone
        const defaultTargets: string[] = [];
        if (isSevere && selectedDroneId && !isBatteryRelated) defaultTargets.push(`drone:${selectedDroneId}`);
        if (isSevere && isBatteryRelated && selectedEquipment.length > 0) {
          selectedEquipment.forEach(eqId => defaultTargets.push(`equipment:${eqId}`));
        } else if (isSevere && selectedDroneId) {
          defaultTargets.push(`drone:${selectedDroneId}`);
        }
        initial[i] = { saveToLog: isSevere, newStatus: isSevere ? 'Gul' : 'Grønn', targetLogbooks: defaultTargets };
      });
      setWarningActions(initial);
    }
  }, [result]);

  // Pre-select equipment and personnel from matched log
  useEffect(() => {
    if (matchedLog?.id && equipmentList.length > 0) {
      fetchMatchedEquipment(matchedLog.id);
    }
    if (matchedLog?.id) {
      fetchMatchedPersonnel(matchedLog.id);
      setOldDroneId(matchedLog.drone_id || null);
    }
  }, [matchedLog, equipmentList]);

  const fetchMatchedEquipment = async (flightLogId: string) => {
    const { data } = await supabase
      .from('flight_log_equipment')
      .select('equipment_id')
      .eq('flight_log_id', flightLogId);
    if (data && data.length > 0) {
      const ids = data.map(d => d.equipment_id);
      setSelectedEquipment(ids);
      setOldEquipmentIds(ids);
    }
  };

  const fetchMatchedPersonnel = async (flightLogId: string) => {
    const { data } = await supabase
      .from('flight_log_personnel')
      .select('profile_id')
      .eq('flight_log_id', flightLogId);
    if (data && data.length > 0) {
      const ids = data.map(d => d.profile_id);
      setOldPilotIds(ids);
      // Pre-select the first pilot if current user isn't already set
      if (!pilotId || !personnel.find(p => p.id === pilotId)) {
        setPilotId(ids[0]);
      }
    }
  };

  const checkSavedCredentials = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('dji_credentials')
      .select('id, dji_email')
      .eq('user_id', user.id)
      .maybeSingle();
    if (data) {
      setHasSavedCredentials(true);
      setSavedDjiEmail(data.dji_email);
    } else {
      setHasSavedCredentials(false);
      setSavedDjiEmail("");
    }
  };

  const handleDjiAutoLogin = async () => {
    setIsAutoLoggingIn(true);
    setIsDjiLoading(true);
    try {
      const data = await callDronelogAction("dji-auto-login", {});
      const accountId = data.result?.djiAccountId || data.result?.id || data.result?.accountId || data.accountId;
      if (!accountId) throw new Error("Auto-innlogging feilet");
      setDjiAccountId(accountId);
      setDjiEmail(data.email || savedDjiEmail);
      await fetchDjiLogs(accountId);
      setStep('dji-logs');
    } catch (error: any) {
      console.error('DJI auto-login error:', error);
      // If auto-login fails, clear saved state and show manual login
      setHasSavedCredentials(false);
      setSavedDjiEmail("");
      toast.error('Auto-innlogging feilet. Logg inn manuelt.');
    } finally {
      setIsAutoLoggingIn(false);
      setIsDjiLoading(false);
    }
  };

  const handleDjiLogout = async () => {
    try {
      await callDronelogAction("dji-delete-credentials", {});
    } catch (e) {
      console.error('Failed to delete credentials:', e);
    }
    setDjiAccountId("");
    setDjiLogs([]);
    setDjiHasMore(false);
    setHasSavedCredentials(false);
    setSavedDjiEmail("");
    setSaveCredentials(false);
    setDjiEmail("");
    setDjiPassword("");
    setStep('dji-login');
    toast.success('Logget ut av DJI');
  };

  const resetState = () => {
    setStep('method');
    setFile(null);
    setBulkFiles([]);
    setBulkResults([]);
    setBulkProgress(0);
    setIsBulkProcessing(false);
    setResult(null);
    setMatchedLog(null);
    setMatchCandidates([]);
    setMatchedMissions([]);
    setSelectedMissionId('');
    setSelectedDroneId("");
    setDjiEmail("");
    setDjiPassword("");
    setDjiAccountId("");
    setDjiLogs([]);
    setDjiHasMore(false);
    setPilotId("");
    setSelectedEquipment([]);
    setOldPilotIds([]);
    setOldEquipmentIds([]);
    setOldDroneId(null);
    setLogToLogbooks(true);
    setWarningActions({});
    setUnmatchedBatterySN(null);
    setShowAddEquipmentDialog(false);
    setUnmatchedDroneSN(null);
    setShowAddDroneDialog(false);
    setLinkBatteryToExisting(false);
    setLinkDroneToExisting(false);
    setSaveCredentials(false);
    setEnableAutoSync(false);
    setIsAutoLoggingIn(false);
    setSyncJustTriggered(false);
  };

  // ── Battery matching helper ──
  const matchBatteryFromResult = (data: DroneLogResult) => {
    if (!data.batterySN) {
      setUnmatchedBatterySN(null);
      return;
    }
    const sn = data.batterySN.trim().toLowerCase();
    const match = equipmentList.find(e => 
      (e.serienummer && e.serienummer.trim().toLowerCase() === sn) ||
      (e.internal_serial && e.internal_serial.trim().toLowerCase() === sn)
    );
    if (match) {
      setSelectedEquipment(prev => prev.includes(match.id) ? prev : [...prev, match.id]);
      toast.info(`Batteri matchet automatisk: ${match.navn}`);
      setUnmatchedBatterySN(null);
    } else {
      setUnmatchedBatterySN(data.batterySN);
    }
  };

  // ── Drone matching helper ──
  const matchDroneFromResult = (data: DroneLogResult) => {
    if (!data.aircraftSN && !data.aircraftSerial) {
      setUnmatchedDroneSN(null);
      return;
    }
    const sn = (data.aircraftSN || data.aircraftSerial || '').trim().toLowerCase();
    const match = drones.find(d => 
      (d.serienummer && d.serienummer.trim().toLowerCase() === sn) ||
      (d.internal_serial && d.internal_serial.trim().toLowerCase() === sn)
    );
    if (match) {
      setSelectedDroneId(match.id);
      toast.info(`${terminology.vehicle} matchet automatisk: ${match.modell}`);
      setUnmatchedDroneSN(null);
    } else {
      setUnmatchedDroneSN(data.aircraftSN || data.aircraftSerial || null);
    }
  };

  const batteryDefaultValues: EquipmentDefaultValues | undefined = unmatchedBatterySN ? (() => {
    const merknader: string[] = [];
    if (result?.batteryHealth != null) merknader.push(`Helse: ${result.batteryHealth}%`);
    if (result?.batteryFullCapacity != null) merknader.push(`Kapasitet: ${result.batteryFullCapacity} mAh`);
    if (result?.batteryCycles != null) merknader.push(`Sykluser: ${result.batteryCycles}`);
    if (result?.batteryTemperature != null) merknader.push(`Maks temp: ${result.batteryTemperature}°C`);
    return {
      type: 'Batteri',
      serienummer: unmatchedBatterySN,
      internal_serial: unmatchedBatterySN,
      navn: `Batteri ${unmatchedBatterySN}`,
      merknader: merknader.length > 0 ? `Fra DJI-logg: ${merknader.join(', ')}` : undefined,
    };
  })() : undefined;

  const droneDefaultValues: DroneDefaultValues | undefined = unmatchedDroneSN ? {
    modell: result?.aircraftName || result?.droneType || '',
    serienummer: unmatchedDroneSN,
    internal_serial: unmatchedDroneSN,
    merknader: 'Importert fra DJI-logg',
  } : undefined;

  const fetchDrones = async () => {
    const { data } = await supabase
      .from("drones")
      .select("id, modell, serienummer, internal_serial")
      .eq("aktiv", true)
      .order("modell");
    if (data) setDrones(data);
  };

  const fetchPersonnel = async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("company_id", companyId)
      .eq("approved", true)
      .order("full_name");
    if (data) setPersonnel(data);
  };

  const fetchEquipment = async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from("equipment")
      .select("id, navn, serienummer, internal_serial, type")
      .eq("company_id", companyId)
      .eq("aktiv", true)
      .order("navn");
    if (data) setEquipmentList(data);
  };

  // ── File upload flow ──

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const valid = files.filter(f => {
      const ext = f.name.toLowerCase().substring(f.name.lastIndexOf('.'));
      return ['.txt', '.zip'].includes(ext);
    });

    if (valid.length !== files.length) {
      toast.error(t('dronelog.invalidFileType', 'Ugyldig filtype. Bruk TXT eller ZIP (DJI-format).'));
    }

    if (valid.length === 0) return;

    if (valid.length > 10) {
      toast.warning('Maks 10 filer om gangen.');
      const sliced = valid.slice(0, 10);
      setBulkFiles(sliced);
      setFile(sliced[0]);
    } else if (valid.length === 1) {
      setFile(valid[0]);
      setBulkFiles([]);
    } else {
      setBulkFiles(valid);
      setFile(valid[0]); // keep first for fallback
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error(t('errors.generic')); return; }

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/process-dronelog`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || err.details || 'Upload failed');
      }

      const data: DroneLogResult = await response.json();
      console.log('[DroneLog] startTime from API:', data.startTime, '| aircraftSN:', data.aircraftSN, '| aircraftSerial:', data.aircraftSerial);
      setResult(data);
      if (!selectedDroneId) {
        matchDroneFromResult(data);
      }
      matchBatteryFromResult(data);
      await findMatchingFlightLog(data);
      setStep('result');
    } catch (error: any) {
      console.error('DroneLog upload error:', error);
      if (isApiLimitError(error)) {
        const { message, type } = getDronelogErrorMessage(error);
        type === 'warning' ? toast.warning(message, { duration: 8000 }) : toast.error(message, { duration: 8000 });
      } else { toast.error(t('dronelog.uploadError', 'Kunne ikke behandle flyloggen: ') + error.message); }
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Bulk upload flow ──

  const bulkAbortRef = useRef(false);

  const handleBulkUpload = async () => {
    if (bulkFiles.length === 0 || !companyId || !user) return;
    setIsBulkProcessing(true);
    bulkAbortRef.current = false;
    const results: BulkResult[] = bulkFiles.map(f => ({ fileName: f.name, status: 'pending' as const }));
    setBulkResults([...results]);
    setStep('bulk-result');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { toast.error('Ikke autentisert'); setIsBulkProcessing(false); return;  }
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

    // Keep refs to allow background processing after dialog close
    const localCompanyId = companyId;
    const localDrones = [...drones];
    const localEquipment = [...equipmentList];

    for (let i = 0; i < bulkFiles.length; i++) {
      setBulkProgress(i);
      results[i].status = 'processing';
      setBulkResults([...results]);

      try {
        // 1. Upload & parse
        const formData = new FormData();
        formData.append('file', bulkFiles[i]);
        const response = await fetch(`https://${projectId}.supabase.co/functions/v1/process-dronelog`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: formData,
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(err.error || err.details || 'Upload failed');
        }
        const data: DroneLogResult = await response.json();

        // 2. SHA-256 dedup check (pending_dji_logs + flight_logs)
        if (data.sha256Hash) {
          const isDup = await checkDuplicateAll(data.sha256Hash, localCompanyId);
          if (isDup) {
            results[i] = { ...results[i], status: 'duplicate', durationMinutes: data.durationMinutes, droneModel: data.aircraftName || data.droneType || undefined };
            setBulkResults([...results]);
            continue;
          }
        }

        // 3. Auto-match drone
        let droneId: string | null = null;
        let droneModel: string | undefined;
        const sn = (data.aircraftSN || data.aircraftSerial || '').trim().toLowerCase();
        if (sn) {
          const match = localDrones.find(d =>
            d.serienummer.trim().toLowerCase() === sn ||
            (d.internal_serial && d.internal_serial.trim().toLowerCase() === sn)
          );
          if (match) { droneId = match.id; droneModel = match.modell; }
        }

        // 4. Auto-match battery
        let batteryId: string | null = null;
        if (data.batterySN) {
          const bsn = data.batterySN.trim().toLowerCase();
          const bMatch = localEquipment.find(e =>
            (e.serienummer && e.serienummer.trim().toLowerCase() === bsn) ||
            (e.internal_serial && e.internal_serial.trim().toLowerCase() === bsn)
          );
          if (bMatch) batteryId = bMatch.id;
        }

        // 5. Save to pending_dji_logs
        const effectiveDate = data.startTime ? (parseFlightDate(data.startTime) || new Date()) : new Date();

        const { error: insertError } = await supabase
          .from('pending_dji_logs')
          .insert({
            company_id: localCompanyId,
            user_id: user?.id,
            dji_log_id: data.sha256Hash || crypto.randomUUID(),
            aircraft_name: data.aircraftName || data.droneType || null,
            aircraft_sn: data.aircraftSN || data.aircraftSerial || null,
            flight_date: effectiveDate.toISOString(),
            duration_seconds: data.totalTimeSeconds ?? Math.round(data.durationMinutes * 60),
            max_height_m: data.maxAltitude ?? null,
            total_distance_m: data.totalDistance ?? null,
            matched_drone_id: droneId,
            matched_battery_id: batteryId,
            status: 'pending',
            parsed_result: data as any,
          } as any);

        if (insertError) throw new Error(insertError.message);

        results[i] = {
          ...results[i],
          status: 'done',
          droneModel: droneModel || data.aircraftName || data.droneType || undefined,
          durationMinutes: data.durationMinutes,
        };
      } catch (error: any) {
        console.error(`[Bulk] Error processing ${bulkFiles[i].name}:`, error);
        results[i] = { ...results[i], status: 'error', error: error.message || 'Ukjent feil' };
      }
      setBulkResults([...results]);
    }

    setBulkProgress(bulkFiles.length);
    setIsBulkProcessing(false);

    // Refresh pending logs list
    pendingLogsRef.current?.refresh();

    const savedCount = results.filter(r => r.status === 'done').length;
    if (savedCount > 0) toast.success(`${savedCount} av ${bulkFiles.length} logger lagt til behandlingskøen`);
  };

  // Dedup check against both pending_dji_logs and flight_logs
  const checkDuplicateAll = async (sha256: string, cid: string): Promise<boolean> => {
    if (!cid || !sha256) return false;
    // Check flight_logs
    const { data: flData } = await (supabase
      .from('flight_logs')
      .select('id')
      .eq('company_id', cid) as any)
      .eq('dronelog_sha256', sha256)
      .limit(1);
    if (flData && flData.length > 0) return true;
    // Check pending_dji_logs
    const { data: pdData } = await supabase
      .from('pending_dji_logs')
      .select('id')
      .eq('company_id', cid)
      .eq('dji_log_id', sha256)
      .limit(1);
    return !!(pdData && pdData.length > 0);
  };

  const [djiLoginCooldown, setDjiLoginCooldown] = useState(false);
  const [djiImportCooldown, setDjiImportCooldown] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  const handleDjiLogin = async () => {
    if (!djiEmail || !djiPassword || djiLoginCooldown) return;
    setIsDjiLoading(true);
    setDjiLoginCooldown(true);
    setTimeout(() => setDjiLoginCooldown(false), 15000); // 15s cooldown
    try {
      const data = await callDronelogAction("dji-login", { email: djiEmail, password: djiPassword });
      console.log("DJI login response:", JSON.stringify(data));
      const accountId = data.result?.djiAccountId || data.result?.id || data.result?.accountId || data.accountId || (typeof data.result === "string" ? data.result : null);
      if (!accountId) throw new Error("Ingen konto-ID mottatt. API-svar: " + JSON.stringify(data).substring(0, 200));
      setDjiAccountId(accountId);
      
      // Save credentials if checkbox is checked
      if (saveCredentials) {
        try {
          await callDronelogAction("dji-save-credentials", { email: djiEmail, password: djiPassword, accountId });
          setHasSavedCredentials(true);
          setSavedDjiEmail(djiEmail);
          toast.success('DJI-innlogging lagret');
          
          // Enable auto-sync on company if checkbox is checked
          if (enableAutoSync && companyId) {
            try {
              await supabase
                .from("companies")
                .update({ dji_auto_sync_enabled: true })
                .eq("id", companyId);
              toast.success('Automatisk sync aktivert');
            } catch (syncErr) {
              console.error('Failed to enable auto sync:', syncErr);
            }
          }
        } catch (saveErr) {
          console.error('Failed to save DJI credentials:', saveErr);
          toast.warning('Innlogging OK, men kunne ikke lagre legitimasjon');
        }
      }
      
      setDjiPassword("");
      await fetchDjiLogs(accountId);
      setStep('dji-logs');
    } catch (error: any) {
      console.error('DJI login error:', error);
      if (isApiLimitError(error)) {
        const { message, type } = getDronelogErrorMessage(error);
        type === 'warning' ? toast.warning(message, { duration: 8000 }) : toast.error(message, { duration: 8000 });
      } else { toast.error(t('dronelog.djiLoginError', 'DJI-innlogging feilet: ') + error.message); }
    } finally {
      setIsDjiLoading(false);
    }
  };

  const fetchDjiLogs = async (accountId: string, createdAfterId?: number) => {
    setIsDjiLoading(true);
    try {
      const payload: any = { accountId, limit: 20 };
      if (createdAfterId) payload.createdAfterId = createdAfterId;
      const data = await callDronelogAction("dji-list-logs", payload);
      const r = data.result || data;
      const rawLogs = Array.isArray(r) ? r : (r.logs || []);
      const mapped: DjiLog[] = rawLogs.map((l: any) => ({
        id: String(l.id),
        date: l.timestamp ? format(new Date(l.timestamp), 'dd.MM.yyyy HH:mm') : l.date || '',
        _timestamp: l.timestamp || 0,
        duration: l.totalTime ? Math.round(l.totalTime / 1000) : l.duration || 0,
        aircraft: l.aircraftName || l.aircraft || '',
        fileName: l.fileName || '',
        totalDistance: l.totalDistance || 0,
        maxHeight: l.maxHeight || 0,
        url: l.downloadUrl || l.url || '',
      })).sort((a: any, b: any) => b._timestamp - a._timestamp);
      if (createdAfterId) {
        setDjiLogs(prev => [...prev, ...mapped]);
      } else {
        setDjiLogs(mapped);
      }
      setDjiHasMore(rawLogs.length >= 20);
    } catch (error: any) {
      console.error('DJI list logs error:', error);
      if (isApiLimitError(error)) {
        const { message, type } = getDronelogErrorMessage(error);
        type === 'warning' ? toast.warning(message, { duration: 8000 }) : toast.error(message, { duration: 8000 });
      } else { toast.error(t('dronelog.djiListError', 'Kunne ikke hente flylogger: ') + error.message); }
    } finally {
      setIsDjiLoading(false);
    }
  };

  const startImportCooldown = () => {
    setDjiImportCooldown(true);
    setCooldownSeconds(15);
    const interval = setInterval(() => {
      setCooldownSeconds(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setDjiImportCooldown(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSelectDjiLog = async (log: DjiLog) => {
    if (!log.id || !djiAccountId || djiImportCooldown) return;
    setProcessingLogId(log.id);
    setIsProcessing(true);
    try {
      const data: DroneLogResult = await callDronelogAction("dji-process-log", { accountId: djiAccountId, logId: log.id, downloadUrl: log.url || undefined });
      console.log('[DroneLog] DJI startTime:', data.startTime, '| aircraftSN:', data.aircraftSN, '| aircraftSerial:', data.aircraftSerial);
      setResult(data);
      if (!selectedDroneId) {
        matchDroneFromResult(data);
      }
      matchBatteryFromResult(data);
      await findMatchingFlightLog(data);
      setStep('result');
    } catch (error: any) {
      console.error('DJI process log error:', error);
      if (isApiLimitError(error)) {
        startImportCooldown();
        const { message, type } = getDronelogErrorMessage(error);
        type === 'warning' ? toast.warning(`${message} Vent 15s...`, { duration: 8000 }) : toast.error(message, { duration: 8000 });
      } else { toast.error(t('dronelog.processError', 'Kunne ikke behandle flyloggen: ') + error.message); }
    } finally {
      setIsProcessing(false);
      setProcessingLogId(null);
    }
  };

  // ── Pending DJI log handler ──

  const handleSelectPendingLog = async (pendingLog: any) => {
    let parsed = pendingLog.parsed_result;

    // On-demand parsing: if no parsed_result, fetch and parse via edge function
    if (!parsed) {
      setProcessingLogId(pendingLog.id);
      setIsProcessing(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Not authenticated");

        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const res = await fetch(`https://${projectId}.supabase.co/functions/v1/dji-process-single`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ pending_log_id: pendingLog.id }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Kunne ikke hente flydata");
        }

        if (data.already_imported) {
          toast.info("Denne loggen er allerede importert.");
          // Refresh the pending logs list
          pendingLogsRef.current?.refresh();
          setIsProcessing(false);
          setProcessingLogId(null);
          return;
        }

        parsed = data.parsed_result;
        // Update local pendingLog reference for matched IDs
        pendingLog.matched_drone_id = data.matched_drone_id || null;
        pendingLog.matched_battery_id = data.matched_battery_id || null;
        pendingLog.parsed_result = parsed;
      } catch (error: any) {
        console.error("On-demand parse error:", error);
        toast.error(error.message || "Feil ved henting av flydata");
        setIsProcessing(false);
        setProcessingLogId(null);
        return;
      }
      setIsProcessing(false);
      setProcessingLogId(null);
    }

    if (!parsed) {
      toast.error("Denne loggen mangler data og kan ikke importeres.");
      return;
    }
    // Map parsed_result to DroneLogResult shape
    const data: DroneLogResult = {
      positions: parsed.positions || [],
      durationMinutes: parsed.durationMinutes || Math.round((parsed.durationSeconds || 0) / 60),
      durationMs: (parsed.durationSeconds || 0) * 1000,
      maxSpeed: parsed.maxSpeed || 0,
      minBattery: parsed.minBattery ?? -1,
      batteryReadings: [],
      startPosition: parsed.startPosition || null,
      endPosition: parsed.endPosition || null,
      totalRows: parsed.totalRows || 0,
      sampledPositions: parsed.positions?.length || 0,
      warnings: parsed.warnings || [],
      startTime: parsed.startTime || pendingLog.flight_date,
      endTimeUtc: parsed.endTimeUtc || null,
      aircraftName: parsed.aircraftName || pendingLog.aircraft_name,
      aircraftSN: parsed.aircraftSN || pendingLog.aircraft_sn,
      aircraftSerial: parsed.aircraftSerial || parsed.aircraftSN || pendingLog.aircraft_sn,
      droneType: parsed.droneType || null,
      totalDistance: parsed.totalDistance || pendingLog.total_distance_m,
      maxAltitude: parsed.maxAltitude || pendingLog.max_height_m,
      detailsMaxSpeed: parsed.detailsMaxSpeed || null,
      batteryTemperature: parsed.batteryTemperature || null,
      batteryTempMin: parsed.batteryTempMin || null,
      batteryMinVoltage: parsed.batteryMinVoltage || null,
      batteryCycles: parsed.batteryCycles || null,
      minGpsSatellites: parsed.minGpsSatellites || null,
      maxGpsSatellites: parsed.maxGpsSatellites || null,
      batterySN: parsed.batterySN || null,
      batteryHealth: parsed.batteryHealth || null,
      batteryFullCapacity: parsed.batteryFullCapacity || null,
      batteryCurrentCapacity: parsed.batteryCurrentCapacity || null,
      batteryStatus: parsed.batteryStatus || null,
      batteryCellDeviationMax: parsed.batteryCellDeviationMax || null,
      maxDistance: parsed.maxDistance || null,
      maxVSpeed: parsed.maxVSpeed || null,
      totalTimeSeconds: parsed.durationSeconds || null,
      sha256Hash: parsed.sha256Hash || null,
      guid: parsed.guid || null,
      rthTriggered: parsed.rthTriggered || false,
      events: parsed.events || [],
    };
    setResult(data);
    
    // Auto-match drone
    if (pendingLog.matched_drone_id) {
      setSelectedDroneId(pendingLog.matched_drone_id);
    } else {
      matchDroneFromResult(data);
    }
    matchBatteryFromResult(data);
    await findMatchingFlightLog(data);
    setStep('result');
    
    // Mark the pending log as processing (will be marked approved on save)
    // Store the pending log id for later update
    (window as any).__pendingDjiLogId = pendingLog.id;
  };

  // ── Shared logic ──

  const findMatchingFlightLog = async (data: DroneLogResult) => {
    if (!companyId) return;

    // Early SHA-256 duplicate check — catches orphaned flight_logs too
    if (data.sha256Hash) {
      const { data: dupMatch } = await (supabase
        .from('flight_logs')
        .select('id, flight_date, flight_duration_minutes, drone_id, mission_id, missions(tittel, tidspunkt)')
        .eq('company_id', companyId) as any)
        .eq('dronelog_sha256', data.sha256Hash)
        .limit(1)
        .maybeSingle();
      if (dupMatch) {
        // If the duplicate belongs to a mission, fetch all logs for that mission
        // and let user choose, rather than returning early
        if (dupMatch.mission_id) {
          const { data: missionData } = await supabase
            .from('missions')
            .select('id, tittel, tidspunkt, status, lokasjon')
            .eq('id', dupMatch.mission_id)
            .single();

          if (missionData) {
            setMatchedMissions([missionData]);
            setSelectedMissionId(missionData.id);

            const { data: existingLogs } = await supabase
              .from('flight_logs')
              .select('id, flight_date, flight_duration_minutes, drone_id, departure_location, landing_location, mission_id, drones(modell)')
              .eq('mission_id', dupMatch.mission_id)
              .order('flight_date', { ascending: false });

            if (existingLogs && existingLogs.length > 0) {
              setMatchCandidates(existingLogs as any[]);
              setMatchedLog(dupMatch as any); // Pre-select the duplicate
              toast.info('Flyloggen er allerede importert. Du kan oppdatere den eller velge en annen flytur.');
            } else {
              setMatchedLog(dupMatch as any);
              toast.info('Flyloggen er allerede importert. Du kan oppdatere den eksisterende.');
            }
          } else {
            setMatchedLog(dupMatch as any);
            toast.info('Flyloggen er allerede importert. Du kan oppdatere den eksisterende.');
          }
          return;
        }
        // No mission — just pre-select the duplicate
        setMatchedLog(dupMatch as any);
        toast.info('Flyloggen er allerede importert. Du kan oppdatere den eksisterende.');
        return;
      }
    }

    // Direct mission search: find missions within 1-hour window of the flight
    let flightStart: Date | null = null;
    if (data.startTime) {
      const d = parseFlightDate(data.startTime);
      if (d && !isNaN(d.getTime())) flightStart = d;
    }
    if (!flightStart) return; // Can't match without a timestamp

    const flightEndMs = flightStart.getTime() + (data.durationMinutes || 0) * 60 * 1000;
    const windowMs = 60 * 60 * 1000; // 1 hour
    const rangeStart = new Date(flightStart.getTime() - windowMs).toISOString();
    const rangeEnd = new Date(flightEndMs + windowMs).toISOString();

    console.log('[DroneLog] Searching missions between', rangeStart, 'and', rangeEnd);

    const { data: missions } = await supabase
      .from('missions')
      .select('id, tittel, tidspunkt, status, lokasjon')
      .eq('company_id', companyId)
      .gte('tidspunkt', rangeStart)
      .lte('tidspunkt', rangeEnd)
      .order('tidspunkt', { ascending: true });

    if (missions && missions.length > 0) {
      // Sort by closest to flight start
      const sorted = [...missions].sort((a, b) => {
        const diffA = Math.abs(new Date(a.tidspunkt).getTime() - flightStart!.getTime());
        const diffB = Math.abs(new Date(b.tidspunkt).getTime() - flightStart!.getTime());
        return diffA - diffB;
      });
      console.log('[DroneLog] Found', sorted.length, 'matching missions');
      setMatchedMissions(sorted);
      setSelectedMissionId(sorted[0].id); // Pre-select closest

      // Fetch all existing flight logs for matched missions so user can choose
      const missionIds = sorted.map(m => m.id);
      const { data: existingLogs } = await supabase
        .from('flight_logs')
        .select('id, flight_date, flight_duration_minutes, drone_id, departure_location, landing_location, mission_id, drones(modell)')
        .in('mission_id', missionIds)
        .order('flight_date', { ascending: false });

      if (existingLogs && existingLogs.length > 0) {
        console.log('[DroneLog] Found', existingLogs.length, 'existing flight logs on matched missions');
        setMatchCandidates(existingLogs as any[]);
        // Don't auto-set matchedLog — let user choose
        toast.info('Oppdraget har eksisterende flyturer. Velg om du vil oppdatere en eller legge til ny.');
      }
    }
  };

  const buildExtendedFields = (r: DroneLogResult) => ({
    source: 'dronelogapi' as any,
    dronelog_sha256: r.sha256Hash || null,
    start_time_utc: r.startTime ? (parseFlightDate(r.startTime)?.toISOString() || null) : null,
    end_time_utc: r.endTimeUtc ? (parseFlightDate(r.endTimeUtc)?.toISOString() || null) : null,
    total_distance_m: r.totalDistance || null,
    max_height_m: r.maxAltitude || null,
    max_horiz_speed_ms: r.detailsMaxSpeed || null,
    max_vert_speed_ms: r.maxVSpeed || null,
    drone_model: r.droneType || null,
    aircraft_serial: r.aircraftSerial || r.aircraftSN || null,
    battery_cycles: r.batteryCycles || null,
    battery_temp_min_c: r.batteryTempMin || null,
    battery_temp_max_c: r.batteryTemperature || null,
    battery_voltage_min_v: r.batteryMinVoltage || null,
    gps_sat_min: r.minGpsSatellites || null,
    gps_sat_max: r.maxGpsSatellites || null,
    rth_triggered: r.rthTriggered || false,
    battery_sn: r.batterySN || null,
    battery_health_pct: r.batteryHealth || null,
    max_distance_m: r.maxDistance || null,
    dronelog_warnings: r.warnings.length > 0 ? r.warnings : null,
  });

  // ── Update battery equipment card with latest telemetry ──
  const updateBatteryEquipment = async (r: DroneLogResult) => {
    if (!companyId || selectedEquipment.length === 0) return;
    // Find which selected equipment is a battery
    const batteryEquipment = equipmentList.filter(
      eq => selectedEquipment.includes(eq.id) && isBatteryType(eq.type)
    );
    if (batteryEquipment.length === 0) return;

    for (const bat of batteryEquipment) {
      const updates: Record<string, any> = {};
      if (r.batteryCycles != null) updates.battery_cycles = r.batteryCycles;
      if (r.batteryHealth != null) updates.battery_health_pct = r.batteryHealth;
      if (r.batteryFullCapacity != null) updates.battery_full_capacity_mah = r.batteryFullCapacity;
      if (r.batteryCellDeviationMax != null) {
        // Only update if new value is worse (higher)
        updates.battery_max_cell_deviation_v = r.batteryCellDeviationMax;
      }
      if (Object.keys(updates).length > 0) {
        await supabase.from('equipment').update(updates).eq('id', bat.id);
      }
    }
  };

  // ── Ensure drone↔battery link exists in drone_equipment_history ──
  const ensureDroneEquipmentHistory = async () => {
    if (!companyId || !selectedDroneId || selectedEquipment.length === 0) return;
    const batteryEquipment = equipmentList.filter(
      eq => selectedEquipment.includes(eq.id) && isBatteryType(eq.type)
    );
    if (batteryEquipment.length === 0) return;
    for (const bat of batteryEquipment) {
      try {
        const { data: latest } = await supabase
          .from('drone_equipment_history')
          .select('action')
          .eq('drone_id', selectedDroneId)
          .eq('item_id', bat.id)
          .order('created_at', { ascending: false })
          .limit(1);
        if (latest && latest.length > 0 && latest[0].action === 'added') continue;
        await supabase.from('drone_equipment_history').insert({
          drone_id: selectedDroneId,
          company_id: companyId,
          item_id: bat.id,
          item_type: 'equipment',
          item_name: bat.navn,
          action: 'added',
          user_id: user?.id || null,
        });
      } catch (err) {
        console.error('Failed to ensure drone equipment history:', err);
      }
    }
  };

  const saveFlightEvents = async (flightLogId: string, r: DroneLogResult) => {
    if (!companyId || !r.events || r.events.length === 0) return;
    const rows = r.events.map(e => ({
      flight_log_id: flightLogId,
      company_id: companyId,
      t_offset_ms: e.t_offset_ms,
      type: e.type,
      message: e.message,
      raw_field: e.raw_field,
      raw_value: e.raw_value,
    }));
    const { error } = await supabase.from('flight_events' as any).insert(rows as any);
    if (error) console.error('Failed to save flight events:', error);
  };

  const checkDuplicate = async (sha256: string): Promise<boolean> => {
    if (!companyId || !sha256) return false;
    const { data } = await (supabase
      .from('flight_logs')
      .select('id')
      .eq('company_id', companyId) as any)
      .eq('dronelog_sha256', sha256)
      .limit(1);
    return (data && data.length > 0);
  };

  const saveLogbookEntries = async (flightLogId: string, durationMinutes: number, isUpdate: boolean = false, oldDurationMinutes: number = 0) => {
    if (!logToLogbooks || !companyId || !user) return;

    const diffMinutes = isUpdate ? durationMinutes - oldDurationMinutes : durationMinutes;
    const newDuration = durationMinutes;
    const oldDuration = oldDurationMinutes;

    // ── Helper to adjust flight hours on a resource ──
    const adjustHours = async (table: 'profiles' | 'drones' | 'equipment', id: string, minutesDelta: number) => {
      if (minutesDelta === 0) return;
      const { data: row } = await supabase.from(table).select('flyvetimer').eq('id', id).single();
      if (row) {
        await supabase.from(table).update({
          flyvetimer: Math.max(0, ((row as any).flyvetimer || 0) + minutesDelta / 60.0)
        }).eq('id', id);
      }
    };

    // ── PILOT ──
    if (isUpdate) {
      const oldPilot = oldPilotIds[0] || null;
      const newPilot = pilotId || null;
      const pilotChanged = oldPilot !== newPilot;

      if (pilotChanged) {
        // Remove old pilot from junction & subtract old duration
        if (oldPilot) {
          await supabase.from('flight_log_personnel').delete().eq('flight_log_id', flightLogId).eq('profile_id', oldPilot);
          await adjustHours('profiles', oldPilot, -oldDuration);
        }
        // Add new pilot to junction & add full new duration
        if (newPilot) {
          await supabase.from('flight_log_personnel').insert({ flight_log_id: flightLogId, profile_id: newPilot });
          await adjustHours('profiles', newPilot, newDuration);
        }
      } else if (newPilot && diffMinutes !== 0) {
        // Same pilot, just adjust by diff
        await adjustHours('profiles', newPilot, diffMinutes);
      }
    } else if (pilotId) {
      await supabase.from('flight_log_personnel').insert({ flight_log_id: flightLogId, profile_id: pilotId });
      await adjustHours('profiles', pilotId, newDuration);
    }

    // ── DRONE ──
    if (isUpdate) {
      const droneChanged = oldDroneId !== selectedDroneId;
      if (droneChanged) {
        if (oldDroneId) await adjustHours('drones', oldDroneId, -oldDuration);
        if (selectedDroneId) await adjustHours('drones', selectedDroneId, newDuration);
      } else if (selectedDroneId && diffMinutes !== 0) {
        await adjustHours('drones', selectedDroneId, diffMinutes);
      }
    }
    // For new logs, drone hours are handled by DB trigger trg_update_drone_hours

    // ── EQUIPMENT ──
    if (isUpdate) {
      const removedEq = oldEquipmentIds.filter(id => !selectedEquipment.includes(id));
      const addedEq = selectedEquipment.filter(id => !oldEquipmentIds.includes(id));
      const keptEq = selectedEquipment.filter(id => oldEquipmentIds.includes(id));

      // Removed equipment: delete junction & subtract old duration
      for (const eqId of removedEq) {
        await supabase.from('flight_log_equipment').delete().eq('flight_log_id', flightLogId).eq('equipment_id', eqId);
        await adjustHours('equipment', eqId, -oldDuration);
      }
      // Added equipment: insert junction & add full new duration
      for (const eqId of addedEq) {
        await supabase.from('flight_log_equipment').insert({ flight_log_id: flightLogId, equipment_id: eqId });
        await adjustHours('equipment', eqId, newDuration);
      }
      // Kept equipment: adjust by diff only
      for (const eqId of keptEq) {
        if (diffMinutes !== 0) await adjustHours('equipment', eqId, diffMinutes);
      }
    } else {
      for (const eqId of selectedEquipment) {
        await supabase.from('flight_log_equipment').insert({ flight_log_id: flightLogId, equipment_id: eqId });
        // Equipment hours are handled by DB trigger on INSERT
      }
    }
  };

  const handleWarningsWithActions = async (droneId: string, warnings: Array<{ type: string; message: string; value?: number }>) => {
    if (!companyId || !user) return;

    // Derive flight date from result.startTime, fall back to today
    const flightDate = result?.startTime
      ? (parseFlightDate(result.startTime)?.toISOString() ?? new Date().toISOString())
      : new Date().toISOString();

    const statusPriority: Record<string, number> = { 'Grønn': 0, 'Gul': 1, 'Rød': 2 };
    // Track worst status per resource
    const resourceStatuses: Record<string, string> = {};

    for (let i = 0; i < warnings.length; i++) {
      const action = warningActions[i];
      if (!action) continue;

      const warning = warnings[i];
      let title = warning.type === 'low_battery'
        ? t('dronelog.warningLowBattery', 'Lavt batterinivå under flytur')
        : warning.type === 'cell_deviation'
          ? 'Celleavvik registrert på batteri'
          : warning.type === 'low_battery_health'
            ? 'Lav batterihelse registrert'
            : t('dronelog.warningAltitude', 'Advarsel fra flylogg');

      // Save to each selected logbook target
      for (const target of action.targetLogbooks) {
        const [type, id] = target.split(':');
        if (type === 'drone') {
          await supabase.from('drone_log_entries').insert({
            company_id: companyId,
            user_id: user.id,
            drone_id: id,
            entry_date: flightDate,
            entry_type: 'Advarsel',
            title,
            description: warning.message,
          });
        } else if (type === 'equipment') {
          await supabase.from('equipment_log_entries').insert({
            company_id: companyId,
            user_id: user.id,
            equipment_id: id,
            entry_date: flightDate,
            entry_type: 'Advarsel',
            title,
            description: warning.message,
          });
        }

        // Track worst status per resource
        const key = target;
        if (!resourceStatuses[key] || statusPriority[action.newStatus] > statusPriority[resourceStatuses[key]]) {
          resourceStatuses[key] = action.newStatus;
        }
      }
    }

    // Update statuses per resource
    for (const [target, status] of Object.entries(resourceStatuses)) {
      if (status === 'Grønn') continue;
      const [type, id] = target.split(':');
      if (type === 'drone') {
        const { error } = await supabase.from('drones').update({ status }).eq('id', id);
        if (error) {
          console.error('Error updating drone status:', error);
          toast.error(`Kunne ikke oppdatere dronestatus: ${error.message}`);
        }
      } else if (type === 'equipment') {
        const { error } = await supabase.from('equipment').update({ status }).eq('id', id);
        if (error) {
          console.error('Error updating equipment status:', error);
          toast.error(`Kunne ikke oppdatere utstyrsstatus: ${error.message}`);
        }
      }
    }
  };

  const handleUpdateExisting = async () => {
    if (!result || !matchedLog || !companyId || !user) return;
    setIsSubmitting(true);
    try {
      const rawTrack = result.positions.map(p => ({ lat: p.lat, lng: p.lng, alt: p.alt, timestamp: p.timestamp }));
      const maxPts = 200;
      let flightTrack = rawTrack;
      if (rawTrack.length > maxPts) {
        const step = Math.ceil(rawTrack.length / maxPts);
        flightTrack = rawTrack.filter((_, i) => i % step === 0 || i === rawTrack.length - 1);
      }
      await supabase.from('flight_logs').update({
        flight_track: { positions: flightTrack } as any,
        flight_duration_minutes: result.durationMinutes,
        drone_id: selectedDroneId || null,
        ...buildExtendedFields(result),
      } as any).eq('id', matchedLog.id);

      await saveFlightEvents(matchedLog.id, result);
      // Drone flyvetimer is auto-updated by DB trigger trg_update_drone_hours
      if (result.warnings.length > 0 && (selectedDroneId || selectedEquipment.length > 0)) {
        await handleWarningsWithActions(selectedDroneId, result.warnings);
        queryClient.invalidateQueries({ queryKey: ['drones'] });
        queryClient.invalidateQueries({ queryKey: ['equipment'] });
      }
      await saveLogbookEntries(matchedLog.id, result.durationMinutes, true, matchedLog.flight_duration_minutes);
      
      await updateBatteryEquipment(result);
      await ensureDroneEquipmentHistory();
      await markPendingLogApproved(matchedLog.id);
      toast.success(t('dronelog.logUpdated', 'Flylogg oppdatert med DJI-data!'));
      // Return to method step so user can continue processing pending logs
      resetState();
      pendingLogsRef.current?.refresh();
    } catch (error: any) {
      console.error('Update error:', error);
      toast.error(t('dronelog.updateError', 'Kunne ikke oppdatere flyloggen'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateNew = async () => {
    if (!result || !companyId || !user) return;
    setIsSubmitting(true);
    try {
      // SHA-256 dedup is now handled early in findMatchingFlightLog

      const rawTrack = result.positions.map(p => ({ lat: p.lat, lng: p.lng, alt: p.alt, timestamp: p.timestamp }));
      const maxPoints = 200;
      let flightTrack = rawTrack;
      if (rawTrack.length > maxPoints) {
        const step = Math.ceil(rawTrack.length / maxPoints);
        flightTrack = rawTrack.filter((_, i) => i % step === 0 || i === rawTrack.length - 1);
      }
      const effectiveDate = result.startTime ? (parseFlightDate(result.startTime) || new Date()) : new Date();
      const { data: mission, error: missionError } = await supabase.from('missions').insert({
        company_id: companyId, user_id: user.id,
        tittel: `DJI-flylogg ${format(effectiveDate, 'dd.MM.yyyy HH:mm')}`,
        lokasjon: result.startPosition ? `${result.startPosition.lat.toFixed(5)}, ${result.startPosition.lng.toFixed(5)}` : 'Ukjent',
        tidspunkt: effectiveDate.toISOString(), status: 'Fullført', risk_nivå: 'Lav',
        beskrivelse: `Importert fra DJI flylogg. Flytid: ${result.durationMinutes} min, Maks hastighet: ${result.maxSpeed} m/s`,
        latitude: result.startPosition?.lat ?? null,
        longitude: result.startPosition?.lng ?? null,
      }).select('id').single();
      if (missionError) throw missionError;

      if (mission && selectedDroneId) await supabase.from('mission_drones').insert({ mission_id: mission.id, drone_id: selectedDroneId });
      if (mission && pilotId) await supabase.from('mission_personnel').insert({ mission_id: mission.id, profile_id: pilotId });
      if (mission && selectedEquipment.length > 0) await supabase.from('mission_equipment').insert(selectedEquipment.map(eqId => ({ mission_id: mission.id, equipment_id: eqId })));

      const { data: logData, error: logError } = await supabase.from('flight_logs').insert({
        company_id: companyId, user_id: user.id, drone_id: selectedDroneId || null, mission_id: mission?.id || null,
        flight_date: effectiveDate.toISOString(), flight_duration_minutes: result.durationMinutes,
        departure_location: result.startPosition ? `${result.startPosition.lat.toFixed(5)}, ${result.startPosition.lng.toFixed(5)}` : 'Ukjent',
        landing_location: result.endPosition ? `${result.endPosition.lat.toFixed(5)}, ${result.endPosition.lng.toFixed(5)}` : 'Ukjent',
        movements: 1, flight_track: { positions: flightTrack } as any,
        notes: `Importert fra DJI-flylogg. Maks hastighet: ${result.maxSpeed} m/s, Min batteri: ${result.minBattery}%`,
        ...buildExtendedFields(result),
      } as any).select('id').single();
      if (logError) throw logError;

      if (logData) {
        await saveFlightEvents(logData.id, result);
        await saveLogbookEntries(logData.id, result.durationMinutes);
      }
      // Drone flyvetimer is auto-updated by DB trigger trg_update_drone_hours
      if (result.warnings.length > 0 && (selectedDroneId || selectedEquipment.length > 0)) {
        await handleWarningsWithActions(selectedDroneId, result.warnings);
        queryClient.invalidateQueries({ queryKey: ['drones'] });
        queryClient.invalidateQueries({ queryKey: ['equipment'] });
      }

      await updateBatteryEquipment(result);
      await ensureDroneEquipmentHistory();
      await markPendingLogApproved(logData?.id);
      toast.success(t('dronelog.missionCreated', 'Nytt oppdrag opprettet fra DJI-flylogg!'));
      // Return to method step so user can continue processing pending logs
      resetState();
      pendingLogsRef.current?.refresh();
    } catch (error: any) {
      console.error('Create error:', error);
      toast.error(t('dronelog.createError', 'Kunne ikke opprette oppdrag'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Link to existing mission (no new mission created) ──
  const handleLinkToMission = async () => {
    if (!result || !companyId || !user || !selectedMissionId) return;
    setIsSubmitting(true);
    try {
      const rawTrack = result.positions.map(p => ({ lat: p.lat, lng: p.lng, alt: p.alt, timestamp: p.timestamp }));
      const maxPoints = 200;
      let flightTrack = rawTrack;
      if (rawTrack.length > maxPoints) {
        const step = Math.ceil(rawTrack.length / maxPoints);
        flightTrack = rawTrack.filter((_, i) => i % step === 0 || i === rawTrack.length - 1);
      }
      const effectiveDate = result.startTime ? (parseFlightDate(result.startTime) || new Date()) : new Date();

      // Link drone, personnel, equipment to mission
      if (selectedDroneId) {
        await supabase.from('mission_drones').upsert({ mission_id: selectedMissionId, drone_id: selectedDroneId }, { onConflict: 'mission_id,drone_id' });
      }
      if (selectedMissionId && pilotId) {
        await supabase.from('mission_personnel').upsert({ mission_id: selectedMissionId, profile_id: pilotId }, { onConflict: 'mission_id,profile_id' });
      }
      if (selectedMissionId && selectedEquipment.length > 0) {
        await supabase.from('mission_equipment').upsert(selectedEquipment.map(eqId => ({ mission_id: selectedMissionId, equipment_id: eqId })), { onConflict: 'mission_id,equipment_id' });
      }

      const logPayload = {
        company_id: companyId, user_id: user.id, drone_id: selectedDroneId || null, mission_id: selectedMissionId,
        flight_date: effectiveDate.toISOString(), flight_duration_minutes: result.durationMinutes,
        departure_location: result.startPosition ? `${result.startPosition.lat.toFixed(5)}, ${result.startPosition.lng.toFixed(5)}` : 'Ukjent',
        landing_location: result.endPosition ? `${result.endPosition.lat.toFixed(5)}, ${result.endPosition.lng.toFixed(5)}` : 'Ukjent',
        movements: 1, flight_track: { positions: flightTrack } as any,
        notes: `Importert fra DJI-flylogg. Maks hastighet: ${result.maxSpeed} m/s, Min batteri: ${result.minBattery}%`,
        ...buildExtendedFields(result),
      };

      // User chose "add as new flight" — always insert, skip SHA-256 dedup to avoid updating existing log
      const { dronelog_sha256, ...insertPayload } = logPayload as any;
      const { data: inserted, error: logError } = await supabase
        .from('flight_logs')
        .insert(insertPayload as any)
        .select('id')
        .single();
      if (logError) throw logError;
      const logData: { id: string } | null = inserted;

      if (logData) {
        await saveFlightEvents(logData.id, result);
        await saveLogbookEntries(logData.id, result.durationMinutes);
      }
      if (result.warnings.length > 0 && (selectedDroneId || selectedEquipment.length > 0)) {
        await handleWarningsWithActions(selectedDroneId, result.warnings);
        queryClient.invalidateQueries({ queryKey: ['drones'] });
        queryClient.invalidateQueries({ queryKey: ['equipment'] });
      }

      await updateBatteryEquipment(result);
      await ensureDroneEquipmentHistory();
      await markPendingLogApproved(logData?.id);
      const missionName = matchedMissions.find(m => m.id === selectedMissionId)?.tittel || 'oppdrag';
      toast.success(`Flylogg lagret og knyttet til "${missionName}"!`);
      // Return to method step so user can continue processing pending logs
      resetState();
      pendingLogsRef.current?.refresh();
    } catch (error: any) {
      console.error('Link to mission error:', error);
      toast.error('Kunne ikke lagre flyloggen');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Mark pending DJI log as approved after successful save
  const markPendingLogApproved = async (flightLogId?: string) => {
    const pendingId = (window as any).__pendingDjiLogId;
    if (!pendingId) return;
    await supabase
      .from('pending_dji_logs')
      .update({ status: 'approved', processed_flight_log_id: flightLogId || null })
      .eq('id', pendingId);
    delete (window as any).__pendingDjiLogId;
  };

  // updateDroneFlightHours removed — handled by DB trigger trg_update_drone_hours (divides minutes by 60.0)

  // ── Helpers ──

  const selectedPilot = personnel.find(p => p.id === pilotId);
  const selectedDrone = drones.find(d => d.id === selectedDroneId);
  const selectedEqNames = equipmentList.filter(e => selectedEquipment.includes(e.id));

  // ── Render ──

  const backButton = (target: Step) => (
    <Button variant="ghost" size="sm" onClick={() => setStep(target)} className="mb-2">
      <ArrowLeft className="w-4 h-4 mr-1" />
      {t('actions.back')}
    </Button>
  );

  const renderLogbookSection = () => {
    if (!result) return null;
    const duration = result.durationMinutes;
    const isUpdate = !!matchedLog;
    const oldDuration = matchedLog?.flight_duration_minutes ?? 0;
    const diffMinutes = isUpdate ? duration - oldDuration : duration;

    const flightTimeLabelForResource = (resourceType: 'pilot' | 'drone' | 'equipment', resourceId: string) => {
      if (!isUpdate) return <span className="text-muted-foreground">+{duration} min flytid</span>;

      // Determine if this resource is new, kept, or swapped
      let isNew = false;
      if (resourceType === 'pilot') isNew = !oldPilotIds.includes(resourceId);
      else if (resourceType === 'drone') isNew = oldDroneId !== resourceId;
      else if (resourceType === 'equipment') isNew = !oldEquipmentIds.includes(resourceId);

      if (isNew) {
        return <span className="text-green-600 dark:text-green-400">+{duration} min flytid (ny)</span>;
      }
      if (diffMinutes === 0) return <span className="text-muted-foreground">Ingen endring i flytid</span>;
      return <span className={diffMinutes > 0 ? "text-green-600 dark:text-green-400" : "text-orange-600 dark:text-orange-400"}>
        {diffMinutes > 0 ? '+' : ''}{diffMinutes} min flytid
      </span>;
    };

    return (
      <Collapsible open={logbookOpen} onOpenChange={setLogbookOpen}>
        <div className="rounded-lg border border-border">
          <CollapsibleTrigger className="flex items-center justify-between w-full p-3 hover:bg-muted/30 transition-colors rounded-t-lg">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Loggbok-oppdatering</span>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={logToLogbooks}
                onCheckedChange={(checked) => { setLogToLogbooks(checked); }}
                onClick={(e) => e.stopPropagation()}
              />
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${logbookOpen ? 'rotate-180' : ''}`} />
            </div>
          </CollapsibleTrigger>

          <CollapsibleContent>
            {logToLogbooks && (
              <div className="p-3 pt-0 space-y-3 border-t border-border">
                {/* Pilot selector */}
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1"><User className="w-3 h-3" />Pilot</Label>
                  <Select value={pilotId} onValueChange={setPilotId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Velg pilot" />
                    </SelectTrigger>
                    <SelectContent>
                      {personnel.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.full_name || p.email}
                          {p.id === user?.id ? ' (deg)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Drone selector — reuse existing */}
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1"><Plane className="w-3 h-3" />{terminology.vehicle}</Label>
                  <Select value={selectedDroneId} onValueChange={setSelectedDroneId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder={terminology.selectVehicle} />
                    </SelectTrigger>
                    <SelectContent>
                      {drones.map(d => (
                        <SelectItem key={d.id} value={d.id}>{d.modell} ({d.serienummer})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedDroneId && (result.aircraftSN || result.aircraftSerial) && (selectedDrone?.serienummer === (result.aircraftSN || result.aircraftSerial)?.trim() || selectedDrone?.internal_serial === (result.aircraftSN || result.aircraftSerial)?.trim()) && (
                    <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />Auto-matchet via SN
                    </p>
                  )}
                </div>

                {/* Equipment selector */}
                {equipmentList.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1"><Wrench className="w-3 h-3" />Utstyr</Label>
                    {(() => {
                      const availableEquipment = equipmentList.filter(eq => !selectedEquipment.includes(eq.id));
                      return availableEquipment.length > 0 ? (
                        <Select
                          value=""
                          onValueChange={(val) => {
                            if (val) setSelectedEquipment(prev => [...prev, val]);
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Velg utstyr" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableEquipment.map(eq => (
                              <SelectItem key={eq.id} value={eq.id}>{eq.navn} ({eq.serienummer})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : null;
                    })()}
                    {selectedEquipment.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {selectedEquipment.map(eqId => {
                          const eq = equipmentList.find(e => e.id === eqId);
                          if (!eq) return null;
                          return (
                            <span key={eqId} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                              {eq.navn}
                              <button
                                type="button"
                                onClick={() => setSelectedEquipment(prev => prev.filter(id => id !== eqId))}
                                className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {selectedEquipment.some(eqId => {
                      const eq = equipmentList.find(e => e.id === eqId);
                      return eq && result?.batterySN && eq.serienummer?.trim() === result.batterySN.trim();
                    }) && (
                      <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />Batteri auto-matchet via SN
                      </p>
                    )}
                  </div>
                )}

                {/* Summary */}
                <div className="rounded-md bg-muted/40 p-2 space-y-0.5">
                  <p className="text-xs font-medium text-muted-foreground">Oppsummering</p>
                  {selectedPilot && (
                    <p className="text-xs">
                      <User className="w-3 h-3 inline mr-1" />
                      {selectedPilot.full_name || selectedPilot.email} {flightTimeLabelForResource('pilot', pilotId)}
                    </p>
                  )}
                  {selectedDrone && (
                    <p className="text-xs">
                      <Plane className="w-3 h-3 inline mr-1" />
                      {selectedDrone.modell} {flightTimeLabelForResource('drone', selectedDroneId)}
                    </p>
                  )}
                  {selectedEqNames.length > 0 && selectedEqNames.map(eq => (
                    <p key={eq.id} className="text-xs">
                      <Wrench className="w-3 h-3 inline mr-1" />
                      {eq.navn} {flightTimeLabelForResource('equipment', eq.id)}
                    </p>
                  ))}
                  {!selectedPilot && !selectedDrone && selectedEqNames.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">Ingen ressurser valgt</p>
                  )}
                </div>
              </div>
            )}
          </CollapsibleContent>
        </div>
      </Collapsible>
    );
  };

  const renderWarningActions = (warnings: Array<{ type: string; message: string; value?: number }>) => {
    if (warnings.length === 0 || (!selectedDroneId && selectedEquipment.length === 0)) return null;

    return (
      <div className="space-y-2">
        {warnings.map((w, i) => {
          const action = warningActions[i] || { saveToLog: false, newStatus: 'Grønn', targetLogbooks: [] };
          // Build available logbook targets
          const availableTargets: Array<{ key: string; label: string; icon: React.ReactNode }> = [];
          if (selectedDroneId) {
            const drone = drones.find(d => d.id === selectedDroneId);
            availableTargets.push({ key: `drone:${selectedDroneId}`, label: `${terminology.vehicle}: ${drone?.modell || ''}`, icon: <Plane className="w-3 h-3" /> });
          }
          selectedEquipment.forEach(eqId => {
            const eq = equipmentList.find(e => e.id === eqId);
            if (eq) availableTargets.push({ key: `equipment:${eqId}`, label: `${eq.type}: ${eq.navn}`, icon: <Wrench className="w-3 h-3" /> });
          });

          return (
            <div key={i} className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">{w.message}</p>
              </div>
              
              {availableTargets.length > 0 && (
                <div className="ml-6 space-y-1.5">
                  <p className="text-xs text-muted-foreground font-medium">Lagre i loggbok:</p>
                  {availableTargets.map(target => {
                    const isChecked = action.targetLogbooks.includes(target.key);
                    return (
                      <label key={target.key} className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={(checked) => {
                            const newTargets = checked
                              ? [...action.targetLogbooks, target.key]
                              : action.targetLogbooks.filter(t => t !== target.key);
                            const newSaveToLog = newTargets.length > 0;
                            setWarningActions(prev => ({
                              ...prev,
                              [i]: { ...action, targetLogbooks: newTargets, saveToLog: newSaveToLog }
                            }));
                          }}
                        />
                        <span className="flex items-center gap-1">{target.icon} {target.label}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center gap-1.5 text-xs ml-6">
                <span>Status:</span>
                <Select
                  value={action.newStatus}
                  onValueChange={(val) => {
                    setWarningActions(prev => ({ ...prev, [i]: { ...action, newStatus: val } }));
                  }}
                >
                  <SelectTrigger className="h-6 w-24 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Grønn">🟢 Grønn</SelectItem>
                    <SelectItem value="Gul">🟡 Gul</SelectItem>
                    <SelectItem value="Rød">🔴 Rød</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
        if (!newOpen && isBulkProcessing) {
          toast.info('Prosessering fortsetter i bakgrunnen. Filene dukker opp i «Logger til behandling» når de er klare.');
        }
        if (newOpen && !open) {
          pendingLogsRef.current?.refresh();
        }
        onOpenChange(newOpen);
      }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            {t('dronelog.title', 'Last opp DJI-flylogg')}
          </DialogTitle>
        </DialogHeader>

        {/* ── Step: Method selection ── */}
         {step === 'method' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('dronelog.chooseMethod', 'Velg hvordan du vil importere flyloggen:')}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setStep('upload')}
                className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-muted hover:border-primary/50 hover:bg-muted/50 transition-all text-center"
              >
                <Upload className="w-8 h-8 text-primary" />
                <div>
                  <p className="font-medium text-sm">{t('dronelog.uploadFile', 'Last opp fil')}</p>
                  <p className="text-xs text-muted-foreground mt-1">TXT / ZIP</p>
                </div>
              </button>
              <button
                onClick={() => {
                  if (hasSavedCredentials) {
                    setStep('dji-login');
                    // Trigger auto-login
                    setTimeout(() => handleDjiAutoLogin(), 100);
                  } else {
                    setStep('dji-login');
                  }
                }}
                className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-muted hover:border-primary/50 hover:bg-muted/50 transition-all text-center relative"
              >
                <CloudDownload className="w-8 h-8 text-primary" />
                <div>
                  <p className="font-medium text-sm">{t('dronelog.djiAccount', 'DJI-konto')}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {hasSavedCredentials ? savedDjiEmail : t('dronelog.djiAccountDesc', 'Hent fra skyen')}
                  </p>
                </div>
                {hasSavedCredentials && (
                  <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary" title="Innlogget" />
                )}
              </button>
            </div>

            {/* Sync now button */}
            {hasSavedCredentials && (
              <Button
                variant="outline"
                className="w-full"
                disabled={(window as any).__djiSyncing}
                onClick={async () => {
                  if ((window as any).__djiSyncing) return;
                  (window as any).__djiSyncing = true;
                   try {
                    toast.info('Starter synkronisering...');
                    const { data, error } = await supabase.functions.invoke('dji-auto-sync', {
                      body: { companyId },
                    });
                    if (error) throw error;
                    const companyDetails = data?.companies?.[0]?.details || '';
                    const isRateLimited = data?.rate_limited || companyDetails.toLowerCase().includes('rate limit');
                    const isLoginError = companyDetails.toLowerCase().includes('login failed') || 
                      (data?.errors > 0 && data?.synced === 0 && companyDetails.toLowerCase().includes('login'));
                    
                    if (isRateLimited) {
                      toast.warning('For mange påloggingsforsøk mot DJI. Vent noen minutter og prøv igjen.');
                    } else if (isLoginError || (data?.errors > 0 && data?.synced === 0)) {
                      const detail = companyDetails || `${data.errors} feil oppsto`;
                      toast.error(`Sync feilet: ${detail}`);
                    } else {
                      toast.success(`Sync fullført: ${data?.synced || 0} nye logger hentet${data?.errors ? `, ${data.errors} feil` : ''}`);
                    }
                    setSyncJustTriggered(true);
                  } catch (err: any) {
                    console.error('Manual sync error:', err);
                    toast.error('Sync feilet: ' + (err.message || 'Ukjent feil'));
                    setSyncJustTriggered(true);
                  } finally {
                    // Always refresh pending logs list (even after errors)
                    pendingLogsRef.current?.refresh();
                    // Cooldown 15s
                    setTimeout(() => { (window as any).__djiSyncing = false; }, 15000);
                  }
                }}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Sync nå
              </Button>
            )}

            {/* Post-sync feedback */}
            {syncJustTriggered && (
              <div className="flex flex-col items-center gap-3 py-4 px-3 rounded-xl border border-primary/20 bg-primary/5 animate-in fade-in-0 slide-in-from-bottom-2">
                <div className="relative">
                  <Plane className="w-8 h-8 text-primary animate-bounce" />
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                  </span>
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-semibold">Synkronisering startet! 🚀</p>
                  <p className="text-xs text-muted-foreground">Loggene hentes fra DJI-skyen i bakgrunnen. Kom tilbake om noen minutter for å se og behandle dem.</p>
                </div>
              </div>
            )}

            {/* Pending auto-synced logs */}
            <PendingDjiLogsSection ref={pendingLogsRef} onSelectLog={handleSelectPendingLog} />
          </div>
        )}

        {/* ── Step: File upload ── */}
        {step === 'upload' && (
          <div className="space-y-4">
            {backButton('method')}
            <div className="space-y-2">
              <Label>{bulkFiles.length > 1 ? `Velg flylogg-filer (maks 10)` : t('dronelog.selectFile', 'Velg flylogg-fil')}</Label>
              <div
                className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {bulkFiles.length > 1 ? (
                  <div className="space-y-2">
                    <FileText className="w-6 h-6 mx-auto text-primary" />
                    <p className="text-sm font-medium">{bulkFiles.length} filer valgt</p>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {bulkFiles.map((f, i) => (
                        <p key={i} className="text-xs text-muted-foreground">{f.name} ({(f.size / 1024).toFixed(0)} KB)</p>
                      ))}
                    </div>
                  </div>
                ) : file ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="w-5 h-5 text-primary" />
                    <span className="text-sm font-medium">{file.name}</span>
                    <span className="text-xs text-muted-foreground">({(file.size / 1024).toFixed(0)} KB)</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Klikk for å velge filer (TXT eller ZIP, maks 10)</p>
                  </div>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept=".txt,.zip" multiple className="hidden" onChange={handleFileSelect} />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>{t('actions.cancel')}</Button>
              {bulkFiles.length > 1 ? (
                <Button onClick={handleBulkUpload} disabled={isBulkProcessing}>
                  {isBulkProcessing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Behandler...</> : <><Upload className="w-4 h-4 mr-2" />Behandle {bulkFiles.length} filer</>}
                </Button>
              ) : (
                <Button onClick={handleUpload} disabled={!file || isProcessing}>
                  {isProcessing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('common.processing')}</> : <><Upload className="w-4 h-4 mr-2" />{t('dronelog.process', 'Behandle flylogg')}</>}
                </Button>
              )}
            </DialogFooter>
          </div>
        )}

        {/* ── Step: Bulk result ── */}
        {step === 'bulk-result' && (
          <div className="space-y-4">
            {isBulkProcessing && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-sm font-medium">Behandler fil {bulkProgress + 1} av {bulkFiles.length}...</span>
                </div>
              <div className="w-full bg-muted rounded-full h-2">
                  <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${(bulkProgress / bulkFiles.length) * 100}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">Du kan lukke dialogen, kom tilbake om litt for å se resultatene.</p>
              </div>
            )}

            {!isBulkProcessing && (
              <div className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle className="w-4 h-4 text-primary" />
                Ferdig — {bulkResults.filter(r => r.status === 'done').length} lagt til behandling, {bulkResults.filter(r => r.status === 'duplicate').length} duplikater, {bulkResults.filter(r => r.status === 'error').length} feil
              </div>
            )}

            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left p-2 font-medium text-xs">Fil</th>
                    <th className="text-left p-2 font-medium text-xs">{terminology.vehicle}</th>
                    <th className="text-center p-2 font-medium text-xs">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkResults.map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="p-2 text-xs truncate max-w-[120px]" title={r.fileName}>{r.fileName}</td>
                      <td className="p-2 text-xs text-muted-foreground">{r.droneModel || '—'}</td>
                      <td className="p-2 text-center">
                        {r.status === 'pending' && <span className="text-xs text-muted-foreground">Venter</span>}
                        {r.status === 'processing' && <Loader2 className="w-3 h-3 animate-spin mx-auto text-primary" />}
                        {r.status === 'done' && <span className="text-xs text-primary">✅ Til behandling</span>}
                        {r.status === 'duplicate' && <span className="text-xs text-yellow-600 dark:text-yellow-400">⚠️ Duplikat</span>}
                        {r.status === 'error' && (
                          <span className="text-xs text-destructive" title={r.error}>❌ Feil</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <DialogFooter>
              <Button onClick={() => { resetState(); setStep('method'); pendingLogsRef.current?.refresh(); }}>
                Se ventende logger
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Step: DJI Login ── */}
        {step === 'dji-login' && (
          <div className="space-y-4">
            {backButton('method')}

            {/* Auto-logging in state */}
            {isAutoLoggingIn ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Logger inn som {savedDjiEmail}...</p>
              </div>
            ) : hasSavedCredentials ? (
              /* Saved credentials – show status */
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-muted/30 border border-border space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-primary" />
                    <p className="text-sm font-medium">Lagret innlogging</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{savedDjiEmail}</p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleDjiAutoLogin} disabled={isDjiLoading} className="flex-1">
                    {isDjiLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Logger inn...</> : <><LogIn className="w-4 h-4 mr-2" />Logg inn</>}
                  </Button>
                  <Button variant="outline" onClick={handleDjiLogout}>
                    Logg ut
                  </Button>
                </div>
              </div>
            ) : (
              /* Manual login form */
              <>
                <p className="text-sm text-muted-foreground">
                  {t('dronelog.djiLoginDesc', 'Logg inn med din DJI-konto for å hente flylogger fra skyen.')}
                </p>
                <div className="space-y-2">
                  <Label>{t('dronelog.djiEmail', 'DJI e-post')}</Label>
                  <Input type="email" value={djiEmail} onChange={e => setDjiEmail(e.target.value)} placeholder="bruker@eksempel.no" />
                </div>
                <div className="space-y-2">
                  <Label>{t('dronelog.djiPassword', 'DJI passord')}</Label>
                  <Input type="password" value={djiPassword} onChange={e => setDjiPassword(e.target.value)} placeholder="••••••••" />
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={saveCredentials}
                    onCheckedChange={(checked) => setSaveCredentials(checked === true)}
                  />
                  <span className="text-sm">Husk innlogging</span>
                </label>
                {saveCredentials && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={enableAutoSync}
                      onCheckedChange={(checked) => setEnableAutoSync(checked === true)}
                    />
                    <span className="text-sm">Aktiver automatisk sync (daglig kl. 03:00)</span>
                  </label>
                )}
                <p className="text-xs text-muted-foreground -mt-2">
                  Passordet lagres kryptert på serveren. Du kan logge ut når som helst.
                </p>

                <DialogFooter>
                  <Button variant="outline" onClick={() => onOpenChange(false)}>{t('actions.cancel')}</Button>
                  <Button onClick={handleDjiLogin} disabled={!djiEmail || !djiPassword || isDjiLoading}>
                    {isDjiLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('common.processing')}</> : <><LogIn className="w-4 h-4 mr-2" />{t('dronelog.djiLogin', 'Logg inn')}</>}
                  </Button>
                </DialogFooter>
              </>
            )}
          </div>
        )}

        {/* ── Step: DJI Logs list ── */}
        {step === 'dji-logs' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              {backButton('dji-login')}
              <Button variant="ghost" size="sm" onClick={handleDjiLogout} className="text-xs text-muted-foreground">
                Logg ut av DJI
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('dronelog.selectLog', 'Velg en flylogg å importere:')}
            </p>

            {isDjiLoading && !isProcessing ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : djiLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                {t('dronelog.noLogs', 'Ingen flylogger funnet i DJI-kontoen.')}
              </p>
            ) : (
              <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                {djiLogs.map(log => (
                  <button
                    key={log.id}
                    onClick={() => handleSelectDjiLog(log)}
                    disabled={processingLogId !== null || djiImportCooldown}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-muted hover:border-primary/50 hover:bg-muted/30 transition-all text-left disabled:opacity-50"
                  >
                    <Plane className="w-5 h-5 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{log.aircraft || log.fileName || 'Ukjent drone'}</p>
                      {log.aircraft && log.fileName && <p className="text-xs text-muted-foreground truncate">{log.fileName}</p>}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{log.date}</span>
                        {log.duration > 0 && <span>{Math.round(log.duration / 60)} min</span>}
                        {(log.maxHeight ?? 0) > 0 && <span><Mountain className="inline w-3 h-3 mr-0.5" />{Math.round(log.maxHeight!)}m</span>}
                        {(log.totalDistance ?? 0) > 0 && <span><Route className="inline w-3 h-3 mr-0.5" />{log.totalDistance! >= 1000 ? `${(log.totalDistance! / 1000).toFixed(1)}km` : `${Math.round(log.totalDistance!)}m`}</span>}
                      </div>
                    </div>
                    {processingLogId === log.id && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                  </button>
                ))}
              </div>
            )}

            {/* Load more */}
            {djiHasMore && (
              <div className="flex justify-center pt-2">
                <Button variant="outline" size="sm" disabled={isDjiLoading} onClick={() => {
                  const lastLog = djiLogs[djiLogs.length - 1];
                  if (lastLog) fetchDjiLogs(djiAccountId, Number(lastLog.id));
                }}>
                  {t('common.loadMore', 'Last inn flere')}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Step: Result ── */}
        {step === 'result' && result && (
          <div className="space-y-4">
            {/* Flight date/time & drone info header */}
            {(result.startTime || result.aircraftName || result.droneType || matchedLog) && (
              <div className="p-3 rounded-lg bg-muted/30 border border-border space-y-1">
                {result.startTime ? (
                  <p className="text-sm font-medium">
                    {(() => {
                      const d = parseFlightDate(result.startTime!);
                      const startStr = d ? format(d, 'dd.MM.yyyy HH:mm') : result.startTime;
                      if (result.endTimeUtc) {
                        const end = parseFlightDate(result.endTimeUtc);
                        if (end) return `${startStr} → ${format(end, 'HH:mm')}`;
                      }
                      return startStr;
                    })()}
                  </p>
                ) : matchedLog ? (
                  <p className="text-sm font-medium">{matchedLog.flight_date}</p>
                ) : null}
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                  {result.aircraftName && <span>{result.aircraftName}</span>}
                  {result.droneType && <span>{result.droneType}</span>}
                  {(result.aircraftSN || result.aircraftSerial) && <span>SN: {result.aircraftSN || result.aircraftSerial}</span>}
                  {result.batterySN && <span>Batteri SN: {result.batterySN}</span>}
                </div>
              </div>
            )}

            {/* Primary KPIs */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="w-3 h-3" />{t('dronelog.flightDuration', 'Flytid')}</div>
                <p className="font-semibold">{result.durationMinutes} min</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground"><Zap className="w-3 h-3" />{t('dronelog.maxSpeed', 'Maks hastighet')}</div>
                <p className="font-semibold">{result.detailsMaxSpeed ?? result.maxSpeed} m/s</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground"><Battery className="w-3 h-3" />{t('dronelog.minBattery', 'Min. batteri')}</div>
                <p className={`font-semibold ${result.minBattery >= 0 && result.minBattery < 20 ? 'text-destructive' : ''}`}>
                  {result.minBattery >= 0 ? `${result.minBattery}%` : 'N/A'}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="w-3 h-3" />{t('dronelog.dataPoints', 'Datapunkter')}</div>
                <p className="font-semibold">{result.totalRows}</p>
              </div>
            </div>

            {/* Extended KPIs */}
            {(result.totalDistance != null || result.maxAltitude != null || result.batteryTemperature != null || result.minGpsSatellites != null) && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {result.totalDistance != null && (
                  <div className="p-2 rounded-lg bg-muted/30 space-y-0.5">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground"><Route className="w-3 h-3" />Distanse</div>
                    <p className="text-sm font-medium">{result.totalDistance >= 1000 ? `${(result.totalDistance / 1000).toFixed(1)} km` : `${result.totalDistance} m`}</p>
                  </div>
                )}
                {result.maxAltitude != null && (
                  <div className="p-2 rounded-lg bg-muted/30 space-y-0.5">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground"><Mountain className="w-3 h-3" />Maks høyde</div>
                    <p className="text-sm font-medium">{result.maxAltitude} m</p>
                  </div>
                )}
                {result.minGpsSatellites != null && (
                  <div className="p-2 rounded-lg bg-muted/30 space-y-0.5">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground"><Satellite className="w-3 h-3" />GPS sat.</div>
                    <p className={`text-sm font-medium ${result.minGpsSatellites < 6 ? 'text-destructive' : ''}`}>
                      {result.minGpsSatellites}{result.maxGpsSatellites != null ? ` – ${result.maxGpsSatellites}` : ''}
                    </p>
                  </div>
                )}
                {result.batteryTemperature != null && (
                  <div className="p-2 rounded-lg bg-muted/30 space-y-0.5">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground"><Thermometer className="w-3 h-3" />Batt. temp</div>
                    <p className={`text-sm font-medium ${result.batteryTemperature > 50 || (result.batteryTempMin != null && result.batteryTempMin < 5) ? 'text-destructive' : ''}`}>
                      {result.batteryTempMin != null ? `${result.batteryTempMin} – ` : ''}{result.batteryTemperature}°C
                    </p>
                  </div>
                )}
                {result.batteryMinVoltage != null && (
                  <div className="p-2 rounded-lg bg-muted/30 space-y-0.5">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground"><Zap className="w-3 h-3" />Min. spenning</div>
                    <p className="text-sm font-medium">{result.batteryMinVoltage} V</p>
                  </div>
                )}
                {result.batteryCycles != null && (
                  <div className="p-2 rounded-lg bg-muted/30 space-y-0.5">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground"><Info className="w-3 h-3" />Ladesykluser</div>
                    <p className="text-sm font-medium">{result.batteryCycles}</p>
                  </div>
                )}
                {result.batteryHealth != null && (
                  <div className="p-2 rounded-lg bg-muted/30 space-y-0.5">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground"><Heart className="w-3 h-3" />Batterihelse</div>
                    <p className={`text-sm font-medium ${result.batteryHealth < 70 ? 'text-destructive' : ''}`}>{result.batteryHealth}%</p>
                  </div>
                )}
                {(result.batteryCurrentCapacity != null || result.batteryFullCapacity != null) && (
                  <div className="p-2 rounded-lg bg-muted/30 space-y-0.5">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground"><Battery className="w-3 h-3" />Kapasitet</div>
                    <p className="text-sm font-medium">
                      {result.batteryCurrentCapacity != null ? `${result.batteryCurrentCapacity}` : '?'}
                      {result.batteryFullCapacity != null ? ` / ${result.batteryFullCapacity} mAh` : ' mAh'}
                    </p>
                  </div>
                )}
                {result.maxDistance != null && (
                  <div className="p-2 rounded-lg bg-muted/30 space-y-0.5">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground"><Ruler className="w-3 h-3" />Maks avstand</div>
                    <p className="text-sm font-medium">{result.maxDistance >= 1000 ? `${(result.maxDistance / 1000).toFixed(1)} km` : `${result.maxDistance} m`}</p>
                  </div>
                )}
                {result.maxVSpeed != null && (
                  <div className="p-2 rounded-lg bg-muted/30 space-y-0.5">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground"><Mountain className="w-3 h-3" />Maks V-fart</div>
                    <p className="text-sm font-medium">{result.maxVSpeed} m/s</p>
                  </div>
                )}
                {result.batteryCellDeviationMax != null && (
                  <div className="p-2 rounded-lg bg-muted/30 space-y-0.5">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground"><Zap className="w-3 h-3" />Celleavvik</div>
                    <p className={`text-sm font-medium ${result.batteryCellDeviationMax > 0.1 ? 'text-destructive' : ''}`}>
                      {result.batteryCellDeviationMax.toFixed(3)} V
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* RTH Alert */}
            {result.rthTriggered && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                <p className="text-sm font-medium text-destructive">
                  Return to Home (RTH) ble utløst under denne flygingen
                </p>
              </div>
            )}

            {/* Warnings with actions */}
            {result.warnings.length > 0 && (
              <>
                {renderWarningActions(result.warnings)}

                {/* Flight Events */}
                {result.events && result.events.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Hendelser under flyging</p>
                    {[...new Map(result.events.map((e: any) => [`${e.type}:${e.message}`, e])).values()].map((ev: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/40 text-xs">
                        {ev.type === 'RTH' && <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />}
                        {ev.type === 'LOW_BATTERY' && <Battery className="w-3 h-3 text-destructive shrink-0" />}
                        {ev.type === 'APP_WARNING' && <Info className="w-3 h-3 text-yellow-600 dark:text-yellow-400 shrink-0" />}
                        {!['RTH', 'LOW_BATTERY', 'APP_WARNING'].includes(ev.type) && <Info className="w-3 h-3 text-muted-foreground shrink-0" />}
                        <span className="font-medium">{ev.type}</span>
                        {ev.message && <span className="text-muted-foreground truncate">{ev.message}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Flight events when no warnings */}
            {result.warnings.length === 0 && result.events && result.events.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Hendelser under flyging</p>
                {[...new Map(result.events.map((e: any) => [`${e.type}:${e.message}`, e])).values()].map((ev: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/40 text-xs">
                    {ev.type === 'RTH' && <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />}
                    {ev.type === 'LOW_BATTERY' && <Battery className="w-3 h-3 text-destructive shrink-0" />}
                    {ev.type === 'APP_WARNING' && <Info className="w-3 h-3 text-yellow-600 dark:text-yellow-400 shrink-0" />}
                    {!['RTH', 'LOW_BATTERY', 'APP_WARNING'].includes(ev.type) && <Info className="w-3 h-3 text-muted-foreground shrink-0" />}
                    <span className="font-medium">{ev.type}</span>
                    {ev.message && <span className="text-muted-foreground truncate">{ev.message}</span>}
                  </div>
                ))}
              </div>
            )}

            {/* Battery create prompt */}
            {unmatchedBatterySN && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 space-y-2">
                <div className="flex items-start gap-2">
                  <Battery className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                      Ukjent batteri: {unmatchedBatterySN}
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                      Batteriet ble ikke funnet i ressursene. Opprett nytt eller knytt til eksisterende.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 ml-6 flex-wrap">
                  <Button size="sm" variant="default" onClick={() => setShowAddEquipmentDialog(true)}>
                    <PlusCircle className="w-3 h-3 mr-1" />
                    Opprett batteri
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setLinkBatteryToExisting(true)}>
                    <Wrench className="w-3 h-3 mr-1" />
                    Knytt til eksisterende
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setUnmatchedBatterySN(null)}>
                    Hopp over
                  </Button>
                </div>
                {linkBatteryToExisting && (
                  <div className="ml-6 mt-2">
                    <Label className="text-xs mb-1 block">Velg eksisterende batteri</Label>
                    <Select onValueChange={async (eqId) => {
                      const { error } = await supabase.from('equipment').update({ internal_serial: unmatchedBatterySN }).eq('id', eqId);
                      if (error) { toast.error('Kunne ikke oppdatere internt serienummer'); return; }
                      setEquipmentList(prev => prev.map(e => e.id === eqId ? { ...e, internal_serial: unmatchedBatterySN } : e));
                      setSelectedEquipment(prev => prev.includes(eqId) ? prev : [...prev, eqId]);
                      const matched = equipmentList.find(e => e.id === eqId);
                      toast.success(`Batteri koblet: ${matched?.navn || eqId}`);
                      setUnmatchedBatterySN(null);
                      setLinkBatteryToExisting(false);
                    }}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Velg batteri..." />
                      </SelectTrigger>
                      <SelectContent>
                        {equipmentList.filter(e => isBatteryType(e.type)).map(e => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.navn} {e.serienummer ? `(${e.serienummer})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {/* AddEquipmentDialog for battery creation */}
            {user && showAddEquipmentDialog && (
              <AddEquipmentDialog
                open={showAddEquipmentDialog}
                onOpenChange={(open) => {
                  setShowAddEquipmentDialog(open);
                }}
                onEquipmentAdded={() => {}}
                userId={user.id}
                defaultValues={batteryDefaultValues}
                onEquipmentCreated={(newEq) => {
                  setEquipmentList(prev => [...prev, { ...newEq, internal_serial: null }]);
                  setSelectedEquipment(prev => [...prev, newEq.id]);
                  setUnmatchedBatterySN(null);
                  setShowAddEquipmentDialog(false);
                }}
              />
            )}

            {/* Drone create prompt */}
            {unmatchedDroneSN && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 space-y-2">
                <div className="flex items-start gap-2">
                  <Plane className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                      Ukjent {terminology.vehicleLower}: {unmatchedDroneSN}
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                      {terminology.vehicle} ble ikke funnet i ressursene. Opprett ny eller knytt til eksisterende.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 ml-6 flex-wrap">
                  <Button size="sm" variant="default" onClick={() => setShowAddDroneDialog(true)}>
                    <PlusCircle className="w-3 h-3 mr-1" />
                    Opprett {terminology.vehicleLower}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setLinkDroneToExisting(true)}>
                    <Wrench className="w-3 h-3 mr-1" />
                    Knytt til eksisterende
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setUnmatchedDroneSN(null)}>
                    Hopp over
                  </Button>
                </div>
                {linkDroneToExisting && (
                  <div className="ml-6 mt-2">
                    <Label className="text-xs mb-1 block">Velg eksisterende {terminology.vehicleLower}</Label>
                    <Select onValueChange={async (droneId) => {
                      const { error } = await supabase.from('drones').update({ internal_serial: unmatchedDroneSN }).eq('id', droneId);
                      if (error) { toast.error('Kunne ikke oppdatere internt serienummer'); return; }
                      setDrones(prev => prev.map(d => d.id === droneId ? { ...d, internal_serial: unmatchedDroneSN } : d));
                      setSelectedDroneId(droneId);
                      const matched = drones.find(d => d.id === droneId);
                      toast.success(`${terminology.vehicle} koblet: ${matched?.modell || droneId}`);
                      setUnmatchedDroneSN(null);
                      setLinkDroneToExisting(false);
                    }}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder={`Velg ${terminology.vehicleLower}...`} />
                      </SelectTrigger>
                      <SelectContent>
                        {drones.map(d => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.modell} {d.serienummer ? `(${d.serienummer})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {/* AddDroneDialog for drone creation */}
            {user && showAddDroneDialog && (
              <AddDroneDialog
                open={showAddDroneDialog}
                onOpenChange={(open) => {
                  setShowAddDroneDialog(open);
                }}
                onDroneAdded={() => {}}
                userId={user.id}
                defaultValues={droneDefaultValues}
                onDroneCreated={(newDrone) => {
                  setDrones(prev => [...prev, { ...newDrone, internal_serial: null }]);
                  setSelectedDroneId(newDrone.id);
                  setUnmatchedDroneSN(null);
                  setShowAddDroneDialog(false);
                }}
              />
            )}

            {/* Logbook section */}
            {renderLogbookSection()}

            {/* Mission candidates from direct mission search */}
            {matchedMissions.length > 0 && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 space-y-3">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  {matchedMissions.length === 1
                    ? 'Et oppdrag matcher tidspunktet for denne flyloggen:'
                    : `${matchedMissions.length} oppdrag matcher tidspunktet. Velg hvilket oppdrag flyloggen tilhører:`}
                </p>
                <RadioGroup value={selectedMissionId} onValueChange={(val) => { setSelectedMissionId(val); setMatchedLog(null); }}>
                  {matchedMissions.map((m) => (
                    <label key={m.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer">
                      <RadioGroupItem value={m.id} />
                      <div className="text-sm">
                        <span className="font-medium">{m.tittel}</span>
                        <span className="text-muted-foreground"> — {format(new Date(m.tidspunkt), 'dd.MM.yyyy HH:mm')}</span>
                        {m.lokasjon && <span className="text-muted-foreground"> — {m.lokasjon}</span>}
                        <span className={`ml-1 text-xs ${m.status === 'Fullført' ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>({m.status})</span>
                      </div>
                    </label>
                  ))}
                  <label className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer border-t border-border mt-1 pt-3">
                    <RadioGroupItem value="__new__" />
                    <div className="flex items-center gap-1 text-sm">
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>{t('dronelog.createMission', 'Opprett nytt oppdrag')}</span>
                    </div>
                  </label>
                </RadioGroup>
              </div>
            )}

            {/* Show existing flight logs for chosen mission */}
            {selectedMissionId && selectedMissionId !== '__new__' && matchCandidates.filter(c => c.mission_id === selectedMissionId).length > 0 && (
              <div className="p-3 rounded-lg bg-accent/30 border border-border">
                <p className="text-sm font-medium mb-2">{t('dronelog.existingFlights', 'Eksisterende flyturer på dette oppdraget:')}</p>
                <RadioGroup
                  value={matchedLog ? matchedLog.id : '__new_flight__'}
                  onValueChange={(val) => {
                    if (val === '__new_flight__') {
                      setMatchedLog(null);
                    } else {
                      const found = matchCandidates.find(c => c.id === val);
                      if (found) setMatchedLog(found);
                    }
                  }}
                >
                  {matchCandidates
                    .filter(c => c.mission_id === selectedMissionId)
                    .map((log) => (
                      <label key={log.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer">
                        <RadioGroupItem value={log.id} />
                        <div className="text-sm">
                          <span className="font-medium">
                            {log.flight_date ? format(new Date(log.flight_date), 'dd.MM.yyyy HH:mm') : 'Ukjent dato'}
                          </span>
                          <span className="text-muted-foreground"> — {log.flight_duration_minutes || 0} min</span>
                          {(log as any).drones?.modell && (
                            <span className="text-muted-foreground"> — {(log as any).drones.modell}</span>
                          )}
                          <span className="ml-1 text-xs text-muted-foreground">(Oppdater)</span>
                        </div>
                      </label>
                    ))}
                  <label className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer border-t border-border mt-1 pt-3">
                    <RadioGroupItem value="__new_flight__" />
                    <div className="flex items-center gap-1 text-sm">
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>{t('dronelog.addNewFlight', 'Legg til som ny flytur')}</span>
                    </div>
                  </label>
                </RadioGroup>
              </div>
            )}

            {matchedLog ? (
              <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-green-800 dark:text-green-300">{t('dronelog.matchFound', 'Eksisterende flylogg valgt for oppdatering')}</p>
                    <p className="text-xs text-green-700 dark:text-green-400">
                      {matchedLog.flight_date ? format(new Date(matchedLog.flight_date), 'dd.MM.yyyy') : 'Ukjent dato'} — {matchedLog.flight_duration_minutes} min
                    </p>
                  </div>
                </div>
              </div>
            ) : matchedMissions.length === 0 ? (
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-800 dark:text-blue-300">{t('dronelog.noMatch', 'Ingen eksisterende oppdrag matcher tidspunktet. Du kan opprette et nytt oppdrag.')}</p>
              </div>
            ) : null}

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => { setStep('method'); setResult(null); setMatchedLog(null); setMatchCandidates([]); setMatchedMissions([]); setSelectedMissionId(''); }}>{t('actions.back')}</Button>
              {matchedLog ? (
                <Button onClick={handleUpdateExisting} disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {t('dronelog.updateExisting', 'Oppdater flylogg')}
                </Button>
              ) : selectedMissionId === '__new__' || matchedMissions.length === 0 ? (
                <Button onClick={handleCreateNew} disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {t('dronelog.createMission', 'Opprett nytt oppdrag')}
                </Button>
              ) : selectedMissionId ? (
                <Button onClick={handleLinkToMission} disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Lagre flylogg
                </Button>
              ) : (
                <Button disabled>Velg et oppdrag ovenfor</Button>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
