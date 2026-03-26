import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface CompanySettings {
  show_all_airspace_warnings: boolean;
  hide_reporter_identity: boolean;
  require_mission_approval: boolean;
}

const defaultSettings: CompanySettings = {
  show_all_airspace_warnings: false,
  hide_reporter_identity: false,
  require_mission_approval: false,
};

// Simple in-memory cache keyed by companyId
const cache: Record<string, { settings: CompanySettings; ts: number }> = {};
const CACHE_TTL = 30_000; // 30 seconds

export function invalidateCompanySettingsCache() {
  for (const key of Object.keys(cache)) {
    delete cache[key];
  }
}

export function useCompanySettings() {
  const { companyId } = useAuth();
  const [settings, setSettings] = useState<CompanySettings>(defaultSettings);

  useEffect(() => {
    if (!companyId) return;

    const cached = cache[companyId];
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      setSettings(cached.settings);
      return;
    }

    (supabase
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .single() as any)
      .then(({ data }: any) => {
        if (data) {
          const s: CompanySettings = {
            show_all_airspace_warnings: data.show_all_airspace_warnings ?? false,
            hide_reporter_identity: data.hide_reporter_identity ?? false,
          };
          cache[companyId] = { settings: s, ts: Date.now() };
          setSettings(s);
        }
      });
  }, [companyId]);

  return settings;
}
