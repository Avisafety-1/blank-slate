import { useState, useMemo } from "react";
import { useEccairsTaxonomy } from "@/hooks/useEccairsTaxonomy";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface EccairsTaxonomySelectProps {
  valueListKey: string;
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

const MAX_VISIBLE_ITEMS = 100;

export function EccairsTaxonomySelect({
  valueListKey,
  value,
  onChange,
  placeholder = "Velg...",
  disabled = false,
}: EccairsTaxonomySelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: items, isLoading, error } = useEccairsTaxonomy(valueListKey);

  // Filter out items without description
  const validItems = useMemo(() => 
    (items || []).filter(
      (item) => item.value_description && item.value_description.trim() !== ''
    ),
    [items]
  );

  // Find selected item
  const selectedItem = useMemo(() => {
    if (!value) return null;
    return validItems.find(i => i.value_id === value) || null;
  }, [value, validItems]);

  // Manual filtering with search
  const filteredItems = useMemo(() => {
    const searchLower = search.toLowerCase().trim();
    
    if (!searchLower) {
      // No search: show first MAX items, but always include selected item at top
      const result = validItems.slice(0, MAX_VISIBLE_ITEMS);
      if (selectedItem && !result.find(i => i.value_id === selectedItem.value_id)) {
        return [selectedItem, ...result];
      }
      return result;
    }

    // With search: filter by description and synonym
    const matches = validItems.filter(item => {
      const desc = item.value_description?.toLowerCase() || '';
      const synonym = item.value_synonym?.toLowerCase() || '';
      return desc.includes(searchLower) || synonym.includes(searchLower);
    });

    return matches.slice(0, MAX_VISIBLE_ITEMS);
  }, [validItems, search, selectedItem]);

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
            {selectedItem?.value_description || (value ? `ID: ${value}` : placeholder)}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3" role="search">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Søk..."
              className="h-11 border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
          <CommandList>
            <CommandEmpty>Ingen treff</CommandEmpty>
            <CommandGroup>
              {filteredItems.map((item) => (
                <CommandItem
                  key={item.value_id}
                  value={item.value_id}
                  onSelect={() => {
                    onChange(item.value_id);
                    setOpen(false);
                    setSearch("");
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
