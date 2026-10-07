import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface RegistryOption {
  id: string;
  label: string;
  sub?: string | null;
  /** Company/department heading; shown in the list and on selected items. */
  group?: string;
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

/**
 * Searchable register picker in a popover with internal touch scrolling.
 * The popover is height-limited to the visible space and has an explicit
 * "Done" button, and taps outside always close it — inside modal dialogs on
 * touch devices Radix' own outside-dismiss is not reliable.
 */
export function RegistryMultiSelect({ options, value, onChange, placeholder, searchPlaceholder, emptyText, disabled, single }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = options.filter((o) => value.includes(o.id));
  const summary = selected.length === 0 ? placeholder : selected.map((o) => (o.group ? `${o.label} (${o.group})` : o.label)).join(", ");

  const groups: [string, RegistryOption[]][] = [];
  for (const o of options) {
    const key = o.group ?? "";
    const g = groups.find(([k]) => k === key);
    if (g) g[1].push(o); else groups.push([key, [o]]);
  }

  // Fallback outside-tap close (capture phase, so pointer-events locks can't swallow it).
  useEffect(() => {
    if (!open) return;
    const onTap = (e: Event) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (contentRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("click", onTap, true);
    document.addEventListener("touchend", onTap, true);
    return () => {
      document.removeEventListener("click", onTap, true);
      document.removeEventListener("touchend", onTap, true);
    };
  }, [open]);

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
        <Button ref={triggerRef} type="button" variant="outline" role="combobox" disabled={disabled} className="h-auto min-h-10 w-full justify-between whitespace-normal text-left font-normal">
          <span className={cn("line-clamp-2", selected.length === 0 && "text-muted-foreground")}>{summary}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        className="flex w-[--radix-popover-trigger-width] min-w-[16rem] flex-col p-0 max-h-[60vh] max-h-[min(60vh,var(--radix-popover-content-available-height))]"
        align="start"
        collisionPadding={8}
      >
        <Command className="min-h-0 flex-1">
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="min-h-0 flex-1 max-h-none overflow-y-auto overscroll-contain [touch-action:pan-y]">
            <CommandEmpty>{emptyText}</CommandEmpty>
            {groups.map(([heading, items]) => (
              <CommandGroup key={heading || "_"} heading={heading || undefined}>
                {items.map((o) => (
                  <CommandItem key={o.id} value={`${o.label} ${o.sub ?? ""} ${o.group ?? ""} ${o.id}`} onSelect={() => toggle(o.id)}>
                    <Check className={cn("mr-2 h-4 w-4", value.includes(o.id) ? "opacity-100" : "opacity-0")} />
                    <div className="min-w-0">
                      <div className="truncate">{o.label}</div>
                      {o.sub && <div className="truncate text-xs text-muted-foreground">{o.sub}</div>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
        <div className="shrink-0 border-t border-border p-2">
          <Button type="button" size="sm" className="w-full" onClick={() => setOpen(false)}>
            {t("soraProfile.registry.done")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
