import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface RegistryOption {
  id: string;
  label: string;
  sub?: string | null;
}

interface Props {
  options: RegistryOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  disabled?: boolean;
  /** Single selection (value has at most one id). */
  single?: boolean;
}

/** Searchable register picker in a popover with internal touch scrolling. */
export function RegistryMultiSelect({ options, value, onChange, placeholder, searchPlaceholder, emptyText, disabled, single }: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.filter((o) => value.includes(o.id));
  const summary = selected.length === 0 ? placeholder : selected.map((o) => o.label).join(", ");

  const toggle = (id: string) => {
    if (single) {
      onChange(value.includes(id) ? [] : [id]);
      setOpen(false);
      return;
    }
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" disabled={disabled} className="h-auto min-h-10 w-full justify-between whitespace-normal text-left font-normal">
          <span className={cn("line-clamp-2", selected.length === 0 && "text-muted-foreground")}>{summary}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[16rem] p-0" align="start" collisionPadding={8}>
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-[50vh] overflow-y-auto overscroll-contain [touch-action:pan-y]">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem key={o.id} value={`${o.label} ${o.sub ?? ""} ${o.id}`} onSelect={() => toggle(o.id)}>
                  <Check className={cn("mr-2 h-4 w-4", value.includes(o.id) ? "opacity-100" : "opacity-0")} />
                  <div className="min-w-0">
                    <div className="truncate">{o.label}</div>
                    {o.sub && <div className="truncate text-xs text-muted-foreground">{o.sub}</div>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
