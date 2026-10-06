import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FileText, Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/GlassCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { deriveSoraProfileStatus } from "@/hooks/useSoraProfile";
import { soraStatusClass } from "@/components/sora/SoraProfileBadge";
import { SoraProfileDialog } from "@/components/sora/SoraProfileDialog";

const SoraProfiles = () => {
  const { t } = useTranslation();
  const { companyId, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [openId, setOpenId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");

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

  const { data: allDocs = [], isLoading: docsLoading } = useQuery({
    queryKey: ["sora-profile-doc-picker", companyId],
    enabled: !!companyId && pickerOpen,
    queryFn: async () => {
      const { data: docs } = await supabase.from("documents").select("id, tittel, kategori")
        .eq("company_id", companyId!).order("tittel").limit(500);
      return (docs as any[]) || [];
    },
  });

  const filteredDocs = allDocs.filter((d) =>
    !query || d.tittel.toLowerCase().includes(query.toLowerCase()) || (d.kategori || "").toLowerCase().includes(query.toLowerCase())
  );

  const goBack = () => {
    navigate("/admin");
    // Open the company config tab (Operasjonstyper lives there) once Admin mounts
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("avisafe:set-admin-tab", { detail: { value: "company-config" } }));
    }, 300);
  };

  if (!isAdmin) return <div className="p-6 text-sm text-muted-foreground">{t("soraProfile.adminOnly")}</div>;

  return (
    <div className="container mx-auto max-w-4xl p-4 space-y-4">
      <GlassCard className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" onClick={goBack} aria-label={t("common.back")} className="shrink-0 mt-0.5">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold">{t("soraProfile.pageTitle")}</h1>
              <p className="text-sm text-muted-foreground">{t("soraProfile.pageDescription")}</p>
            </div>
          </div>
          <Button size="sm" onClick={() => { setQuery(""); setPickerOpen(true); }} className="shrink-0 gap-1.5">
            <Plus className="h-4 w-4" />
            {t("soraProfile.newProfile")}
          </Button>
        </div>
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

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("soraProfile.pickDocument")}</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("soraProfile.searchDocuments")}
              className="pl-9"
              autoFocus
            />
          </div>
          <div className="max-h-[50vh] overflow-y-auto overscroll-contain [touch-action:pan-y] -mx-2 px-2">
            {docsLoading ? (
              <p className="p-4 text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : filteredDocs.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">{t("soraProfile.noDocsFound")}</p>
            ) : (
              <ul className="divide-y divide-border">
                {filteredDocs.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/50 rounded-md"
                      onClick={() => { setPickerOpen(false); setOpenId(d.id); }}
                    >
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate text-sm">{d.tittel}</span>
                      {d.kategori && <span className="text-xs text-muted-foreground truncate max-w-[30%]">{d.kategori}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {openId && <SoraProfileDialog documentId={openId} open onOpenChange={(o) => !o && setOpenId(null)} />}
    </div>
  );
};

export default SoraProfiles;
