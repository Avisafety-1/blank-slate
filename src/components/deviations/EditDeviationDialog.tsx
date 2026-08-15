import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Search, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { translateDeviationCategory } from "@/lib/i18nHelpers";
import type { DeviationReport, DeviationStatus } from "@/hooks/useDeviationReports";

interface Category {
  id: string;
  parent_id: string | null;
  label: string;
  sort_order: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: DeviationReport | null;
  onSaved: () => void;
}

const PHASES = ["takeoff", "in_flight", "landing"] as const;
const STATUSES: DeviationStatus[] = ["new", "in_progress", "closed"];

export const EditDeviationDialog = ({ open, onOpenChange, report, onSaved }: Props) => {
  const { t } = useTranslation();
  const { user, companyId } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [path, setPath] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [comment, setComment] = useState("");
  const [phase, setPhase] = useState<string | null>(null);
  const [status, setStatus] = useState<DeviationStatus>("new");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !report) return;
    setSearch("");
    setComment(report.comment ?? "");
    setPhase(report.flight_phase ?? null);
    setStatus(report.status);
    const scope = report.company_id || companyId;
    if (scope) {
      (async () => {
        const { data } = await (supabase as any).rpc("get_effective_deviation_categories", {
          _company_id: scope,
        });
        const cats: Category[] = data || [];
        setCategories(cats);
        const byId = new Map(cats.map((c) => [c.id, c]));
        const restored = (report.category_ids || [])
          .map((id) => byId.get(id))
          .filter(Boolean) as Category[];
        setPath(restored);
      })();
    }
  }, [open, report, companyId]);

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const buildPathFor = (cat: Category): Category[] => {
    const result: Category[] = [];
    let current: Category | undefined = cat;
    while (current) {
      result.unshift(current);
      current = current.parent_id ? catById.get(current.parent_id) : undefined;
    }
    return result;
  };

  const currentParentId = path.length > 0 ? path[path.length - 1].id : null;
  const visibleOptions = categories
    .filter((c) => c.parent_id === currentParentId)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [] as { cat: Category; path: Category[] }[];
    return categories
      .filter((c) => c.label.toLowerCase().includes(q))
      .slice(0, 30)
      .map((c) => ({ cat: c, path: buildPathFor(c) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, categories, catById]);

  const save = async () => {
    if (!report) return;
    setSaving(true);
    const { error } = await (supabase as any)
      .from("mission_deviation_reports")
      .update({
        category_path: path.length ? path.map((p) => p.label) : report.category_path,
        category_ids: path.length ? path.map((p) => p.id) : report.category_ids,
        comment: comment.trim() || null,
        flight_phase: phase,
        status,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      })
      .eq("id", report.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("deviations.edit.saved"));
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("deviations.edit.title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">{t("deviations.edit.category")}</label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("deviations.edit.searchCategories")}
                className="pl-8 h-9"
              />
            </div>

            {search.trim() ? (
              <div className="space-y-1 max-h-48 overflow-y-auto border rounded-md p-1">
                {searchResults.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic px-2 py-3">{t("deviations.edit.noMatches")}</p>
                ) : (
                  searchResults.map(({ cat, path: p }) => (
                    <button
                      key={cat.id}
                      type="button"
                      className="w-full px-3 py-2 text-sm rounded hover:bg-muted/50 text-left"
                      onClick={() => {
                        setPath(p);
                        setSearch("");
                      }}
                    >
                      <div className="font-medium">{translateDeviationCategory(cat.label)}</div>
                      {p.length > 1 && (
                        <div className="text-xs text-muted-foreground">
                          {p.slice(0, -1).map((s) => translateDeviationCategory(s.label)).join(" › ")}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            ) : (
              <>
                {path.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 text-xs">
                    {path.map((p, i) => (
                      <span key={p.id} className="flex items-center gap-1">
                        {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                        <span className="font-medium text-foreground">{translateDeviationCategory(p.label)}</span>
                      </span>
                    ))}
                  </div>
                )}
                {path.length > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => setPath((p) => p.slice(0, -1))} className="h-7 px-2">
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    {t("actions.back")}
                  </Button>
                )}
                {visibleOptions.length > 0 && (
                  <div className="space-y-1 max-h-48 overflow-y-auto border rounded-md p-1">
                    {visibleOptions.map((opt) => {
                      const hasChildren = categories.some((c) => c.parent_id === opt.id);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm rounded hover:bg-muted/50 text-left"
                          onClick={() => setPath((p) => [...p, opt])}
                        >
                          <span>{translateDeviationCategory(opt.label)}</span>
                          {hasChildren && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t("deviations.edit.comment")}</label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t("deviations.edit.phase")}</label>
              <div className="flex flex-wrap gap-2">
                {PHASES.map((p) => (
                  <Button
                    key={p}
                    type="button"
                    size="sm"
                    variant={phase === p ? "default" : "outline"}
                    onClick={() => setPhase((cur) => (cur === p ? null : p))}
                  >
                    {t(`deviations.phase.${p}`)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t("deviations.edit.status")}</label>
              <Select value={status} onValueChange={(v) => setStatus(v as DeviationStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`deviations.status.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row gap-2 sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("actions.cancel")}
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t("actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
