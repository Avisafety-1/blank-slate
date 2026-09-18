import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type LiveStatus = 'live' | 'recent' | 'offline';

/** Green: position within this many seconds. */
const LIVE_SEC = 30;
/** Yellow: position within this many seconds. */
const RECENT_SEC = 300;
/** How often we recompute colours locally (no network). */
const TICK_MS = 5000;
/** Fallback refetch when realtime is unavailable / to self-heal. */
const REFETCH_MS = 20000;

interface Options {
  companyId: string | null | undefined;
  enabled?: boolean;
}

/**
 * Tracks which drones are currently streaming live positions (flighthub2_positions).
 * One query + one realtime channel for the whole list — matching by serial number
 * happens in memory, so there is no per-drone lookup.
 */
export function useLiveDroneStatus({ companyId, enabled = true }: Options) {
  // sn -> epoch ms of last position
  const lastSeenRef = useRef<Map<string, number>>(new Map());
  const [tick, setTick] = useState(0);
  const pendingRef = useRef(false);

  const flush = useCallback(() => {
    if (!pendingRef.current) return;
    pendingRef.current = false;
    setTick((t) => t + 1);
  }, []);

  const fetchPositions = useCallback(async () => {
    if (!companyId) return;
    const sinceIso = new Date(Date.now() - RECENT_SEC * 1000).toISOString();
    const { data, error } = await supabase
      .from('flighthub2_positions')
      .select('sn, time_stamp')
      .eq('company_id', companyId)
      .gte('time_stamp', sinceIso)
      .order('time_stamp', { ascending: false })
      .limit(200);
    if (error || !data) return;
    const map = lastSeenRef.current;
    data.forEach((row) => {
      if (!row.sn || !row.time_stamp) return;
      const ts = new Date(row.time_stamp as string).getTime();
      const prev = map.get(row.sn);
      if (!prev || ts > prev) map.set(row.sn, ts);
    });
    pendingRef.current = true;
    flush();
  }, [companyId, flush]);

  useEffect(() => {
    if (!enabled || !companyId) return;

    lastSeenRef.current = new Map();
    void fetchPositions();

    const channel = supabase
      .channel(`live-drone-status-${companyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'flighthub2_positions',
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          const row = (payload.new ?? {}) as { sn?: string | null; time_stamp?: string | null };
          if (!row.sn) return;
          const ts = row.time_stamp ? new Date(row.time_stamp).getTime() : Date.now();
          const prev = lastSeenRef.current.get(row.sn);
          if (!prev || ts > prev) {
            lastSeenRef.current.set(row.sn, ts);
            // Throttled: the interval below turns this into at most one re-render per tick.
            pendingRef.current = true;
          }
        },
      )
      .subscribe();

    const ticker = window.setInterval(() => {
      pendingRef.current = true;
      flush();
    }, TICK_MS);
    const refetcher = window.setInterval(() => {
      void fetchPositions();
    }, REFETCH_MS);

    return () => {
      window.clearInterval(ticker);
      window.clearInterval(refetcher);
      supabase.removeChannel(channel);
    };
  }, [companyId, enabled, fetchPositions, flush]);

  const getLiveStatus = useCallback(
    (serienummer?: string | null, internalSerial?: string | null): LiveStatus => {
      const map = lastSeenRef.current;
      let last: number | undefined;
      for (const sn of [serienummer, internalSerial]) {
        if (!sn) continue;
        const ts = map.get(sn);
        if (ts && (!last || ts > last)) last = ts;
      }
      if (!last) return 'offline';
      const ageSec = (Date.now() - last) / 1000;
      if (ageSec <= LIVE_SEC) return 'live';
      if (ageSec <= RECENT_SEC) return 'recent';
      return 'offline';
    },
    // Recomputed whenever the tick changes so consumers re-render on updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  );

  return useMemo(() => ({ getLiveStatus }), [getLiveStatus]);
}
