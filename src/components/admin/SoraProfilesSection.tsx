import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FileText, Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/GlassCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { deriveSoraProfileStatus } from "@/hooks/useSoraProfile";
import { soraStatusClass } from "@/components/sora/SoraProfileBadge";
import { SoraProfileDialog } from "@/components/sora/SoraProfileDialog";

interface Props {
  companyId: string;
  disabled?: boolean;
  /** Controls data fetching; defaults to true. */
  enabled?: boolean;
}

/** SORA profile list + document picker, shared by company settings and /sora-profiler. */
export function SoraProfilesSection({ companyId, disabled, enabled = true }: Props) {
  const { t } = useTranslation();
  const [openId, setOpenId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["sora-profile-list", companyId],
    enabled: !!companyId && enabled,
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
    enabled: !!companyId && enabled && pickerOpen,
    queryFn: async () => {
      const { data: docs } = await supabase.from("documents").select("id, tittel, kategori")
        .eq("company_id", companyId!).order("tittel").limit(500);
      return (docs as any[]) || [];
    },
  });

  const filteredDocs = allDocs.filter((d) =>
    !query || d.tittel.toLowerCase().includes(query.toLowerCase()) || (d.kategori || "").toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="w-full min-w-0 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" disabled={disabled} onClick={() => { setQuery(""); setPickerOpen(true); }} className="gap-1.5">
              <Plus className="h-4 w-4" />
              {t("soraProfile.newProfile")}
            </Button>
          </div>
      <GlassCard className="p-2 w-full min-w-0">
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : data.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{t("soraProfile.noDocuments")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.map((d: any) => (
              <li key={d.id} className="flex min-w-0 items-center gap-2 sm:gap-3 p-2 sm:p-3 hover:bg-muted/50">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate text-sm">{d.tittel}</span>
                <span className={cn("shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium", soraStatusClass(d.status))}>
                  {t(`soraProfile.status.${d.status}`)}
                </span>
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => setOpenId(d.id)}>{t("soraProfile.open")}</Button>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-md w-[calc(100vw-1rem)]">
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
}
