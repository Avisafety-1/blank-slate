import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type LiveDroneSource = 'dronetag' | 'fh2';

export interface LiveDrone {
  /** Unique key for the list (source + identifier) */
  key: string;
  source: LiveDroneSource;
  /** Resolved drone from the drones table, when we can match it */
  droneId: string | null;
  /** Display name */
  name: string;
  /** Secondary identifier (callsign / serial number) */
  identifier: string | null;
  dronetagDeviceId: string | null;
  lastSeen: string;
  ageSec: number;
  heightM: number | null;
  batteryPct: number | null;
  speedMs: number | null;
}

/** Positions older than this are not considered "live" at all. */
const LIVE_WINDOW_SEC = 300;
/** Green dot threshold. */
export const FRESH_THRESHOLD_SEC = 30;

interface Options {
  companyId: string | null | undefined;
  enabled: boolean;
  dronetagEnabled: boolean;
  fh2Enabled: boolean;
  intervalMs?: number;
}

/**
 * Collects all drones that are currently streaming live positions to AviSafe,
 * from both DroneTag devices and the FlightHub 2 / MQTT pipeline.
 */
export function useLiveDroneSources({
  companyId,
  enabled,
  dronetagEnabled,
  fh2Enabled,
  intervalMs = 5000,
}: Options) {
  const [drones, setDrones] = useState<LiveDrone[]>([]);
  const [loading, setLoading] = useState(false);
  const cancelledRef = useRef(false);

  const fetchDrones = useCallback(async () => {
    if (!companyId) {
      setDrones([]);
      return;
    }

    const sinceIso = new Date(Date.now() - LIVE_WINDOW_SEC * 1000).toISOString();
    const now = Date.now();
    const collected: LiveDrone[] = [];

    try {
      // --- FlightHub 2 / MQTT positions ---
      if (fh2Enabled) {
        const { data: positions } = await supabase
          .from('flighthub2_positions')
          .select('sn, drone_id, time_stamp, height_m, ground_speed_ms, raw')
          .eq('company_id', companyId)
          .gte('time_stamp', sinceIso)
          .order('time_stamp', { ascending: false })
          .limit(400);

        const latestBySn = new Map<string, NonNullable<typeof positions>[number]>();
        (positions ?? []).forEach((p) => {
          if (p.sn && !latestBySn.has(p.sn)) latestBySn.set(p.sn, p);
        });

        if (latestBySn.size > 0) {
          const sns = Array.from(latestBySn.keys());
          // Match on either the external serial number or the internal one
          const droneSelect = 'id, modell, registration_number, serienummer, internal_serial';
          const [serialRes, internalRes] = await Promise.all([
            supabase
              .from('drones')
              .select(droneSelect)
              .eq('company_id', companyId)
              .in('serienummer', sns),
            supabase
              .from('drones')
              .select(droneSelect)
              .eq('company_id', companyId)
              .in('internal_serial', sns),
          ]);

          const bySerial = new Map<string, NonNullable<typeof serialRes.data>[number]>();
          [...(serialRes.data ?? []), ...(internalRes.data ?? [])].forEach((d) => {
            if (d.serienummer && !bySerial.has(d.serienummer)) bySerial.set(d.serienummer, d);
            if (d.internal_serial && !bySerial.has(d.internal_serial)) bySerial.set(d.internal_serial, d);
          });

          latestBySn.forEach((p, sn) => {
            const drone = bySerial.get(sn);
            const raw = (p.raw ?? {}) as Record<string, any>;
            const battery =
              typeof raw?.data?.battery?.capacity_percent === 'number'
                ? raw.data.battery.capacity_percent
                : typeof raw?.data?.capacity_percent === 'number'
                  ? raw.data.capacity_percent
                  : null;
            collected.push({
              key: `fh2:${sn}`,
              source: 'fh2',
              droneId: (p.drone_id as string | null) ?? drone?.id ?? null,
              name: drone?.registration_number || drone?.modell || sn,
              identifier: sn,
              dronetagDeviceId: null,
              lastSeen: p.time_stamp as string,
              ageSec: Math.max(0, Math.round((now - new Date(p.time_stamp as string).getTime()) / 1000)),
              heightM: (p.height_m as number | null) ?? null,
              batteryPct: battery,
              speedMs: (p.ground_speed_ms as number | null) ?? null,
            });
          });
        }
      }

      // --- DroneTag devices ---
      if (dronetagEnabled) {
        const { data: devices } = await supabase
          .from('dronetag_devices')
          .select('id, device_id, name, callsign, drone_id')
          .eq('company_id', companyId);

        if (devices && devices.length > 0) {
          const { data: positions } = await supabase
            .from('dronetag_positions')
            .select('device_id, timestamp, alt_agl, alt_msl, battery, speed')
            .eq('company_id', companyId)
            .gte('timestamp', sinceIso)
            .order('timestamp', { ascending: false })
            .limit(400);

          const latestByDevice = new Map<string, NonNullable<typeof positions>[number]>();
          (positions ?? []).forEach((p) => {
            if (p.device_id && !latestByDevice.has(p.device_id)) latestByDevice.set(p.device_id, p);
          });

          devices.forEach((device) => {
            const pos = device.device_id ? latestByDevice.get(device.device_id) : undefined;
            if (!pos) return;
            collected.push({
              key: `dronetag:${device.id}`,
              source: 'dronetag',
              droneId: device.drone_id ?? null,
              name: device.name || device.callsign || 'DroneTag',
              identifier: device.callsign ?? device.device_id ?? null,
              dronetagDeviceId: device.id,
              lastSeen: pos.timestamp as string,
              ageSec: Math.max(0, Math.round((now - new Date(pos.timestamp as string).getTime()) / 1000)),
              heightM: (pos.alt_agl as number | null) ?? (pos.alt_msl as number | null) ?? null,
              batteryPct: (pos.battery as number | null) ?? null,
              speedMs: (pos.speed as number | null) ?? null,
            });
          });
        }
      }

      if (cancelledRef.current) return;
      collected.sort((a, b) => a.ageSec - b.ageSec);
      setDrones(collected);
    } catch (err) {
      console.error('useLiveDroneSources failed:', err);
      if (!cancelledRef.current) setDrones([]);
    }
  }, [companyId, dronetagEnabled, fh2Enabled]);

  useEffect(() => {
    cancelledRef.current = false;
    if (!enabled || !companyId) {
      setDrones([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchDrones().finally(() => {
      if (!cancelledRef.current) setLoading(false);
    });
    const interval = setInterval(fetchDrones, intervalMs);

    return () => {
      cancelledRef.current = true;
      clearInterval(interval);
    };
  }, [enabled, companyId, fetchDrones, intervalMs]);

  return { liveDrones: drones, loading, refresh: fetchDrones };
}
