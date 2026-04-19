import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

interface Report {
  id: string;
  category_path: string[];
  comment: string | null;
  created_at: string;
  reported_by: string | null;
  profiles?: { full_name: string | null } | null;
}

interface Props {
  missionId: string | undefined;
  open: boolean;
}

export const DeviationReportsSection = ({ missionId, open }: Props) => {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !missionId) return;
    setLoading(true);
    (supabase as any)
      .from("mission_deviation_reports")
      .select("id, category_path, comment, created_at, reported_by, profiles:reported_by(full_name)")
      .eq("mission_id", missionId)
      .order("created_at", { ascending: false })
      .then(({ data }: any) => {
        setReports(data || []);
        setLoading(false);
      });
  }, [missionId, open]);

  if (loading || reports.length === 0) return null;

  return (
    <div className="border-t border-border pt-4">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
        <p className="text-sm font-medium text-muted-foreground">Avviksrapporter</p>
        <Badge variant="secondary">{reports.length}</Badge>
      </div>
      <div className="space-y-2">
        {reports.map((r) => (
          <div key={r.id} className="rounded-md border bg-muted/30 p-3 space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {r.profiles?.full_name || "Ukjent pilot"} ·{" "}
                {format(new Date(r.created_at), "dd.MM.yyyy HH:mm", { locale: nb })}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1 text-sm">
              {r.category_path.map((label, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                  <span className="font-medium">{label}</span>
                </span>
              ))}
            </div>
            {r.comment && <p className="text-sm text-muted-foreground italic">"{r.comment}"</p>}
          </div>
        ))}
      </div>
    </div>
  );
};
