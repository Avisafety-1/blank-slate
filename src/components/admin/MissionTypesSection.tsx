import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus, Trash2, ArrowUp, ArrowDown, Lock, Paperclip, X, FileText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DepartmentChecklist } from "@/components/admin/DepartmentChecklist";
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
import { useNavigate } from "react-router-dom";
import { SoraProfileBadge } from "@/components/sora/SoraProfileBadge";
import { SoraProfileDialog } from "@/components/sora/SoraProfileDialog";
import { deriveSoraProfileStatus, type SoraProfileStatus } from "@/hooks/useSoraProfile";

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

interface ProfileSummary {
  document_id: string;
  status: string;
  source_file_url: string | null;
}

type PickerFilter = "all" | "profile" | "selected";


export function MissionTypesSection({ companyId, disabled }: Props) {
  const { parentCompanyId } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { types, isInherited, effectiveCompanyId, reload } = useCompanyMissionTypes();
  const [newLabel, setNewLabel] = useState("");
  const [propagate, setPropagate] = useState(false);
  const [hasChildren, setHasChildren] = useState(false);
  const [departments, setDepartments] = useState<{ id: string; navn: string }[]>([]);
  const [parentName, setParentName] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Document picker state
  const [docs, setDocs] = useState<DocOption[]>([]);
  const [pickerOpenForId, setPickerOpenForId] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerFilter, setPickerFilter] = useState<PickerFilter>("all");
  const [profileSummaries, setProfileSummaries] = useState<ProfileSummary[]>([]);
  const [profileDialogDocumentId, setProfileDialogDocumentId] = useState<string | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareDepartmentIds, setShareDepartmentIds] = useState<string[]>([]);
  const [pendingDocumentLink, setPendingDocumentLink] = useState<{ typeId: string; documentId: string; nextIds: string[] } | null>(null);

  const isReadOnly = !!disabled || isInherited;
  const ownsList = effectiveCompanyId === companyId;

  // Den reserverte "annet"-raden finnes bare for å bære dokumentkoblinger for
  // den faste «Annet»-typen. Den skjules fra selve typelisten.
  const annetType = useMemo(() => types.find((mt) => mt.label.toLowerCase() === "annet") || null, [types]);
  const visibleTypes = useMemo(() => types.filter((mt) => mt.label.toLowerCase() !== "annet"), [types]);

  const ensureAnnetType = async (): Promise<CompanyMissionType | null> => {
    if (annetType) return annetType;
    if (!effectiveCompanyId) return null;
    const { data, error } = await (supabase
      .from("company_mission_types")
      .insert({ company_id: effectiveCompanyId, label: "annet", sort_order: 9999, is_active: true } as any)
      .select("id, company_id, label, sort_order, is_active, default_document_id, default_document_ids, sora_document_id, default_evaluation_template_id")
      .maybeSingle() as any);
    if (error) {
      toast({ title: t("admin.missionTypes.toastGenericError"), description: error.message, variant: "destructive" });
      return null;
    }
    await reload();
    return (data as CompanyMissionType) || null;
  };

  const openAnnetPicker = async () => {
    const row = await ensureAnnetType();
    if (row) setPickerOpenForId(row.id);
  };

  // SORA documents on propagated types that departments cannot read.
  const [unsharedSoraIds, setUnsharedSoraIds] = useState<Set<string>>(new Set());
  const soraIdsKey = useMemo(() => [...new Set(types.map((mt) => mt.sora_document_id).filter(Boolean) as string[])].sort().join(","), [types]);
  const loadSoraSharing = async () => {
    const ids = soraIdsKey ? soraIdsKey.split(",") : [];
    if (!propagate || departments.length === 0 || ids.length === 0) { setUnsharedSoraIds(new Set()); return; }
    const [docs, vis] = await Promise.all([
      supabase.from("documents").select("id, visible_to_children").in("id", ids),
      supabase.from("document_department_visibility").select("document_id").in("document_id", ids).in("company_id", departments.map((d) => d.id)),
    ]);
    const shared = new Set<string>(((vis.data as any[]) || []).map((r) => r.document_id));
    for (const d of (docs.data as any[]) || []) if (d.visible_to_children) shared.add(d.id);
    setUnsharedSoraIds(new Set(ids.filter((id) => !shared.has(id))));
  };
  useEffect(() => { loadSoraSharing(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [soraIdsKey, propagate, departments]);
  const shareSoraWithDepartments = async (docId: string) => {
    const { error } = await supabase.from("documents").update({ visible_to_children: true } as any).eq("id", docId);
    if (error) { toast({ title: t("admin.missionTypes.toastDocumentShareError"), description: error.message, variant: "destructive" }); return; }
    await loadSoraSharing();
  };
  const renderSoraShareWarning = (docId: string | null) => (docId && unsharedSoraIds.has(docId) ? (
    <div className="order-last flex basis-full flex-wrap items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 break-words">{t("admin.missionTypes.soraNotShared")}</span>
      {!isReadOnly && (
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => shareSoraWithDepartments(docId)}>
          {t("admin.missionTypes.shareWithDepartments")}
        </Button>
      )}
    </div>
  ) : null);

  useEffect(() => {
    if (!companyId) return;
    (supabase.from("companies").select("propagate_mission_types").eq("id", companyId).maybeSingle() as any)
      .then(({ data }: any) => setPropagate(!!data?.propagate_mission_types));
    (supabase.from("companies").select("id, navn").eq("parent_company_id", companyId).order("navn") as any)
      .then(({ data }: any) => {
        const childDepartments = data || [];
        setDepartments(childDepartments);
        setHasChildren(childDepartments.length > 0);
      });
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
      const sourceCompanyIds = [...new Set([source, companyId].filter((id): id is string => !!id))];
      const [docRes, evalRes, profileRes] = await Promise.all([
        (supabase
          .from("documents")
          .select("id, tittel, kategori, fil_url, nettside_url")
          .in("company_id", sourceCompanyIds)
          .order("tittel") as any),
        (supabase
          .from("evaluation_templates")
          .select("id, title, description")
          .in("company_id", sourceCompanyIds)
          .order("title") as any),
        (supabase
          .from("sora_document_profiles" as any)
          .select("document_id, status, source_file_url")
          .in("company_id", sourceCompanyIds) as any),
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
      setProfileSummaries((profileRes?.data || []) as ProfileSummary[]);
    })();
  }, [companyId, effectiveCompanyId]);


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
    if (next < 0 || next >= visibleTypes.length) return;
    const a = visibleTypes[index];
    const b = visibleTypes[next];
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

  const getDocIds = (mt: CompanyMissionType): string[] => {
    const list = (mt as any).default_document_ids as string[] | null | undefined;
    if (list && list.length > 0) return list;
    return mt.default_document_id ? [mt.default_document_id] : [];
  };

  const saveDocuments = async (typeId: string, docIds: string[]) => {
    const { error } = await (supabase
      .from("company_mission_types")
      .update({ default_document_ids: docIds, default_document_id: docIds[0] ?? null, ...(docIds.length === 0 ? { sora_document_id: null } : {}) } as any)
      .eq("id", typeId) as any);
    if (error) {
      toast({ title: t("admin.missionTypes.toastDocumentSaveError"), description: error.message, variant: "destructive" });
      return;
    }
    await reload();
  };

  const setSoraDocument = async (mt: CompanyMissionType, docId: string | null) => {
    const doc = docId ? docs.find((item) => item.id === docId) : null;
    if (docId && (!doc || doc.isEvaluation || !/\.pdf$/i.test(doc.fil_url || ""))) return;
    const { error } = await supabase.from("company_mission_types")
      .update({ sora_document_id: docId } as any).eq("id", mt.id);
    if (error) toast({ title: t("admin.missionTypes.toastDocumentSaveError"), description: error.message, variant: "destructive" });
    else await reload();
  };

  const setEvaluationTemplate = async (typeId: string, templateId: string | null) => {
    const { error } = await (supabase
      .from("company_mission_types")
      .update({ default_evaluation_template_id: templateId } as any)
      .eq("id", typeId) as any);
    if (error) {
      toast({ title: t("admin.missionTypes.toastDocumentSaveError"), description: error.message, variant: "destructive" });
      return;
    }
    await reload();
  };

  const toggleDocument = async (mt: CompanyMissionType, docId: string, isEvaluation: boolean) => {
    if (isEvaluation) {
      await setEvaluationTemplate(mt.id, mt.default_evaluation_template_id === docId ? null : docId);
      return;
    }
    const current = getDocIds(mt);
    const next = current.includes(docId) ? current.filter((id) => id !== docId) : [...current, docId];
    if (current.includes(docId) && mt.sora_document_id === docId) await setSoraDocument(mt, null);
    if (!current.includes(docId) && propagate && departments.length > 0) {
      const { data } = await supabase
        .from("document_department_visibility")
        .select("company_id")
        .eq("document_id", docId)
        .in("company_id", departments.map((department) => department.id));
      const existingIds = (data || []).map((row) => row.company_id);
      setShareDepartmentIds(existingIds.length > 0 ? existingIds : departments.map((department) => department.id));
      setPendingDocumentLink({ typeId: mt.id, documentId: docId, nextIds: next });
      setShareDialogOpen(true);
      return;
    }
    await saveDocuments(mt.id, next);
  };

  const confirmDocumentSharing = async () => {
    if (!pendingDocumentLink) return;
    setSaving(true);
    const childIds = departments.map((department) => department.id);
    const { data: existingRows, error: loadError } = await supabase
      .from("document_department_visibility")
      .select("company_id")
      .eq("document_id", pendingDocumentLink.documentId)
      .in("company_id", childIds);
    if (loadError) {
      setSaving(false);
      toast({ title: t("admin.missionTypes.toastDocumentShareError"), description: loadError.message, variant: "destructive" });
      return;
    }
    const existingIds = (existingRows || []).map((row) => row.company_id);
    const toAdd = shareDepartmentIds.filter((id) => !existingIds.includes(id));
    const toRemove = existingIds.filter((id) => !shareDepartmentIds.includes(id));
    const results = await Promise.all([
      toAdd.length > 0
        ? supabase.from("document_department_visibility").upsert(
            toAdd.map((companyId) => ({ document_id: pendingDocumentLink.documentId, company_id: companyId })),
            { onConflict: "document_id,company_id" },
          )
        : Promise.resolve({ error: null }),
      toRemove.length > 0
        ? supabase.from("document_department_visibility").delete().eq("document_id", pendingDocumentLink.documentId).in("company_id", toRemove)
        : Promise.resolve({ error: null }),
    ]);
    const shareError = results.find((result) => result.error)?.error;
    if (shareError) {
      setSaving(false);
      toast({ title: t("admin.missionTypes.toastDocumentShareError"), description: shareError.message, variant: "destructive" });
      return;
    }
    await saveDocuments(pendingDocumentLink.typeId, pendingDocumentLink.nextIds);
    setSaving(false);
    setShareDialogOpen(false);
    setPendingDocumentLink(null);
  };

  const clearLinks = async (mt: CompanyMissionType) => {
    await saveDocuments(mt.id, []);
    if (mt.default_evaluation_template_id) await setEvaluationTemplate(mt.id, null);
  };

  const profileStatusByDocument = useMemo(() => {
    const rows = new Map(profileSummaries.map((row) => [row.document_id, row]));
    return new Map(docs.filter((doc) => !doc.isEvaluation).map((doc) => [
      doc.id,
      deriveSoraProfileStatus(rows.get(doc.id), doc.fil_url),
    ]));
  }, [docs, profileSummaries]);

  const profileCount = useMemo(
    () => [...profileStatusByDocument.values()].filter((status) => status !== "none").length,
    [profileStatusByDocument],
  );

  const pickerOpenFor = useMemo(
    () => types.find((mt) => mt.id === pickerOpenForId) || null,
    [types, pickerOpenForId]
  );
  const pickerDocIds = pickerOpenFor ? getDocIds(pickerOpenFor) : [];

  const filteredDocs = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return docs.filter((doc) => {
      const matchesSearch = !q || doc.tittel.toLowerCase().includes(q) || doc.kategori.toLowerCase().includes(q);
      if (!matchesSearch) return false;
      if (pickerFilter === "profile") return profileStatusByDocument.get(doc.id) !== "none" && !doc.isEvaluation;
      if (pickerFilter === "selected") {
        return doc.isEvaluation
          ? pickerOpenFor?.default_evaluation_template_id === doc.id
          : pickerDocIds.includes(doc.id);
      }
      return true;
    });
  }, [docs, pickerSearch, pickerFilter, profileStatusByDocument, pickerOpenFor, pickerDocIds]);

  const selectedCount = pickerDocIds.length + (pickerOpenFor?.default_evaluation_template_id ? 1 : 0);
  const groupedPickerDocs = useMemo(() => {
    const rank: Record<SoraProfileStatus, number> = { confirmed: 0, draft: 1, outdated: 2, none: 3 };
    const sorted = [...filteredDocs].sort((a, b) => {
      if (pickerFilter === "profile") {
        const statusDiff = rank[profileStatusByDocument.get(a.id) ?? "none"] - rank[profileStatusByDocument.get(b.id) ?? "none"];
        if (statusDiff !== 0) return statusDiff;
      }
      return a.tittel.localeCompare(b.tittel);
    });
    if (pickerFilter !== "all") return [{ key: "all", title: null, docs: sorted }];
    const confirmed = sorted.filter((doc) => profileStatusByDocument.get(doc.id) === "confirmed");
    const others = sorted.filter((doc) => profileStatusByDocument.get(doc.id) !== "confirmed");
    return [
      ...(confirmed.length ? [{ key: "profile", title: t("admin.missionTypes.withSoraProfile"), docs: confirmed }] : []),
      ...(others.length ? [{ key: "other", title: confirmed.length ? t("admin.missionTypes.otherDocuments") : null, docs: others }] : []),
    ];
  }, [filteredDocs, pickerFilter, profileStatusByDocument, t]);

  return (
    <div className="space-y-4">
      {!isInherited && (
        <div className="flex justify-end">
          <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => navigate("/sora-profiler")}>
            {t("soraProfile.manageLink")}
          </Button>
        </div>
      )}
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
        {visibleTypes.map((mt, i) => {
          const linkedIds = [...getDocIds(mt), ...(mt.default_evaluation_template_id ? [mt.default_evaluation_template_id] : [])];
          return (
            <div key={mt.id} className={`flex items-center gap-2 rounded-md border p-2 flex-wrap ${mt.sora_document_id && unsharedSoraIds.has(mt.sora_document_id) ? "" : "sm:flex-nowrap"}`}>
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
                  disabled={isReadOnly || i === visibleTypes.length - 1}
                >
                  <ArrowDown className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex-1 text-sm min-w-[100px]">{t(`missions.missionTypes.${mt.label}`, mt.label)}</div>

              {/* Document links */}
              <div className="flex items-center gap-1 flex-wrap">
                {linkedIds.map((id) => {
                  const doc = docsById.get(id);
                  return doc ? (
                    <Badge
                      key={id}
                      variant="secondary"
                      className="gap-1 max-w-[180px] cursor-pointer hover:bg-secondary/80"
                      onClick={() => !isReadOnly && setPickerOpenForId(mt.id)}
                      title={doc.tittel}
                    >
                      <FileText className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{doc.tittel}</span>
                      {mt.sora_document_id === id && <span className="text-xs text-primary">SORA</span>}
                      {mt.sora_document_id === id && <SoraProfileBadge documentId={id} />}
                      {!isReadOnly && (
                        <button
                          type="button"
                          className="ml-1 hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (id === mt.default_evaluation_template_id) {
                              setEvaluationTemplate(mt.id, null);
                            } else {
                               saveDocuments(mt.id, getDocIds(mt).filter((x) => x !== id));
                               if (mt.sora_document_id === id) setSoraDocument(mt, null);
                            }
                          }}
                          aria-label={t("admin.missionTypes.removeDocument")}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </Badge>
                  ) : (
                    <Badge key={id} variant="outline" className="gap-1 text-muted-foreground">
                      <FileText className="h-3 w-3" />
                      <span className="text-xs">{t("admin.missionTypes.unknownDocument")}</span>
                    </Badge>
                  );
                })}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs gap-1"
                  onClick={() => setPickerOpenForId(mt.id)}
                  disabled={isReadOnly}
                >
                  <Paperclip className="h-3 w-3" />
                  <span className="hidden sm:inline">
                    {linkedIds.length > 0 ? t("admin.missionTypes.addDocument") : t("admin.missionTypes.attachDocument")}
                  </span>
                  <span className="sm:hidden">{t("admin.missionTypes.attachDocumentShort")}</span>
                </Button>
              </div>
              {renderSoraShareWarning(mt.sora_document_id)}

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
        <div className="flex items-center gap-2 rounded-md border border-dashed p-2 text-sm text-muted-foreground flex-wrap sm:flex-nowrap">
          <div className="min-w-[100px]">{t("admin.missionTypes.otherFixed")}</div>
          <div className="flex flex-1 items-center gap-1 flex-wrap">
            {annetType && getDocIds(annetType).map((id) => {
              const doc = docsById.get(id);
              return doc ? (
                <Badge
                  key={id}
                  variant="secondary"
                  className="gap-1 max-w-[180px] cursor-pointer hover:bg-secondary/80"
                  onClick={() => !isReadOnly && setPickerOpenForId(annetType.id)}
                  title={doc.tittel}
                >
                  <FileText className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{doc.tittel}</span>
                  {annetType.sora_document_id === id && <span className="text-xs text-primary">SORA</span>}
                  {annetType.sora_document_id === id && <SoraProfileBadge documentId={id} />}
                  {!isReadOnly && (
                    <button
                      type="button"
                      className="ml-1 hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        saveDocuments(annetType.id, getDocIds(annetType).filter((x) => x !== id));
                        if (annetType.sora_document_id === id) setSoraDocument(annetType, null);
                      }}
                      aria-label={t("admin.missionTypes.removeDocument")}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ) : null;
            })}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1"
              onClick={openAnnetPicker}
              disabled={isReadOnly}
            >
              <Paperclip className="h-3 w-3" />
              <span className="hidden sm:inline">
                {annetType && getDocIds(annetType).length > 0 ? t("admin.missionTypes.addDocument") : t("admin.missionTypes.attachDocument")}
              </span>
              <span className="sm:hidden">{t("admin.missionTypes.attachDocumentShort")}</span>
            </Button>
          </div>
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
        open={!!pickerOpenForId}
        onOpenChange={(open) => {
          if (!open) {
            setPickerOpenForId(null);
            setPickerSearch("");
            setPickerFilter("all");
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[80vh] max-h-[80dvh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Paperclip className="h-5 w-5" />
              {t("admin.missionTypes.pickerTitle", { label: pickerOpenFor?.label.toLowerCase() === "annet" ? t("missions.missionTypes.Annet") : pickerOpenFor?.label })}
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

          <div className="flex shrink-0 gap-2 overflow-x-auto overscroll-x-contain pb-1 [touch-action:pan-x]">
            <Button type="button" size="sm" variant={pickerFilter === "all" ? "secondary" : "outline"} className="shrink-0" onClick={() => setPickerFilter("all")}>
              {t("admin.missionTypes.filterAll")}
            </Button>
            {profileCount > 0 && (
              <Button type="button" size="sm" variant={pickerFilter === "profile" ? "secondary" : "outline"} className="shrink-0" onClick={() => setPickerFilter("profile")}>
                {t("admin.missionTypes.filterSoraProfile", { count: profileCount })}
              </Button>
            )}
            <Button type="button" size="sm" variant={pickerFilter === "selected" ? "secondary" : "outline"} className="shrink-0" onClick={() => setPickerFilter("selected")}>
              {t("admin.missionTypes.filterSelected", { count: selectedCount })}
            </Button>
          </div>

          <div className="flex-1 min-h-[200px] max-h-[400px] border rounded-lg overflow-y-auto overscroll-contain [touch-action:pan-y]">
            {filteredDocs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-sm">
                <FileText className="h-8 w-8 mb-2" />
                <p>{t("admin.missionTypes.pickerEmpty")}</p>
              </div>
            ) : (
              <div className="p-2 space-y-3">
                {groupedPickerDocs.map((group) => (
                  <div key={group.key} className="space-y-1">
                    {group.title && <p className="px-2 pb-1 text-xs font-semibold text-muted-foreground">{group.title}</p>}
                    {group.docs.map((doc) => {
                  const isSelected = doc.isEvaluation
                    ? pickerOpenFor?.default_evaluation_template_id === doc.id
                    : pickerDocIds.includes(doc.id);
                  const profileStatus = profileStatusByDocument.get(doc.id) ?? "none";
                  const isCurrentSora = pickerOpenFor?.sora_document_id === doc.id;
                  const oldSoraTitle = pickerOpenFor?.sora_document_id ? docsById.get(pickerOpenFor.sora_document_id)?.tittel : null;
                  return (
                    <div key={doc.id} className={`rounded-lg border ${isSelected ? "border-primary/30 bg-primary/10" : "border-transparent hover:bg-muted/50"}`}>
                      <div className="flex min-w-0 items-center gap-2 p-2">
                        <Button type="button" variant="ghost" className="h-auto min-w-0 flex-1 justify-start gap-3 p-1 text-left" onClick={() => pickerOpenFor && toggleDocument(pickerOpenFor, doc.id, !!doc.isEvaluation)}>
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{doc.tittel}</span>
                            <span className="block truncate text-xs text-muted-foreground">{doc.kategori}</span>
                          </span>
                        </Button>
                        {profileStatus !== "none" && !doc.isEvaluation && (
                          <SoraProfileBadge documentId={doc.id} statusOverride={profileStatus} readOnly className="shrink-0" />
                        )}
                        {isSelected && !doc.isEvaluation && /\.pdf$/i.test(doc.fil_url || "") && (
                          <Button type="button" size="sm" variant={isCurrentSora ? "default" : "outline"} className="shrink-0"
                            onClick={() => pickerOpenFor && setSoraDocument(pickerOpenFor, isCurrentSora ? null : doc.id)}>
                            {t("admin.missionTypes.markSora")}
                          </Button>
                        )}
                      </div>
                      {isSelected && profileStatus === "confirmed" && !isCurrentSora && !doc.isEvaluation && (
                        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
                          <span>{oldSoraTitle
                            ? t("admin.missionTypes.replaceSoraPrompt", { title: oldSoraTitle })
                            : t("admin.missionTypes.useAsSoraPrompt")}</span>
                          <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => pickerOpenFor && setSoraDocument(pickerOpenFor, doc.id)}>
                            {oldSoraTitle ? t("admin.missionTypes.replaceSora") : t("admin.missionTypes.useAsSora")}
                          </Button>
                        </div>
                      )}
                      {isCurrentSora && (profileStatus === "draft" || profileStatus === "outdated") && (
                        <div className="flex flex-wrap items-center gap-2 border-t border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 flex-1">{t("admin.missionTypes.unconfirmedProfileHelp")}</span>
                          <Button type="button" size="sm" variant="link" className="h-auto p-0 text-current" onClick={() => setProfileDialogDocumentId(doc.id)}>
                            {t("admin.missionTypes.openProfile")}
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            {(pickerDocIds.length > 0 || pickerOpenFor?.default_evaluation_template_id) && (
              <Button
                variant="outline"
                onClick={async () => {
                  if (!pickerOpenFor) return;
                  await clearLinks(pickerOpenFor);
                }}
              >
                {t("admin.missionTypes.removeLink")}
              </Button>
            )}
            <Button
              onClick={() => {
                setPickerOpenForId(null);
                setPickerSearch("");
                setPickerFilter("all");
              }}
            >
              {t("admin.missionTypes.done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {profileDialogDocumentId && (
        <SoraProfileDialog documentId={profileDialogDocumentId} open onOpenChange={(open) => !open && setProfileDialogDocumentId(null)} readOnly />
      )}

      <Dialog
        open={shareDialogOpen}
        onOpenChange={(open) => {
          if (!open && !saving) {
            setShareDialogOpen(false);
            setPendingDocumentLink(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("admin.missionTypes.shareDialogTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("admin.missionTypes.shareDialogDescription")}</p>
          <DepartmentChecklist
            departments={departments}
            selectedIds={shareDepartmentIds}
            onToggle={(id, checked) => setShareDepartmentIds((current) => checked ? [...current, id] : current.filter((item) => item !== id))}
            allSelected={departments.length > 0 && shareDepartmentIds.length === departments.length}
            onToggleAll={(checked) => setShareDepartmentIds(checked ? departments.map((department) => department.id) : [])}
            allLabel={t("admin.missionTypes.shareAllDepartments")}
          />
          <DialogFooter>
            <Button variant="outline" disabled={saving} onClick={() => {
              setShareDialogOpen(false);
              setPendingDocumentLink(null);
            }}>
              {t("admin.missionTypes.cancel")}
            </Button>
            <Button disabled={saving} onClick={confirmDocumentSharing}>
              {t("admin.missionTypes.shareAndAttach")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
