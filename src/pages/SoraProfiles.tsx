import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/GlassCard";
import { cn } from "@/lib/utils";
import { deriveSoraProfileStatus } from "@/hooks/useSoraProfile";
import { soraStatusClass } from "@/components/sora/SoraProfileBadge";
import { SoraProfileDialog } from "@/components/sora/SoraProfileDialog";

const SoraProfiles = () => {
  const { t } = useTranslation();
  const { companyId, isAdmin } = useAuth();
  const [openId, setOpenId] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["sora-profile-list", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const [types, missions, profiles] = await Promise.all([
        supabase.from("company_mission_types").select("sora_document_id").eq("company_id", companyId!).not("sora_document_id", "is", null),
        supabase.from("missions").select("sora_document_id").eq("company_id", companyId!).not("sora_document_id", "is", null).limit(1000),
        (supabase.from("sora_document_profiles" as any).select("document_id, status, source_file_url").eq("company_id", companyId!) as any),
      ]);
      const ids = new Set<string>();
      for (const r of (types.data as any[]) || []) ids.add(r.sora_document_id);
      for (const r of (missions.data as any[]) || []) ids.add(r.sora_document_id);
      for (const r of (profiles.data as any[]) || []) ids.add(r.document_id);
      if (ids.size === 0) return [];
      const { data: docs } = await supabase.from("documents").select("id, tittel, fil_url, company_id")
        .in("id", [...ids]).eq("company_id", companyId!).order("tittel");
      const byDoc = new Map(((profiles.data as any[]) || []).map((p) => [p.document_id, p]));
      return ((docs as any[]) || []).map((d) => ({ ...d, status: deriveSoraProfileStatus(byDoc.get(d.id), d.fil_url) }));
    },
  });

  if (!isAdmin) return <div className="p-6 text-sm text-muted-foreground">{t("soraProfile.adminOnly")}</div>;

  return (
    <div className="container mx-auto max-w-4xl p-4 space-y-4">
      <GlassCard className="p-4">
        <h1 className="text-xl font-semibold">{t("soraProfile.pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("soraProfile.pageDescription")}</p>
      </GlassCard>
      <GlassCard className="p-2">
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : data.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{t("soraProfile.noDocuments")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.map((d: any) => (
              <li key={d.id} className="flex items-center gap-3 p-3 hover:bg-muted/50">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate text-sm">{d.tittel}</span>
                <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", soraStatusClass(d.status))}>
                  {t(`soraProfile.status.${d.status}`)}
                </span>
                <Button size="sm" variant="outline" onClick={() => setOpenId(d.id)}>{t("soraProfile.open")}</Button>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
      {openId && <SoraProfileDialog documentId={openId} open onOpenChange={(o) => !o && setOpenId(null)} />}
    </div>
  );
};

export default SoraProfiles;
