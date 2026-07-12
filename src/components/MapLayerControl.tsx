import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { 
  Layers, 
  Ban, 
  AlertTriangle, 
  TreePine, 
  Radio, 
  PlaneLanding, 
  Plane, 
  MapPin,
  Shield,
  Navigation,
  Radar,
  Users,
  Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  layers: Layers,
  ban: Ban,
  alertTriangle: AlertTriangle,
  treePine: TreePine,
  radio: Radio,
  planeLanding: PlaneLanding,
  plane: Plane,
  mapPin: MapPin,
  shield: Shield,
  navigation: Navigation,
  radar: Radar,
  users: Users,
  zap: Zap,
};

export interface LayerConfig {
  id: string;
  name: string;
  /** A single Leaflet layer, or several layers that toggle together as one. */
  layer: L.Layer | L.Layer[];
  enabled: boolean;
  icon?: string;
  /** Optional section header shown above the toggle. */
  group?: string;
}

interface MapLayerControlProps {
  layers: LayerConfig[];
  onLayerToggle: (id: string, enabled: boolean) => void;
}

// Stable section order — anything without a group falls into "Annet"
const GROUP_ORDER = [
  "Luftrom",
  "Restriksjoner",
  "Natur & befolkning",
  "Infrastruktur",
  "Live trafikk",
  "Oppdrag",
  "Annet",
];

export function MapLayerControl({ layers, onLayerToggle }: MapLayerControlProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const groupLabels: Record<string, string> = {
    "Luftrom": t("safety.mapLayerControl.groupLuftrom"),
    "Restriksjoner": t("safety.mapLayerControl.groupRestriksjoner"),
    "Natur & befolkning": t("safety.mapLayerControl.groupNaturBefolkning"),
    "Infrastruktur": t("safety.mapLayerControl.groupInfrastruktur"),
    "Live trafikk": t("safety.mapLayerControl.groupLiveTrafikk"),
    "Oppdrag": t("safety.mapLayerControl.groupOppdrag"),
    "Annet": t("safety.mapLayerControl.groupAnnet"),
  };

  const grouped = useMemo(() => {
    const map = new Map<string, LayerConfig[]>();
    for (const l of layers) {
      const key = l.group ?? "Annet";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    }
    return GROUP_ORDER
      .filter((g) => map.has(g))
      .map((g) => [g, map.get(g)!] as const)
      .concat(
        [...map.entries()].filter(([g]) => !GROUP_ORDER.includes(g))
      );
  }, [layers]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="secondary"
          size="icon"
          className="shadow-lg bg-card hover:bg-accent"
          aria-label={t("safety.mapLayerControl.ariaLabel")}
        >
          <Layers className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[280px] sm:w-[320px]">
        <SheetHeader>
          <SheetTitle>{t("safety.mapLayerControl.title")}</SheetTitle>
        </SheetHeader>
        <ScrollArea className="mt-6 h-[calc(100vh-8rem)]">
          <div className="space-y-5 pr-3">
            {grouped.map(([groupName, items]) => (
              <div key={groupName} className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                  {groupLabels[groupName] ?? groupName}
                </div>
                <div className="space-y-3">
                  {items.map((layer) => {
                    const IconComponent = layer.icon ? iconMap[layer.icon] : null;
                    return (
                      <div key={layer.id} className="flex items-center space-x-3">
                        <Checkbox
                          id={layer.id}
                          checked={layer.enabled}
                          onCheckedChange={(checked) => {
                            onLayerToggle(layer.id, checked as boolean);
                          }}
                        />
                        {IconComponent && (
                          <IconComponent className="h-4 w-4 text-muted-foreground" />
                        )}
                        <Label
                          htmlFor={layer.id}
                          className="text-sm font-normal cursor-pointer flex-1"
                        >
                          {layer.name}
                        </Label>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
