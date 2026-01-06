import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEccairsTaxonomy, EccairsValueListItem } from "@/hooks/useEccairsTaxonomy";
import { Skeleton } from "@/components/ui/skeleton";

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
  const { data: items, isLoading, error } = useEccairsTaxonomy(valueListKey);

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

  // Filter out items without description
  const validItems = (items || []).filter(
    (item) => item.value_description && item.value_description.trim() !== ''
  );

  return (
    <Select 
      value={value || ""} 
      onValueChange={onChange}
      disabled={disabled}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {validItems.map((item) => (
          <SelectItem key={item.value_id} value={item.value_id}>
            {item.value_description}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
