import { useEffect, useState } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyMissionTypes, CompanyMissionType } from "@/hooks/useCompanyMissionTypes";

interface Props {
  companyId: string | null;
  disabled?: boolean;
}

export function MissionTypesSection({ companyId, disabled }: Props) {
  const { parentCompanyId } = useAuth();
  const { types, isInherited, effectiveCompanyId, reload } = useCompanyMissionTypes();
  const [newLabel, setNewLabel] = useState("");
  const [propagate, setPropagate] = useState(false);
  const [hasChildren, setHasChildren] = useState(false);
  const [parentName, setParentName] = useState<string>("");
  const [saving, setSaving] = useState(false);

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

  const handleAdd = async () => {
    const label = newLabel.trim();
    if (!label || !companyId) return;
    if (label.toLowerCase() === "annet") {
      toast({ title: "Reservert", description: "«Annet» finnes alltid som valg.", variant: "destructive" });
      return;
    }
    if (types.some((t) => t.label.toLowerCase() === label.toLowerCase())) {
      toast({ title: "Finnes allerede", variant: "destructive" });
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
      toast({ title: "Kunne ikke lagre", description: error.message, variant: "destructive" });
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
      toast({ title: "Kunne ikke slette", description: error.message, variant: "destructive" });
      return;
    }
    await reload();
  };

  const handleToggleActive = async (t: CompanyMissionType) => {
    const { error } = await (supabase
      .from("company_mission_types")
      .update({ is_active: !t.is_active } as any)
      .eq("id", t.id) as any);
    if (error) {
      toast({ title: "Feil", description: error.message, variant: "destructive" });
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
      toast({ title: "Feil", description: error.message, variant: "destructive" });
      return;
    }
    setPropagate(checked);
    toast({ title: checked ? "Gjelder nå for alle avdelinger" : "Avdelinger bruker egen liste" });
  };

  return (
    <div className="space-y-4">
      {isInherited && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm flex items-center gap-2">
          <Lock className="h-4 w-4" />
          <span>
            Styres av {parentName || "moderselskap"}. Listen kan ikke endres her.
          </span>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Listen brukes i både «Legg til oppdrag» og i AI-risikovurdering. «Annet» er alltid tilgjengelig som fritekstvalg.
      </p>

      <div className="space-y-2">
        {(isInherited ? types : types).map((t, i) => (
          <div key={t.id} className="flex items-center gap-2 rounded-md border p-2">
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
            <div className="flex-1 text-sm">{t.label}</div>
            <div className="flex items-center gap-2">
              <Label htmlFor={`active-${t.id}`} className="text-xs text-muted-foreground">
                Aktiv
              </Label>
              <Switch
                id={`active-${t.id}`}
                checked={t.is_active}
                onCheckedChange={() => handleToggleActive(t)}
                disabled={isReadOnly}
              />
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => handleDelete(t.id)}
              disabled={isReadOnly}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <div className="flex items-center gap-2 rounded-md border border-dashed p-2 text-sm text-muted-foreground">
          <div className="flex-1">Annet (fast valg – kan ikke fjernes)</div>
        </div>
      </div>

      {!isReadOnly && (
        <div className="flex gap-2">
          <Input
            placeholder="Ny oppdragstype (f.eks. Linjebefaring)"
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
            Legg til
          </Button>
        </div>
      )}

      {ownsList && hasChildren && (
        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="pr-4">
            <Label htmlFor="propagate-mission-types" className="cursor-pointer font-medium">
              Gjelder for alle avdelinger
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              Når på vil alle datteravdelinger bruke denne listen og ikke kunne redigere den selv.
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
    </div>
  );
}
