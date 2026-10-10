import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { OpenEntityButton } from "./AuditEntityDialogHost";
import { useNavigate } from "react-router-dom";
import {
  ArrowDown, ArrowRight, ArrowUp, CheckCircle2, Clock, Hourglass, MailX, MoreHorizontal, Send, ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ScannerFinding } from "../types";
import type { ActionFilter, FindingContext, FollowUpState, ReminderPhase } from "../lib/complianceView";
import { SeverityBadge } from "./SeverityBadge";
import { InfoTip } from "./InfoTip";
import { SendReminderDialog } from "../SendReminderDialog";
import { DispositionDialog } from "./DispositionDialog";

export interface ActionItem {
  finding: ScannerFinding;
  ctx: FindingContext;
  follow: FollowUpState;
  departmentName: string | null;
}

type SortKey = "severity" | "title" | "department" | "responsible" | "age" | "status";

interface Props {
  items: ActionItem[];
  filter: ActionFilter;
  onFilterChange: (f: ActionFilter) => void;
  /** Extra label when a KPI card narrows the list. */
  presetLabel?: string | null;
  onClearPreset?: () => void;
  showDepartment: boolean;
  initialLimit?: number;
  titleKey?: string;
  helpKey?: string;
  emptyKey?: string;
}

const FILTERS: ActionFilter[] = ["all", "untreated", "waiting", "noResponse"];
const SEV_RANK = { critical: 0, warning: 1, info: 2 } as const;
const PHASE_RANK: Record<ReminderPhase, number> = { noResponse: 0, none: 1, waiting: 2, done: 3 };

export const ReminderPhaseBadge = ({ phase }: { phase: ReminderPhase }) => {
  const { t } = useTranslation();
  const meta = {
    none: { icon: MailX, cls: "text-muted-foreground border-border" },
    waiting: { icon: Clock, cls: "text-status-yellow border-status-yellow/50" },
    noResponse: { icon: Hourglass, cls: "text-status-red border-status-red/50" },
    done: { icon: CheckCircle2, cls: "text-status-green border-status-green/50" },
  }[phase];
  const Icon = meta.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs whitespace-nowrap", meta.cls)}>
      <Icon className="h-3.5 w-3.5" />
      {t(`audit.action.reminder.${phase}`)}
    </span>
  );
};

export const ActionList = ({
  items, filter, onFilterChange, presetLabel, onClearPreset, showDepartment,
  initialLimit = 10, titleKey = "audit.action.title", helpKey = "audit.help.actionList", emptyKey = "audit.action.empty",
}: Props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [reminderFor, setReminderFor] = useState<ScannerFinding | null>(null);
  const [disposeFor, setDisposeFor] = useState<{ finding: ScannerFinding; mode: "accepted" | "snoozed" } | null>(null);

  const title = (f: ScannerFinding) => String(t(f.titleKey, (f.titleParams ?? {}) as never));

  const sorted = useMemo(() => {
    if (!sort) return items; // already in default order (untreated criticals first)
    const val = (i: ActionItem): string | number => {
      switch (sort.key) {
        case "severity": return SEV_RANK[i.finding.severity];
        case "title": return title(i.finding).toLowerCase();
        case "department": return (i.departmentName ?? "").toLowerCase();
        case "responsible": return (i.ctx.responsible ?? "").toLowerCase();
        case "age": return i.ctx.ageDays ?? -1;
        case "status": return PHASE_RANK[i.follow.reminder];
      }
    };
    return [...items].sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, sort]);

  const visible = showAll ? sorted : sorted.slice(0, initialLimit);
  const hidden = sorted.length - visible.length;

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }));

  const SortHead = ({ k, label, className }: { k: SortKey; label: string; className?: string }) => (
    <th className={cn("px-3 py-2 text-left font-medium text-xs text-muted-foreground", className)}>
      <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        {sort?.key === k ? (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : null}
      </button>
    </th>
  );

  const Actions = ({ f }: { f: ScannerFinding }) => (
    <div className="flex items-center gap-1.5 justify-end">
      <OpenEntityButton entityType={f.entityType} entityId={f.entityId} />
      <Button size="sm" variant="outline" onClick={() => setReminderFor(f)}>
        <Send className="mr-1 h-3.5 w-3.5" /> {t("audit.action.remind")}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" aria-label={t("audit.action.more")}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setDisposeFor({ finding: f, mode: "snoozed" })}>
            <Clock className="mr-2 h-4 w-4" /> {t("audit.action.snooze")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDisposeFor({ finding: f, mode: "accepted" })}>
            <ShieldCheck className="mr-2 h-4 w-4" /> {t("audit.action.accept")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const why = (f: ScannerFinding) => t(`audit.why.${f.code}`, { defaultValue: "" });
  const age = (d: number | null) => (d == null ? "—" : t("audit.action.age", { count: d }));

  return (
    <Card>
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold">{t(titleKey)}</h3>
          <InfoTip k={helpKey} />
          <Badge variant="outline" className="ml-auto">{items.length}</Badge>
        </div>
        <div className="flex gap-1.5 overflow-x-auto [touch-action:pan-x] -mx-1 px-1 pb-1">
          {FILTERS.map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f && !presetLabel ? "default" : "outline"}
              className="shrink-0 h-8"
              onClick={() => onFilterChange(f)}
            >
              {t(`audit.action.filters.${f}`)}
            </Button>
          ))}
          {presetLabel && (
            <Button size="sm" variant="default" className="shrink-0 h-8" onClick={onClearPreset}>
              {presetLabel} ✕
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 text-status-green" />
            <span>{t(emptyKey)}</span>
          </div>
        ) : (
          <>
            {/* Table (≥768px) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border">
                  <tr>
                    <SortHead k="severity" label={t("audit.action.cols.severity")} />
                    <SortHead k="title" label={t("audit.action.cols.finding")} />
                    {showDepartment && <SortHead k="department" label={t("audit.action.cols.department")} className="hidden lg:table-cell" />}
                    <SortHead k="responsible" label={t("audit.action.cols.responsible")} className="hidden lg:table-cell" />
                    <SortHead k="age" label={t("audit.action.cols.age")} />
                    <SortHead k="status" label={t("audit.action.cols.reminder")} />
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visible.map((i) => (
                    <tr key={`${i.finding.code}-${i.finding.entityId}`} className="align-top hover:bg-muted/50">
                      <td className="px-3 py-3"><SeverityBadge severity={i.finding.severity} /></td>
                      <td className="px-3 py-3 min-w-[16rem]">
                        <div className="font-medium leading-snug">{title(i.finding)}</div>
                        {why(i.finding) && <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{why(i.finding)}</div>}
                        <div className="text-xs text-muted-foreground mt-0.5 lg:hidden">
                          {[showDepartment ? i.departmentName : null, i.ctx.responsible].filter(Boolean).join(" · ")}
                        </div>
                      </td>
                      {showDepartment && <td className="px-3 py-3 hidden lg:table-cell text-muted-foreground">{i.departmentName ?? "—"}</td>}
                      <td className="px-3 py-3 hidden lg:table-cell text-muted-foreground">{i.ctx.responsible ?? "—"}</td>
                      <td className="px-3 py-3 whitespace-nowrap tabular-nums">{age(i.ctx.ageDays)}</td>
                      <td className="px-3 py-3"><ReminderPhaseBadge phase={i.follow.reminder} /></td>
                      <td className="px-3 py-3"><Actions f={i.finding} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Cards (<768px) */}
            <ul className="md:hidden space-y-3">
              {visible.map((i) => (
                <li key={`${i.finding.code}-${i.finding.entityId}`} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <SeverityBadge severity={i.finding.severity} />
                    <ReminderPhaseBadge phase={i.follow.reminder} />
                  </div>
                  <div className="font-medium leading-snug">{title(i.finding)}</div>
                  {why(i.finding) && <div className="text-xs text-muted-foreground leading-snug">{why(i.finding)}</div>}
                  <div className="text-xs text-muted-foreground">
                    {[showDepartment ? i.departmentName : null, i.ctx.responsible, i.ctx.ageDays != null ? age(i.ctx.ageDays) : null]
                      .filter(Boolean).join(" · ")}
                  </div>
                  <Actions f={i.finding} />
                </li>
              ))}
            </ul>

            {(hidden > 0 || showAll) && sorted.length > initialLimit && (
              <div className="pt-3 text-center">
                <Button size="sm" variant="ghost" onClick={() => setShowAll((s) => !s)}>
                  {showAll ? t("audit.action.showLess") : t("audit.action.showAll", { count: sorted.length })}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>

      <SendReminderDialog finding={reminderFor} open={!!reminderFor} onOpenChange={(o) => !o && setReminderFor(null)} />
      <DispositionDialog
        finding={disposeFor?.finding ?? null}
        mode={disposeFor?.mode ?? "accepted"}
        onClose={() => setDisposeFor(null)}
      />
    </Card>
  );
};
