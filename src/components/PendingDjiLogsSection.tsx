import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Plane, CheckCircle, XCircle, Loader2, Trash2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { toast } from "sonner";
import { usePlanGating } from "@/hooks/usePlanGating";

interface PendingDjiLog {
  id: string;
  dji_log_id: string;
  aircraft_name: string | null;
  aircraft_sn: string | null;
  flight_date: string | null;
  duration_seconds: number | null;
  max_height_m: number | null;
  total_distance_m: number | null;
  matched_drone_id: string | null;
  matched_battery_id: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
  parsed_result: any;
}

interface PendingDjiLogsSectionProps {
  onSelectLog: (log: PendingDjiLog) => void;
}

export interface PendingDjiLogsSectionRef {
  refresh: () => void;
}

export const PendingDjiLogsSection = forwardRef<PendingDjiLogsSectionRef, PendingDjiLogsSectionProps>(({ onSelectLog }, ref) => {
  const { companyId } = useAuth();
  const { hasAddon } = usePlanGating();
  const [logs, setLogs] = useState<PendingDjiLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const djiEnabled = hasAddon('dji');

  useImperativeHandle(ref, () => ({
    refresh: () => { if (companyId) fetchPendingLogs(); }
  }));

  useEffect(() => {
    if (companyId) fetchPendingLogs();
  }, [companyId]);

  const fetchPendingLogs = async () => {
    if (!companyId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("pending_dji_logs")
      .select("*")
      .eq("company_id", companyId)
      .eq("status", "pending")
      .order("flight_date", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Error fetching pending logs:", error);
    }
    setLogs((data as PendingDjiLog[]) || []);
    setLoading(false);
  };

  const handleDismiss = async (e: React.MouseEvent, logId: string) => {
    e.stopPropagation();
    setDismissingId(logId);
    const { error } = await supabase
      .from("pending_dji_logs")
      .update({ status: "dismissed" })
      .eq("id", logId);

    if (error) {
      toast.error("Kunne ikke avvise loggen");
      console.error("Dismiss error:", error);
    } else {
      setLogs(prev => prev.filter(l => l.id !== logId));
      toast.success("Logg fjernet");
    }
    setDismissingId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-3 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        <span className="text-xs">Sjekker ventende logger...</span>
      </div>
    );
  }

  if (logs.length === 0) return (
    <p className="text-xs text-muted-foreground">Ingen logger til behandling</p>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-primary" />
        <p className="text-sm font-medium">Ventende flylogger fra auto-sync</p>
        <Badge variant="secondary" className="text-xs">{logs.length}</Badge>
      </div>
      <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
        {logs.map(log => (
          <button
            key={log.id}
            onClick={() => onSelectLog(log)}
            className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/30 transition-all text-left group"
          >
            <Plane className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium truncate">
                  {log.aircraft_name || log.aircraft_sn || "Ukjent drone"}
                </p>
                {log.matched_drone_id && (
                  <CheckCircle className="w-3 h-3 text-green-500 shrink-0" />
                )}
                {!log.matched_drone_id && (
                  <AlertTriangle className="w-3 h-3 text-yellow-500 shrink-0" />
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {log.flight_date
                  ? format(new Date(log.flight_date), "dd. MMM yyyy HH:mm", { locale: nb })
                  : "Ukjent dato"}
                {log.duration_seconds
                  ? ` · ${Math.round(log.duration_seconds / 60)} min`
                  : ""}
                {log.max_height_m ? ` · ${Math.round(log.max_height_m)}m` : ""}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
              onClick={(e) => handleDismiss(e, log.id)}
              disabled={dismissingId === log.id}
            >
              {dismissingId === log.id ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </Button>
          </button>
        ))}
      </div>
    </div>
  );
});
