import { SoraSettings } from "@/components/OpenAIPMap";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface SoraSettingsPanelProps {
  settings: SoraSettings;
  onChange: (settings: SoraSettings) => void;
}

export function SoraSettingsPanel({ settings, onChange }: SoraSettingsPanelProps) {
  const [open, setOpen] = useState(false);

  const update = (partial: Partial<SoraSettings>) => {
    onChange({ ...settings, ...partial });
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t border-border">
      <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 sm:px-4 hover:bg-muted/50 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">SORA Operasjonelt volum</span>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={settings.enabled}
            onCheckedChange={(checked) => update({ enabled: checked })}
            onClick={(e) => e.stopPropagation()}
          />
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 pb-3 sm:px-4 sm:pb-4 space-y-4">
          {/* Flight altitude */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Flyhøyde (m)</Label>
            <Input
              type="number"
              min={0}
              max={500}
              value={settings.flightAltitude}
              onChange={(e) => update({ flightAltitude: Number(e.target.value) || 0 })}
              className="h-8 text-sm"
            />
          </div>

          {/* Flight Geography Area */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Flight Geography Area (m)</Label>
              <span className="text-xs font-mono text-green-600 dark:text-green-400">{settings.flightGeographyDistance}m</span>
            </div>
            <Slider
              min={0}
              max={200}
              step={1}
              value={[settings.flightGeographyDistance]}
              onValueChange={([v]) => update({ flightGeographyDistance: v })}
              className="[&_[role=slider]]:bg-green-600"
            />
          </div>

          {/* Buffer mode */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Buffermetode</Label>
            <RadioGroup
              value={settings.bufferMode ?? "corridor"}
              onValueChange={(v) => update({ bufferMode: v as "corridor" | "convexHull" })}
              className="flex gap-4"
            >
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="corridor" id="mode-corridor" />
                <Label htmlFor="mode-corridor" className="text-xs cursor-pointer">Rute-korridor</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="convexHull" id="mode-hull" />
                <Label htmlFor="mode-hull" className="text-xs cursor-pointer">Konveks område</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Contingency area */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Contingency area (m)</Label>
              <span className="text-xs font-mono text-amber-600 dark:text-amber-400">{settings.contingencyDistance}m</span>
            </div>
            <Slider
              min={1}
              max={200}
              step={1}
              value={[settings.contingencyDistance]}
              onValueChange={([v]) => update({ contingencyDistance: v })}
              className="[&_[role=slider]]:bg-amber-500"
            />
          </div>

          {/* Contingency volume height */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Contingency volume høyde (m over flyhøyde)</Label>
            <Input
              type="number"
              min={0}
              max={200}
              value={settings.contingencyHeight}
              onChange={(e) => update({ contingencyHeight: Number(e.target.value) || 0 })}
              className="h-8 text-sm"
            />
          </div>

          {/* Ground risk buffer */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Ground risk buffer (m)</Label>
              <span className="text-xs font-mono text-red-600 dark:text-red-400">{settings.groundRiskDistance}m</span>
            </div>
            <Slider
              min={1}
              max={500}
              step={1}
              value={[settings.groundRiskDistance]}
              onValueChange={([v]) => update({ groundRiskDistance: v })}
              className="[&_[role=slider]]:bg-red-500"
            />
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 pt-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-green-600/40 border border-green-600/60" /> Flight geography area
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-green-500/40 border border-green-500/60" /> Flight geography
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-amber-500/40 border border-amber-500/60" /> Contingency
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-red-500/40 border border-red-500/60" /> Ground risk
            </span>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
