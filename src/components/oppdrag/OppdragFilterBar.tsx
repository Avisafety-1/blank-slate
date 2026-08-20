import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface CustomerOption { id: string; navn: string }
interface PilotOption { id: string; full_name: string }
interface DroneOption { id: string; modell: string; serienummer: string | null }

interface OppdragFilterBarProps {
  filterTab: "active" | "completed";
  onFilterTabChange: (tab: "active" | "completed") => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  customerFilter: string;
  onCustomerFilterChange: (value: string) => void;
  pilotFilter: string;
  onPilotFilterChange: (value: string) => void;
  droneFilter: string;
  onDroneFilterChange: (value: string) => void;
  customerOptions: CustomerOption[];
  pilotOptions: PilotOption[];
  droneOptions: DroneOption[];
  onResetFilters: () => void;
  onAddMission: () => void;
}

export const OppdragFilterBar = ({
  filterTab,
  onFilterTabChange,
  searchQuery,
  onSearchChange,
  customerFilter,
  onCustomerFilterChange,
  pilotFilter,
  onPilotFilterChange,
  droneFilter,
  onDroneFilterChange,
  customerOptions,
  pilotOptions,
  droneOptions,
  onResetFilters,
  onAddMission,
}: OppdragFilterBarProps) => {
  const { t } = useTranslation();

  const hasActiveFilters = customerFilter !== "alle" || pilotFilter !== "alle" || droneFilter !== "alle";

  // Show serial number only when several drones share the same model
  const modelCounts = droneOptions.reduce<Record<string, number>>((acc, d) => {
    acc[d.modell] = (acc[d.modell] || 0) + 1;
    return acc;
  }, {});
  const droneLabel = (d: DroneOption) =>
    modelCounts[d.modell] > 1 && d.serienummer ? `${d.modell} (${d.serienummer})` : d.modell;

  return (
    <GlassCard className="p-3 sm:p-4 space-y-3 sm:space-y-4">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
        <Tabs value={filterTab} onValueChange={(v) => onFilterTabChange(v as "active" | "completed")} className="flex-1">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="active" className="text-xs sm:text-sm">{t('pages.missions.filterBar.ongoingAndUpcoming')}</TabsTrigger>
            <TabsTrigger value="completed" className="text-xs sm:text-sm">{t('pages.missions.filterBar.completed')}</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button data-tour="mission-create-button" onClick={onAddMission} className="w-full sm:w-auto" size="lg">
          <Plus className="h-4 w-4 mr-2" />
          <span className="hidden sm:inline">{t('pages.missions.filterBar.addMission')}</span>
          <span className="sm:hidden">{t('pages.missions.filterBar.newMission')}</span>
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('pages.missions.filterBar.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Select value={customerFilter} onValueChange={onCustomerFilterChange}>
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue placeholder={t('pages.missions.filterBar.customer')} />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="alle">{t('pages.missions.filterBar.allCustomers')}</SelectItem>
            {customerOptions.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.navn}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={pilotFilter} onValueChange={onPilotFilterChange}>
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue placeholder={t('pages.missions.filterBar.pilot')} />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="alle">{t('pages.missions.filterBar.allPilots')}</SelectItem>
            {pilotOptions.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={droneFilter} onValueChange={onDroneFilterChange}>
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue placeholder={t('pages.missions.filterBar.drone')} />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="alle">{t('pages.missions.filterBar.allDrones')}</SelectItem>
            {droneOptions.map(d => (
              <SelectItem key={d.id} value={d.id}>{droneLabel(d)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onResetFilters}>
            <X className="h-3.5 w-3.5 mr-1" />
            {t('pages.missions.filterBar.resetFilters')}
          </Button>
        )}
      </div>
    </GlassCard>
  );
};
