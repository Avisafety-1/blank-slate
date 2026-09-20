import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const STALE_MS = 45 * 1000;
const POLL_MS = 10000;
const TICK_MS = 5000;

/** Tikker jevnlig slik at "foreldet" strøm blir rød uten nye databasehendelser. */
function useStaleTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => window.clearInterval(id);
  }, []);
  return tick;
}

/**
 * Hvilke droner sender live video akkurat nå?
 * Lett spørring + én realtime-kanal per selskap.
 */
export function useLiveVideoStreams(companyId?: string | null) {
  const [rows, setRows] = useState<{ drone_id: string; last_seen_at: string }[]>([]);

  useEffect(() => {
    if (!companyId) {
      setRows([]);
      return;
    }
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from("drone_live_streams")
        .select("drone_id, last_seen_at")
        .eq("company_id", companyId)
        .eq("active", true)
        .limit(100);
      if (!cancelled) setRows(data ?? []);
    };

    void load();
    const interval = window.setInterval(load, POLL_MS);

    // Unikt kanalnavn per instans – supabase deduper kanaler på navn, og
    // en gjenbrukt kanal kaster "cannot add callbacks after subscribe()".
    const channel = supabase
      .channel(`live-video-${companyId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "drone_live_streams",
          filter: `company_id=eq.${companyId}`,
        },
        () => void load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  const tick = useStaleTick();

  const liveDroneIds = useMemo(() => {
    const now = Date.now();
    return new Set(
      rows
        .filter((r) => now - new Date(r.last_seen_at).getTime() < STALE_MS)
        .map((r) => r.drone_id),
    );
  }, [rows, tick]);

  return { liveDroneIds, hasLiveVideo: (droneId: string) => liveDroneIds.has(droneId) };
}

/**
 * Som useLiveVideoStreams, men slår opp på en liste drone-ID-er i stedet for
 * selskap. Brukes på dashbordet der aktive flyvninger kan høre til flere
 * selskaper (mor/avdelinger).
 */
export function useLiveVideoByDroneIds(droneIds: string[]) {
  const [rows, setRows] = useState<{ drone_id: string; last_seen_at: string }[]>([]);
  const key = droneIds.slice().sort().join(",");

  useEffect(() => {
    if (!key) {
      setRows([]);
      return;
    }
    let cancelled = false;
    const ids = key.split(",");

    const load = async () => {
      const { data } = await supabase
        .from("drone_live_streams")
        .select("drone_id, last_seen_at")
        .in("drone_id", ids)
        .eq("active", true)
        .limit(200);
      if (!cancelled) setRows(data ?? []);
    };

    void load();
    const interval = window.setInterval(load, POLL_MS);

    const channel = supabase
      .channel(`live-video-drones-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "drone_live_streams",
          filter: `drone_id=in.(${ids.join(",")})`,
        },
        () => void load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [key]);

  const tick = useStaleTick();

  const liveDroneIds = useMemo(() => {
    const now = Date.now();
    return new Set(
      rows
        .filter((r) => now - new Date(r.last_seen_at).getTime() < STALE_MS)
        .map((r) => r.drone_id),
    );
  }, [rows, tick]);

  return { liveDroneIds, hasLiveVideo: (droneId: string) => liveDroneIds.has(droneId) };
}
