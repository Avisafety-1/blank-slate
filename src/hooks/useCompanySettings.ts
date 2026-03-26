import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface CompanySettings {
  show_all_airspace_warnings: boolean;
}

const defaultSettings: CompanySettings = {
  show_all_airspace_warnings: false,
};

// Simple in-memory cache keyed by companyId
const cache: Record<string, { settings: CompanySettings; ts: number }> = {};
const CACHE_TTL = 60_000; // 1 minute

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

    supabase
      .from("companies")
      .select("show_all_airspace_warnings")
      .eq("id", companyId)
      .single()
      .then(({ data }) => {
        if (data) {
          const s: CompanySettings = {
            show_all_airspace_warnings: (data as any).show_all_airspace_warnings ?? false,
          };
          cache[companyId] = { settings: s, ts: Date.now() };
          setSettings(s);
        }
      });
  }, [companyId]);

  return settings;
}
