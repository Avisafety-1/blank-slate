import { useState, useMemo } from "react";
import { useEccairsTaxonomy } from "@/hooks/useEccairsTaxonomy";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface EccairsTaxonomySelectProps {
  valueListKey: string;
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function EccairsTaxonomySelect({
  valueListKey,
  value,
  onChange,
  placeholder = "Velg...",
  disabled = false,
}: EccairsTaxonomySelectProps) {
  const [open, setOpen] = useState(false);
  const { data: items, isLoading, error } = useEccairsTaxonomy(valueListKey);

  // Filter out items without description
  const validItems = useMemo(() => 
    (items || []).filter(
      (item) => item.value_description && item.value_description.trim() !== ''
    ),
    [items]
  );

  // Find selected item label
  const selectedLabel = useMemo(() => {
    if (!value) return null;
    const item = validItems.find(i => i.value_id === value);
    return item?.value_description || null;
  }, [value, validItems]);

  if (isLoading) {
    return <Skeleton className="h-10 w-full" />;
  }

  if (error) {
    return (
      <div className="text-sm text-destructive">
        Kunne ikke laste taxonomi
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={disabled}
        >
          <span className="truncate">
            {selectedLabel || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Søk..." />
          <CommandList>
            <CommandEmpty>Ingen treff</CommandEmpty>
            <CommandGroup>
              {validItems.map((item) => (
                <CommandItem
                  key={item.value_id}
                  value={item.value_description}
                  onSelect={() => {
                    onChange(item.value_id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === item.value_id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {item.value_description}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
