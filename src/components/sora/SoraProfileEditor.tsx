import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { AlertTriangle, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useSoraProfile } from "@/hooks/useSoraProfile";
import {
  ARC_LEVELS,
  OPERATION_TYPES,
  ROBUSTNESS,
  SAIL_LEVELS,
  checkSoraProfileConsistency,
  emptyAircraft,
  emptySoraProfile,
  type SoraProfile,
} from "@/lib/soraProfile";
import { soraStatusClass } from "./SoraProfileBadge";

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
  const SelectField = ({ path, options, labels }: { path: string; options: readonly string[]; labels?: (o: string) => string }) => (
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
  const { loading, row, status, canEdit, isPdf, confirmerName, save, extract } = useSoraProfile(documentId);
  const [profile, setProfile] = useState<SoraProfile>(emptySoraProfile());
  const [source, setSource] = useState<"ai" | "manual" | null>(null);
  const [extractedAt, setExtractedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<null | "ai" | "save" | "confirm">(null);

  useEffect(() => {
    if (dirty) return;
    setProfile(row?.profile ?? emptySoraProfile());
    setSource(row?.extraction_source ?? null);
    setExtractedAt(row?.extracted_at ?? null);
  }, [row, dirty]);

  const editable = canEdit && !readOnly;
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
      setProfile(result.profile);
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
          <TextField path="soraVersion" />
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
          {profile.aircraft.length === 0 && <p className="text-xs text-muted-foreground">{t("soraProfile.noAircraft")}</p>}
          {profile.aircraft.map((_, idx) => (
            <div key={idx} className="rounded-md border border-border/60 p-2 space-y-2">
              <div className="flex items-center justify-between text-xs font-medium">
                <span>#{idx + 1}</span>
                {editable && (
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={t("soraProfile.removeAircraft")}
                    onClick={() => update("aircraft", profile.aircraft.filter((__, i) => i !== idx))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <TextField path={`aircraft.${idx}.manufacturer`} />
                <TextField path={`aircraft.${idx}.model`} />
                <TextField path={`aircraft.${idx}.type`} />
                <NumField path={`aircraft.${idx}.maxDimensionM`} />
                <NumField path={`aircraft.${idx}.maxSpeedMps`} />
                <NumField path={`aircraft.${idx}.mtomKg`} />
              </div>
            </div>
          ))}
        </section>

        <Section title={t("soraProfile.sections.ground")}>
          <NumField path="ground.igrc" step="1" />
          <NumField path="ground.fgrc" step="1" />
          {(["m1a", "m1b", "m1c", "m2"] as const).map((m) => (
            <div key={m} className="sm:col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-2 rounded-md border border-border/60 p-2">
              <div className="sm:col-span-2 text-xs font-semibold">{t(`soraProfile.mitigations.${m}`)}</div>
              <SelectField path={`ground.mitigations.${m}.robustness`} options={ROBUSTNESS} labels={robustnessLabel} />
              <NumField path={`ground.mitigations.${m}.reduction`} step="1" />
              <TextField path={`ground.mitigations.${m}.conditionText`} multiline wide />
              {m === "m1c" && <BoolField path="ground.mitigations.m1c.requiresObserver" />}
              {m === "m2" && <TextField path="ground.mitigations.m2.requiredEquipmentText" multiline wide />}
            </div>
          ))}
        </Section>

        <Section title={t("soraProfile.sections.air")}>
          <TextField path="air.scenario" wide />
          <SelectField path="air.initialArc" options={ARC_LEVELS} />
          <NumField path="air.aec" step="1" />
          <Field path="air.strategicReductions" wide>
            <Textarea rows={2} disabled={!editable} value={profile.air.strategicReductions.join("\n")}
              onChange={(e) => update("air.strategicReductions", e.target.value.split("\n").filter((s, i, a) => s.trim() || i === a.length - 1))} />
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
              <TextField path={`oso.${idx}.id`} />
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
          <Button type="button" disabled={!!busy} onClick={() => persist(true)}>
            {busy === "confirm" && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}{t("soraProfile.confirm")}
          </Button>
        </div>
      )}
    </EditorCtx.Provider>
  );
}
