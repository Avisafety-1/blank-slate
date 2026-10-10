import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { MissionDetailDialog } from "@/components/dashboard/MissionDetailDialog";
import { IncidentDetailDialog } from "@/components/dashboard/IncidentDetailDialog";
import { DocumentDetailDialog } from "@/components/dashboard/DocumentDetailDialog";
import { DroneDetailDialog } from "@/components/resources/DroneDetailDialog";
import { EquipmentDetailDialog } from "@/components/resources/EquipmentDetailDialog";
import { PersonCompetencyDialog } from "@/components/resources/PersonCompetencyDialog";
import { AuditTaskDialog } from "./AuditTaskDialog";
import { AddIncidentDialog } from "@/components/dashboard/AddIncidentDialog";
import DocumentCardModal from "@/components/documents/DocumentCardModal";
import { useAuth } from "@/contexts/AuthContext";
import { auditDeepLink } from "../utils/auditDeepLink";

/**
 * One host for every "Open" button in the compliance module: fetches the row
 * and shows the app's existing detail dialog on top of the module instead of
 * navigating away. auditDeepLink stays for reminders (recipients are elsewhere).
 */

type Kind = "mission" | "incident" | "document" | "drone" | "equipment" | "person" | "audit_task";
export type EntityOpenTarget =
  | "detail" | "incident-close" | "incident-responsible" | "incident-report"
  | "incident-report-missing-risk" | "incident-report-sora" | "incident-report-no-go"
  | "risk-start" | "risk-readonly" | "mission-notes" | "competency-edit"
  | "document-version" | "emergency-plan" | "drone-maintenance";
type Open = { kind: Kind; row: any; target: EntityOpenTarget; sourceEntityId?: string } | null;

interface Ctx {
  openEntity: (entityType: string, entityId: string, target?: EntityOpenTarget) => Promise<void>;
  pendingKey: string | null;
  closeRevision: number;
}

const AuditEntityContext = createContext<Ctx | null>(null);

export const useAuditEntityDialog = (): Ctx => {
  const ctx = useContext(AuditEntityContext);
  if (!ctx) throw new Error("useAuditEntityDialog must be used inside AuditEntityDialogHost");
  return ctx;
};

/** Entity types that have a detail dialog. Others (audit findings/actions) have none. */
export const canOpenEntity = (entityType: string) =>
  ["mission", "active_flight", "activeFlight", "flight", "incident", "action", "document", "drone", "equipment",
    "profile", "person", "personnel", "competency", "audit_finding", "audit_action"].includes(entityType);

const documentStatus = (doc: any): string => {
  if (!doc?.gyldig_til) return "Grønn";
  const days = Math.floor((new Date(doc.gyldig_til).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "Rød";
  if (days <= (doc.varsel_dager_for_utløp || 30)) return "Gul";
  return "Grønn";
};

async function fetchEntity(entityType: string, id: string, target: EntityOpenTarget): Promise<Open> {
  switch (entityType) {
    case "mission": {
      const { data } = await supabase.from("missions").select("*").eq("id", id).maybeSingle();
      return data ? { kind: "mission", row: data, target } : null;
    }
    case "active_flight":
    case "activeFlight":
    case "flight": {
      const { data: af } = await (supabase as any).from("active_flights").select("mission_id").eq("id", id).maybeSingle();
      const missionId = af?.mission_id ?? id;
      const { data } = await supabase.from("missions").select("*").eq("id", missionId).maybeSingle();
      return data ? { kind: "mission", row: data, target } : null;
    }
    case "incident":
    case "action": {
      const { data } = await supabase.from("incidents").select("*").eq("id", id).maybeSingle();
      return data ? { kind: "incident", row: data, target } : null;
    }
    case "document": {
      if (target === "emergency-plan") return { kind: "document", row: {}, target };
      const { data } = await supabase.from("documents").select("*").eq("id", id).maybeSingle();
      return data ? { kind: "document", row: data, target } : null;
    }
    case "drone": {
      const { data } = await supabase.from("drones").select("*").eq("id", id).maybeSingle();
      return data ? { kind: "drone", row: data, target } : null;
    }
    case "equipment": {
      const { data } = await supabase.from("equipment").select("*").eq("id", id).maybeSingle();
      return data ? { kind: "equipment", row: data, target } : null;
    }
    case "competency":
    case "profile":
    case "person":
    case "personnel": {
      let profileId = id;
      if (entityType === "competency") {
        const { data: c } = await supabase.from("personnel_competencies").select("profile_id").eq("id", id).maybeSingle();
        profileId = (c as any)?.profile_id ?? id;
      }
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, personnel_competencies(*)")
        .eq("id", profileId)
        .maybeSingle();
      return data ? { kind: "person", row: data, target, sourceEntityId: entityType === "competency" ? id : undefined } : null;
    }
    case "audit_finding":
      return { kind: "audit_task", row: { id }, target };
    case "audit_action": {
      const { data } = await supabase.from("audit_actions").select("finding_id").eq("id", id).maybeSingle();
      return data?.finding_id ? { kind: "audit_task", row: { id: data.finding_id }, target } : null;
    }
    default:
      return null;
  }
}

const FULL_PAGE_KEY: Record<Kind, string> = {
  mission: "audit.openEntity.inMissions",
  incident: "audit.openEntity.inIncidents",
  document: "audit.openEntity.inDocuments",
  drone: "audit.openEntity.inResources",
  equipment: "audit.openEntity.inResources",
  person: "audit.openEntity.inResources",
  audit_task: "audit.alerts.open",
};

const DEEP_LINK_TYPE: Record<Kind, string> = {
  mission: "mission", incident: "incident", document: "document", drone: "drone", equipment: "equipment", person: "person",
  audit_task: "audit_finding",
};

export const AuditEntityDialogHost = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { isAdmin, companyId } = useAuth();
  const [open, setOpen] = useState<Open>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [closeRevision, setCloseRevision] = useState(0);

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["audit"] });
    qc.invalidateQueries({ queryKey: ["inbox"] });
    qc.invalidateQueries({ queryKey: ["inbox-thread"] });
    qc.invalidateQueries({ queryKey: ["inbox-unread-count"] });
  }, [qc]);

  const openEntity = useCallback(async (entityType: string, entityId: string, target: EntityOpenTarget = "detail") => {
    const key = `${entityType}:${entityId}`;
    setPendingKey(key);
    try {
      const res = await fetchEntity(entityType, entityId, target);
      if (!res) {
        toast.error(t("audit.openEntity.notFound"));
        return;
      }
      setOpen(res);
    } catch {
      toast.error(t("audit.openEntity.notFound"));
    } finally {
      setPendingKey((k) => (k === key ? null : k));
    }
  }, [t]);

  const close = (v: boolean) => {
    if (!v) {
      setOpen(null);
      setCloseRevision((value) => value + 1);
      refresh();
    }
  };

  const value = useMemo(() => ({ openEntity, pendingKey, closeRevision }), [openEntity, pendingKey, closeRevision]);
  const row = open?.row ?? null;
  const fullPageLink = open ? (
    <div className="flex justify-end">
      <Button asChild size="sm" variant="link" className="h-auto p-0 text-xs">
        <Link to={auditDeepLink(DEEP_LINK_TYPE[open.kind], row.id).path}>
          <ExternalLink className="mr-1 h-3.5 w-3.5" />
          {t(FULL_PAGE_KEY[open.kind])}
        </Link>
      </Button>
    </div>
  ) : null;

  return (
    <AuditEntityContext.Provider value={value}>
      {children}
      <MissionDetailDialog
        open={open?.kind === "mission"}
        onOpenChange={close}
        mission={open?.kind === "mission" ? row : null}
        onMissionUpdated={refresh}
        topSlot={open?.kind === "mission" ? fullPageLink : null}
        initialView={open?.kind === "mission" ? open.target : undefined}
      />
      <IncidentDetailDialog open={open?.kind === "incident"} onOpenChange={close} incident={open?.kind === "incident" ? row : null} initialView={open?.kind === "incident" ? open.target : undefined} />
      <DocumentDetailDialog
        open={open?.kind === "document"}
        onOpenChange={close}
        document={open?.kind === "document" ? row : null}
        status={open?.kind === "document" ? documentStatus(row) : "Grønn"}
      />
      <DroneDetailDialog open={open?.kind === "drone"} onOpenChange={close} drone={open?.kind === "drone" ? row : null} onDroneUpdated={refresh} initialSection={open?.kind === "drone" && open.target === "drone-maintenance" ? "maintenance" : undefined} />
      <EquipmentDetailDialog
        open={open?.kind === "equipment"}
        onOpenChange={close}
        equipment={open?.kind === "equipment" ? row : null}
        onEquipmentUpdated={refresh}
      />
      <PersonCompetencyDialog
        open={open?.kind === "person"}
        onOpenChange={close}
        person={open?.kind === "person" ? row : null}
        onCompetencyUpdated={refresh}
        initialCompetencyId={open?.kind === "person" ? open.sourceEntityId : undefined}
      />
      {open?.kind === "audit_task" && <AuditTaskDialog findingId={row.id} onClose={() => close(false)} />}
      <AddIncidentDialog
        open={open?.kind === "mission" && open.target.startsWith("incident-report")}
        onOpenChange={close}
        defaultMissionId={open?.kind === "mission" ? row.id : undefined}
        defaultTitle={open?.kind === "mission" && open.target.startsWith("incident-report") ? t(`reminders.incidentDefaults.${open.target}.title`) : undefined}
        defaultDescription={open?.kind === "mission" && open.target.startsWith("incident-report") ? t(`reminders.incidentDefaults.${open.target}.description`) : undefined}
      />
      <DocumentCardModal
        document={open?.kind === "document" && open.target === "document-version" ? row : null}
        isOpen={open?.kind === "document" && (open.target === "document-version" || open.target === "emergency-plan")}
        onClose={() => close(false)} onSaveSuccess={() => close(false)} onDeleteSuccess={() => close(false)}
        isAdmin={isAdmin} isCreating={open?.kind === "document" && open.target === "emergency-plan"}
        isOwnerCompany={open?.kind === "document" ? !row.company_id || row.company_id === companyId : false}
      />
    </AuditEntityContext.Provider>
  );
};

/**
 * Standard "Open" button for the compliance module, with spinner while the row
 * loads and a small secondary link to the full page.
 */
export const OpenEntityButton = ({
  entityType, entityId, variant = "outline", label, showFullPageLink = true,
}: {
  entityType: string;
  entityId: string;
  variant?: "outline" | "ghost";
  label?: string;
  showFullPageLink?: boolean;
}) => {
  const { t } = useTranslation();
  const { openEntity, pendingKey } = useAuditEntityDialog();
  if (!entityId || !canOpenEntity(entityType)) return null;
  const loading = pendingKey === `${entityType}:${entityId}`;
  const fullPath = auditDeepLink(entityType === "active_flight" ? "mission" : entityType, entityId).path;
  return (
    <span className="inline-flex items-center gap-0.5">
      <Button size="sm" variant={variant} disabled={loading} onClick={() => openEntity(entityType, entityId)}>
        {label ?? t("audit.alerts.open")}
        {loading ? <Loader2 className="ml-1.5 h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="ml-1.5 h-3.5 w-3.5" />}
      </Button>
      {showFullPageLink && entityType !== "active_flight" && entityType !== "competency" && (
        <Button asChild size="icon" variant="ghost" className="h-8 w-8" title={t("audit.openEntity.fullPage")}>
          <Link to={fullPath} aria-label={t("audit.openEntity.fullPage")}>
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </Button>
      )}
    </span>
  );
};
