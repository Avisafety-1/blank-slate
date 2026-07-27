import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import {
  AlertOctagon,
  Building2,
  Users,
  Plane,
  FileText,
  Activity,
  AlertTriangle,
  ShieldAlert,
  ClipboardCheck,
  Package,
  Gauge,
  Download,
  Loader2,
  Send,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuditOverview, useAuditReviews } from "../hooks/useAuditData";
import {
  buildInspectionPackage,
  getPackageSignedUrl,
  type BuildOptions,
  type BuildProgress,
} from "../services/InspectionPackageBuilder";

type SectionKey =
  | "company"
  | "personnel"
  | "fleet"
  | "documents"
  | "activity"
  | "findings"
  | "incidents"
  | "reviews"
  | "score";

const SECTION_ICONS: Record<SectionKey, typeof Package> = {
  company: Building2,
  personnel: Users,
  fleet: Plane,
  documents: FileText,
  activity: Activity,
  findings: AlertTriangle,
  incidents: ShieldAlert,
  reviews: ClipboardCheck,
  score: Gauge,
};

interface HistoryRow {
  id: string;
  generated_at: string;
  generated_by: string | null;
  storage_path: string;
  file_size_bytes: number | null;
  overall_score: number | null;
  generator_name?: string | null;
}

export const InspectionPackageTab = () => {
  const { t, i18n } = useTranslation();
  const { user, companyId } = useAuth();
  const queryClient = useQueryClient();
  const overview = useAuditOverview();
  const reviews = useAuditReviews();
  const critical = overview.kpis?.criticalFindings ?? 0;

  const [options, setOptions] = useState<BuildOptions>({
    includeAttachments: true,
    includeIncidents: true,
    includeReviews: true,
    redactPersonalData: false,
    period: "12mo",
    language: (i18n.language?.startsWith("en") ? "en" : "no") as "no" | "en",
  });
  const [progressStep, setProgressStep] = useState<BuildProgress["step"] | null>(null);

  const history = useQuery({
    queryKey: ["inspection-packages", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<HistoryRow[]> => {
      const { data, error } = await supabase
        .from("inspection_packages")
        .select("id, generated_at, generated_by, storage_path, file_size_bytes, overall_score")
        .eq("company_id", companyId!)
        .order("generated_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      const rows = (data ?? []) as HistoryRow[];
      const userIds = Array.from(new Set(rows.map((r) => r.generated_by).filter(Boolean))) as string[];
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", userIds);
        const map = new Map((profs ?? []).map((p: any) => [p.id, p.full_name || p.email]));
        for (const r of rows) r.generator_name = r.generated_by ? map.get(r.generated_by) ?? null : null;
      }
      return rows;
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      if (!user?.id || !companyId) throw new Error("no auth");
      return buildInspectionPackage({
        userId: user.id,
        companyId,
        options,
        t,
        onProgress: (p) => setProgressStep(p.step),
      });
    },
    onSuccess: (res) => {
      toast.success(t("audit.package.success"));
      window.open(res.signedUrl, "_blank");
      queryClient.invalidateQueries({ queryKey: ["inspection-packages", companyId] });
    },
    onError: (err: any) => {
      toast.error(err?.message ?? t("audit.package.genericError"));
    },
    onSettled: () => setProgressStep(null),
  });

  const sections: { key: SectionKey; count: number }[] = useMemo(
    () => [
      { key: "company", count: 1 },
      { key: "personnel", count: overview.kpis?.activePilots ?? 0 },
      { key: "fleet", count: overview.kpis?.activeDrones ?? 0 },
      { key: "documents", count: overview.documents.length },
      { key: "activity", count: overview.kpis?.flights12mo ?? 0 },
      { key: "findings", count: overview.kpis?.openFindings ?? 0 },
      { key: "incidents", count: overview.kpis?.incidents12mo ?? 0 },
      { key: "reviews", count: (reviews.data ?? []).length },
      { key: "score", count: overview.evaluation?.overall ?? 0 },
    ],
    [overview, reviews.data],
  );

  const canGenerate = !!user?.id && !!companyId && critical === 0 && !generate.isPending;
  const isBusy = generate.isPending || progressStep !== null;

  const openHistoric = async (row: HistoryRow) => {
    try {
      const url = await getPackageSignedUrl(row.storage_path);
      window.open(url, "_blank");
    } catch (e: any) {
      toast.error(e?.message ?? t("audit.package.genericError"));
    }
  };

  const shareHistoric = async (row: HistoryRow) => {
    try {
      const url = await getPackageSignedUrl(row.storage_path);
      const msg = t("audit.package.sendPrefill", {
        company: overview.company?.navn ?? "",
        date: new Date(row.generated_at).toLocaleDateString(i18n.language),
        url,
      });
      await navigator.clipboard.writeText(msg);
      toast.success(t("common.copiedToClipboard", { defaultValue: "Kopiert" }));
    } catch (e: any) {
      toast.error(e?.message ?? t("audit.package.genericError"));
    }
  };

  return (
    <div className="space-y-6">
      {critical > 0 && (
        <Card className="border-l-4 border-status-red/60">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertOctagon className="w-5 h-5 text-status-red mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-status-red">
                {t("audit.package.criticalOpenTitle", { count: critical })}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("audit.package.criticalOpenBody")}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="w-4 h-4 text-primary" />
            {t("audit.package.header")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">{t("audit.package.description")}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("audit.package.options")}
              </div>
              {[
                { key: "includeAttachments" as const, label: t("audit.package.includeAttachments") },
                { key: "includeIncidents" as const, label: t("audit.package.includeIncidents") },
                { key: "includeReviews" as const, label: t("audit.package.includeReviews") },
                { key: "redactPersonalData" as const, label: t("audit.package.redactPersonalData") },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-start gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={options[key]}
                    onCheckedChange={(v) => setOptions((o) => ({ ...o, [key]: !!v }))}
                    disabled={isBusy}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("audit.package.period")}
              </div>
              <RadioGroup
                value={options.period}
                onValueChange={(v) => setOptions((o) => ({ ...o, period: v as BuildOptions["period"] }))}
                className="space-y-2"
              >
                {[
                  { v: "12mo", l: t("audit.package.periodLast12mo") },
                  { v: "24mo", l: t("audit.package.periodLast24mo") },
                  { v: "all", l: t("audit.package.periodAll") },
                ].map(({ v, l }) => (
                  <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
                    <RadioGroupItem value={v} disabled={isBusy} />
                    <span>{l}</span>
                  </label>
                ))}
              </RadioGroup>

              <div className="pt-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("audit.package.language")}
                </Label>
                <RadioGroup
                  value={options.language}
                  onValueChange={(v) => setOptions((o) => ({ ...o, language: v as "no" | "en" }))}
                  className="flex gap-4 mt-2"
                >
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <RadioGroupItem value="no" disabled={isBusy} />
                    <span>Norsk</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <RadioGroupItem value="en" disabled={isBusy} />
                    <span>English</span>
                  </label>
                </RadioGroup>
              </div>
            </div>
          </div>

          <Separator />

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-sm text-muted-foreground min-h-[1.25rem]">
              {progressStep && (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t(`audit.package.generatingStep.${progressStep}`)}
                </span>
              )}
            </div>
            <Button
              size="lg"
              onClick={() => generate.mutate()}
              disabled={!canGenerate}
            >
              {generate.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t("audit.package.generating")}
                </>
              ) : (
                <>
                  <Package className="w-4 h-4 mr-2" />
                  {t("audit.package.generate")}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("audit.package.contentsHeader")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {sections.map(({ key, count }) => {
              const Icon = SECTION_ICONS[key];
              return (
                <li
                  key={key}
                  className="flex items-center gap-3 rounded-md border p-3 text-sm"
                >
                  <Icon className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="flex-1 min-w-0 truncate">
                    {t(`audit.package.section.${key}`)}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {key === "score" ? `${count}%` : t("audit.package.sectionCount", { count })}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="w-4 h-4 text-primary" />
            {t("audit.package.history")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.isLoading ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              …
            </div>
          ) : (history.data ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">{t("audit.package.historyEmpty")}</div>
          ) : (
            <ul className="divide-y">
              {(history.data ?? []).map((row) => {
                const mb = row.file_size_bytes
                  ? (row.file_size_bytes / (1024 * 1024)).toFixed(2)
                  : "0";
                return (
                  <li key={row.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">
                        {new Date(row.generated_at).toLocaleString(i18n.language)}
                      </div>
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3">
                        <span>
                          {t("audit.package.historyGeneratedBy")}: {row.generator_name ?? "—"}
                        </span>
                        <span>{t("audit.package.historySize", { size: mb })}</span>
                        {row.overall_score !== null && <span>{row.overall_score}%</span>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openHistoric(row)}>
                        <Download className="w-4 h-4 mr-1" />
                        {t("audit.package.download")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => shareHistoric(row)}>
                        <Send className="w-4 h-4 mr-1" />
                        {t("audit.package.sendToInspector")}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
