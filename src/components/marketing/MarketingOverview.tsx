import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lightbulb, FileEdit, CheckCircle, Clock } from "lucide-react";

export const MarketingOverview = () => {
  const { companyId } = useAuth();

  const { data: ideaCount = 0 } = useQuery({
    queryKey: ["marketing-ideas-count", companyId],
    queryFn: async () => {
      const { count } = await supabase
        .from("marketing_content_ideas")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId!);
      return count ?? 0;
    },
    enabled: !!companyId,
  });

  const { data: draftCount = 0 } = useQuery({
    queryKey: ["marketing-drafts-count", companyId],
    queryFn: async () => {
      const { count } = await supabase
        .from("marketing_drafts")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId!)
        .eq("status", "draft");
      return count ?? 0;
    },
    enabled: !!companyId,
  });

  const { data: approvedCount = 0 } = useQuery({
    queryKey: ["marketing-approved-count", companyId],
    queryFn: async () => {
      const { count } = await supabase
        .from("marketing_drafts")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId!)
        .eq("status", "approved");
      return count ?? 0;
    },
    enabled: !!companyId,
  });

  const { data: scheduledCount = 0 } = useQuery({
    queryKey: ["marketing-scheduled-count", companyId],
    queryFn: async () => {
      const { count } = await supabase
        .from("marketing_drafts")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId!)
        .eq("status", "scheduled");
      return count ?? 0;
    },
    enabled: !!companyId,
  });

  const stats = [
    { label: "Idéer", value: ideaCount, icon: Lightbulb, color: "text-yellow-500" },
    { label: "Utkast", value: draftCount, icon: FileEdit, color: "text-blue-500" },
    { label: "Godkjent", value: approvedCount, icon: CheckCircle, color: "text-green-500" },
    { label: "Planlagt", value: scheduledCount, icon: Clock, color: "text-orange-500" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Marketing Oversikt</h1>
        <p className="text-muted-foreground text-sm mt-1">Administrer innholdsidéer og utkast for markedsføring.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <s.icon className={`w-4 h-4 ${s.color}`} />
                {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
