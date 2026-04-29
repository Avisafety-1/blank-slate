import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { TRAINING_MODULES, type TrainingModuleKey } from "@/config/trainingModules";

interface TrainingModulePickerProps {
  selected: TrainingModuleKey[];
  onChange: (modules: TrainingModuleKey[]) => void;
  disabled?: boolean;
}

export const TrainingModulePicker = ({ selected, onChange, disabled }: TrainingModulePickerProps) => {
  const toggle = (moduleKey: TrainingModuleKey, checked: boolean) => {
    if (checked) onChange(Array.from(new Set([...selected, moduleKey])));
    else onChange(selected.filter((key) => key !== moduleKey));
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {TRAINING_MODULES.map((module) => (
        <Label
          key={module.key}
          className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/50 cursor-pointer"
        >
          <Checkbox
            checked={selected.includes(module.key)}
            onCheckedChange={(checked) => toggle(module.key, checked === true)}
            disabled={disabled}
          />
          <span>{module.label}</span>
        </Label>
      ))}
    </div>
  );
};