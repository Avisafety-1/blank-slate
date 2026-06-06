import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/GlassCard";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Building2, Users, Plane, Clock, AlertTriangle, Package, Target, Shield, CheckCircle, Activity, BarChart3, Sparkles, ChevronDown, RefreshCw } from "lucide-react";
import { PlatformActivityLog } from "@/components/admin/PlatformActivityLog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import droneBackground from "@/assets/drone-background.png";
import { useTranslation } from "react-i18next";


const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--destructive))",
  "hsl(var(--status-yellow))",
  "hsl(var(--status-green))",
  "hsl(var(--muted-foreground))",
  "#8884d8",
  "#82ca9d",
  "#ffc658",
];

interface PlatformStats {
  kpis: {
    activeCompanies: number;
    approvedUsers: number;
    totalFlights: number;
    totalFlightHours: number;
    totalIncidents: number;
    totalDrones: number;
    totalMissions: number;
    totalRiskAssessments: number;
  };
  trends: {
    flightsPerMonth: { month: string; count: number }[];
    flightHoursPerMonth: { month: string; hours: number }[];
    incidentsPerMonth: { month: string; count: number }[];
    usersPerMonth: { month: string; count: number }[];
    riskAssessmentsPerMonth: { month: string; count: number }[];
  };
  distributions: {
    incidentsBySeverity: { name: string; value: number }[];
    missionsByStatus: { name: string; value: number }[];
  };
  rankings: {
    topCompaniesByHours: { name: string; hours: number }[];
    topCompaniesByMissions: { name: string; count: number }[];
  };
  metrics: {
    safeskyRate: number;
    checklistRate: number;
    avgFlightMinutes: number;
    incidentFrequency: number;
  };
}

const formatMonth = (m: string) => {
  const [year, month] = m.split("-");
  const months = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];
  return `${months[parseInt(month) - 1]} ${year.slice(2)}`;
};

const Statistikk = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading, isSuperAdmin, companyName } = useAuth();
  const { t } = useTranslation();

  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [excludeAvisafe, setExcludeAvisafe] = useState(true);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const canAccess = isSuperAdmin && companyName?.toLowerCase() === "avisafe";

  useEffect(() => {
    if (authLoading) return;
    if (!user || !canAccess) {
      navigate("/");
      return;
    }
    fetchStats();
  }, [user, authLoading, canAccess, excludeAvisafe]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error("No session");

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/platform-statistics?exclude_avisafe=${excludeAvisafe}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to fetch stats");
      }

      const result = await res.json();
      setStats(result);
    } catch (error) {
      console.error("Error fetching platform statistics:", error);
    } finally {
      setLoading(false);
    }
  };

  const runAiAnalysis = async () => {
    setAiLoading(true);
    setAiText("");
    setAiOpen(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error("Ingen aktiv sesjon");

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/platform-statistics-ai`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ exclude_avisafe: excludeAvisafe }),
        }
      );

      if (!resp.ok || !resp.body) {
        let msg = "AI-analyse feilet";
        try {
          const j = await resp.json();
          msg = j.error || msg;
        } catch { /* ignore */ }
        if (resp.status === 429) msg = "Forespørselsgrense nådd. Prøv igjen om litt.";
        if (resp.status === 402) msg = "AI-kreditter brukt opp. Legg til kreditter i workspace.";
        toast.error(msg);
        setAiText(msg);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let assembled = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assembled += content;
              setAiText(assembled);
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
    } catch (err) {
      console.error("AI analysis error:", err);
      const msg = err instanceof Error ? err.message : "Ukjent feil";
      toast.error(msg);
      setAiText(msg);
    } finally {
      setAiLoading(false);
    }
  };

  if (authLoading || (!canAccess && !authLoading)) {
    return null;
  }

  return (
    <div
      className="min-h-screen bg-gradient-to-b from-background via-background/95 to-background/90"
      style={{
        backgroundImage: `url(${droneBackground})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "scroll",
      }}
    >
      <div className="min-h-screen bg-background/85">
        {/* Header */}
        <header className="bg-card/95 border-b border-glass sticky top-0 pt-[env(safe-area-inset-top)] z-[1100]">
          <div className="w-full px-3 sm:px-4 py-2 sm:py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="h-8 w-8 p-0 flex-shrink-0 sm:h-auto sm:w-auto sm:px-3">
                <ArrowLeft className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">{t('pages.stats.back')}</span>
              </Button>
              <h1 className="text-base sm:text-xl font-bold text-foreground truncate">
                Plattformstatistikk
              </h1>
            </div>
            <div className="flex items-center gap-2 pl-10 sm:pl-0 flex-wrap">
              <Switch
                id="exclude-avisafe"
                checked={excludeAvisafe}
                onCheckedChange={setExcludeAvisafe}
              />
              <Label htmlFor="exclude-avisafe" className="text-xs sm:text-sm cursor-pointer whitespace-nowrap">
                Ekskluder Avisafe
              </Label>
              <Button
                size="sm"
                variant="outline"
                onClick={runAiAnalysis}
                disabled={aiLoading || loading}
                className="ml-1"
              >
                <Sparkles className="w-4 h-4 mr-1" />
                {aiLoading ? "Analyserer..." : "Behandle med AI"}
              </Button>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-6 space-y-6">
          {loading ? (
            <div className="text-center py-20 text-muted-foreground">{t('pages.stats.loading')}</div>
          ) : stats ? (
            <>
              {/* AI Analysis */}
              {(aiOpen || aiText) && (
                <Collapsible open={aiOpen} onOpenChange={setAiOpen}>
                  <GlassCard>
                    <div className="flex items-center justify-between gap-2">
                      <CollapsibleTrigger className="flex items-center gap-2 font-semibold text-foreground flex-1 text-left">
                        <Sparkles className="w-4 h-4 text-primary" />
                        AI-analyse for ledelsen
                        <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${aiOpen ? "rotate-180" : ""}`} />
                      </CollapsibleTrigger>
                      {aiText && !aiLoading && (
                        <Button size="sm" variant="ghost" onClick={runAiAnalysis} title="Generer på nytt">
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    <CollapsibleContent>
                      <div className="mt-4 text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                        {aiText || (aiLoading ? "Genererer analyse..." : "")}
                        {aiLoading && aiText && <span className="inline-block w-2 h-4 bg-primary/60 animate-pulse ml-1 align-middle" />}
                      </div>
                    </CollapsibleContent>
                  </GlassCard>
                </Collapsible>
              )}

              {/* Activity Log */}
              <PlatformActivityLog excludeAvisafe={excludeAvisafe} />


              {/* KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 gap-3">
                <KPICard icon={Building2} label="Selskaper" value={stats.kpis.activeCompanies} />
                <KPICard icon={Users} label="Brukere" value={stats.kpis.approvedUsers} />
                <KPICard icon={Plane} label="Flyturer" value={stats.kpis.totalFlights} />
                <KPICard icon={Clock} label="Flytimer" value={stats.kpis.totalFlightHours} />
                <KPICard icon={AlertTriangle} label="Hendelser" value={stats.kpis.totalIncidents} />
                <KPICard icon={Package} label="Droner" value={stats.kpis.totalDrones} />
                <KPICard icon={Target} label="Oppdrag" value={stats.kpis.totalMissions} />
                <KPICard icon={Shield} label="Risikovurderinger" value={stats.kpis.totalRiskAssessments} />
              </div>

              {/* Extra metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <GlassCard className="text-center">
                  <Shield className="w-5 h-5 mx-auto mb-1 text-primary" />
                  <div className="text-xl font-bold text-foreground">{stats.metrics.safeskyRate}%</div>
                  <div className="text-xs text-muted-foreground">{t('pages.stats.safeSkyUsage')}</div>
                </GlassCard>
                <GlassCard className="text-center">
                  <CheckCircle className="w-5 h-5 mx-auto mb-1 text-primary" />
                  <div className="text-xl font-bold text-foreground">{stats.metrics.checklistRate}%</div>
                  <div className="text-xs text-muted-foreground">{t('pages.stats.checklistRate')}</div>
                </GlassCard>
                <GlassCard className="text-center">
                  <Clock className="w-5 h-5 mx-auto mb-1 text-primary" />
                  <div className="text-xl font-bold text-foreground">{stats.metrics.avgFlightMinutes} min</div>
                  <div className="text-xs text-muted-foreground">{t('pages.stats.avgFlightTime')}</div>
                </GlassCard>
                <GlassCard className="text-center">
                  <Activity className="w-5 h-5 mx-auto mb-1 text-primary" />
                  <div className="text-xl font-bold text-foreground">{stats.metrics.incidentFrequency}</div>
                  <div className="text-xs text-muted-foreground">{t('pages.stats.incidentsPer100h')}</div>
                </GlassCard>

              </div>

              {/* Charts row 1 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <GlassCard>
                  <h3 className="font-semibold mb-4 text-foreground">{t('pages.stats.flightsPerMonth')}</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={stats.trends.flightsPerMonth}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" tickFormatter={formatMonth} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                      <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip />
                      <Bar dataKey="count" fill="hsl(var(--primary))" name="Flyturer" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </GlassCard>

                <GlassCard>
                  <h3 className="font-semibold mb-4 text-foreground">{t('pages.stats.flightTimePerMonth')}</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={stats.trends.flightHoursPerMonth}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" tickFormatter={formatMonth} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                      <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip />
                      <Line type="monotone" dataKey="hours" stroke="hsl(var(--primary))" strokeWidth={2} name="Timer" />
                    </LineChart>
                  </ResponsiveContainer>
                </GlassCard>
              </div>

              {/* Charts row 2 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <GlassCard>
                  <h3 className="font-semibold mb-4 text-foreground">{t('pages.stats.incidentsPerMonth')}</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={stats.trends.incidentsPerMonth}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" tickFormatter={formatMonth} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                      <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip />
                      <Bar dataKey="count" fill="hsl(var(--destructive))" name="Hendelser" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </GlassCard>

                <GlassCard>
                  <h3 className="font-semibold mb-4 text-foreground">{t('pages.stats.riskAssessmentsPerMonth')}</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={stats.trends.riskAssessmentsPerMonth}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" tickFormatter={formatMonth} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                      <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip />
                      <Bar dataKey="count" fill="hsl(var(--primary))" name="Risikovurderinger" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </GlassCard>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <GlassCard>
                  <h3 className="font-semibold mb-4 text-foreground">{t('pages.stats.newUsersPerMonth')}</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={stats.trends.usersPerMonth}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" tickFormatter={formatMonth} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                      <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip />
                      <Line type="monotone" dataKey="count" stroke="hsl(var(--status-green))" strokeWidth={2} name="Nye brukere" />
                    </LineChart>
                  </ResponsiveContainer>
                </GlassCard>
              </div>

              {/* Charts row 3 - Pie charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <GlassCard>
                  <h3 className="font-semibold mb-4 text-foreground">{t('pages.stats.incidentsBySeverity')}</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={stats.distributions.incidentsBySeverity}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {stats.distributions.incidentsBySeverity.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </GlassCard>

                <GlassCard>
                  <h3 className="font-semibold mb-4 text-foreground">{t('pages.stats.missionsByStatus')}</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={stats.distributions.missionsByStatus}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {stats.distributions.missionsByStatus.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </GlassCard>
              </div>

              {/* Charts row 4 - Top companies */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <GlassCard>
                  <h3 className="font-semibold mb-4 text-foreground">{t('pages.stats.top10CompaniesHours')}</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={stats.rankings.topCompaniesByHours} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                      <YAxis dataKey="name" type="category" width={120} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip />
                      <Bar dataKey="hours" fill="hsl(var(--primary))" name="Flytimer" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </GlassCard>

                <GlassCard>
                  <h3 className="font-semibold mb-4 text-foreground">{t('pages.stats.top10CompaniesMissions')}</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={stats.rankings.topCompaniesByMissions} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                      <YAxis dataKey="name" type="category" width={120} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip />
                      <Bar dataKey="count" fill="hsl(var(--status-green))" name="Oppdrag" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </GlassCard>
              </div>
            </>
          ) : (
            <div className="text-center py-20 text-muted-foreground">
              Kunne ikke laste statistikk.
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

interface KPICardProps {
  icon: React.ElementType;
  label: string;
  value: number;
}

const KPICard = ({ icon: Icon, label, value }: KPICardProps) => (
  <GlassCard className="text-center py-3 px-2">
    <Icon className="w-5 h-5 mx-auto mb-1 text-primary" />
    <div className="text-2xl font-bold text-foreground">{value.toLocaleString("nb-NO")}</div>
    <div className="text-xs text-muted-foreground">{label}</div>
  </GlassCard>
);

export default Statistikk;
