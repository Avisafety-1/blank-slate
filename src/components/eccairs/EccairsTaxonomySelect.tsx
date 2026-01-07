import { useState, useEffect } from "react";
import { useEccairsTaxonomy, useEccairsTaxonomyItem } from "@/hooks/useEccairsTaxonomy";
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

export function EccairsTaxonomySelect({
  valueListKey,
  value,
  onChange,
  placeholder = "Velg...",
  disabled = false,
}: EccairsTaxonomySelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Server-side search query
  const { data: items, isLoading: isLoadingItems } = useEccairsTaxonomy(
    valueListKey, 
    debouncedSearch, 
    open // Only fetch when popover is open
  );

  // Separate query for selected item label
  const { data: selectedItem, isLoading: isLoadingSelected } = useEccairsTaxonomyItem(
    valueListKey,
    value,
    !!value
  );

  const isLoading = isLoadingItems || (!!value && isLoadingSelected);

  if (isLoading && !open && !selectedItem) {
    return <Skeleton className="h-10 w-full" />;
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
            {isLoadingItems ? (
              <div className="p-4 text-sm text-muted-foreground">Søker...</div>
            ) : (
              <>
                <CommandEmpty>Ingen treff</CommandEmpty>
                <CommandGroup>
                  {(items || []).map((item) => (
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
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
