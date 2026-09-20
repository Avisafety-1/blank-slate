import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const STALE_MS = 2 * 60 * 1000;

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
    const interval = window.setInterval(load, 30000);

    // Unikt kanalnavn per instans – supabase deduper kanaler på navn, og
    // en gjenbrukt kanal kaster "cannot add callbacks after subscribe()".
    const channel = supabase
      .channel(`live-video-${companyId}-${crypto.randomUUID()}`)
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

  const liveDroneIds = useMemo(() => {
    const now = Date.now();
    return new Set(
      rows
        .filter((r) => now - new Date(r.last_seen_at).getTime() < STALE_MS)
        .map((r) => r.drone_id),
    );
  }, [rows]);

  return { liveDroneIds, hasLiveVideo: (droneId: string) => liveDroneIds.has(droneId) };
}
