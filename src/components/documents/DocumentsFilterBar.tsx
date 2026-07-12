import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DocumentCategory, DocumentSortOption, DocumentStatusFilter } from "@/pages/Documents";

interface DocumentsFilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedCategories: DocumentCategory[];
  onCategoriesChange: (categories: DocumentCategory[]) => void;
  selectedStatuses: DocumentStatusFilter[];
  onStatusesChange: (statuses: DocumentStatusFilter[]) => void;
  sortOption: DocumentSortOption;
  onSortChange: (option: DocumentSortOption) => void;
}

const CATEGORY_KEYS: { value: DocumentCategory; key: string }[] = [
  { value: "regelverk", key: "regelverk" },
  { value: "prosedyrer", key: "prosedyrer" },
  { value: "sjekklister", key: "sjekklister" },
  { value: "rapporter", key: "rapporter" },
  { value: "nettsider", key: "nettsider" },
  { value: "oppdrag", key: "oppdrag" },
  { value: "loggbok", key: "loggbok" },
  { value: "kml-kmz", key: "kmlKmz" },
  { value: "dokumentstyring", key: "dokumentstyring" },
  { value: "risikovurderinger", key: "risikovurderinger" },
  { value: "operasjonsmanual", key: "operasjonsmanual" },
  { value: "annet", key: "annet" },
];

const SORT_KEYS: { value: DocumentSortOption; key: string }[] = [
  { value: "newest", key: "newest" },
  { value: "oldest", key: "oldest" },
  { value: "expiry", key: "expiry" },
  { value: "alpha_asc", key: "alphaAsc" },
  { value: "alpha_desc", key: "alphaDesc" },
];

const DocumentsFilterBar = ({
  searchQuery,
  onSearchChange,
  selectedCategories,
  onCategoriesChange,
  selectedStatuses,
  onStatusesChange,
  sortOption,
  onSortChange,
}: DocumentsFilterBarProps) => {
  const { t } = useTranslation();
  const toggleCategory = (category: DocumentCategory) => {
    if (selectedCategories.includes(category)) {
      onCategoriesChange(selectedCategories.filter(c => c !== category));
    } else {
      onCategoriesChange([...selectedCategories, category]);
    }
  };

  const toggleStatus = (status: DocumentStatusFilter) => {
    if (selectedStatuses.includes(status)) {
      onStatusesChange(selectedStatuses.filter(s => s !== status));
    } else {
      onStatusesChange([...selectedStatuses, status]);
    }
  };

  return (
    <div className="space-y-3">
      {/* Search + Sort row */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder={t('documents.filterBar.searchPlaceholder')}
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={sortOption} onValueChange={(v) => onSortChange(v as DocumentSortOption)}>
          <SelectTrigger className="w-[170px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_KEYS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{t(`documents.sort.${opt.key}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Category filter badges */}
      <div className="flex flex-wrap gap-2">
        {CATEGORY_KEYS.map(category => (
          <Badge
            key={category.value}
            variant={selectedCategories.includes(category.value) ? "default" : "outline"}
            onClick={() => toggleCategory(category.value)}
            className={selectedCategories.includes(category.value) ? "cursor-pointer" : "cursor-pointer bg-secondary"}
          >
            {t(`documents.categories.${category.key}`)}
          </Badge>
        ))}
      </div>
    </div>
  );
};

export default DocumentsFilterBar;
