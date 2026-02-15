import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Target,
  Shield,
  AlertTriangle,
  FileText,
  UserPlus,
  Package,
  Wrench,
  ChevronDown,
  Activity,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";

interface ActivityItem {
  type: string;
  description: string;
  person: string;
  company: string;
  timestamp: string;
}

const TYPE_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  mission: { icon: Target, label: "Oppdrag", color: "text-primary" },
  risk_assessment: { icon: Shield, label: "Risikovurdering", color: "text-purple-500" },
  incident: { icon: AlertTriangle, label: "Hendelse", color: "text-destructive" },
  document: { icon: FileText, label: "Dokument", color: "text-green-500" },
  new_user: { icon: UserPlus, label: "Ny bruker", color: "text-blue-500" },
  drone: { icon: Package, label: "Drone", color: "text-orange-500" },
  equipment: { icon: Wrench, label: "Utstyr", color: "text-muted-foreground" },
};

interface Props {
  excludeAvisafe: boolean;
}

export const PlatformActivityLog = ({ excludeAvisafe }: Props) => {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(20);

  const fetchActivities = useCallback(async (fetchLimit: number) => {
    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) return;

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/platform-activity-log?exclude_avisafe=${excludeAvisafe}&limit=${fetchLimit}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setActivities(data);
      }
    } catch (err) {
      console.error("Failed to fetch activity log:", err);
    } finally {
      setLoading(false);
    }
  }, [excludeAvisafe]);

  useEffect(() => {
    fetchActivities(limit);
  }, [fetchActivities, limit]);

  const handleLoadMore = () => {
    setLimit((prev) => Math.min(prev + 30, 200));
  };

  const formatRelativeTime = (ts: string) => {
    try {
      return formatDistanceToNow(new Date(ts), { addSuffix: true, locale: nb });
    } catch {
      return ts;
    }
  };

  const formatFullTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleString("nb-NO", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return ts;
    }
  };

  return (
    <GlassCard>
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-foreground">Aktivitetslogg</h3>
      </div>

      {loading && activities.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Laster aktivitet...
        </div>
      ) : (
        <>
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <TooltipProvider>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Type</TableHead>
                    <TableHead>Beskrivelse</TableHead>
                    <TableHead className="hidden sm:table-cell">Person</TableHead>
                    <TableHead className="hidden md:table-cell">Selskap</TableHead>
                    <TableHead className="text-right w-[120px]">Tidspunkt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activities.map((item, i) => {
                    const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.equipment;
                    const Icon = config.icon;
                    return (
                      <TableRow key={`${item.type}-${item.timestamp}-${i}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Icon className={`w-4 h-4 flex-shrink-0 ${config.color}`} />
                            <span className="text-xs whitespace-nowrap">{config.label}</span>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-foreground">
                          {item.description}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground">
                          {item.person}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">
                          {item.company}
                        </TableCell>
                        <TableCell className="text-right">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-xs text-muted-foreground cursor-default whitespace-nowrap">
                                {formatRelativeTime(item.timestamp)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {formatFullTime(item.timestamp)}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {activities.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Ingen aktivitet funnet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TooltipProvider>
          </div>

          {activities.length >= limit && limit < 200 && (
            <div className="flex justify-center mt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLoadMore}
                disabled={loading}
                className="text-muted-foreground"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <ChevronDown className="w-4 h-4 mr-1" />
                )}
                Vis mer
              </Button>
            </div>
          )}
        </>
      )}
    </GlassCard>
  );
};
