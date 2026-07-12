import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Loader2, ArrowRightLeft, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type ResourceType = "accessory" | "dronetag" | "equipment" | "document";
type Action = "move" | "share" | "leave";

interface ResourceItem {
  type: ResourceType;
  id: string; // logical resource id (accessory.id, dronetag.id, equipment.id, document.id)
  name: string;
  /** True when the resource is also linked to other drones that will remain in the source dept. */
  crossLinked?: boolean;
}

interface Department {
  id: string;
  navn: string;
}

interface MoveDroneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drone: {
    id: string;
    modell: string;
    serienummer: string;
    company_id?: string;
    companies?: { navn?: string | null } | null;
    sjekkliste_id?: string | null;
    operations_checklist_ids?: string[] | null;
    post_flight_checklist_id?: string | null;
  };
  onTransferred?: () => void;
}

const SUPPORTS_SHARE: Record<ResourceType, boolean> = {
  accessory: false,
  dronetag: false,
  equipment: true,
  document: true,
};

const SECTION_LABELS: Record<ResourceType, string> = {
  accessory: "Tilbehør",
  dronetag: "DroneTag",
  equipment: "Tilkoblet utstyr",
  document: "Dokumenter & sjekklister",
};

const SHARE_HINT: Partial<Record<ResourceType, string>> = {
  document: "Del med underavdelinger (gjør synlig for alle underavdelinger av eier).",
  equipment: "Del synlighet med ny avdeling — eier endres ikke.",
};

export const MoveDroneDialog = ({ open, onOpenChange, drone, onTransferred }: MoveDroneDialogProps) => {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [targetCompanyId, setTargetCompanyId] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [actions, setActions] = useState<Record<string, Action>>({}); // key = `${type}:${id}`

  const fromCompanyName = drone.companies?.navn ?? "denne avdelingen";

  // Load sibling/parent departments and attached resources
  useEffect(() => {
    if (!open || !drone.id || !drone.company_id) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        // Departments in same hierarchy
        const { data: own } = await supabase
          .from("companies")
          .select("id, parent_company_id")
          .eq("id", drone.company_id!)
          .maybeSingle();
        const rootId = own?.parent_company_id || drone.company_id!;
        const { data: children } = await supabase
          .from("companies")
          .select("id, navn")
          .eq("parent_company_id", rootId)
          .order("navn");
        const depts: Department[] = [];
        if (own?.parent_company_id) {
          const { data: parent } = await supabase
            .from("companies")
            .select("id, navn")
            .eq("id", rootId)
            .maybeSingle();
          if (parent) depts.push(parent as Department);
        }
        for (const c of children || []) {
          if (c.id !== drone.company_id) depts.push(c as Department);
        }

        // Resources attached to the drone
        const [acc, tags, eqLinks, docLinks] = await Promise.all([
          supabase.from("drone_accessories").select("id, navn").eq("drone_id", drone.id),
          supabase.from("dronetag_devices").select("id, name").eq("drone_id", drone.id),
          supabase.from("drone_equipment").select("equipment_id, equipment:equipment_id(id, navn)").eq("drone_id", drone.id),
          supabase.from("drone_documents").select("document_id, documents:document_id(id, tittel)").eq("drone_id", drone.id),
        ]);

        const items: ResourceItem[] = [];
        for (const a of acc.data || []) items.push({ type: "accessory", id: a.id, name: a.navn });
        for (const t of tags.data || []) items.push({ type: "dronetag", id: t.id, name: t.name || "DroneTag" });

        const eqIds: string[] = [];
        for (const r of (eqLinks.data || []) as any[]) {
          const e = r.equipment;
          if (e?.id) {
            eqIds.push(e.id);
            items.push({ type: "equipment", id: e.id, name: e.navn || "Utstyr" });
          }
        }

        const docIds = new Set<string>();
        for (const r of (docLinks.data || []) as any[]) {
          const d = r.documents;
          if (d?.id) {
            docIds.add(d.id);
            items.push({ type: "document", id: d.id, name: d.tittel || "Dokument" });
          }
        }
        // Add checklist documents referenced from the drone row itself
        const checklistIds = new Set<string>();
        if (drone.sjekkliste_id) checklistIds.add(drone.sjekkliste_id);
        if (drone.post_flight_checklist_id) checklistIds.add(drone.post_flight_checklist_id);
        for (const id of drone.operations_checklist_ids || []) if (id) checklistIds.add(id);
        const extraChecklistIds = Array.from(checklistIds).filter((id) => !docIds.has(id));
        if (extraChecklistIds.length > 0) {
          const { data: extraDocs } = await supabase
            .from("documents")
            .select("id, tittel")
            .in("id", extraChecklistIds);
          for (const d of extraDocs || []) {
            docIds.add(d.id);
            items.push({ type: "document", id: d.id, name: (d as any).tittel || "Sjekkliste" });
          }
        }

        // Cross-link detection: equipment also linked to other drones
        if (eqIds.length > 0) {
          const { data: otherEq } = await supabase
            .from("drone_equipment")
            .select("equipment_id, drone_id")
            .in("equipment_id", eqIds)
            .neq("drone_id", drone.id);
          const crossEq = new Set((otherEq || []).map((r: any) => r.equipment_id));
          for (const it of items) {
            if (it.type === "equipment" && crossEq.has(it.id)) it.crossLinked = true;
          }
        }
        // Cross-link detection: documents also linked to other drones via drone_documents
        if (docIds.size > 0) {
          const { data: otherDocs } = await supabase
            .from("drone_documents")
            .select("document_id, drone_id")
            .in("document_id", Array.from(docIds))
            .neq("drone_id", drone.id);
          const crossDocs = new Set((otherDocs || []).map((r: any) => r.document_id));
          for (const it of items) {
            if (it.type === "document" && crossDocs.has(it.id)) it.crossLinked = true;
          }
        }

        if (cancelled) return;
        setDepartments(depts);
        setTargetCompanyId(depts[0]?.id || "");
        setResources(items);
        // Default actions: move where possible, leave if cross-linked equipment/doc, share is opt-in
        const defaults: Record<string, Action> = {};
        for (const it of items) {
          const key = `${it.type}:${it.id}`;
          if (it.crossLinked && SUPPORTS_SHARE[it.type]) defaults[key] = "share";
          else defaults[key] = "move";
        }
        setActions(defaults);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, drone.id, drone.company_id, drone.sjekkliste_id, drone.post_flight_checklist_id, drone.operations_checklist_ids]);

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setNote("");
      setResources([]);
      setActions({});
      setTargetCompanyId("");
    }
  }, [open]);

  const grouped = useMemo(() => {
    const g: Record<ResourceType, ResourceItem[]> = {
      accessory: [],
      dronetag: [],
      equipment: [],
      document: [],
    };
    for (const r of resources) g[r.type].push(r);
    return g;
  }, [resources]);

  const setAction = (type: ResourceType, id: string, action: Action) => {
    setActions((prev) => ({ ...prev, [`${type}:${id}`]: action }));
  };

  const setAllForType = (type: ResourceType, action: Action) => {
    setActions((prev) => {
      const next = { ...prev };
      for (const r of grouped[type]) {
        if (action === "move" && r.crossLinked) continue; // can't bulk-move cross-linked
        next[`${type}:${r.id}`] = action;
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!targetCompanyId) {
      toast.error("Velg en målavdeling");
      return;
    }
    setSubmitting(true);
    try {
      const payload = resources.map((r) => ({
        type: r.type,
        resource_id: r.id,
        action: actions[`${r.type}:${r.id}`] || "leave",
      }));
      const { data, error } = await supabase.rpc("transfer_drone", {
        _drone_id: drone.id,
        _to_company_id: targetCompanyId,
        _note: note || null,
        _actions: payload as any,
      });
      if (error) throw error;
      toast.success("Drone flyttet");
      onTransferred?.();
      // Invalidate everything that could reflect the move
      qc.invalidateQueries();
      onOpenChange(false);
      return data;
    } catch (e: any) {
      console.error("transfer_drone failed", e);
      toast.error(e?.message || "Kunne ikke flytte drone");
    } finally {
      setSubmitting(false);
    }
  };

  const renderActionPicker = (item: ResourceItem) => {
    const key = `${item.type}:${item.id}`;
    const current = actions[key] || "move";
    const supportsShare = SUPPORTS_SHARE[item.type];
    const moveDisabled = !!item.crossLinked;
    return (
      <RadioGroup
        value={current}
        onValueChange={(v) => setAction(item.type, item.id, v as Action)}
        className="flex flex-wrap gap-3 text-xs"
      >
        <label className={`flex items-center gap-1.5 ${moveDisabled ? "opacity-50" : ""}`}>
          <RadioGroupItem value="move" id={`${key}-move`} disabled={moveDisabled} />
          Flytt med
        </label>
        {supportsShare && (
          <label className="flex items-center gap-1.5">
            <RadioGroupItem value="share" id={`${key}-share`} />
            {item.type === "document" ? "Del med underavd." : "Del synlighet"}
          </label>
        )}
        <label className="flex items-center gap-1.5">
          <RadioGroupItem value="leave" id={`${key}-leave`} />
          La være
        </label>
      </RadioGroup>
    );
  };

  const renderSection = (type: ResourceType) => {
    const list = grouped[type];
    if (list.length === 0) return null;
    const supportsShare = SUPPORTS_SHARE[type];
    return (
      <div key={type} className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h4 className="text-sm font-semibold">{SECTION_LABELS[type]}</h4>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Velg alle:</span>
            <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setAllForType(type, "move")}>Flytt</Button>
            {supportsShare && (
              <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setAllForType(type, "share")}>Del</Button>
            )}
            <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setAllForType(type, "leave")}>La være</Button>
          </div>
        </div>
        {SHARE_HINT[type] && supportsShare && (
          <p className="text-[11px] text-muted-foreground">{SHARE_HINT[type]}</p>
        )}
        <div className="space-y-2">
          {list.map((item) => (
            <div key={`${item.type}:${item.id}`} className="rounded-md border border-border bg-muted/30 p-2.5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{item.name}</div>
                  {item.crossLinked && (
                    <div className="text-[11px] text-amber-600 dark:text-amber-400">
                      Også koblet til andre droner — «Flytt med» deaktivert.
                    </div>
                  )}
                </div>
                {renderActionPicker(item)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-primary" />
            Flytt drone til annen avdeling
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{drone.modell}</span> ({drone.serienummer}) – fra{" "}
              <span className="font-medium text-foreground">{fromCompanyName}</span>
            </div>

            <div className="space-y-2">
              <Label>Til avdeling</Label>
              {departments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Ingen andre avdelinger i samme hierarki tilgjengelig.
                </p>
              ) : (
                <Select value={targetCompanyId} onValueChange={setTargetCompanyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Velg målavdeling" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.navn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label>Notat (valgfritt)</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Begrunnelse, referanse e.l." />
            </div>

            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
              <div className="flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>Loggbok, inspeksjoner og utstyrshistorikk følger drona automatisk.</span>
              </div>
              <div className="flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>Flygelogger, hendelser og DJI-synkjobber beholdes på {fromCompanyName} som historikk.</span>
              </div>
              <div className="flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>Eksisterende delings-rader for drona fjernes — sett opp deling på nytt etter behov.</span>
              </div>
            </div>

            {resources.length > 0 && <Separator />}

            {(["accessory", "document", "equipment", "dronetag"] as ResourceType[]).map(renderSection)}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Avbryt
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || loading || !targetCompanyId}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Bekreft flytting
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
