import { useState, useEffect } from "react";
import droneBackground from "@/assets/drone-background.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AddIncidentDialog } from "@/components/dashboard/AddIncidentDialog";
import { IncidentDetailDialog } from "@/components/dashboard/IncidentDetailDialog";
import { MissionDetailDialog } from "@/components/dashboard/MissionDetailDialog";
import { EccairsMappingDialog } from "@/components/eccairs/EccairsMappingDialog";
import { EccairsAttachmentUpload } from "@/components/eccairs/EccairsAttachmentUpload";
import { EccairsSettingsDialog } from "@/components/eccairs/EccairsSettingsDialog";
import { GlassCard } from "@/components/GlassCard";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Search, MessageSquare, MapPin, Calendar, User, Bell, Edit, FileText, Link2, ChevronDown, AlertTriangle, ExternalLink, Loader2, Tags, RefreshCw, Trash2, Paperclip, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { exportIncidentPDF } from "@/lib/incidentPdfExport";
import { getAttributeLabel } from "@/config/eccairsFields";

type Incident = {
  id: string;
  tittel: string;
  beskrivelse: string | null;
  hendelsestidspunkt: string;
  alvorlighetsgrad: string;
  status: string;
  kategori: string | null;
  lokasjon: string | null;
  rapportert_av: string | null;
  opprettet_dato: string | null;
  oppdatert_dato: string | null;
  user_id: string | null;
  mission_id: string | null;
  oppfolgingsansvarlig_id: string | null;
  company_id: string;
  hovedaarsak: string | null;
  medvirkende_aarsak: string | null;
  incident_number: string | null;
  drone_serial_number?: string | null;
};

type IncidentComment = {
  id: string;
  comment_text: string;
  created_by_name: string;
  created_at: string;
};

const statusOptions = ["Alle", "Åpen", "Under behandling", "Ferdigbehandlet", "Lukket"];

const severityColors: Record<string, string> = {
  Kritisk: "bg-red-100 text-red-900 border-red-300 dark:bg-red-900/30 dark:text-red-100 dark:border-red-700",
  Høy: "bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-900/30 dark:text-orange-100 dark:border-orange-700",
  Middels: "bg-yellow-100 text-yellow-900 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-100 dark:border-yellow-700",
  Lav: "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-900/30 dark:text-blue-100 dark:border-blue-700"
};

const statusColors: Record<string, string> = {
  Åpen: "bg-red-100 text-red-900 border-red-300 dark:bg-red-900/30 dark:text-red-100 dark:border-red-700",
  "Under behandling": "bg-yellow-100 text-yellow-900 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-100 dark:border-yellow-700",
  Ferdigbehandlet: "bg-green-100 text-green-900 border-green-300 dark:bg-green-900/30 dark:text-green-100 dark:border-green-700",
  Lukket: "bg-gray-100 text-gray-900 border-gray-300 dark:bg-gray-700/30 dark:text-gray-100 dark:border-gray-600"
};

// ---- ECCAIRS config ----
const ECCAIRS_GATEWAY = import.meta.env.VITE_ECCAIRS_GATEWAY_URL || "";
const ECCAIRS_ENV: "sandbox" | "prod" = (import.meta.env.VITE_ECCAIRS_ENV as "sandbox" | "prod") || "sandbox";
const ECCAIRS_GATEWAY_KEY = import.meta.env.VITE_ECCAIRS_GATEWAY_KEY || "";

// Helper: get Supabase access token
async function getAccessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

type EccairsExportStatus = 'pending' | 'draft_created' | 'draft_updated' | 'submitted' | 'failed';

type EccairsExport = {
  id: string;
  incident_id: string;
  company_id: string;
  status: EccairsExportStatus;
  e2_id: string | null;
  e2_version: string | null;
  last_attempt_at: string | null;
  last_error: string | null;
  environment: 'sandbox' | 'prod';
  attempts: number;
  response: any;
};

const getEccairsStatusLabel = (status?: string): string => {
  switch (status) {
    case 'pending': return 'Venter';
    case 'draft_created': return 'Utkast opprettet';
    case 'draft_updated': return 'Utkast oppdatert';
    case 'submitted': return 'Sendt';
    case 'failed': return 'Feilet';
    default: return 'Ikke eksportert';
  }
};

const getEccairsStatusClass = (status?: string): string => {
  switch (status) {
    case 'pending':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    case 'draft_created':
    case 'draft_updated':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'submitted':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'failed':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700/30 dark:text-gray-300';
  }
};

const Hendelser = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading, companyId } = useAuth();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [filteredIncidents, setFilteredIncidents] = useState<Incident[]>([]);
  const [oppfolgingsansvarlige, setOppfolgingsansvarlige] = useState<Record<string, string>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, IncidentComment[]>>({});
  const [missions, setMissions] = useState<Record<string, any>>({});
  const [selectedMission, setSelectedMission] = useState<any | null>(null);
  const [missionDialogOpen, setMissionDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("Alle");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [incidentToEdit, setIncidentToEdit] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [eccairsExports, setEccairsExports] = useState<Record<string, EccairsExport>>({});
  const [eccairsExportingId, setEccairsExportingId] = useState<string | null>(null);
  const [eccairsEnabled, setEccairsEnabled] = useState(false);
  const [eccairsMappingDialogOpen, setEccairsMappingDialogOpen] = useState(false);
  const [eccairsMappingIncident, setEccairsMappingIncident] = useState<Incident | null>(null);
  const [attachmentDialogOpen, setAttachmentDialogOpen] = useState(false);
  const [attachmentIncident, setAttachmentIncident] = useState<{ id: string; e2Id: string } | null>(null);
  const [eccairsSettingsOpen, setEccairsSettingsOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [user, authLoading, navigate]);

  // Fetch ECCAIRS enabled setting for company
  useEffect(() => {
    const fetchCompanySettings = async () => {
      if (!companyId) return;
      const { data } = await supabase
        .from('companies')
        .select('eccairs_enabled')
        .eq('id', companyId)
        .single();
      setEccairsEnabled(data?.eccairs_enabled ?? false);
    };
    fetchCompanySettings();
  }, [companyId]);

  useEffect(() => {
    fetchIncidents();
    const channel = supabase.channel('incidents_changes').on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'incidents'
    }, () => {
      fetchIncidents();
    }).subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  // Fetch comment counts and comments when incidents change
  useEffect(() => {
    const fetchCommentsData = async () => {
      if (incidents.length === 0) return;

      try {
        const { data, error } = await supabase
          .from('incident_comments')
          .select('id, incident_id, comment_text, created_by_name, created_at')
          .in('incident_id', incidents.map(i => i.id))
          .order('created_at', { ascending: true });

        if (error) throw error;

        const counts: Record<string, number> = {};
        const commentsMap: Record<string, IncidentComment[]> = {};
        
        data?.forEach(row => {
          counts[row.incident_id] = (counts[row.incident_id] || 0) + 1;
          if (!commentsMap[row.incident_id]) {
            commentsMap[row.incident_id] = [];
          }
          commentsMap[row.incident_id].push({
            id: row.id,
            comment_text: row.comment_text,
            created_by_name: row.created_by_name,
            created_at: row.created_at
          });
        });
        
        setCommentCounts(counts);
        setComments(commentsMap);
      } catch (error) {
        console.error('Error fetching comments:', error);
      }
    };

    fetchCommentsData();
  }, [incidents]);

  // Fetch linked missions
  useEffect(() => {
    const fetchMissions = async () => {
      const incidentsWithMissions = incidents.filter(i => i.mission_id);
      if (incidentsWithMissions.length === 0) return;

      const missionIds = [...new Set(incidentsWithMissions.map(i => i.mission_id).filter(Boolean))];
      
      try {
        const { data, error } = await supabase
          .from('missions')
          .select('*')
          .in('id', missionIds);

        if (error) throw error;

        const missionsMap: Record<string, any> = {};
        data?.forEach(m => {
          missionsMap[m.id] = m;
        });
        setMissions(missionsMap);
      } catch (error) {
        console.error('Error fetching missions:', error);
      }
    };

    fetchMissions();
  }, [incidents]);

  // Fetch ECCAIRS exports when incidents change
  useEffect(() => {
    const fetchEccairsExports = async () => {
      if (!incidents || incidents.length === 0) {
        setEccairsExports({});
        return;
      }

      try {
        const incidentIds = incidents.map(i => i.id);

        const { data, error } = await supabase
          .from('eccairs_exports')
          .select('*')
          .eq('environment', ECCAIRS_ENV)
          .in('incident_id', incidentIds);

        if (error) throw error;

        const exportsMap: Record<string, EccairsExport> = {};
        (data || []).forEach(exp => {
          exportsMap[exp.incident_id] = exp as EccairsExport;
        });

        setEccairsExports(exportsMap);
      } catch (err) {
        console.error('Error fetching ECCAIRS exports:', err);
      }
    };

    fetchEccairsExports();
  }, [incidents]);

  // Real-time subscription for ECCAIRS exports
  useEffect(() => {
    const channel = supabase
      .channel(`eccairs-exports-${ECCAIRS_ENV}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'eccairs_exports',
          filter: `environment=eq.${ECCAIRS_ENV}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const exportData = payload.new as unknown as EccairsExport;
            setEccairsExports(prev => ({
              ...prev,
              [exportData.incident_id]: exportData,
            }));
          } else if (payload.eventType === 'DELETE') {
            const deleted = payload.old as { incident_id: string };
            setEccairsExports(prev => {
              const updated = { ...prev };
              delete updated[deleted.incident_id];
              return updated;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Real-time subscription for comment changes
  useEffect(() => {
    const channel = supabase
      .channel('hendelser-comments-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'incident_comments'
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newComment = payload.new as { incident_id: string; id: string; comment_text: string; created_by_name: string; created_at: string };
            setCommentCounts(prev => ({
              ...prev,
              [newComment.incident_id]: (prev[newComment.incident_id] || 0) + 1
            }));
            setComments(prev => ({
              ...prev,
              [newComment.incident_id]: [...(prev[newComment.incident_id] || []), {
                id: newComment.id,
                comment_text: newComment.comment_text,
                created_by_name: newComment.created_by_name,
                created_at: newComment.created_at
              }]
            }));
          } else if (payload.eventType === 'DELETE') {
            const deletedComment = payload.old as { incident_id: string; id: string };
            setCommentCounts(prev => ({
              ...prev,
              [deletedComment.incident_id]: Math.max((prev[deletedComment.incident_id] || 1) - 1, 0)
            }));
            setComments(prev => ({
              ...prev,
              [deletedComment.incident_id]: (prev[deletedComment.incident_id] || []).filter(c => c.id !== deletedComment.id)
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    filterIncidents();
  }, [incidents, searchQuery, selectedStatus]);

  const fetchIncidents = async () => {
    try {
      const { data, error } = await supabase.from('incidents').select('*').order('opprettet_dato', {
        ascending: false
      });
      if (error) throw error;
      setIncidents(data || []);

      // Hent oppfølgingsansvarlige for hendelser som har det
      const incidentsWithResponsible = (data || []).filter(inc => inc.oppfolgingsansvarlig_id);
      if (incidentsWithResponsible.length > 0) {
        const userIds = [...new Set(incidentsWithResponsible.map(inc => inc.oppfolgingsansvarlig_id))];
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', userIds);
        if (profiles) {
          const responsibleMap: Record<string, string> = {};
          profiles.forEach(profile => {
            responsibleMap[profile.id] = profile.full_name || 'Ukjent bruker';
          });
          setOppfolgingsansvarlige(responsibleMap);
        }
      }
    } catch (error) {
      console.error('Error fetching incidents:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterIncidents = () => {
    let filtered = [...incidents];

    // Filter by status
    if (selectedStatus !== "Alle") {
      filtered = filtered.filter(incident => incident.status === selectedStatus);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(incident => 
        incident.tittel.toLowerCase().includes(query) || 
        incident.beskrivelse?.toLowerCase().includes(query) || 
        incident.kategori?.toLowerCase().includes(query) || 
        incident.rapportert_av?.toLowerCase().includes(query) || 
        incident.lokasjon?.toLowerCase().includes(query) ||
        incident.incident_number?.toLowerCase().includes(query)
      );
    }
    setFilteredIncidents(filtered);
  };

  const handleIncidentClick = (incident: Incident) => {
    setSelectedIncident(incident);
    setDetailDialogOpen(true);
  };

  const handleEditRequest = (incident: Incident) => {
    setIncidentToEdit(incident);
    setAddDialogOpen(true);
  };

  const handleAddDialogClose = (open: boolean) => {
    setAddDialogOpen(open);
    if (!open) {
      setIncidentToEdit(null);
    }
  };

  const handleExportPDF = async (incident: Incident) => {
    if (!companyId || !user) return;
    
    setExportingId(incident.id);
    
    const success = await exportIncidentPDF({
      incident,
      comments: comments[incident.id] || [],
      oppfolgingsansvarligName: incident.oppfolgingsansvarlig_id ? oppfolgingsansvarlige[incident.oppfolgingsansvarlig_id] || null : null,
      relatedMissionTitle: incident.mission_id ? missions[incident.mission_id]?.tittel || null : null,
      companyId,
      userId: user.id
    });

    if (success) {
      toast.success("Hendelsesrapport lagret i dokumenter");
    } else {
      toast.error("Kunne ikke eksportere rapport");
    }
    
    setExportingId(null);
  };

  const exportToEccairs = async (incidentId: string) => {
    if (!ECCAIRS_GATEWAY) {
      toast.error("ECCAIRS gateway URL er ikke konfigurert");
      console.error("Missing VITE_ECCAIRS_GATEWAY_URL");
      return;
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      toast.error("Du må være logget inn");
      return;
    }

    if (!companyId) {
      toast.error("Ingen bedrift tilknyttet");
      return;
    }
    
    setEccairsExportingId(incidentId);
    
    try {
      const { data: incidentRow, error: incidentErr } = await supabase
        .from('incidents')
        .select('id, company_id')
        .eq('id', incidentId)
        .single();

      if (incidentErr) throw incidentErr;

      const nowIso = new Date().toISOString();
      const currentExport = eccairsExports[incidentId];

      const { data: upserted, error: upsertErr } = await supabase
        .from('eccairs_exports')
        .upsert({
          incident_id: incidentId,
          company_id: incidentRow.company_id,
          environment: ECCAIRS_ENV,
          status: 'pending',
          last_attempt_at: nowIso,
          attempts: (currentExport?.attempts ?? 0) + 1,
          last_error: null,
        }, { onConflict: 'incident_id,environment' })
        .select('*')
        .single();

      if (upsertErr) throw upsertErr;

      setEccairsExports(prev => ({ ...prev, [incidentId]: upserted as EccairsExport }));

      const res = await fetch(`${ECCAIRS_GATEWAY}/api/eccairs/drafts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          ...(ECCAIRS_GATEWAY_KEY ? { 'x-api-key': ECCAIRS_GATEWAY_KEY } : {}),
        },
        body: JSON.stringify({ incident_id: incidentId, environment: ECCAIRS_ENV }),
      });

      const json = await res.json().catch(() => ({}));

      // Handle structured validation errors from gateway
      if (!res.ok || !json?.ok) {
        const errorDetails = json?.details;
        
        if (Array.isArray(errorDetails) && errorDetails.length > 0) {
          // Structured validation errors - show each one
          const errorMessages = errorDetails.map((d: { attribute_code?: number; taxonomy_code?: string; message?: string }) => {
            const attrLabel = d.attribute_code ? getAttributeLabel(d.attribute_code) : 'Ukjent';
            const taxonomyInfo = d.taxonomy_code && d.taxonomy_code !== '24' ? ` (taxonomy ${d.taxonomy_code})` : '';
            return `${attrLabel}${taxonomyInfo}: ${d.message || 'Ukjent feil'}`;
          });
          
          console.error('ECCAIRS structured validation errors:', errorDetails);
          
          // Show each error in separate toast
          errorMessages.forEach((msg: string) => toast.error(msg));
          
          // Save detailed error in database
          await supabase
            .from('eccairs_exports')
            .update({
              status: 'failed',
              last_error: JSON.stringify(errorDetails),
              response: json,
              last_attempt_at: new Date().toISOString(),
            })
            .eq('incident_id', incidentId)
            .eq('environment', ECCAIRS_ENV);
          
          return; // Exit early
        }
        
        const msg = json?.error || json?.message || `Gateway error (${res.status})`;
        throw new Error(msg);
      }

      const { data: updated, error: updErr } = await supabase
        .from('eccairs_exports')
        .update({
          status: 'draft_created',
          e2_id: json.e2_id ?? json.data?.e2Id ?? null,
          e2_version: json.e2_version ?? json.data?.version ?? null,
          response: json,
          last_error: null,
          last_attempt_at: new Date().toISOString(),
        })
        .eq('incident_id', incidentId)
        .eq('environment', ECCAIRS_ENV)
        .select('*')
        .single();

      if (updErr) throw updErr;

      setEccairsExports(prev => ({ ...prev, [incidentId]: updated as EccairsExport }));
      toast.success(`ECCAIRS utkast opprettet: ${json.e2_id}`);

    } catch (err: any) {
      console.error('ECCAIRS export failed', err);
      
      const msg = err?.message ?? 'Ukjent feil ved eksport til ECCAIRS';
      
      const { data: failedRow } = await supabase
        .from('eccairs_exports')
        .update({
          status: 'failed',
          last_error: msg,
          last_attempt_at: new Date().toISOString(),
        })
        .eq('incident_id', incidentId)
        .eq('environment', ECCAIRS_ENV)
        .select('*')
        .single();

      if (failedRow) {
        setEccairsExports(prev => ({ ...prev, [incidentId]: failedRow as EccairsExport }));
      }
      
      toast.error(`ECCAIRS-eksport feilet: ${msg}`);
    } finally {
      setEccairsExportingId(null);
    }
  };

  const openInEccairs = async (e2Id: string) => {
    if (!ECCAIRS_GATEWAY) {
      toast.error("ECCAIRS gateway URL er ikke konfigurert");
      return;
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      toast.error("Du må være logget inn");
      return;
    }

    try {
      const url = new URL(`${ECCAIRS_GATEWAY}/api/eccairs/get-url`);
      url.searchParams.set("e2_id", e2Id);
      url.searchParams.set("environment", ECCAIRS_ENV);

      const r = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          ...(ECCAIRS_GATEWAY_KEY ? { 'x-api-key': ECCAIRS_GATEWAY_KEY } : {}),
        },
      });

      const j = await r.json().catch(() => ({}));

      // Happy path - direktelenke funnet
      if (r.ok && j?.ok && j?.url) {
        window.open(j.url, "_blank", "noopener,noreferrer");
        return;
      }

      // Fallback for OR drafts (E2 get-URL ikke tilgjengelig)
      const returnCode = j?.details?.returnCode;
      const errText = (j?.details?.errorDetails || j?.error || "").toString().toLowerCase();
      const isNotFound = r.status === 404 || returnCode === 2 || errText.includes("not found");

      if (isNotFound && typeof e2Id === "string" && e2Id.startsWith("OR-")) {
        toast.message("E2 kan ikke gi direktelenke for OR-utkast. Åpner portal – søk på E2 ID.");

        // Best effort: kopier E2 ID til clipboard
        try { 
          await navigator.clipboard.writeText(e2Id); 
        } catch {}

        window.open("https://aviationreporting.eu/", "_blank", "noopener,noreferrer");
        return;
      }

      toast.error("Kunne ikke åpne i ECCAIRS");
      console.error("openInEccairs failed:", { status: r.status, body: j });
    } catch (err) {
      console.error('Failed to get ECCAIRS URL', err);
      toast.error('Kunne ikke åpne i ECCAIRS');
    }
  };

  const submitToEccairs = async (incidentId: string) => {
    if (!ECCAIRS_GATEWAY) {
      toast.error("ECCAIRS gateway URL er ikke konfigurert");
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      toast.error("Du må være logget inn");
      return;
    }

    try {
      const res = await fetch(`${ECCAIRS_GATEWAY}/api/eccairs/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          ...(ECCAIRS_GATEWAY_KEY ? { "x-api-key": ECCAIRS_GATEWAY_KEY } : {}),
        },
        body: JSON.stringify({ incident_id: incidentId, environment: ECCAIRS_ENV }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        toast.error(json?.error || "Kunne ikke sende til ECCAIRS");
        console.error("ECCAIRS submit failed:", json);
        return;
      }

      toast.success("Sendt til ECCAIRS");
      // Update local state to reflect submitted status
      setEccairsExports(prev => ({
        ...prev,
        [incidentId]: {
          ...prev[incidentId],
          status: "submitted"
        }
      }));
    } catch (e) {
      toast.error("Nettverksfeil ved sending til ECCAIRS");
      console.error(e);
    }
  };

  const updateEccairsDraft = async (incidentId: string) => {
    if (!ECCAIRS_GATEWAY) {
      toast.error("ECCAIRS gateway URL er ikke konfigurert");
      return;
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      toast.error("Du må være logget inn");
      return;
    }

    setEccairsExportingId(incidentId);

    const url = `${ECCAIRS_GATEWAY}/api/eccairs/drafts/update`;
    
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          ...(ECCAIRS_GATEWAY_KEY ? { 'x-api-key': ECCAIRS_GATEWAY_KEY } : {}),
        },
        body: JSON.stringify({ 
          incident_id: incidentId, 
          environment: ECCAIRS_ENV
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        console.error('ECCAIRS update failed:', {
          url,
          status: res.status,
          response: json
        });
        
        const errorDetails = json?.details;
        if (Array.isArray(errorDetails) && errorDetails.length > 0) {
          errorDetails.forEach((d: { attribute_code?: number; message?: string }) => {
            const attrLabel = d.attribute_code ? getAttributeLabel(d.attribute_code) : 'Ukjent';
            toast.error(`${attrLabel}: ${d.message || 'Ukjent feil'}`);
          });
          return;
        }
        throw new Error(json?.error || `Feil ${res.status}: Kunne ikke oppdatere utkast`);
      }

      await supabase
        .from('eccairs_exports')
        .update({
          e2_version: json.e2_version ?? json.data?.version ?? null,
          response: json,
          last_error: null,
          last_attempt_at: new Date().toISOString(),
        })
        .eq('incident_id', incidentId)
        .eq('environment', ECCAIRS_ENV);

      toast.success("ECCAIRS-utkast oppdatert");
    } catch (err: any) {
      console.error('ECCAIRS update failed', err);
      toast.error(`Kunne ikke oppdatere utkast: ${err?.message}`);
    } finally {
      setEccairsExportingId(null);
    }
  };

  const deleteEccairsDraft = async (incidentId: string) => {
    if (!ECCAIRS_GATEWAY) {
      toast.error("ECCAIRS gateway URL er ikke konfigurert");
      return;
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      toast.error("Du må være logget inn");
      return;
    }

    const exp = eccairsExports[incidentId];
    if (!exp?.e2_id) {
      toast.error("Ingen E2 ID funnet");
      return;
    }

    if (!confirm(`Er du sikker på at du vil slette ECCAIRS-utkast ${exp.e2_id}?`)) {
      return;
    }

    setEccairsExportingId(incidentId);

    try {
      const res = await fetch(`${ECCAIRS_GATEWAY}/api/eccairs/drafts/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          ...(ECCAIRS_GATEWAY_KEY ? { 'x-api-key': ECCAIRS_GATEWAY_KEY } : {}),
        },
        body: JSON.stringify({ 
          e2_id: exp.e2_id,
          environment: ECCAIRS_ENV 
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Feil ${res.status}: Kunne ikke slette utkast`);
      }

      // Oppdater lokal database - marker som slettet
      await supabase
        .from('eccairs_exports')
        .delete()
        .eq('incident_id', incidentId)
        .eq('environment', ECCAIRS_ENV);

      // Oppdater state - fjern fra exports
      setEccairsExports(prev => {
        const updated = { ...prev };
        delete updated[incidentId];
        return updated;
      });

      toast.success(`ECCAIRS-utkast ${exp.e2_id} slettet`);
    } catch (err: any) {
      console.error('ECCAIRS delete failed', err);
      toast.error(`Kunne ikke slette utkast: ${err?.message}`);
    } finally {
      setEccairsExportingId(null);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-foreground">Laster...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative w-full overflow-x-hidden">
      {/* Background with gradient overlay */}
      <div 
        className="fixed inset-0 z-0" 
        style={{
          backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.5)), url(${droneBackground})`,
          backgroundSize: "cover",
          backgroundPosition: "center center",
          backgroundRepeat: "no-repeat"
        }} 
      />

      {/* Content */}
      <div className="relative z-10 w-full">
        <main className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2 text-secondary-foreground">Hendelser</h1>
          </div>

          <GlassCard className="mb-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Søk i hendelser..." 
                  value={searchQuery} 
                  onChange={e => setSearchQuery(e.target.value)} 
                  className="pl-9" 
                />
              </div>
              
              <Button onClick={() => setAddDialogOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Legg til hendelse
              </Button>
            </div>

            <div className="flex gap-2 mt-4 flex-wrap">
              {statusOptions.map(status => (
                <Button 
                  key={status} 
                  variant={selectedStatus === status ? "default" : "outline"} 
                  size="sm" 
                  onClick={() => setSelectedStatus(status)}
                >
                  {status}
                </Button>
              ))}
            </div>
          </GlassCard>

          {loading ? (
            <GlassCard>
              <p className="text-center text-muted-foreground py-8">Laster hendelser...</p>
            </GlassCard>
          ) : filteredIncidents.length === 0 ? (
            <GlassCard>
              <p className="text-center text-muted-foreground py-8">
                {searchQuery || selectedStatus !== "Alle" 
                  ? "Ingen hendelser funnet med valgte filtre" 
                  : "Ingen hendelser rapportert ennå"}
              </p>
            </GlassCard>
          ) : (
            <div className="grid gap-4">
              {filteredIncidents.map(incident => (
                <GlassCard key={incident.id} className="space-y-4">
                  {/* Header with title and action buttons */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3">
                        {incident.incident_number && (
                          <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{incident.incident_number}</span>
                        )}
                        <h3 className="font-semibold text-lg sm:text-xl">{incident.tittel}</h3>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge className={statusColors[incident.status] || ""}>
                          {incident.status}
                        </Badge>
                        <Badge className={severityColors[incident.alvorlighetsgrad] || ""}>
                          {incident.alvorlighetsgrad}
                        </Badge>
                        {incident.kategori && (
                          <Badge variant="outline">{incident.kategori}</Badge>
                        )}
                        {incident.hovedaarsak && (
                          <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/30 dark:text-amber-100 dark:border-amber-700">
                            {incident.hovedaarsak}
                          </Badge>
                        )}
                        {incident.medvirkende_aarsak && (
                          <Badge variant="outline" className="bg-slate-100 text-slate-900 border-slate-300 dark:bg-slate-700/30 dark:text-slate-100 dark:border-slate-600">
                            {incident.medvirkende_aarsak}
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex gap-2 shrink-0">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleEditRequest(incident)}
                      >
                        <Edit className="w-4 h-4 mr-2" />
                        Rediger
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleExportPDF(incident)}
                        disabled={exportingId === incident.id}
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        {exportingId === incident.id ? "Eksporterer..." : "PDF"}
                      </Button>
                    </div>
                  </div>

                  {/* Info grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    {incident.lokasjon && (
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                        <span>{incident.lokasjon}</span>
                      </div>
                    )}
                    <div className="flex items-start gap-2">
                      <Calendar className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                      <span>
                        {format(new Date(incident.hendelsestidspunkt), "d. MMMM yyyy 'kl.' HH:mm", { locale: nb })}
                      </span>
                    </div>
                    {incident.rapportert_av && (
                      <div className="flex items-start gap-2">
                        <User className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                        <span>Rapportert av: {incident.rapportert_av}</span>
                      </div>
                    )}
                    {incident.oppfolgingsansvarlig_id && oppfolgingsansvarlige[incident.oppfolgingsansvarlig_id] && (
                      <div className="flex items-start gap-2">
                        <Bell className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                        <span>Ansvarlig: {oppfolgingsansvarlige[incident.oppfolgingsansvarlig_id]}</span>
                      </div>
                    )}
                  </div>

                  {/* Description */}
                  {incident.beskrivelse && (
                    <div className="pt-3 border-t border-border/50">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        Beskrivelse
                      </p>
                      <p className="text-sm whitespace-pre-wrap">{incident.beskrivelse}</p>
                    </div>
                  )}

                  {/* Linked mission */}
                  {incident.mission_id && missions[incident.mission_id] && (
                    <div className="pt-3 border-t border-border/50">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        Tilknyttet oppdrag
                      </p>
                      <button
                        onClick={() => {
                          setSelectedMission(missions[incident.mission_id]);
                          setMissionDialogOpen(true);
                        }}
                        className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
                      >
                        <Link2 className="w-4 h-4 text-muted-foreground" />
                        <span className="underline underline-offset-2">{missions[incident.mission_id].tittel}</span>
                      </button>
                    </div>
                  )}

                  {/* ECCAIRS Export Status - only show if enabled for company */}
                  {eccairsEnabled && (
                    <div className="pt-3 border-t border-border/50">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          ECCAIRS Rapportering
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2"
                          onClick={() => setEccairsSettingsOpen(true)}
                        >
                          <Settings2 className="w-3 h-3 mr-1" />
                          <span className="text-xs">Innstillinger</span>
                        </Button>
                      </div>
                      {(() => {
                        const exp = eccairsExports[incident.id];
                        return (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                            <div className="flex items-center gap-2 col-span-1 sm:col-span-2">
                              <span className="text-muted-foreground">Status:</span>
                              <Badge variant="outline" className={cn(getEccairsStatusClass(exp?.status))}>
                                {getEccairsStatusLabel(exp?.status)}
                              </Badge>
                            </div>
                            {exp?.e2_id && (
                              <div className="flex items-center gap-2 col-span-1 sm:col-span-2">
                                <span className="text-muted-foreground">E2 ID:</span>
                                <span className="text-xs break-all">{exp.e2_id}</span>
                              </div>
                            )}
                            {exp?.last_attempt_at && (
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">Sist forsøk:</span>
                                <span>
                                  {format(new Date(exp.last_attempt_at), 'd. MMM HH:mm', { locale: nb })}
                                </span>
                              </div>
                            )}
                            {typeof exp?.attempts === 'number' && exp.attempts > 0 && (
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">Forsøk:</span>
                                <span>{exp.attempts}</span>
                              </div>
                            )}
                            {exp?.last_error && (
                              <div className="col-span-2 flex items-start gap-2 text-red-600 dark:text-red-400">
                                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                <span className="text-xs">{exp.last_error}</span>
                              </div>
                            )}
                            {/* Action buttons */}
                            <div className="col-span-2 mt-2 flex flex-wrap gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={async (e) => { 
                                  e.preventDefault();
                                  // Fetch drone serial number if incident has a mission
                                  let droneSerialNumber: string | null = null;
                                  if (incident.mission_id) {
                                    const { data: missionDrones } = await supabase
                                      .from('mission_drones')
                                      .select('drone_id, drones(serienummer)')
                                      .eq('mission_id', incident.mission_id)
                                      .limit(1);
                                    if (missionDrones && missionDrones.length > 0) {
                                      const drone = missionDrones[0].drones as any;
                                      droneSerialNumber = drone?.serienummer || null;
                                    }
                                  }
                                  setEccairsMappingIncident({
                                    ...incident,
                                    drone_serial_number: droneSerialNumber
                                  });
                                  setEccairsMappingDialogOpen(true);
                                }}
                              >
                                <Tags className="w-4 h-4 mr-2" />
                                Klassifiser
                              </Button>
                              {(!exp || exp.status === 'failed' || exp.status === 'pending') && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={eccairsExportingId === incident.id}
                                  onClick={(e) => { 
                                    e.preventDefault(); 
                                    exportToEccairs(incident.id); 
                                  }}
                                >
                                  {eccairsExportingId === incident.id ? (
                                    <>
                                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                      Eksporterer...
                                    </>
                                  ) : (
                                    <>Eksporter til ECCAIRS</>
                                  )}
                                </Button>
                              )}
                              {exp?.e2_id && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => { 
                                      e.preventDefault(); 
                                      openInEccairs(exp.e2_id!); 
                                    }}
                                  >
                                    <ExternalLink className="w-4 h-4 mr-2" />
                                    Åpne i ECCAIRS
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => { 
                                      e.preventDefault(); 
                                      setAttachmentIncident({ id: incident.id, e2Id: exp.e2_id! });
                                      setAttachmentDialogOpen(true);
                                    }}
                                  >
                                    <Paperclip className="w-4 h-4 mr-2" />
                                    Vedlegg
                                  </Button>
                                </>
                              )}
                              {(exp?.status === 'draft_created' || exp?.status === 'draft_updated') && exp?.e2_id && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={eccairsExportingId === incident.id}
                                    onClick={(e) => { 
                                      e.preventDefault(); 
                                      updateEccairsDraft(incident.id); 
                                    }}
                                  >
                                    {eccairsExportingId === incident.id ? (
                                      <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Oppdaterer...
                                      </>
                                    ) : (
                                      <>
                                        <RefreshCw className="w-4 h-4 mr-2" />
                                        Oppdater utkast
                                      </>
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={(e) => { 
                                      e.preventDefault(); 
                                      submitToEccairs(incident.id); 
                                    }}
                                  >
                                    Send inn til ECCAIRS
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    disabled={eccairsExportingId === incident.id}
                                    onClick={(e) => { 
                                      e.preventDefault(); 
                                      deleteEccairsDraft(incident.id); 
                                    }}
                                  >
                                    {eccairsExportingId === incident.id ? (
                                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                      <Trash2 className="w-4 h-4 mr-2" />
                                    )}
                                    Slett utkast
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Comments - Collapsible */}
                  <div className="pt-3 border-t border-border/50">
                    <Collapsible>
                      <CollapsibleTrigger className="flex items-center justify-between w-full text-sm text-muted-foreground hover:text-foreground transition-colors group">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="w-4 h-4" />
                          <span>
                            {commentCounts[incident.id] 
                              ? `${commentCounts[incident.id]} kommentar${commentCounts[incident.id] > 1 ? 'er' : ''}`
                              : 'Ingen kommentarer'
                            }
                          </span>
                        </div>
                        <ChevronDown className="w-4 h-4 transition-transform group-data-[state=open]:rotate-180" />
                      </CollapsibleTrigger>
                      
                      <CollapsibleContent className="pt-3 space-y-3">
                        {comments[incident.id]?.length > 0 ? (
                          comments[incident.id].map((comment) => (
                            <div key={comment.id} className="bg-muted/50 rounded-lg p-3 text-sm">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium">{comment.created_by_name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(comment.created_at), "d. MMM yyyy HH:mm", { locale: nb })}
                                </span>
                              </div>
                              <p className="text-muted-foreground">{comment.comment_text}</p>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground italic">Ingen kommentarer ennå</p>
                        )}
                        
                        <button
                          onClick={() => handleIncidentClick(incident)}
                          className="text-sm text-primary hover:underline"
                        >
                          Legg til kommentar eller se alle detaljer →
                        </button>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </main>
      </div>

      <AddIncidentDialog 
        open={addDialogOpen} 
        onOpenChange={handleAddDialogClose} 
        incidentToEdit={incidentToEdit}
      />

      <IncidentDetailDialog 
        open={detailDialogOpen} 
        onOpenChange={setDetailDialogOpen} 
        incident={selectedIncident} 
        onEditRequest={handleEditRequest}
      />

      <MissionDetailDialog
        open={missionDialogOpen}
        onOpenChange={setMissionDialogOpen}
        mission={selectedMission}
      />

      {eccairsMappingIncident && (
        <EccairsMappingDialog
          incident={eccairsMappingIncident}
          open={eccairsMappingDialogOpen}
          onOpenChange={(open) => {
            setEccairsMappingDialogOpen(open);
            if (!open) setEccairsMappingIncident(null);
          }}
        />
      )}

      {attachmentIncident && (
        <EccairsAttachmentUpload
          incidentId={attachmentIncident.id}
          e2Id={attachmentIncident.e2Id}
          open={attachmentDialogOpen}
          onOpenChange={(open) => {
            setAttachmentDialogOpen(open);
            if (!open) setAttachmentIncident(null);
          }}
        />
      )}

      <EccairsSettingsDialog
        open={eccairsSettingsOpen}
        onOpenChange={setEccairsSettingsOpen}
      />
    </div>
  );
};

export default Hendelser;
