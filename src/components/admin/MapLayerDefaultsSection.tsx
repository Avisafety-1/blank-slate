import { useEffect, useMemo, useState } from "react";
import {
  Layers, Ban, AlertTriangle, TreePine, Radio, PlaneLanding,
  Plane, MapPin, Shield, Navigation, Radar, Users, Zap,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MAP_LAYER_CATALOG, MAP_LAYER_GROUP_ORDER, isLayerAvailableForCompany } from "@/config/mapLayers";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  layers: Layers, ban: Ban, alertTriangle: AlertTriangle, treePine: TreePine,
  radio: Radio, planeLanding: PlaneLanding, plane: Plane, mapPin: MapPin,
  shield: Shield, navigation: Navigation, radar: Radar, users: Users, zap: Zap,
};

interface Props {
  companyId: string | null;
  /** Global "saving/editing" disable flag from the parent settings pane. */
  disabled?: boolean;
  /** Locked because this is a child department inheriting the parent's defaults. */
  locked?: boolean;
}

export function MapLayerDefaultsSection({ companyId, disabled, locked }: Props) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [propagate, setPropagate] = useState(false);
  const [isRoot, setIsRoot] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    (supabase
      .from("companies")
      .select("default_map_layers, propagate_default_map_layers, parent_company_id")
      .eq("id", companyId)
      .maybeSingle() as any).then(({ data }: any) => {
        if (data) {
          const raw = data.default_map_layers;
          setOverrides(
            raw && typeof raw === "object" && !Array.isArray(raw)
              ? (raw as Record<string, boolean>)
              : {},
          );
          setPropagate(!!data.propagate_default_map_layers);
          setIsRoot(!data.parent_company_id);
        }
        setLoading(false);
      });
  }, [companyId]);

  const grouped = useMemo(() => {
    const byGroup = new Map<string, typeof MAP_LAYER_CATALOG>();
    for (const entry of MAP_LAYER_CATALOG) {
      const arr = byGroup.get(entry.group) ?? [];
      arr.push(entry);
      byGroup.set(entry.group, arr);
    }
    return MAP_LAYER_GROUP_ORDER
      .filter((g) => byGroup.has(g))
      .map((g) => [g, byGroup.get(g)!] as const)
      .concat(
        [...byGroup.entries()].filter(([g]) => !MAP_LAYER_GROUP_ORDER.includes(g)),
      );
  }, []);

  const effectiveEnabled = (id: string, fallback: boolean) =>
    Object.prototype.hasOwnProperty.call(overrides, id) ? !!overrides[id] : fallback;

  async function saveOverrides(next: Record<string, boolean>) {
    if (!companyId) return;
    setSaving(true);
    setOverrides(next);
    const { error } = await (supabase
      .from("companies")
      .update({ default_map_layers: next as any })
      .eq("id", companyId) as any);
    setSaving(false);
    if (error) {
      toast.error("Kunne ikke lagre standard kartlag: " + error.message);
      return;
    }
    toast.success("Standard kartlag lagret");
  }

  async function togglePropagate(next: boolean) {
    if (!companyId) return;
    setSaving(true);
    setPropagate(next);
    const { error } = await (supabase
      .from("companies")
      .update({ propagate_default_map_layers: next })
      .eq("id", companyId) as any);
    setSaving(false);
    if (error) {
      toast.error("Kunne ikke oppdatere deling: " + error.message);
      return;
    }
    toast.success(
      next ? "Standard kartlag deles nå med underavdelinger" : "Deling slått av",
    );
  }

  if (loading) return null;
  const isDisabled = !!disabled || saving || !!locked;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Velg hvilke kartlag som er på som standard når brukere åpner /kart. Listen speiler
        knappene i kartlag-menyen. Brukere kan fortsatt endre lagene lokalt for sin økt.
      </p>

      {locked && (
        <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          Denne innstillingen er styrt av moderavdelingen og kan ikke endres her.
        </div>
      )}

      <div className="space-y-4">
        {grouped.map(([groupName, items]) => (
          <div key={groupName} className="rounded-lg border border-border/50 p-3 space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              {groupName}
            </div>
            {items.map((entry) => {
              const Icon = ICON_MAP[entry.icon] ?? Layers;
              const checked = effectiveEnabled(entry.id, entry.defaultEnabled);
              const rowId = `map-default-${entry.id}`;
              return (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-3 pt-2 border-t border-border/40 first:border-t-0 first:pt-0"
                >
                  <Label htmlFor={rowId} className="flex items-center gap-2 cursor-pointer flex-1">
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm">{entry.name}</span>
                  </Label>
                  <Switch
                    id={rowId}
                    checked={checked}
                    disabled={isDisabled}
                    onCheckedChange={(v) => {
                      const next = { ...overrides, [entry.id]: !!v };
                      saveOverrides(next);
                    }}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {isRoot && (
        <div className="flex items-start justify-between gap-3 pt-3 border-t border-border/50">
          <Label htmlFor="map-defaults-propagate" className="flex-1 cursor-pointer">
            <div className="font-medium text-sm">Del med underavdelinger</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Når på: standardvalget over kopieres til alle underavdelinger, og disse
              innstillingene låses hos dem.
            </div>
          </Label>
          <Switch
            id="map-defaults-propagate"
            checked={propagate}
            disabled={isDisabled}
            onCheckedChange={togglePropagate}
          />
        </div>
      )}
    </div>
  );
}
