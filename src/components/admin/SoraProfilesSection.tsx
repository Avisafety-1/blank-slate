import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronDown, FileText, Info, Plus, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/GlassCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { deriveSoraProfileStatus, soraProfileKey } from "@/hooks/useSoraProfile";
import { soraStatusClass } from "@/components/sora/SoraProfileBadge";
import { SoraProfileDialog } from "@/components/sora/SoraProfileDialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  companyId: string;
  disabled?: boolean;
  /** Controls data fetching; defaults to true. */
  enabled?: boolean;
}

/** SORA profile list + document picker, shared by company settings and /sora-profiler. */
export function SoraProfilesSection({ companyId, disabled, enabled = true }: Props) {
  const { t } = useTranslation();
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; tittel: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await (supabase.from("sora_document_profiles" as any)
      .delete().eq("document_id", deleteTarget.id) as any);
    setDeleting(false);
    if (error) {
      toast.error(t("soraProfile.deleteError"));
      return;
    }
    toast.success(t("soraProfile.deleteSuccess"));
    setDeleteTarget(null);
    await queryClient.invalidateQueries({ queryKey: ["sora-profile-list"] });
    await queryClient.invalidateQueries({ queryKey: soraProfileKey(deleteTarget.id) });
  };

  const { data = [], isLoading } = useQuery({
    queryKey: ["sora-profile-list", companyId],
    enabled: !!companyId && enabled,
    queryFn: async () => {
      // Only documents that actually have a profile; SORA references without a profile are not listed.
      const profiles = await (supabase.from("sora_document_profiles" as any)
        .select("document_id, status, source_file_url").eq("company_id", companyId!) as any);
      const ids = new Set<string>();
      for (const r of (profiles.data as any[]) || []) ids.add(r.document_id);
      if (ids.size === 0) return [];
      const { data: docs } = await supabase.from("documents").select("id, tittel, fil_url, company_id")
        .in("id", [...ids]).eq("company_id", companyId!).order("tittel");
      const byDoc = new Map(((profiles.data as any[]) || []).map((p) => [p.document_id, p]));
      return ((docs as any[]) || [])
        .map((d) => ({ ...d, status: deriveSoraProfileStatus(byDoc.get(d.id), d.fil_url) }))
        .filter((d) => d.status !== "none");
    },
  });

  const { data: allDocs = [], isLoading: docsLoading } = useQuery({
    queryKey: ["sora-profile-doc-picker", companyId],
    enabled: !!companyId && enabled && pickerOpen,
    queryFn: async () => {
      const { data: docs } = await supabase.from("documents").select("id, tittel, kategori, fil_url")
        .eq("company_id", companyId!).not("fil_url", "is", null).order("tittel").limit(500);
      // Only PDFs can be read as SORA profiles.
      return ((docs as any[]) || []).filter((d) => /\.pdf($|\?)/i.test(d.fil_url || ""));
    },
  });

  const filteredDocs = allDocs.filter((d) =>
    !query || d.tittel.toLowerCase().includes(query.toLowerCase()) || (d.kategori || "").toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="w-full min-w-0 space-y-3">
      <Collapsible open={helpOpen} onOpenChange={setHelpOpenPersisted} className="rounded-md border border-border bg-muted/20">
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" className="h-auto w-full justify-start gap-2 px-3 py-3 text-left">
            <Info className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 font-medium">{t("soraProfile.help.title")}</span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", helpOpen && "rotate-180")} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t border-border px-4 py-4">
          <ol className="space-y-3 text-sm">
            {[1, 2, 3, 4, 5].map((step) => (
              <li key={step} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{step}</span>
                <p className="min-w-0 break-words"><strong>{t(`soraProfile.help.steps.${step}.title`)}</strong> — {t(`soraProfile.help.steps.${step}.body`)}</p>
              </li>
            ))}
          </ol>
          <div className="mt-5 space-y-2 text-sm">
            <h3 className="font-semibold">{t("soraProfile.help.assessmentTitle")}</h3>
            <ul className="list-disc space-y-2 pl-5">
              {[1, 2, 3, 4].map((item) => <li key={item}>{t(`soraProfile.help.assessment.${item}`)}</li>)}
            </ul>
          </div>
          <p className="mt-4 text-sm"><strong>{t("soraProfile.help.departmentsTitle")}:</strong> {t("soraProfile.help.departmentsBody")}</p>
          <p className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
            <strong>{t("soraProfile.help.importantTitle")}:</strong> {t("soraProfile.help.importantBody")}
          </p>
        </CollapsibleContent>
      </Collapsible>
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
                {isAdmin && d.status !== "none" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 text-destructive hover:text-destructive"
                    disabled={disabled}
                    aria-label={t("soraProfile.delete")}
                    onClick={() => setDeleteTarget({ id: d.id, tittel: d.tittel })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("soraProfile.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("soraProfile.deleteConfirmBody", { title: deleteTarget?.tittel ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); void handleDelete(); }}
            >
              {deleting ? t("common.loading") : t("soraProfile.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
