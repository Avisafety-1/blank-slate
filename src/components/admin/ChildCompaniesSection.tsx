import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invalidateCompanySettingsCache } from "@/hooks/useCompanySettings";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CompanyManagementDialog } from "./CompanyManagementDialog";
import { Plus, Pencil, Building2, Settings, Hash, ChevronDown, ChevronUp, Trash2, UserCog, Info, X, Bell, Send } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSoraApprovalEnabled } from "@/hooks/useSoraApprovalEnabled";
import { SearchablePersonSelect } from "@/components/SearchablePersonSelect";

interface ChildCompany {
  id: string;
  navn: string;
  org_nummer: string | null;
  adresse: string | null;
  adresse_lat?: number | null;
  adresse_lon?: number | null;
  kontakt_epost: string | null;
  kontakt_telefon: string | null;
  aktiv: boolean;
  selskapstype: string | null;
  stripe_exempt?: boolean;
  parent_company_id?: string | null;
}

export const ChildCompaniesSection = () => {
  const { companyId } = useAuth();
  const isMobile = useIsMobile();
  const soraApprovalEnabled = useSoraApprovalEnabled();
  const [children, setChildren] = useState<ChildCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<ChildCompany | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [companyToDelete, setCompanyToDelete] = useState<ChildCompany | null>(null);
  const [parentCompanyName, setParentCompanyName] = useState<string>("");
  const [showAllAirspaceWarnings, setShowAllAirspaceWarnings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [hideReporterIdentity, setHideReporterIdentity] = useState(false);
  const [requireMissionApproval, setRequireMissionApproval] = useState(false);
  const [requireSoraOnMissions, setRequireSoraOnMissions] = useState(false);
  const [requireSoraSteps, setRequireSoraSteps] = useState(1);
  const [defaultBufferMode, setDefaultBufferMode] = useState<"corridor" | "convexHull">("corridor");
  const [applySettingsToChildren, setApplySettingsToChildren] = useState(false);
  const [applyRolesToChildren, setApplyRolesToChildren] = useState(false);
  const [applyAlertsToChildren, setApplyAlertsToChildren] = useState(false);
  const [missionRoles, setMissionRoles] = useState<{id: string; name: string}[]>([]);
  const [newRoleName, setNewRoleName] = useState("");
  const [savingRole, setSavingRole] = useState(false);

  // ── Flight alerts state ──
  const ALERT_TYPES = [
    { key: 'low_battery', label: 'Batteri under', unit: '%', defaultValue: 20, hasThreshold: true },
    { key: 'rth_triggered', label: 'RTH ble trigget', unit: '', defaultValue: null, hasThreshold: false },
    { key: 'max_height', label: 'Høyde over', unit: 'm AGL', defaultValue: 120, hasThreshold: true },
    { key: 'max_speed', label: 'Maks hastighet over', unit: 'm/s', defaultValue: 20, hasThreshold: true },
    { key: 'low_gps_sats', label: 'GPS-satellitter under', unit: 'stk', defaultValue: 6, hasThreshold: true },
    { key: 'battery_cell_deviation', label: 'Battericelleavvik over', unit: 'V', defaultValue: 0.3, hasThreshold: true },
    { key: 'battery_temp_high', label: 'Batteritemperatur over', unit: '°C', defaultValue: 50, hasThreshold: true },
    { key: 'high_vibration', label: 'Høy vibrasjon (ArduPilot)', unit: '', defaultValue: null, hasThreshold: false },
  ];

  const [flightAlerts, setFlightAlerts] = useState<Record<string, { enabled: boolean; threshold_value: number | null }>>({});
  const [alertRecipients, setAlertRecipients] = useState<{ id: string; profile_id: string; full_name: string | null }[]>([]);
  const [companyProfiles, setCompanyProfiles] = useState<{ id: string; full_name: string | null }[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);

  // FlightHub 2 state
  const [fh2Token, setFh2Token] = useState("");
  const fh2Editing = useRef(false);
  const [fh2BaseUrl, setFh2BaseUrl] = useState("");
  const [savingFh2, setSavingFh2] = useState(false);
  const [testingFh2, setTestingFh2] = useState(false);
  const [fh2ShowToken, setFh2ShowToken] = useState(false);
  const [fh2Connected, setFh2Connected] = useState(false);
  const [fh2Projects, setFh2Projects] = useState<string[]>([]);
  const [fh2Inherited, setFh2Inherited] = useState(false);

  const fetchFlightAlerts = useCallback(async () => {
    if (!companyId) return;
    setLoadingAlerts(true);
    const { data: alerts } = await (supabase as any)
      .from("company_flight_alerts")
      .select("alert_type, enabled, threshold_value")
      .eq("company_id", companyId);
    const map: Record<string, { enabled: boolean; threshold_value: number | null }> = {};
    (alerts || []).forEach((a: any) => { map[a.alert_type] = { enabled: a.enabled, threshold_value: a.threshold_value }; });
    setFlightAlerts(map);

    const { data: recipients } = await (supabase as any)
      .from("company_flight_alert_recipients")
      .select("id, profile_id")
      .eq("company_id", companyId);
    
    // Fetch names for recipients
    const profileIds = (recipients || []).map((r: any) => r.profile_id);
    let profileMap: Record<string, string | null> = {};
    if (profileIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", profileIds);
      (profiles || []).forEach((p: any) => { profileMap[p.id] = p.full_name; });
    }
    setAlertRecipients((recipients || []).map((r: any) => ({
      id: r.id, profile_id: r.profile_id, full_name: profileMap[r.profile_id] || null,
    })));

    // Fetch company profiles for the recipient selector
    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("company_id", companyId)
      .order("full_name");
    setCompanyProfiles(allProfiles || []);
    setLoadingAlerts(false);
  }, [companyId]);

  const handleToggleAlert = async (alertType: string, enabled: boolean) => {
    if (!companyId) return;
    const defaultVal = ALERT_TYPES.find(a => a.key === alertType)?.defaultValue ?? null;
    const current = flightAlerts[alertType];
    await (supabase as any).from("company_flight_alerts").upsert({
      company_id: companyId,
      alert_type: alertType,
      enabled,
      threshold_value: current?.threshold_value ?? defaultVal,
    }, { onConflict: 'company_id,alert_type' });
    setFlightAlerts(prev => ({ ...prev, [alertType]: { enabled, threshold_value: current?.threshold_value ?? defaultVal } }));
  };

  const handleChangeThreshold = async (alertType: string, value: number) => {
    if (!companyId) return;
    const current = flightAlerts[alertType];
    await (supabase as any).from("company_flight_alerts").upsert({
      company_id: companyId,
      alert_type: alertType,
      enabled: current?.enabled ?? true,
      threshold_value: value,
    }, { onConflict: 'company_id,alert_type' });
    setFlightAlerts(prev => ({ ...prev, [alertType]: { enabled: current?.enabled ?? true, threshold_value: value } }));
  };

  const handleAddRecipient = async (profileId: string | null) => {
    if (!companyId || !profileId) return;
    if (alertRecipients.some(r => r.profile_id === profileId)) return;
    const { data, error } = await (supabase as any).from("company_flight_alert_recipients")
      .insert({ company_id: companyId, profile_id: profileId })
      .select("id")
      .single();
    if (error) {
      if (error.code === '23505') toast.error("Mottaker finnes allerede");
      else toast.error("Kunne ikke legge til mottaker");
      return;
    }
    const profile = companyProfiles.find(p => p.id === profileId);
    setAlertRecipients(prev => [...prev, { id: data.id, profile_id: profileId, full_name: profile?.full_name || null }]);
    toast.success("Mottaker lagt til");
  };

  const handleRemoveRecipient = async (recipientId: string) => {
    await (supabase as any).from("company_flight_alert_recipients").delete().eq("id", recipientId);
    setAlertRecipients(prev => prev.filter(r => r.id !== recipientId));
    toast.success("Mottaker fjernet");
  };

  const fetchMissionRoles = useCallback(async () => {
    if (!companyId) return;
    const { data } = await (supabase as any)
      .from("company_mission_roles")
      .select("id, name")
      .eq("company_id", companyId)
      .order("name");
    setMissionRoles(data || []);
  }, [companyId]);

  const handleAddRole = async () => {
    if (!companyId || !newRoleName.trim()) return;
    setSavingRole(true);
    const { error } = await (supabase as any)
      .from("company_mission_roles")
      .insert({ company_id: companyId, name: newRoleName.trim() });
    setSavingRole(false);
    if (error) {
      if (error.code === '23505') toast.error("Rollen finnes allerede");
      else toast.error("Kunne ikke legge til rolle");
      return;
    }
    setNewRoleName("");
    toast.success("Rolle lagt til");
    fetchMissionRoles();
  };

  const handleDeleteRole = async (roleId: string) => {
    const { error } = await (supabase as any)
      .from("company_mission_roles")
      .delete()
      .eq("id", roleId);
    if (error) {
      toast.error("Kunne ikke slette rolle");
      return;
    }
    toast.success("Rolle slettet");
    fetchMissionRoles();
  };

  const fetchChildren = async () => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from("companies")
        .select("id, navn, org_nummer, adresse, adresse_lat, adresse_lon, kontakt_epost, kontakt_telefon, aktiv, selskapstype, stripe_exempt, parent_company_id")
        .eq("parent_company_id", companyId)
        .order("navn");

      if (error) throw error;
      setChildren(data || []);
    } catch (error) {
      console.error("Error fetching child companies:", error);
      toast.error("Kunne ikke laste avdelinger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChildren();
    fetchParentSettings();
    fetchMissionRoles();
    fetchFlightAlerts();

    if (!companyId) return;
    const channel = supabase
      .channel(`company-settings-${companyId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "companies", filter: `id=eq.${companyId}` },
        () => {
          fetchParentSettings();
          invalidateCompanySettingsCache();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  const fetchParentSettings = async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from("companies")
      .select("navn, show_all_airspace_warnings, hide_reporter_identity, require_mission_approval, require_sora_on_missions, require_sora_steps, flighthub2_base_url")
      .eq("id", companyId)
      .single();
    if (data) {
      setParentCompanyName(data.navn);
      setShowAllAirspaceWarnings((data as any).show_all_airspace_warnings ?? false);
      setHideReporterIdentity((data as any).hide_reporter_identity ?? false);
      setRequireMissionApproval((data as any).require_mission_approval ?? false);
      setRequireSoraOnMissions((data as any).require_sora_on_missions ?? false);
      setRequireSoraSteps((data as any).require_sora_steps ?? 1);
      setFh2BaseUrl((data as any).flighthub2_base_url || "");

      // Check if FH2 credentials exist (own or inherited via parent)
      const { data: cred } = await (supabase as any)
        .from("company_fh2_credentials")
        .select("company_id")
        .eq("company_id", companyId)
        .maybeSingle();

      const hasOwnCred = !!cred;
      if (hasOwnCred && !fh2Editing.current) setFh2Token("••••••••");

      // Always try test-connection — edge function handles parent fallback
      try {
        const { data: testData } = await supabase.functions.invoke("flighthub2-proxy", {
          body: { action: "test-connection" },
        });
        if (testData?.token_ok) {
          setFh2Connected(true);
          setFh2Projects(testData.project_names || []);
          setFh2Inherited(!hasOwnCred);
        } else {
          setFh2Inherited(false);
        }
      } catch {
        setFh2Inherited(false);
      }
    }
    // Fetch default buffer mode from sora config
    const { data: soraData } = await (supabase as any)
      .from("company_sora_config")
      .select("default_buffer_mode")
      .eq("company_id", companyId)
      .maybeSingle();
    if (soraData?.default_buffer_mode) {
      setDefaultBufferMode(soraData.default_buffer_mode);
    }
  };

  const handleToggleAirspaceWarnings = async (checked: boolean) => {
    if (!companyId) return;
    setSavingSettings(true);
    const { error } = await supabase
      .from("companies")
      .update({ show_all_airspace_warnings: checked } as any)
      .eq("id", companyId);
    if (error) {
      setSavingSettings(false);
      toast.error("Kunne ikke lagre innstilling");
      return;
    }

    if (applySettingsToChildren) {
      await supabase
        .from("companies")
        .update({ show_all_airspace_warnings: checked } as any)
        .eq("parent_company_id", companyId);
    }

    setSavingSettings(false);
    setShowAllAirspaceWarnings(checked);
    invalidateCompanySettingsCache();
    toast.success("Innstilling lagret");
  };

  const handleToggleHideReporter = async (checked: boolean) => {
    if (!companyId) return;
    setSavingSettings(true);
    const { error } = await supabase
      .from("companies")
      .update({ hide_reporter_identity: checked } as any)
      .eq("id", companyId);
    if (error) {
      setSavingSettings(false);
      toast.error("Kunne ikke lagre innstilling");
      return;
    }

    if (applySettingsToChildren) {
      await supabase
        .from("companies")
        .update({ hide_reporter_identity: checked } as any)
        .eq("parent_company_id", companyId);
    }

    setSavingSettings(false);
    setHideReporterIdentity(checked);
    invalidateCompanySettingsCache();
    toast.success("Innstilling lagret");
  };

  const handleToggleRequireMissionApproval = async (checked: boolean) => {
    if (!companyId) return;
    setSavingSettings(true);
    const { error } = await supabase
      .from("companies")
      .update({ require_mission_approval: checked } as any)
      .eq("id", companyId);
    if (error) {
      setSavingSettings(false);
      toast.error("Kunne ikke lagre innstilling");
      return;
    }

    if (applySettingsToChildren) {
      await supabase
        .from("companies")
        .update({ require_mission_approval: checked } as any)
        .eq("parent_company_id", companyId);
    }

    setSavingSettings(false);
    setRequireMissionApproval(checked);
    invalidateCompanySettingsCache();
    toast.success("Innstilling lagret");
  };

  const handleToggleRequireSora = async (checked: boolean) => {
    if (!companyId) return;

    if (checked) {
      const { data: soraConfig } = await supabase
        .from("company_sora_config")
        .select("sora_based_approval")
        .eq("company_id", companyId)
        .maybeSingle();

      if (soraApprovalEnabled || !!soraConfig?.sora_based_approval) {
        toast.error("Kan ikke aktiveres når SORA-basert godkjenning er på");
        return;
      }
    }

    setSavingSettings(true);
    const { error } = await supabase
      .from("companies")
      .update({ require_sora_on_missions: checked } as any)
      .eq("id", companyId);
    if (error) {
      setSavingSettings(false);
      toast.error("Kunne ikke lagre innstilling");
      return;
    }

    if (applySettingsToChildren) {
      await supabase
        .from("companies")
        .update({ require_sora_on_missions: checked } as any)
        .eq("parent_company_id", companyId);
    }

    setSavingSettings(false);
    setRequireSoraOnMissions(checked);
    invalidateCompanySettingsCache();
    toast.success("Innstilling lagret");
  };

  const handleChangeSoraSteps = async (steps: number) => {
    if (!companyId) return;
    setSavingSettings(true);
    const { error } = await supabase
      .from("companies")
      .update({ require_sora_steps: steps } as any)
      .eq("id", companyId);
    if (error) {
      setSavingSettings(false);
      toast.error("Kunne ikke lagre innstilling");
      return;
    }

    if (applySettingsToChildren) {
      await supabase
        .from("companies")
        .update({ require_sora_steps: steps } as any)
        .eq("parent_company_id", companyId);
    }

    setSavingSettings(false);
    setRequireSoraSteps(steps);
    invalidateCompanySettingsCache();
    toast.success("Innstilling lagret");
  };

  const handleChangeBufferMode = async (mode: "corridor" | "convexHull") => {
    if (!companyId) return;
    setSavingSettings(true);
    await (supabase as any)
      .from("company_sora_config")
      .upsert({ company_id: companyId, default_buffer_mode: mode }, { onConflict: 'company_id' });
    setSavingSettings(false);
    setDefaultBufferMode(mode);
    invalidateCompanySettingsCache();
    toast.success("Buffermodus lagret");
  };

  const FH2_MASK = "••••••••";

  const handleSaveFh2 = async () => {
    if (!companyId) return;
    const cleanToken = (fh2Token || "").trim().replace(/^bearer\s+/i, "");
    if (cleanToken === FH2_MASK) {
      toast.error("Klikk \"Endre nøkkel\" først for å lime inn en ny nøkkel");
      return;
    }
    setSavingFh2(true);
    try {
      if (cleanToken) {
        const { error } = await supabase.functions.invoke("flighthub2-proxy", {
          body: { action: "save-token", token: cleanToken },
        });
        if (error) throw error;
      } else {
        await (supabase as any).from("company_fh2_credentials").delete().eq("company_id", companyId);
      }
      setFh2Token(cleanToken ? FH2_MASK : "");
      fh2Editing.current = false;
      toast.success(cleanToken ? "FlightHub 2-nøkkel lagret (kryptert)" : "FlightHub 2-nøkkel fjernet");
    } catch (err: any) {
      toast.error(err?.message || "Kunne ikke lagre");
    } finally {
      setSavingFh2(false);
    }
  };

  const handleDeleteFh2 = async () => {
    if (!companyId) return;
    setSavingFh2(true);
    try {
      await (supabase as any).from("company_fh2_credentials").delete().eq("company_id", companyId);
      setFh2Token("");
      setFh2Connected(false);
      setFh2Projects([]);
      toast.success("FlightHub 2-nøkkel slettet");
    } catch (err: any) {
      toast.error(err?.message || "Kunne ikke slette");
    } finally {
      setSavingFh2(false);
    }
  };

  const handleTestFh2 = async () => {
    if (!fh2Token) { toast.error("Fyll inn organisasjonsnøkkel først"); return; }
    const cleanToken = (fh2Token || "").trim().replace(/^bearer\s+/i, "");
    if (cleanToken === FH2_MASK) {
      toast.error("Klikk \"Endre nøkkel\" først for å lime inn en ny nøkkel");
      return;
    }
    setTestingFh2(true);
    setFh2Connected(false);
    setFh2Projects([]);
    try {
      await supabase.functions.invoke("flighthub2-proxy", {
        body: { action: "save-token", token: cleanToken },
      });

      const { data, error } = await supabase.functions.invoke("flighthub2-proxy", {
        body: { action: "test-connection" },
      });
      if (error) throw error;

      if (data?.token_ok) {
        if (data.working_base_url) {
          await supabase
            .from("companies")
            .update({ flighthub2_base_url: data.working_base_url } as any)
            .eq("id", companyId);
          setFh2BaseUrl(data.working_base_url);
        }

        const projectNames: string[] = data.project_names || [];
        setFh2Projects(projectNames);
        setFh2Connected(true);
        setFh2Token(FH2_MASK);
        fh2Editing.current = false;
        toast.success(`Gratulerer! Du er tilkoblet din FH2-konto med ${data.project_count || 0} prosjekter`);
      } else if (data?.server_ok && !data?.token_ok) {
        toast.error("Server svarer, men nøkkelen ble avvist. Sjekk at nøkkelen er korrekt og ikke utløpt.", { duration: 10000 });
      } else if (data?.error) {
        toast.error(`FlightHub 2 feil: ${data.error}`, { duration: 10000 });
      } else {
        toast.error("Kunne ikke nå FlightHub 2-serveren.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Tilkobling feilet");
    } finally {
      setTestingFh2(false);
    }
  };

  const handleToggleApplySettingsToChildren = async (checked: boolean) => {
    if (!companyId) return;
    setApplySettingsToChildren(checked);
    if (checked) {
      setSavingSettings(true);
      await supabase
        .from("companies")
        .update({ show_all_airspace_warnings: showAllAirspaceWarnings, hide_reporter_identity: hideReporterIdentity, require_mission_approval: requireMissionApproval, require_sora_on_missions: requireSoraOnMissions, require_sora_steps: requireSoraSteps } as any)
        .eq("parent_company_id", companyId);
      setSavingSettings(false);
      toast.success("Selskapsinnstillinger anvendt på alle avdelinger");
    }
  };

  const handleToggleApplyRolesToChildren = async (checked: boolean) => {
    if (!companyId) return;
    setApplyRolesToChildren(checked);
    if (checked) {
      setSavingSettings(true);
      // Get child companies
      const { data: childCompanies } = await supabase
        .from("companies")
        .select("id")
        .eq("parent_company_id", companyId);
      if (childCompanies && childCompanies.length > 0) {
        for (const child of childCompanies) {
          // Get existing roles for child
          const { data: existingRoles } = await (supabase as any)
            .from("company_mission_roles")
            .select("name")
            .eq("company_id", child.id);
          const existingNames = new Set((existingRoles || []).map((r: any) => r.name));
          const rolesToInsert = missionRoles
            .filter(r => !existingNames.has(r.name))
            .map(r => ({ company_id: child.id, name: r.name }));
          if (rolesToInsert.length > 0) {
            await (supabase as any).from("company_mission_roles").insert(rolesToInsert);
          }
        }
      }
      setSavingSettings(false);
      toast.success("Roller anvendt på alle avdelinger");
    }
  };

  const handleToggleApplyAlertsToChildren = async (checked: boolean) => {
    if (!companyId) return;
    setApplyAlertsToChildren(checked);
    if (checked) {
      setSavingSettings(true);
      const { data: childCompanies } = await supabase
        .from("companies")
        .select("id")
        .eq("parent_company_id", companyId);
      if (childCompanies && childCompanies.length > 0) {
        for (const child of childCompanies) {
          // Upsert alerts
          for (const alertType of ALERT_TYPES) {
            const current = flightAlerts[alertType.key];
            if (current) {
              await (supabase as any).from("company_flight_alerts").upsert({
                company_id: child.id,
                alert_type: alertType.key,
                enabled: current.enabled,
                threshold_value: current.threshold_value,
              }, { onConflict: 'company_id,alert_type' });
            }
          }
          // Sync recipients
          await (supabase as any).from("company_flight_alert_recipients").delete().eq("company_id", child.id);
          if (alertRecipients.length > 0) {
            const recipientInserts = alertRecipients.map(r => ({
              company_id: child.id,
              profile_id: r.profile_id,
            }));
            await (supabase as any).from("company_flight_alert_recipients").insert(recipientInserts);
          }
        }
      }
      setSavingSettings(false);
      toast.success("Flylogg-varsler anvendt på alle avdelinger");
    }
  };

  const handleAdd = () => {
    setSelectedCompany(null);
    setDialogOpen(true);
  };

  const handleEdit = (company: ChildCompany) => {
    setSelectedCompany(company);
    setDialogOpen(true);
  };

  const handleDeleteClick = (company: ChildCompany) => {
    setCompanyToDelete(company);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!companyToDelete) return;
    try {
      const { error } = await supabase
        .from("companies")
        .delete()
        .eq("id", companyToDelete.id);

      if (error) throw error;
      toast.success("Avdeling slettet");
      setDeleteDialogOpen(false);
      setCompanyToDelete(null);
      fetchChildren();
    } catch (error: any) {
      console.error("Error deleting child company:", error);
      toast.error("Kunne ikke slette avdeling: " + error.message);
    }
  };

  // Build the company object passed to dialog, with parent_company_id pre-set
  const dialogCompany = selectedCompany || undefined;

  return (
    <div className="space-y-4">
      <Collapsible>
        <GlassCard>
          <CollapsibleTrigger className="w-full text-left">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Selskapsinnstillinger — {parentCompanyName}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Innstillinger som gjelder for ditt selskap
                </p>
              </div>
              <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4">
            <div className="space-y-3">
              <div className="rounded-lg border-2 border-primary/30 bg-muted/30 p-3 flex items-center justify-between">
                <Label htmlFor="show-all-airspace" className="flex-1 cursor-pointer pr-4">
                  <div className="font-medium text-sm">Vis alle luftromsadvarsler på oppdragskortene</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Når aktivert vises alle advarsler direkte i stedet for kun den viktigste med resten i en ekspanderbar liste
                  </div>
                </Label>
                <Switch
                  id="show-all-airspace"
                  checked={showAllAirspaceWarnings}
                  onCheckedChange={handleToggleAirspaceWarnings}
                  disabled={savingSettings}
                />
              </div>
              <div className="rounded-lg border-2 border-primary/30 bg-muted/30 p-3 flex items-center justify-between">
                <Label htmlFor="hide-reporter" className="flex-1 cursor-pointer pr-4">
                  <div className="font-medium text-sm">Skjul identitet til rapportør av hendelser</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Når aktivert vises ikke navnet på den som rapporterte hendelsen. Administratorer i moderselskapet kan fortsatt se rapportørens identitet.
                  </div>
                </Label>
                <Switch
                  id="hide-reporter"
                  checked={hideReporterIdentity}
                  onCheckedChange={handleToggleHideReporter}
                  disabled={savingSettings}
                />
              </div>
              <div className="rounded-lg border-2 border-primary/30 bg-muted/30 p-3 flex items-center justify-between">
                <Label htmlFor="require-approval" className="flex-1 cursor-pointer pr-4">
                  <div className="font-medium text-sm">Oppdrag krever godkjenning</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    SORA-spesifikk godkjenningslogikk overstyrer dette valget
                  </div>
                </Label>
                <Switch
                  id="require-approval"
                  checked={requireMissionApproval}
                  onCheckedChange={handleToggleRequireMissionApproval}
                  disabled={savingSettings}
                />
              </div>
              <div className="rounded-lg border-2 border-primary/30 bg-muted/30 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="require-sora" className="flex-1 cursor-pointer pr-4">
                    <div className="font-medium text-sm">Krev SORA på alle oppdrag</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Alle oppdrag må ha gjennomført SORA-analyse for å kunne startes eller godkjennes. Gjelder ikke når SORA-basert godkjenning er aktivert.
                    </div>
                  </Label>
                  <Switch
                    id="require-sora"
                    checked={requireSoraOnMissions}
                    onCheckedChange={handleToggleRequireSora}
                    disabled={savingSettings || soraApprovalEnabled}
                  />
                </div>
                {requireSoraOnMissions && (
                  <div className="pl-1 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Antall påkrevde steg:</p>
                    <RadioGroup
                      value={String(requireSoraSteps)}
                      onValueChange={(v) => handleChangeSoraSteps(Number(v))}
                      className="flex gap-4"
                    >
                      <div className="flex items-center gap-1.5">
                        <RadioGroupItem value="1" id="sora-step-1" />
                        <Label htmlFor="sora-step-1" className="text-xs cursor-pointer">1 steg (AI-vurdering)</Label>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <RadioGroupItem value="2" id="sora-step-2" />
                        <Label htmlFor="sora-step-2" className="text-xs cursor-pointer">2 steg (+ revurdering)</Label>
                      </div>
                    </RadioGroup>
                  </div>
                )}
              </div>
              <div className="rounded-lg border-2 border-primary/30 bg-muted/30 p-3 space-y-3">
                <Label className="flex-1">
                  <div className="font-medium text-sm">Standard SORA-buffersone</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Velg standard buffermodus for nye oppdrag og ruteplanlegger
                  </div>
                </Label>
                <RadioGroup
                  value={defaultBufferMode}
                  onValueChange={(v) => handleChangeBufferMode(v as "corridor" | "convexHull")}
                  className="flex gap-4"
                  disabled={savingSettings}
                >
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="corridor" id="buffer-corridor" />
                    <Label htmlFor="buffer-corridor" className="text-xs cursor-pointer">Rute-korridor</Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="convexHull" id="buffer-convex" />
                    <Label htmlFor="buffer-convex" className="text-xs cursor-pointer">Konveks (convex hull)</Label>
                  </div>
                </RadioGroup>
              </div>
              {/* Settings propagation toggle */}
              <div className="border-t pt-2 flex items-center justify-between">
                <Label htmlFor="apply-settings-children" className="flex-1 cursor-pointer pr-4">
                  <div className="font-medium text-sm">Gjelder for alle underavdelinger</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Når aktivert vil selskapsinnstillingene også settes på alle avdelinger
                  </div>
                </Label>
                <Switch
                  id="apply-settings-children"
                  checked={applySettingsToChildren}
                  onCheckedChange={handleToggleApplySettingsToChildren}
                  disabled={savingSettings}
                />
              </div>
              <div className="rounded-lg border-2 border-primary/30 bg-muted/30 p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <UserCog className="h-4 w-4 text-muted-foreground" />
                  <div className="font-medium text-sm">Roller</div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs max-w-[200px]">Roller kan tildeles personell ved planlegging av oppdrag</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Ny rolle (f.eks. Ansvarlig pilot)"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddRole()}
                    className="h-8 text-sm"
                  />
                  <Button size="sm" onClick={handleAddRole} disabled={savingRole || !newRoleName.trim()} className="h-8">
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Legg til
                  </Button>
                </div>
                {missionRoles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {missionRoles.map((role) => (
                      <div key={role.id} className="flex items-center gap-1 bg-secondary text-secondary-foreground px-2 py-1 rounded-md text-xs">
                        <span>{role.name}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteRole(role.id)}
                          className="hover:bg-destructive/20 rounded-full p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {/* Roles propagation toggle */}
                <div className="border-t pt-2 flex items-center justify-between">
                  <Label htmlFor="apply-roles-children" className="flex-1 cursor-pointer pr-4">
                    <div className="font-medium text-sm">Gjelder for alle underavdelinger</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Når aktivert kopieres rollene til alle avdelinger i selskapet
                    </div>
                  </Label>
                  <Switch
                    id="apply-roles-children"
                    checked={applyRolesToChildren}
                    onCheckedChange={handleToggleApplyRolesToChildren}
                    disabled={savingSettings}
                  />
                </div>
              </div>
              <div className="rounded-lg border-2 border-primary/30 bg-muted/30 p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-muted-foreground" />
                  <div className="font-medium text-sm">Flylogg-varsler</div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs max-w-[220px]">Motta e-postvarsler når kritiske terskelverdier nås under flyging (DJI/ArduPilot)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="space-y-2">
                  {ALERT_TYPES.map((alert) => {
                    const current = flightAlerts[alert.key];
                    const enabled = current?.enabled ?? false;
                    const thresholdValue = current?.threshold_value ?? alert.defaultValue;
                    return (
                      <div key={alert.key} className="flex items-center gap-2 flex-wrap">
                        <Switch
                          checked={enabled}
                          onCheckedChange={(checked) => handleToggleAlert(alert.key, checked)}
                          className="shrink-0"
                        />
                        <span className="text-sm min-w-0">{alert.label}</span>
                        {alert.hasThreshold && (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              value={thresholdValue ?? ''}
                              onChange={(e) => handleChangeThreshold(alert.key, parseFloat(e.target.value) || 0)}
                              className="h-7 w-16 text-xs"
                              step={alert.key === 'battery_cell_deviation' ? 0.1 : 1}
                              disabled={!enabled}
                            />
                            <span className="text-xs text-muted-foreground">{alert.unit}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="border-t pt-2 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Mottakere av varsler:</p>
                  <SearchablePersonSelect
                    persons={companyProfiles.filter(p => !alertRecipients.some(r => r.profile_id === p.id))}
                    value={null}
                    onValueChange={handleAddRecipient}
                    placeholder="Legg til mottaker..."
                    searchPlaceholder="Søk person..."
                    emptyText="Ingen tilgjengelige personer."
                  />
                  {alertRecipients.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {alertRecipients.map((r) => (
                        <div key={r.id} className="flex items-center gap-1 bg-secondary text-secondary-foreground px-2 py-1 rounded-md text-xs">
                          <span>{r.full_name || 'Ukjent bruker'}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveRecipient(r.id)}
                            className="hover:bg-destructive/20 rounded-full p-0.5"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {/* Alerts propagation toggle */}
                <div className="border-t pt-2 flex items-center justify-between">
                  <Label htmlFor="apply-alerts-children" className="flex-1 cursor-pointer pr-4">
                    <div className="font-medium text-sm">Gjelder for alle underavdelinger</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Når aktivert kopieres varsler og mottakere til alle avdelinger
                    </div>
                  </Label>
                  <Switch
                    id="apply-alerts-children"
                    checked={applyAlertsToChildren}
                    onCheckedChange={handleToggleApplyAlertsToChildren}
                    disabled={savingSettings}
                  />
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </GlassCard>
      </Collapsible>

      {/* FlightHub 2 Integration */}
      <Collapsible>
        <GlassCard>
          <CollapsibleTrigger className="w-full text-left">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Send className="h-5 w-5" />
                  DJI FlightHub 2
                </h3>
                <p className="text-sm text-muted-foreground">
                  Send rutefiler og SORA-korridorer til DJI FlightHub 2
                </p>
              </div>
              <div className="flex items-center gap-2">
                {fh2Connected && (
                  <Badge variant="default" className="text-xs bg-green-600">
                    {fh2Inherited ? "Arvet tilkobling" : "Tilkoblet"}
                  </Badge>
                )}
                <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
              </div>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs">Organisasjonsnøkkel (FlightHub Sync)</Label>
                <div className="flex gap-2">
                  <Input
                    type={fh2ShowToken ? "text" : "password"}
                    value={fh2Token}
                    onChange={(e) => setFh2Token(e.target.value)}
                    onFocus={() => { if (fh2Token === FH2_MASK) { fh2Editing.current = true; setFh2Token(""); } }}
                    placeholder="Lim inn FlightHub Sync-nøkkel..."
                    className="h-8 text-sm font-mono"
                  />
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setFh2ShowToken(!fh2ShowToken)}>
                    {fh2ShowToken ? "Skjul" : "Vis"}
                  </Button>
                  {fh2Token === FH2_MASK && (
                    <Button variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => { fh2Editing.current = true; setFh2Token(""); }}>
                      <Pencil className="h-3 w-3 mr-1" /> Endre
                    </Button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Bruk nøkkelen fra FlightHub 2 → Organisasjonsinnstillinger → FlightHub Sync → Organisasjonsnøkkel.
                </p>
              </div>

              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveFh2} disabled={savingFh2} className="h-8">
                  {savingFh2 ? "Lagrer..." : "Lagre"}
                </Button>
                <Button variant="outline" size="sm" onClick={handleTestFh2} disabled={testingFh2 || !fh2Token} className="h-8">
                  {testingFh2 ? "Tester..." : "Test tilkobling"}
                </Button>
                {fh2Connected && (
                  <Button variant="destructive" size="sm" onClick={handleDeleteFh2} disabled={savingFh2} className="h-8">
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Slett
                  </Button>
                )}
              </div>

              {fh2Connected && (
                <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 space-y-2">
                  <p className="text-sm font-medium text-green-700 dark:text-green-300">
                    ✅ {fh2Inherited
                      ? `Tilkoblet via morselskapet med ${fh2Projects.length} prosjekter`
                      : `Gratulerer! Du er tilkoblet din FH2-konto med ${fh2Projects.length} prosjekter`}
                  </p>
                  {fh2Projects.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {fh2Projects.map((name, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </GlassCard>
      </Collapsible>

      <GlassCard>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Avdelinger
            </h3>
            <p className="text-sm text-muted-foreground">
              Opprett og administrer avdelinger tilknyttet ditt selskap
            </p>
          </div>
          <Button onClick={handleAdd} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Ny avdeling
          </Button>
        </div>

        {loading ? (
          <p className="text-muted-foreground text-sm">Laster...</p>
        ) : children.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">
            Ingen avdelinger opprettet ennå.
          </p>
        ) : isMobile ? (
          <div className="space-y-2">
            {children.map((c) => (
              <div key={c.id} className="border rounded-lg p-3 bg-card space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{c.navn}</span>
                  <Badge variant={c.aktiv ? "default" : "secondary"} className="text-xs">
                    {c.aktiv ? "Aktiv" : "Inaktiv"}
                  </Badge>
                </div>
                {c.org_nummer && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Hash className="h-3 w-3" /> {c.org_nummer}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEdit(c)}>
                    <Pencil className="h-3 w-3 mr-1" /> Rediger
                  </Button>
                  <Button variant="destructive" size="sm" className="flex-1" onClick={() => handleDeleteClick(c)}>
                    Slett
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Navn</TableHead>
                <TableHead>Org.nr</TableHead>
                <TableHead>E-post</TableHead>
                <TableHead>Telefon</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Handlinger</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {children.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.navn}</TableCell>
                  <TableCell>{c.org_nummer || "–"}</TableCell>
                  <TableCell>{c.kontakt_epost || "–"}</TableCell>
                  <TableCell>{c.kontakt_telefon || "–"}</TableCell>
                  <TableCell>
                    <Badge variant={c.aktiv ? "default" : "secondary"}>
                      {c.aktiv ? "Aktiv" : "Inaktiv"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="outline" size="sm" onClick={() => handleEdit(c)}>
                      <Pencil className="h-3 w-3 mr-1" /> Rediger
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDeleteClick(c)}>
                      Slett
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </GlassCard>

      <CompanyManagementDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        company={dialogCompany ? dialogCompany : null}
        onSuccess={fetchChildren}
        forceParentCompanyId={companyId || undefined}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slett avdeling</AlertDialogTitle>
            <AlertDialogDescription>
              Er du sikker på at du vil slette «{companyToDelete?.navn}»? Denne handlingen kan ikke angres.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>Slett</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
