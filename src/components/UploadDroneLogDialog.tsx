import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Upload, FileText, AlertTriangle, CheckCircle, Loader2, MapPin, Clock, Battery, Zap, LogIn, CloudDownload, ArrowLeft, Plane, Thermometer, Satellite, Mountain, Route, Info, Heart, Ruler } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTerminology } from "@/hooks/useTerminology";
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
  // Extended fields
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
  // Battery & performance fields
  batterySN: string | null;
  batteryHealth: number | null;
  batteryFullCapacity: number | null;
  batteryCurrentCapacity: number | null;
  batteryStatus: string | null;
  batteryCellDeviationMax: number | null;
  maxDistance: number | null;
  maxVSpeed: number | null;
  totalTimeSeconds: number | null;
  // Dedup & events
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
}

interface DjiLog {
  id: string;
  date: string;
  duration: number;
  aircraft: string;
  url?: string;
}

type Step = 'method' | 'upload' | 'dji-login' | 'dji-logs' | 'result';

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
  if (!res.ok) throw new Error(data.error || data.message || "Request failed");
  return data;
}

// ── Component ──

export const UploadDroneLogDialog = ({ open, onOpenChange }: UploadDroneLogDialogProps) => {
  const { t } = useTranslation();
  const { user, companyId } = useAuth();
  const terminology = useTerminology();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('method');
  const [file, setFile] = useState<File | null>(null);
  const [selectedDroneId, setSelectedDroneId] = useState("");
  const [drones, setDrones] = useState<Drone[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<DroneLogResult | null>(null);
  const [matchedLog, setMatchedLog] = useState<MatchedFlightLog | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // DJI login state
  const [djiEmail, setDjiEmail] = useState("");
  const [djiPassword, setDjiPassword] = useState("");
  const [djiAccountId, setDjiAccountId] = useState("");
  const [djiLogs, setDjiLogs] = useState<DjiLog[]>([]);
  const [djiLogsTotal, setDjiLogsTotal] = useState(0);
  const [djiPage, setDjiPage] = useState(1);
  const [isDjiLoading, setIsDjiLoading] = useState(false);

  useEffect(() => {
    if (open && companyId) {
      fetchDrones();
      resetState();
    }
  }, [open, companyId]);

  const resetState = () => {
    setStep('method');
    setFile(null);
    setResult(null);
    setMatchedLog(null);
    setSelectedDroneId("");
    setDjiEmail("");
    setDjiPassword("");
    setDjiAccountId("");
    setDjiLogs([]);
    setDjiLogsTotal(0);
    setDjiPage(1);
  };

  const fetchDrones = async () => {
    const { data } = await supabase
      .from("drones")
      .select("id, modell, serienummer")
      .eq("aktiv", true)
      .order("modell");
    if (data) setDrones(data);
  };

  // ── File upload flow ──

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      const ext = f.name.toLowerCase().substring(f.name.lastIndexOf('.'));
      if (!['.txt', '.zip'].includes(ext)) {
        toast.error(t('dronelog.invalidFileType', 'Ugyldig filtype. Bruk TXT eller ZIP (DJI-format).'));
        return;
      }
      setFile(f);
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
      // Auto-match drone by serial number
      if (!selectedDroneId && (data.aircraftSN || data.aircraftSerial)) {
        const sn = (data.aircraftSN || data.aircraftSerial || '').trim();
        const match = drones.find(d => d.serienummer && d.serienummer.trim() === sn);
        if (match) {
          setSelectedDroneId(match.id);
          toast.info(`Drone matchet automatisk: ${match.modell}`);
        }
      }
      await findMatchingFlightLog(data);
      setStep('result');
    } catch (error: any) {
      console.error('DroneLog upload error:', error);
      toast.error(t('dronelog.uploadError', 'Kunne ikke behandle flyloggen: ') + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // ── DJI login flow ──

  const handleDjiLogin = async () => {
    if (!djiEmail || !djiPassword) return;
    setIsDjiLoading(true);
    try {
      const data = await callDronelogAction("dji-login", { email: djiEmail, password: djiPassword });
      console.log("DJI login response:", JSON.stringify(data));
      const accountId = data.result?.id || data.result?.accountId || data.accountId || (typeof data.result === "string" ? data.result : null);
      if (!accountId) throw new Error("Ingen konto-ID mottatt. API-svar: " + JSON.stringify(data).substring(0, 200));
      setDjiAccountId(accountId);
      setDjiPassword(""); // clear password from memory
      await fetchDjiLogs(accountId, 1);
      setStep('dji-logs');
    } catch (error: any) {
      console.error('DJI login error:', error);
      toast.error(t('dronelog.djiLoginError', 'DJI-innlogging feilet: ') + error.message);
    } finally {
      setIsDjiLoading(false);
    }
  };

  const fetchDjiLogs = async (accountId: string, page: number) => {
    setIsDjiLoading(true);
    try {
      const data = await callDronelogAction("dji-list-logs", { accountId, page, limit: 20 });
      const r = data.result || data;
      setDjiLogs(r.logs || []);
      setDjiLogsTotal(r.total || 0);
      setDjiPage(page);
    } catch (error: any) {
      console.error('DJI list logs error:', error);
      toast.error(t('dronelog.djiListError', 'Kunne ikke hente flylogger: ') + error.message);
    } finally {
      setIsDjiLoading(false);
    }
  };

  const handleSelectDjiLog = async (log: DjiLog) => {
    if (!log.url && !log.id) return;
    setIsProcessing(true);
    try {
      const data: DroneLogResult = await callDronelogAction("dji-process-log", { url: log.url || log.id });
      console.log('[DroneLog] DJI startTime:', data.startTime, '| aircraftSN:', data.aircraftSN, '| aircraftSerial:', data.aircraftSerial);
      setResult(data);
      // Auto-match drone by serial number
      if (!selectedDroneId && (data.aircraftSN || data.aircraftSerial)) {
        const sn = (data.aircraftSN || data.aircraftSerial || '').trim();
        const match = drones.find(d => d.serienummer && d.serienummer.trim() === sn);
        if (match) {
          setSelectedDroneId(match.id);
          toast.info(`Drone matchet automatisk: ${match.modell}`);
        }
      }
      await findMatchingFlightLog(data);
      setStep('result');
    } catch (error: any) {
      console.error('DJI process log error:', error);
      toast.error(t('dronelog.processError', 'Kunne ikke behandle flyloggen: ') + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Shared logic ──

  const findMatchingFlightLog = async (data: DroneLogResult) => {
    if (!companyId) return;

    // Bestem dato: fra startTime, eller fallback til i dag
    let flightDate: Date | null = null;
    if (data.startTime) {
      const d = new Date(data.startTime);
      if (!isNaN(d.getTime())) flightDate = d;
    }

    const dateStr = flightDate
      ? flightDate.toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    console.log('[DroneLog] Matching: dateStr =', dateStr, '| droneId =', selectedDroneId, '| duration =', data.durationMinutes);

    let query = supabase
      .from('flight_logs')
      .select('id, flight_date, flight_duration_minutes, drone_id, departure_location, landing_location, mission_id, missions(tittel, tidspunkt)')
      .eq('company_id', companyId)
      .eq('flight_date', dateStr)
      .order('flight_date', { ascending: false });
    if (selectedDroneId) query = query.eq('drone_id', selectedDroneId);

    const { data: logs } = await query;
    console.log('[DroneLog] Found', logs?.length || 0, 'flight_logs on', dateStr);
    if (!logs || logs.length === 0) return;

    // 1. Prøv tidsmatch (60 min vindu) hvis vi har startTime
    if (flightDate) {
      for (const log of logs) {
        const missionTime = (log as any).missions?.tidspunkt;
        if (missionTime) {
          const missionDate = new Date(missionTime);
          const diffMs = Math.abs(flightDate.getTime() - missionDate.getTime());
          if (diffMs <= 60 * 60 * 1000) {
            console.log('[DroneLog] Matched by time window:', log.id);
            setMatchedLog(log as any);
            return;
          }
        }
      }
    }

    // 2. Match på drone + lignende varighet (innenfor 2 min)
    if (selectedDroneId && data.durationMinutes > 0) {
      const durationMatch = logs.find(l =>
        l.drone_id === selectedDroneId &&
        Math.abs((l.flight_duration_minutes || 0) - data.durationMinutes) <= 2
      );
      if (durationMatch) {
        console.log('[DroneLog] Matched by drone + duration:', durationMatch.id);
        setMatchedLog(durationMatch as any);
        return;
      }
    }

    // 3. Fallback: kun én logg på datoen
    if (logs.length === 1) {
      console.log('[DroneLog] Matched single log on date:', logs[0].id);
      setMatchedLog(logs[0] as any);
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
        ...buildExtendedFields(result),
      } as any).eq('id', matchedLog.id);

      await saveFlightEvents(matchedLog.id, result);
      if (selectedDroneId) await updateDroneFlightHours(selectedDroneId, result.durationMinutes);
      if (result.warnings.length > 0 && selectedDroneId) await handleWarnings(selectedDroneId, result.warnings);
      
      toast.success(t('dronelog.logUpdated', 'Flylogg oppdatert med DJI-data!'));
      onOpenChange(false);
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
      // Deduplication check
      if (result.sha256Hash) {
        const isDup = await checkDuplicate(result.sha256Hash);
        if (isDup) {
          toast.error('Denne flyloggen er allerede importert (duplikat oppdaget via SHA-256).');
          setIsSubmitting(false);
          return;
        }
      }

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

      const { data: logData, error: logError } = await supabase.from('flight_logs').insert({
        company_id: companyId, user_id: user.id, drone_id: selectedDroneId || null, mission_id: mission?.id || null,
        flight_date: effectiveDate.toISOString().split('T')[0], flight_duration_minutes: result.durationMinutes,
        departure_location: result.startPosition ? `${result.startPosition.lat.toFixed(5)}, ${result.startPosition.lng.toFixed(5)}` : 'Ukjent',
        landing_location: result.endPosition ? `${result.endPosition.lat.toFixed(5)}, ${result.endPosition.lng.toFixed(5)}` : 'Ukjent',
        movements: 1, flight_track: { positions: flightTrack } as any,
        notes: `Importert fra DJI-flylogg. Maks hastighet: ${result.maxSpeed} m/s, Min batteri: ${result.minBattery}%`,
        ...buildExtendedFields(result),
      } as any).select('id').single();
      if (logError) throw logError;

      if (logData) await saveFlightEvents(logData.id, result);
      if (selectedDroneId) await updateDroneFlightHours(selectedDroneId, result.durationMinutes);
      if (result.warnings.length > 0 && selectedDroneId) await handleWarnings(selectedDroneId, result.warnings);

      toast.success(t('dronelog.missionCreated', 'Nytt oppdrag opprettet fra DJI-flylogg!'));
      onOpenChange(false);
    } catch (error: any) {
      console.error('Create error:', error);
      toast.error(t('dronelog.createError', 'Kunne ikke opprette oppdrag'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateDroneFlightHours = async (droneId: string, minutes: number) => {
    const { data: drone } = await supabase.from('drones').select('flyvetimer').eq('id', droneId).single();
    if (drone) await supabase.from('drones').update({ flyvetimer: drone.flyvetimer + minutes / 60 }).eq('id', droneId);
  };


  const handleWarnings = async (droneId: string, warnings: Array<{ type: string; message: string; value?: number }>) => {
    if (!companyId || !user) return;
    await supabase.from('drones').update({ status: 'Gul' }).eq('id', droneId);
    for (const warning of warnings) {
      await supabase.from('drone_log_entries').insert({
        company_id: companyId, user_id: user.id, drone_id: droneId,
        entry_date: new Date().toISOString().split('T')[0], entry_type: 'Advarsel',
        title: warning.type === 'low_battery' ? t('dronelog.warningLowBattery', 'Lavt batterinivå under flytur') : t('dronelog.warningAltitude', 'Uventet høydeendring registrert'),
        description: warning.message,
      });
    }
  };

  // ── Render ──

  const backButton = (target: Step) => (
    <Button variant="ghost" size="sm" onClick={() => setStep(target)} className="mb-2">
      <ArrowLeft className="w-4 h-4 mr-1" />
      {t('actions.back')}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                onClick={() => setStep('dji-login')}
                className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-muted hover:border-primary/50 hover:bg-muted/50 transition-all text-center"
              >
                <CloudDownload className="w-8 h-8 text-primary" />
                <div>
                  <p className="font-medium text-sm">{t('dronelog.djiAccount', 'DJI-konto')}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t('dronelog.djiAccountDesc', 'Hent fra skyen')}</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ── Step: File upload ── */}
        {step === 'upload' && (
          <div className="space-y-4">
            {backButton('method')}
            <div className="space-y-2">
              <Label>{t('dronelog.selectFile', 'Velg flylogg-fil')}</Label>
              <div
                className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {file ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="w-5 h-5 text-primary" />
                    <span className="text-sm font-medium">{file.name}</span>
                    <span className="text-xs text-muted-foreground">({(file.size / 1024).toFixed(0)} KB)</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{t('dronelog.dropOrClick', 'Klikk for å velge fil (TXT eller ZIP)')}</p>
                  </div>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept=".txt,.zip" className="hidden" onChange={handleFileSelect} />
            </div>

            <div className="space-y-2">
              <Label>{terminology.vehicle}</Label>
              <Select value={selectedDroneId} onValueChange={setSelectedDroneId}>
                <SelectTrigger><SelectValue placeholder={terminology.selectVehicle} /></SelectTrigger>
                <SelectContent>
                  {drones.map(d => <SelectItem key={d.id} value={d.id}>{d.modell} ({d.serienummer})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>{t('actions.cancel')}</Button>
              <Button onClick={handleUpload} disabled={!file || isProcessing}>
                {isProcessing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('common.processing')}</> : <><Upload className="w-4 h-4 mr-2" />{t('dronelog.process', 'Behandle flylogg')}</>}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Step: DJI Login ── */}
        {step === 'dji-login' && (
          <div className="space-y-4">
            {backButton('method')}
            <p className="text-sm text-muted-foreground">
              {t('dronelog.djiLoginDesc', 'Logg inn med din DJI-konto for å hente flylogger fra skyen. Legitimasjonen sendes direkte til DJI og lagres ikke.')}
            </p>
            <div className="space-y-2">
              <Label>{t('dronelog.djiEmail', 'DJI e-post')}</Label>
              <Input type="email" value={djiEmail} onChange={e => setDjiEmail(e.target.value)} placeholder="bruker@eksempel.no" />
            </div>
            <div className="space-y-2">
              <Label>{t('dronelog.djiPassword', 'DJI passord')}</Label>
              <Input type="password" value={djiPassword} onChange={e => setDjiPassword(e.target.value)} placeholder="••••••••" />
            </div>

            <div className="space-y-2">
              <Label>{terminology.vehicle} ({t('common.optional', 'valgfritt')})</Label>
              <Select value={selectedDroneId} onValueChange={setSelectedDroneId}>
                <SelectTrigger><SelectValue placeholder={terminology.selectVehicle} /></SelectTrigger>
                <SelectContent>
                  {drones.map(d => <SelectItem key={d.id} value={d.id}>{d.modell} ({d.serienummer})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>{t('actions.cancel')}</Button>
              <Button onClick={handleDjiLogin} disabled={!djiEmail || !djiPassword || isDjiLoading}>
                {isDjiLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('common.processing')}</> : <><LogIn className="w-4 h-4 mr-2" />{t('dronelog.djiLogin', 'Logg inn')}</>}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Step: DJI Logs list ── */}
        {step === 'dji-logs' && (
          <div className="space-y-4">
            {backButton('dji-login')}
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
                    disabled={isProcessing}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-muted hover:border-primary/50 hover:bg-muted/30 transition-all text-left disabled:opacity-50"
                  >
                    <Plane className="w-5 h-5 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{log.aircraft || 'Ukjent drone'}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{log.date}</span>
                        {log.duration > 0 && <span>{Math.round(log.duration / 60)} min</span>}
                      </div>
                    </div>
                    {isProcessing && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                  </button>
                ))}
              </div>
            )}

            {/* Pagination */}
            {djiLogsTotal > 20 && (
              <div className="flex justify-between items-center pt-2">
                <Button variant="outline" size="sm" disabled={djiPage <= 1 || isDjiLoading} onClick={() => fetchDjiLogs(djiAccountId, djiPage - 1)}>
                  {t('common.previous', 'Forrige')}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {t('common.page', 'Side')} {djiPage} / {Math.ceil(djiLogsTotal / 20)}
                </span>
                <Button variant="outline" size="sm" disabled={djiPage >= Math.ceil(djiLogsTotal / 20) || isDjiLoading} onClick={() => fetchDjiLogs(djiAccountId, djiPage + 1)}>
                  {t('common.next', 'Neste')}
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

            {/* Warnings */}
            {result.warnings.length > 0 && (
              <div className="space-y-2">
                {result.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
                    <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">{w.message}</p>
                    </div>
                  </div>
                ))}

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
                {selectedDroneId && (
                  <p className="text-xs text-muted-foreground">
                    {t('dronelog.warningDroneStatus', 'Dronens status settes til gul. Du kan kvittere ut advarselen i dronekortet.')}
                  </p>
                )}
              </div>
            )}

            {matchedLog ? (
              <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-green-800 dark:text-green-300">{t('dronelog.matchFound', 'Eksisterende flylogg funnet!')}</p>
                    <p className="text-xs text-green-700 dark:text-green-400">
                      {matchedLog.flight_date} — {matchedLog.flight_duration_minutes} min
                      {matchedLog.missions ? ` — ${(matchedLog.missions as any).tittel}` : ''}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-800 dark:text-blue-300">{t('dronelog.noMatch', 'Ingen eksisterende flylogg matcher. Du kan opprette et nytt oppdrag.')}</p>
              </div>
            )}

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => { setStep('method'); setResult(null); setMatchedLog(null); }}>{t('actions.back')}</Button>
              {matchedLog ? (
                <Button onClick={handleUpdateExisting} disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {t('dronelog.updateExisting', 'Oppdater flylogg')}
                </Button>
              ) : (
                <Button onClick={handleCreateNew} disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {t('dronelog.createMission', 'Opprett nytt oppdrag')}
                </Button>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
