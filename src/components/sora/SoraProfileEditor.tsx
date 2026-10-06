import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { AlertTriangle, Check, Loader2, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { RegistryMultiSelect, type RegistryOption } from "./RegistryMultiSelect";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useSoraProfile } from "@/hooks/useSoraProfile";
import {
  AIRCRAFT_TYPES,
  ARC_LEVELS,
  OPERATION_TYPES,
  OSO_IDS,
  STRATEGIC_REDUCTIONS,
  ROBUSTNESS,
  SAIL_LEVELS,
  checkSoraProfileConsistency,
  emptyAircraft,
  emptySoraProfile,
  suggestAircraftMatches,
  type SoraProfile,
} from "@/lib/soraProfile";
import { soraStatusClass } from "./SoraProfileBadge";
import { MITIGATION_MATRIX } from "../../../supabase/functions/_shared/soraGroundRisk";

const MITIGATION_KEY = { m1a: "m1a_sheltering", m1b: "m1b_operational_restrictions", m1c: "m1c_ground_observation", m2: "m2_impact_reduction" } as const;
const validRobustness = (m: keyof typeof MITIGATION_KEY) =>
  ROBUSTNESS.filter((r) => MITIGATION_MATRIX[MITIGATION_KEY[m]][r] != null);
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i));
const GRC_OPTIONS = range(1, 10);
const AEC_OPTIONS = range(1, 12);
// M3 kan ikke velges lenger, men lagrede profiler med verdien vises fortsatt som brikke.
const STRATEGIC_LABEL_KEYS = ['m1_operational_restrictions', 'm2_structures_rules', 'm3_erp'] as const;
const SORA_VERSIONS = ["2.0", "2.5"];

const getPath = (obj: any, path: string) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
const setPath = (obj: any, path: string, value: unknown) => {
  const clone = structuredClone(obj);
  const keys = path.split(".");
  let cur = clone;
  for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
  cur[keys[keys.length - 1]] = value;
  return clone;
};

const hasAnyValue = (p: SoraProfile) => {
  const walk = (v: any): boolean =>
    Array.isArray(v) ? v.length > 0 : v && typeof v === "object" ? Object.entries(v).some(([k, x]) => k !== "requiresObserver" && k !== "pages" && walk(x)) : v !== null && v !== undefined && v !== "";
  return walk(p);
};


interface Ctx {
  profile: SoraProfile;
  editable: boolean;
  update: (path: string, value: unknown) => void;
  fieldLabel: (path: string) => string;
  t: (key: string, opts?: any) => string;
}
const EditorCtx = createContext<Ctx | null>(null);
const useCtx = () => useContext(EditorCtx)!;

const PageMark = ({ path }: { path: string }) => {
  const { profile, t } = useCtx();
  return profile.pages[path] ? (
    <span className="ml-1 rounded bg-primary/10 px-1 text-[10px] font-normal text-primary">{t("soraProfile.page", { page: profile.pages[path] })}</span>
  ) : null;
};
const Field = ({ path, children, wide }: { path: string; children: ReactNode; wide?: boolean }) => {
  const { profile, editable, update, t, fieldLabel } = useCtx();
  return (
    <div className={cn("space-y-1", wide && "sm:col-span-2")}>
      <Label className="text-xs text-muted-foreground">{fieldLabel(path)}<PageMark path={path} /></Label>
      {children}
    </div>
  );
};

const NumField = ({ path, step = "any" }: { path: string; step?: string }) => {
  const { profile, editable, update, t, fieldLabel } = useCtx();
  return (
    <Field path={path}>
      <Input
        type="number"
        inputMode="decimal"
        step={step}
        disabled={!editable}
        value={getPath(profile, path) ?? ""}
        onChange={(e) => update(path, e.target.value === "" ? null : Number(e.target.value))}
      />
    </Field>
  );
};
const TextField = ({ path, multiline, wide }: { path: string; multiline?: boolean; wide?: boolean }) => {
  const { profile, editable, update, t, fieldLabel } = useCtx();
  return (
    <Field path={path} wide={wide}>
      {multiline ? (
        <Textarea rows={2} disabled={!editable} value={getPath(profile, path) ?? ""} onChange={(e) => update(path, e.target.value || null)} />
      ) : (
        <Input disabled={!editable} value={getPath(profile, path) ?? ""} onChange={(e) => update(path, e.target.value || null)} />
      )}
    </Field>
  );
};
const SelectField = ({ path, options, labels }: { path: string; options: readonly string[]; labels?: (o: string) => string }) => {
  const { profile, editable, update, t } = useCtx();
  return (
    <Field path={path}>
      <Select disabled={!editable} value={getPath(profile, path) ?? "__none__"} onValueChange={(v) => update(path, v === "__none__" ? null : v)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">{t("soraProfile.unknown")}</SelectItem>
          {options.map((o) => <SelectItem key={o} value={o}>{labels ? labels(o) : o}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  );
};
const NumSelectField = ({ path, options }: { path: string; options: readonly string[] }) => {
  const { profile, editable, update, t } = useCtx();
  const v = getPath(profile, path);
  return (
    <Field path={path}>
      <Select disabled={!editable} value={v == null ? "__none__" : String(v)} onValueChange={(x) => update(path, x === "__none__" ? null : Number(x))}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">{t("soraProfile.unknown")}</SelectItem>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  );
};
const BoolField = ({ path }: { path: string }) => {
  const { profile, editable, update, t } = useCtx();
    const v = getPath(profile, path);
    return (
      <Field path={path}>
        <Select disabled={!editable} value={v === true ? "yes" : v === false ? "no" : "__none__"} onValueChange={(x) => update(path, x === "yes" ? true : x === "no" ? false : null)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">{t("soraProfile.unknown")}</SelectItem>
            <SelectItem value="yes">{t("common.yes")}</SelectItem>
            <SelectItem value="no">{t("common.no")}</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    );
};
const Section = ({ title, children }: { title: string; children: ReactNode }) => {
  const { profile, editable, update, t, fieldLabel } = useCtx();
  return (
    <section className="space-y-3 rounded-lg border border-border p-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
};

interface Props {
  documentId: string;
  readOnly?: boolean;
}

export function SoraProfileEditor({ documentId, readOnly }: Props) {
  const { t } = useTranslation();
  const { loading, document: soraDoc, row, status, canEdit, isPdf, confirmerName, save, extract } = useSoraProfile(documentId);
  const [profile, setProfile] = useState<SoraProfile>(emptySoraProfile());
  const [source, setSource] = useState<"ai" | "manual" | null>(null);
  const [extractedAt, setExtractedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<null | "ai" | "save" | "confirm">(null);
  const { companyId } = useAuth();
  // Aircraft rows (by index) whose register links are unaccepted suggestions.
  const [suggested, setSuggested] = useState<Set<number>>(new Set());

  // The register covers the document owner and all its departments, so a parent
  // company's SORA profile can link department drones and equipment.
  const ownerCompanyId: string | null = soraDoc?.company_id ?? companyId ?? null;
  const { data: registry } = useQuery({
    queryKey: ["sora-profile-registry", ownerCompanyId],
    enabled: !!ownerCompanyId,
    queryFn: async () => {
      const [owner, children] = await Promise.all([
        supabase.from("companies").select("id, navn").eq("id", ownerCompanyId!).maybeSingle(),
        supabase.from("companies").select("id, navn").eq("parent_company_id", ownerCompanyId!).order("navn"),
      ]);
      const childRows = (children.data as any[]) ?? [];
      const ids = [ownerCompanyId!, ...childRows.map((c) => c.id)];
      const groupNames: Record<string, string> = {};
      groupNames[ownerCompanyId!] = (childRows.length > 0 ? t("soraProfile.registry.parentCompany") : ((owner.data as any)?.navn ?? "")));
      for (const c of childRows) groupNames[c.id] = t("soraProfile.registry.department", { name: c.navn });
      const [d, e, c] = await Promise.all([
        supabase.from("drones").select("id, company_id, modell, dji_aircraft_name, serienummer, registration_number").in("company_id", ids).eq("aktiv", true).order("modell"),
        supabase.from("equipment").select("id, company_id, navn, type, serienummer").in("company_id", ids).eq("aktiv", true).order("navn"),
        supabase.from("drone_models").select("id, name, characteristic_dimension_m, max_speed_mps, standard_takeoff_weight_kg, weight_kg").order("name"),
      ]);
      const order = (x: { company_id: string }) => ids.indexOf(x.company_id);
      const drones = ((d.data as any[]) ?? []).sort((a, b) => order(a) - order(b));
      const equipment = ((e.data as any[]) ?? []).sort((a, b) => order(a) - order(b));
      return { drones, equipment, catalog: c.data ?? [], groupNames, hasDepartments: childRows.length > 0 };
    },
  });
  const groupOf = (cid: string) => (registry?.hasDepartments ? (registry.groupNames as Record<string, string>)?.[cid] ?? "" : undefined);

  const applySuggestions = (p: SoraProfile): { profile: SoraProfile; rows: Set<number> } => {
    const rows = new Set<number>();
    if (!registry) return { profile: p, rows };
    const aircraft = p.aircraft.map((a, i) => {
      if (a.droneIds.length > 0 || a.catalogModelId) return a;
      const m = suggestAircraftMatches(a, registry.drones, registry.catalog);
      if (m.confidence === "none") return a;
      rows.add(i);
      return { ...a, droneIds: m.droneIds, catalogModelId: m.catalogModelId };
    });
    return { profile: { ...p, aircraft }, rows };
  };

  useEffect(() => {
    if (dirty) return;
    const base = row?.profile ?? emptySoraProfile();
    const { profile: withSuggestions, rows } = canEdit && !readOnly ? applySuggestions(base) : { profile: base, rows: new Set<number>() };
    setProfile(withSuggestions);
    setSuggested(rows);
    setSource(row?.extraction_source ?? null);
    setExtractedAt(row?.extracted_at ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row, dirty, registry, canEdit, readOnly]);

  const droneOptions: RegistryOption[] = useMemo(() => (registry?.drones ?? []).map((d) => ({
    id: d.id, label: d.modell, sub: [d.serienummer, d.registration_number].filter(Boolean).join(" · "), group: groupOf(d.company_id),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [registry]);
  const equipmentOptions: RegistryOption[] = useMemo(() => (registry?.equipment ?? []).map((e) => ({
    id: e.id, label: e.navn, sub: [e.type, e.serienummer].filter(Boolean).join(" · "), group: groupOf(e.company_id),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [registry]);
  const catalogOptions: RegistryOption[] = useMemo(() => (registry?.catalog ?? []).map((c) => ({ id: c.id, label: c.name })), [registry]);

  const unlinkedRows = profile.aircraft.map((a, i) => (a.droneIds.length === 0 ? i : -1)).filter((i) => i >= 0);
  // Register links are optional; unlinked rows only show a warning.
  const confirmBlocked = false;
  void unlinkedRows;

  const acceptSuggestion = (idx: number) => setSuggested((s) => { const n = new Set(s); n.delete(idx); return n; });

  const fillFromCatalog = (idx: number) => {
    const a = profile.aircraft[idx];
    const c = registry?.catalog.find((x) => x.id === a.catalogModelId);
    if (!c) return;
    const next = { ...a };
    if (next.maxDimensionM === null && c.characteristic_dimension_m != null) next.maxDimensionM = Number(c.characteristic_dimension_m);
    if (next.maxSpeedMps === null && c.max_speed_mps != null) next.maxSpeedMps = Number(c.max_speed_mps);
    const w = c.standard_takeoff_weight_kg ?? c.weight_kg;
    if (next.mtomKg === null && w != null) next.mtomKg = Number(w);
    if (!next.model) next.model = c.name;
    update(`aircraft.${idx}`, next);
  };

  const removeAircraft = (idx: number) => {
    update("aircraft", profile.aircraft.filter((__, i) => i !== idx));
    setSuggested((s) => new Set([...s].filter((i) => i !== idx).map((i) => (i > idx ? i - 1 : i))));
  };

  const editable = canEdit && !readOnly;
  // Department admins viewing a parent's profile see which of their own drones it covers.
  const ownDepartmentDrones = useMemo(() => {
    if (!registry || !companyId || !ownerCompanyId || companyId === ownerCompanyId) return [];
    const linked = new Set(profile.aircraft.flatMap((a) => a.droneIds));
    return registry.drones.filter((d) => d.company_id === companyId).map((d) => ({ ...d, covered: linked.has(d.id) }));
  }, [registry, companyId, ownerCompanyId, profile.aircraft]);
  const issues = useMemo(() => checkSoraProfileConsistency(profile), [profile]);
  const shownStatus = dirty ? "draft" : status;

  const fieldLabel = (path: string) => t(`soraProfile.fields.${path.replace(/^aircraft\.\d+\./, "aircraft.").replace(/^oso\.\d+\./, "oso.")}`);

  const update = (path: string, value: unknown) => {
    setProfile((p) => setPath(p, path, value));
    setDirty(true);
    if (!source) setSource("manual");
  };

  const robustnessLabel = (o: string) => t(`soraProfile.robustness.${o}`);

  const runAi = async () => {
    if (hasAnyValue(profile) && !window.confirm(t("soraProfile.confirmOverwrite"))) return;
    setBusy("ai");
    try {
      const result = await extract();
      if (!result.readable || !result.profile) {
        toast.warning(t("soraProfile.unreadable"));
        return;
      }
      const applied = applySuggestions(result.profile);
      setProfile(applied.profile);
      setSuggested(applied.rows);
      setSource("ai");
      setExtractedAt(new Date().toISOString());
      setDirty(true);
      toast.success(t("soraProfile.aiDone"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("soraProfile.aiError"));
    } finally {
      setBusy(null);
    }
  };

  const persist = async (confirm: boolean) => {
    setBusy(confirm ? "confirm" : "save");
    try {
      await save(profile, { confirm, extractionSource: source ?? "manual", extractedAt });
      setDirty(false);
      setSuggested(new Set());
      toast.success(t(confirm ? "soraProfile.confirmed" : "soraProfile.saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("soraProfile.saveError"));
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <div className="flex flex-1 items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const issueValue = (v: unknown) => (v === null || v === undefined ? "—" : v === "certified" ? t("soraProfile.certified") : String(v));

  return (
    <EditorCtx.Provider value={{ profile, editable, update, fieldLabel, t }}>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-4 [touch-action:pan-y]">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={cn("rounded-full border px-2 py-0.5 font-medium", soraStatusClass(shownStatus))}>{t(`soraProfile.status.${shownStatus}`)}</span>
          {row?.status === "confirmed" && row.confirmed_at && !dirty && (
            <span className="text-muted-foreground">
              {t("soraProfile.confirmedBy", { name: confirmerName ?? "—", date: format(new Date(row.confirmed_at), "dd.MM.yyyy HH:mm") })}
            </span>
          )}
          {source && <span className="text-muted-foreground">{t(`soraProfile.source.${source}`)}</span>}
          {!editable && <span className="text-muted-foreground">{t("soraProfile.readOnly")}</span>}
        </div>
        {status === "outdated" && !dirty && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs">{t("soraProfile.outdatedHint")}</div>
        )}
        {issues.length > 0 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-1">
            <div className="flex items-center gap-1 font-semibold"><AlertTriangle className="h-4 w-4" />{t("soraProfile.issuesTitle")}</div>
            <ul className="space-y-0.5">
              {issues.map((i) => (
                <li key={i.field}>
                  {fieldLabel(i.field)}: {t("soraProfile.issueLine", { doc: issueValue(i.documentValue), calc: issueValue(i.calculated) })}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Section title={t("soraProfile.sections.envelope")}>
          <SelectField path="soraVersion" options={SORA_VERSIONS} />
          <SelectField path="soraType" options={["generic", "specific"]} labels={(o) => t(`soraProfile.soraType.${o}`)} />
          <TextField path="operatingArea" multiline wide />
          <NumField path="envelope.maxHeightM" />
          <NumField path="envelope.maxSpeedMps" />
          <NumField path="envelope.maxPopulationDensity" />
          <SelectField path="envelope.operationType" options={OPERATION_TYPES} />
          <NumField path="envelope.maxDistanceFromPilotM" />
          <BoolField path="envelope.controlledGroundArea" />
        </Section>

        <section className="space-y-3 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t("soraProfile.sections.aircraft")}</h3>
            {editable && (
              <Button type="button" size="sm" variant="outline" onClick={() => update("aircraft", [...profile.aircraft, emptyAircraft()])}>
                <Plus className="h-4 w-4 mr-1" />{t("soraProfile.addAircraft")}
              </Button>
            )}
          </div>
          {ownDepartmentDrones.length > 0 && (
            <div className="rounded-md border border-border/60 p-2 space-y-1">
              <p className="text-xs font-medium">{t("soraProfile.registry.ownDronesCoverage")}</p>
              <ul className="space-y-1">
                {ownDepartmentDrones.map((d) => (
                  <li key={d.id} className="flex min-w-0 items-center justify-between gap-2 text-xs">
                    <span className="truncate">{d.modell}{d.serienummer ? ` · ${d.serienummer}` : ""}</span>
                    <span className={d.covered
                      ? "shrink-0 rounded-full border border-emerald-500/50 bg-emerald-500/15 px-2 py-0.5 text-emerald-700 dark:text-emerald-300"
                      : "shrink-0 rounded-full border border-amber-500/50 bg-amber-500/15 px-2 py-0.5 text-amber-700 dark:text-amber-300"}>
                      {d.covered ? t("soraProfile.registry.covered") : t("soraProfile.registry.notCovered")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {profile.aircraft.length === 0 && <p className="text-xs text-muted-foreground">{t("soraProfile.noAircraft")}</p>}
          {profile.aircraft.map((_, idx) => (
            <div key={idx} className="rounded-md border border-border/60 p-2 space-y-2">
              <div className="flex items-center justify-between text-xs font-medium">
                <span>#{idx + 1}</span>
                {editable && (
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={t("soraProfile.removeAircraft")}
                    onClick={() => removeAircraft(idx)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <TextField path={`aircraft.${idx}.manufacturer`} />
                <TextField path={`aircraft.${idx}.model`} />
                <SelectField path={`aircraft.${idx}.type`} options={AIRCRAFT_TYPES} labels={(o) => t(`soraProfile.aircraftTypes.${o}`)} />
                <NumField path={`aircraft.${idx}.maxDimensionM`} />
                <NumField path={`aircraft.${idx}.maxSpeedMps`} />
                <NumField path={`aircraft.${idx}.mtomKg`} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("soraProfile.registry.linkedDrones")}</Label>
                  <RegistryMultiSelect
                    options={droneOptions}
                    value={profile.aircraft[idx].droneIds}
                    onChange={(ids) => { update(`aircraft.${idx}.droneIds`, ids); acceptSuggestion(idx); }}
                    disabled={!editable}
                    placeholder={t("soraProfile.registry.selectDrones")}
                    searchPlaceholder={t("soraProfile.registry.search")}
                    emptyText={t("soraProfile.registry.noResults")}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("soraProfile.registry.catalogModel")}</Label>
                  <div className="flex gap-2">
                    <div className="min-w-0 flex-1">
                      <RegistryMultiSelect
                        single
                        options={catalogOptions}
                        value={profile.aircraft[idx].catalogModelId ? [profile.aircraft[idx].catalogModelId!] : []}
                        onChange={(ids) => { update(`aircraft.${idx}.catalogModelId`, ids[0] ?? null); acceptSuggestion(idx); }}
                        disabled={!editable}
                        placeholder={t("soraProfile.registry.selectCatalog")}
                        searchPlaceholder={t("soraProfile.registry.search")}
                        emptyText={t("soraProfile.registry.noResults")}
                      />
                    </div>
                    {editable && (
                      <Button type="button" variant="outline" size="sm" className="h-10 shrink-0" disabled={!profile.aircraft[idx].catalogModelId} onClick={() => fillFromCatalog(idx)}>
                        <Wand2 className="h-4 w-4 mr-1" />{t("soraProfile.registry.fillFromCatalog")}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              {suggested.has(idx) && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/10 p-2 text-xs">
                  <span className="rounded bg-primary/20 px-1.5 py-0.5 font-medium text-primary">{t("soraProfile.registry.suggestion")}</span>
                  <span className="flex-1">{t("soraProfile.registry.suggestionHint")}</span>
                  {editable && (
                    <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => acceptSuggestion(idx)}>
                      <Check className="h-3.5 w-3.5 mr-1" />{t("soraProfile.registry.accept")}
                    </Button>
                  )}
                </div>
              )}
              {profile.aircraft[idx].droneIds.length === 0 && (
                <div className="flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                  <AlertTriangle className="h-4 w-4 shrink-0" />{t("soraProfile.registry.notLinked")}
                </div>
              )}
            </div>
          ))}
        </section>

        <Section title={t("soraProfile.sections.ground")}>
          <NumSelectField path="ground.igrc" options={GRC_OPTIONS} />
          <NumSelectField path="ground.fgrc" options={GRC_OPTIONS} />
          {(["m1a", "m1b", "m1c", "m2"] as const).map((m) => (
            <div key={m} className="sm:col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-2 rounded-md border border-border/60 p-2">
              <div className="sm:col-span-2 text-xs font-semibold">{t(`soraProfile.mitigations.${m}`)}</div>
              <Field path={`ground.mitigations.${m}.robustness`}>
                <Select
                  disabled={!editable}
                  value={profile.ground.mitigations[m].robustness ?? "__none__"}
                  onValueChange={(v) => {
                    const r = v === "__none__" ? null : v;
                    const red = r ? MITIGATION_MATRIX[MITIGATION_KEY[m]][r] ?? null : null;
                    setProfile((p) => setPath(setPath(p, `ground.mitigations.${m}.robustness`, r), `ground.mitigations.${m}.reduction`, red));
                    setDirty(true);
                    if (!source) setSource("manual");
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("soraProfile.unknown")}</SelectItem>
                    {validRobustness(m).map((o) => (
                      <SelectItem key={o} value={o}>{robustnessLabel(o)} ({MITIGATION_MATRIX[MITIGATION_KEY[m]][o]})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field path={`ground.mitigations.${m}.reduction`}>
                <Input disabled readOnly value={profile.ground.mitigations[m].reduction ?? "–"} />
              </Field>
              <TextField path={`ground.mitigations.${m}.conditionText`} multiline wide />
              {m === "m1c" && <BoolField path="ground.mitigations.m1c.requiresObserver" />}
              {m === "m2" && <TextField path="ground.mitigations.m2.requiredEquipmentText" multiline wide />}
              {m === "m2" && (profile.ground.mitigations.m2.robustness ?? "None") !== "None" && (
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">{t("soraProfile.registry.m2Equipment")}</Label>
                  <RegistryMultiSelect
                    options={equipmentOptions}
                    value={profile.ground.mitigations.m2.equipmentIds}
                    onChange={(ids) => update("ground.mitigations.m2.equipmentIds", ids)}
                    disabled={!editable}
                    placeholder={t("soraProfile.registry.selectEquipment")}
                    searchPlaceholder={t("soraProfile.registry.search")}
                    emptyText={t("soraProfile.registry.noResults")}
                  />
                </div>
              )}
            </div>
          ))}
        </Section>

        <Section title={t("soraProfile.sections.air")}>
          <TextField path="air.scenario" wide />
          <SelectField path="air.initialArc" options={ARC_LEVELS} />
          <NumSelectField path="air.aec" options={AEC_OPTIONS} />
          <Field path="air.strategicReductions" wide>
            <div className="flex flex-wrap gap-2">
              {[...STRATEGIC_REDUCTIONS, ...profile.air.strategicReductions.filter((s) => !(STRATEGIC_REDUCTIONS as readonly string[]).includes(s))].map((opt) => {
                const active = profile.air.strategicReductions.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    disabled={!editable}
                    onClick={() =>
                      update(
                        "air.strategicReductions",
                        active ? profile.air.strategicReductions.filter((s) => s !== opt) : [...profile.air.strategicReductions, opt],
                      )
                    }
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs",
                      active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
                      !editable && "opacity-60",
                    )}
                  >
                    {(STRATEGIC_LABEL_KEYS as readonly string[]).includes(opt) ? t(`soraProfile.strategicOptions.${opt}`) : opt}
                  </button>
                );
              })}
            </div>
          </Field>
          <SelectField path="air.residualArc" options={ARC_LEVELS} />
          <SelectField path="air.tmpr" options={ROBUSTNESS} labels={robustnessLabel} />
        </Section>

        <Section title={t("soraProfile.sections.sail")}>
          <SelectField path="sail" options={SAIL_LEVELS} />
        </Section>

        <Section title={t("soraProfile.sections.containment")}>
          <SelectField path="containment.robustness" options={ROBUSTNESS} labels={robustnessLabel} />
          <NumField path="containment.adjacentAreaKm" />
          <NumField path="containment.maxAdjacentDensity" />
          <BoolField path="containment.shelterApplicable" />
          <TextField path="containment.maxAssembly" wide />
        </Section>

        <Section title={t("soraProfile.sections.buffers")}>
          <NumField path="buffers.cvHorizontalM" />
          <NumField path="buffers.cvVerticalM" />
          <NumField path="buffers.groundRiskBufferM" />
        </Section>

        <section className="space-y-3 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t("soraProfile.sections.oso")}</h3>
            {editable && (
              <Button type="button" size="sm" variant="outline" onClick={() => update("oso", [...profile.oso, { id: "", robustness: null }])}>
                <Plus className="h-4 w-4 mr-1" />{t("soraProfile.addOso")}
              </Button>
            )}
          </div>
          {profile.oso.map((_, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <SelectField path={`oso.${idx}.id`} options={OSO_IDS} />
              <SelectField path={`oso.${idx}.robustness`} options={ROBUSTNESS} labels={robustnessLabel} />
              {editable && (
                <Button type="button" size="icon" variant="ghost" aria-label={t("soraProfile.removeOso")}
                  onClick={() => update("oso", profile.oso.filter((__, i) => i !== idx))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </section>
      </div>

      {editable && (
        <div className="shrink-0 border-t border-border px-4 py-3 flex flex-wrap gap-2 justify-end">
          {isPdf && (
            <Button type="button" variant="outline" disabled={!!busy} onClick={runAi}>
              {busy === "ai" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
              {t("soraProfile.readWithAi")}
            </Button>
          )}
          <Button type="button" variant="secondary" disabled={!!busy} onClick={() => persist(false)}>
            {busy === "save" && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}{t("soraProfile.saveDraft")}
          </Button>
          {confirmBlocked && <p className="w-full text-right text-xs text-muted-foreground">{t("soraProfile.registry.confirmBlocked")}</p>}
          <Button type="button" disabled={!!busy || confirmBlocked} onClick={() => persist(true)}>
            {busy === "confirm" && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}{t("soraProfile.confirm")}
          </Button>
        </div>
      )}
    </EditorCtx.Provider>
  );
}
