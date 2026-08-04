import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown, Lock, Paperclip, X, FileText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyMissionTypes, CompanyMissionType } from "@/hooks/useCompanyMissionTypes";
import { useTranslation } from "react-i18next";

interface Props {
  companyId: string | null;
  disabled?: boolean;
}

interface DocOption {
  id: string;
  tittel: string;
  kategori: string;
  fil_url: string | null;
  nettside_url: string | null;
  isEvaluation?: boolean;
}


export function MissionTypesSection({ companyId, disabled }: Props) {
  const { parentCompanyId } = useAuth();
  const { t } = useTranslation();
  const { types, isInherited, effectiveCompanyId, reload } = useCompanyMissionTypes();
  const [newLabel, setNewLabel] = useState("");
  const [propagate, setPropagate] = useState(false);
  const [hasChildren, setHasChildren] = useState(false);
  const [parentName, setParentName] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Document picker state
  const [docs, setDocs] = useState<DocOption[]>([]);
  const [pickerOpenFor, setPickerOpenFor] = useState<CompanyMissionType | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");

  const isReadOnly = !!disabled || isInherited;
  const ownsList = effectiveCompanyId === companyId;

  useEffect(() => {
    if (!companyId) return;
    (supabase.from("companies").select("propagate_mission_types").eq("id", companyId).maybeSingle() as any)
      .then(({ data }: any) => setPropagate(!!data?.propagate_mission_types));
    (supabase.from("companies").select("id", { count: "exact", head: true }).eq("parent_company_id", companyId) as any)
      .then(({ count }: any) => setHasChildren((count ?? 0) > 0));
    if (parentCompanyId && isInherited) {
      (supabase.from("companies").select("name").eq("id", parentCompanyId).maybeSingle() as any)
        .then(({ data }: any) => setParentName(data?.name || ""));
    }
  }, [companyId, parentCompanyId, isInherited]);

  // Load documents + evaluation templates available for tilknytning
  useEffect(() => {
    const source = effectiveCompanyId;
    if (!source) return;
    (async () => {
      const [docRes, evalRes] = await Promise.all([
        (supabase
          .from("documents")
          .select("id, tittel, kategori, fil_url, nettside_url")
          .eq("company_id", source)
          .order("tittel") as any),
        (supabase
          .from("evaluation_templates")
          .select("id, title, description")
          .eq("company_id", source)
          .order("title") as any),
      ]);
      const documents: DocOption[] = (docRes?.data || []) as DocOption[];
      const evaluations: DocOption[] = ((evalRes?.data || []) as any[]).map((e) => ({
        id: e.id,
        tittel: e.title,
        kategori: "vurderingsskjema",
        fil_url: null,
        nettside_url: null,
        isEvaluation: true,
      }));
      setDocs([...documents, ...evaluations].sort((a, b) => a.tittel.localeCompare(b.tittel)));
    })();
  }, [effectiveCompanyId]);


  const docsById = useMemo(() => {
    const map = new Map<string, DocOption>();
    docs.forEach((d) => map.set(d.id, d));
    return map;
  }, [docs]);

  const handleAdd = async () => {
    const label = newLabel.trim();
    if (!label || !companyId) return;
    if (label.toLowerCase() === "annet") {
      toast({ title: t("admin.missionTypes.toastReserved"), description: t("admin.missionTypes.toastReservedDesc"), variant: "destructive" });
      return;
    }
    if (types.some((t) => t.label.toLowerCase() === label.toLowerCase())) {
      toast({ title: t("admin.missionTypes.toastExists"), variant: "destructive" });
      return;
    }
    setSaving(true);
    const maxOrder = Math.max(0, ...types.map((t) => t.sort_order));
    const { error } = await (supabase.from("company_mission_types").insert({
      company_id: companyId,
      label,
      sort_order: maxOrder + 10,
      is_active: true,
    } as any) as any);
    setSaving(false);
    if (error) {
      toast({ title: t("admin.missionTypes.toastSaveError"), description: error.message, variant: "destructive" });
      return;
    }
    setNewLabel("");
    await reload();
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    const { error } = await (supabase.from("company_mission_types").delete().eq("id", id) as any);
    setSaving(false);
    if (error) {
      toast({ title: t("admin.missionTypes.toastDeleteError"), description: error.message, variant: "destructive" });
      return;
    }
    await reload();
  };

  const handleToggleActive = async (item: CompanyMissionType) => {
    const { error } = await (supabase
      .from("company_mission_types")
      .update({ is_active: !item.is_active } as any)
      .eq("id", item.id) as any);
    if (error) {
      toast({ title: t("admin.missionTypes.toastGenericError"), description: error.message, variant: "destructive" });
      return;
    }
    await reload();
  };

  const handleMove = async (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= types.length) return;
    const a = types[index];
    const b = types[next];
    await (supabase.from("company_mission_types").update({ sort_order: b.sort_order } as any).eq("id", a.id) as any);
    await (supabase.from("company_mission_types").update({ sort_order: a.sort_order } as any).eq("id", b.id) as any);
    await reload();
  };

  const handleTogglePropagate = async (checked: boolean) => {
    if (!companyId) return;
    setSaving(true);
    const { error } = await (supabase
      .from("companies")
      .update({ propagate_mission_types: checked } as any)
      .eq("id", companyId) as any);
    setSaving(false);
    if (error) {
      toast({ title: t("admin.missionTypes.toastGenericError"), description: error.message, variant: "destructive" });
      return;
    }
    setPropagate(checked);
    toast({ title: checked ? t("admin.missionTypes.toastPropagateOn") : t("admin.missionTypes.toastPropagateOff") });
  };

  const setDefaultDocument = async (typeId: string, docId: string | null, isEvaluation = false) => {
    const payload = isEvaluation
      ? { default_document_id: null, default_evaluation_template_id: docId }
      : { default_document_id: docId, default_evaluation_template_id: null };
    const { error } = await (supabase
      .from("company_mission_types")
      .update(payload as any)
      .eq("id", typeId) as any);
    if (error) {
      toast({ title: t("admin.missionTypes.toastDocumentSaveError"), description: error.message, variant: "destructive" });
      return;
    }
    await reload();
  };

  const filteredDocs = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) => d.tittel.toLowerCase().includes(q) || d.kategori.toLowerCase().includes(q));
  }, [docs, pickerSearch]);

  return (
    <div className="space-y-4">
      {isInherited && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm flex items-center gap-2">
          <Lock className="h-4 w-4" />
          <span>
            {t("admin.missionTypes.inheritedNotice", { parent: parentName || t("admin.missionTypes.inheritedParentFallback") })}
          </span>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        {t("admin.missionTypes.description")}
      </p>

      <div className="space-y-2">
        {types.map((mt, i) => {
          const linkedDoc = mt.default_document_id ? docsById.get(mt.default_document_id) : null;
          return (
            <div key={mt.id} className="flex items-center gap-2 rounded-md border p-2 flex-wrap sm:flex-nowrap">
              <div className="flex flex-col">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5"
                  onClick={() => handleMove(i, -1)}
                  disabled={isReadOnly || i === 0}
                >
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5"
                  onClick={() => handleMove(i, 1)}
                  disabled={isReadOnly || i === types.length - 1}
                >
                  <ArrowDown className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex-1 text-sm min-w-[100px]">{t(`missions.missionTypes.${mt.label}`, mt.label)}</div>

              {/* Document link */}
              {linkedDoc ? (
                <Badge
                  variant="secondary"
                  className="gap-1 max-w-[180px] cursor-pointer hover:bg-secondary/80"
                  onClick={() => !isReadOnly && setPickerOpenFor(mt)}
                  title={linkedDoc.tittel}
                >
                  <FileText className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{linkedDoc.tittel}</span>
                  {!isReadOnly && (
                    <button
                      type="button"
                      className="ml-1 hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDefaultDocument(mt.id, null);
                      }}
                      aria-label={t("admin.missionTypes.removeDocument")}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ) : mt.default_document_id ? (
                // Dokument-ID lagret, men ikke funnet i listen (kanskje slettet eller annet selskap)
                <Badge variant="outline" className="gap-1 text-muted-foreground">
                  <FileText className="h-3 w-3" />
                  <span className="text-xs">{t("admin.missionTypes.unknownDocument")}</span>
                </Badge>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs gap-1"
                  onClick={() => setPickerOpenFor(mt)}
                  disabled={isReadOnly}
                >
                  <Paperclip className="h-3 w-3" />
                  <span className="hidden sm:inline">{t("admin.missionTypes.attachDocument")}</span>
                  <span className="sm:hidden">{t("admin.missionTypes.attachDocumentShort")}</span>
                </Button>
              )}

              <div className="flex items-center gap-2">
                <Label htmlFor={`active-${mt.id}`} className="text-xs text-muted-foreground">
                  {t("admin.missionTypes.active")}
                </Label>
                <Switch
                  id={`active-${mt.id}`}
                  checked={mt.is_active}
                  onCheckedChange={() => handleToggleActive(mt)}
                  disabled={isReadOnly}
                />
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => handleDelete(mt.id)}
                disabled={isReadOnly}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
        <div className="flex items-center gap-2 rounded-md border border-dashed p-2 text-sm text-muted-foreground">
          <div className="flex-1">{t("admin.missionTypes.otherFixed")}</div>
        </div>
      </div>

      {!isReadOnly && (
        <div className="flex gap-2">
          <Input
            placeholder={t("admin.missionTypes.newTypePlaceholder")}
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
            disabled={saving}
          />
          <Button onClick={handleAdd} disabled={saving || !newLabel.trim()}>
            <Plus className="h-4 w-4 mr-1" />
            {t("admin.missionTypes.add")}
          </Button>
        </div>
      )}

      {ownsList && hasChildren && (
        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="pr-4">
            <Label htmlFor="propagate-mission-types" className="cursor-pointer font-medium">
              {t("admin.missionTypes.propagateLabel")}
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              {t("admin.missionTypes.propagateDesc")}
            </p>
          </div>
          <Switch
            id="propagate-mission-types"
            checked={propagate}
            onCheckedChange={handleTogglePropagate}
            disabled={saving}
          />
        </div>
      )}

      {/* Document picker dialog */}
      <Dialog
        open={!!pickerOpenFor}
        onOpenChange={(open) => {
          if (!open) {
            setPickerOpenFor(null);
            setPickerSearch("");
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Paperclip className="h-5 w-5" />
              {t("admin.missionTypes.pickerTitle", { label: pickerOpenFor?.label })}
            </DialogTitle>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("admin.missionTypes.pickerSearchPlaceholder")}
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex-1 min-h-[200px] max-h-[400px] border rounded-lg overflow-y-auto">
            {filteredDocs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-sm">
                <FileText className="h-8 w-8 mb-2" />
                <p>{t("admin.missionTypes.pickerEmpty")}</p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredDocs.map((doc) => {
                  const isSelected = pickerOpenFor?.default_document_id === doc.id;
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={async () => {
                        if (!pickerOpenFor) return;
                        await setDefaultDocument(pickerOpenFor.id, doc.id);
                        setPickerOpenFor(null);
                        setPickerSearch("");
                      }}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                        isSelected
                          ? "bg-primary/10 border border-primary/30"
                          : "hover:bg-muted/50 border border-transparent"
                      }`}
                    >
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{doc.tittel}</p>
                        <p className="text-xs text-muted-foreground">{doc.kategori}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            {pickerOpenFor?.default_document_id && (
              <Button
                variant="outline"
                onClick={async () => {
                  if (!pickerOpenFor) return;
                  await setDefaultDocument(pickerOpenFor.id, null);
                  setPickerOpenFor(null);
                  setPickerSearch("");
                }}
              >
                {t("admin.missionTypes.removeLink")}
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                setPickerOpenFor(null);
                setPickerSearch("");
              }}
            >
              {t("admin.missionTypes.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
