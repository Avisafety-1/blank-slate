import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { DocumentCategory } from "@/pages/Documents";
interface DocumentsFilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedCategories: DocumentCategory[];
  onCategoriesChange: (categories: DocumentCategory[]) => void;
}
const CATEGORIES: {
  value: DocumentCategory;
  label: string;
}[] = [{
  value: "regelverk",
  label: "Regelverk"
}, {
  value: "prosedyrer",
  label: "Prosedyrer"
}, {
  value: "sjekklister",
  label: "Sjekklister"
}, {
  value: "rapporter",
  label: "Rapporter"
}, {
  value: "nettsider",
  label: "Nettsider"
}, {
  value: "oppdrag",
  label: "Oppdrag"
}, {
  value: "loggbok",
  label: "Loggbok"
}, {
  value: "kml-kmz",
  label: "KML/KMZ"
}, {
  value: "dokumentstyring",
  label: "Dokumentstyring"
}, {
  value: "risikovurderinger",
  label: "Risikovurderinger"
}, {
  value: "annet",
  label: "Annet"
}];
const DocumentsFilterBar = ({
  searchQuery,
  onSearchChange,
  selectedCategories,
  onCategoriesChange
}: DocumentsFilterBarProps) => {
  const toggleCategory = (category: DocumentCategory) => {
    if (selectedCategories.includes(category)) {
      onCategoriesChange(selectedCategories.filter(c => c !== category));
    } else {
      onCategoriesChange([...selectedCategories, category]);
    }
  };
  return <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input type="text" placeholder="Søk i dokumenter..." value={searchQuery} onChange={e => onSearchChange(e.target.value)} className="pl-10" />
      </div>

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map(category => <Badge key={category.value} variant={selectedCategories.includes(category.value) ? "default" : "outline"} onClick={() => toggleCategory(category.value)} className={selectedCategories.includes(category.value) ? "cursor-pointer" : "cursor-pointer bg-secondary"}>
            {category.label}
          </Badge>)}
      </div>
    </div>;
};
export default DocumentsFilterBar;