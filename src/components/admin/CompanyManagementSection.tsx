import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createUniqueChannel } from "@/lib/realtimeChannel";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CompanyManagementDialog } from "./CompanyManagementDialog";
import { Plus, Pencil, Building2, Mail, Phone, MapPin, Hash, Plane, Radio, ChevronDown, BarChart3, Loader2, CalendarIcon, Search } from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";

interface Company {
  id: string;
  navn: string;
  org_nummer: string | null;
  adresse: string | null;
  kontakt_epost: string | null;
  kontakt_telefon: string | null;
  aktiv: boolean;
  selskapstype: string | null;
  created_at: string;
  updated_at: string;
  eccairs_enabled: boolean | null;
  dji_flightlog_enabled: boolean;
  dji_auto_sync_enabled: boolean;
  dji_sync_from_date: string | null;
  dronetag_enabled: boolean;
  ardupilot_enabled: boolean;
  parent_company_id: string | null;
}

// Mobile expandable company card component
const MobileCompanyCard = ({
  company,
  onToggleActive,
  onToggleEccairs,
  onToggleDji,
  onToggleAutoSync,
  onToggleDronetag,
  onToggleArdupilot,
  onSyncDateChange,
  onEdit,
  onDelete,
}: {
  company: Company;
  onToggleActive: (company: Company) => void;
  onToggleEccairs: (company: Company) => void;
  onToggleDji: (company: Company) => void;
  onToggleAutoSync: (company: Company) => void;
  onToggleDronetag: (company: Company) => void;
  onToggleArdupilot: (company: Company) => void;
  onSyncDateChange: (company: Company, date: Date | undefined) => void;
  onEdit: (company: Company) => void;
  onDelete: (company: Company) => void;
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border rounded-lg bg-card">
        <CollapsibleTrigger className="w-full p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="font-medium text-sm truncate">{company.navn}</span>
            <div className="flex gap-1 flex-shrink-0">
              <Badge variant={company.aktiv ? "default" : "secondary"} className="text-xs">
                {company.aktiv ? "Aktiv" : "Inaktiv"}
              </Badge>
              {company.eccairs_enabled && (
                <Badge variant="outline" className="text-xs">ECCAIRS</Badge>
              )}
              {company.dji_flightlog_enabled && (
                <Badge variant="outline" className="text-xs">DJI</Badge>
              )}
              {company.ardupilot_enabled && (
                <Badge variant="outline" className="text-xs">ArduPilot</Badge>
              )}
              {company.dronetag_enabled && (
                <Badge variant="outline" className="text-xs">DroneTag</Badge>
              )}
            </div>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-3 border-t pt-3">
            {/* Type */}
            <div className="flex items-center gap-2 text-sm">
              {company.selskapstype === 'flyselskap' ? (
                <>
                  <Plane className="h-3 w-3 text-muted-foreground" />
                  <span>{t("admin.companyManagement.flyselskap")}</span>
                </>
              ) : (
                <>
                  <Radio className="h-3 w-3 text-muted-foreground" />
                  <span>{t("admin.companyManagement.droneoperator")}</span>
                </>
              )}
            </div>

            {/* Contact info */}
            <div className="space-y-1 text-sm">
              {company.org_nummer && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Hash className="h-3 w-3" />
                  <span>{company.org_nummer}</span>
                </div>
              )}
              {company.kontakt_epost && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3 w-3" />
                  <span className="truncate">{company.kontakt_epost}</span>
                </div>
              )}
              {company.kontakt_telefon && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3 w-3" />
                  <span>{company.kontakt_telefon}</span>
                </div>
              )}
              {company.adresse && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  <span className="truncate">{company.adresse}</span>
                </div>
              )}
            </div>

            {/* Toggles */}
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={company.aktiv}
                  onCheckedChange={() => onToggleActive(company)}
                />
                <Label className="text-sm">{t("admin.companyManagement.status")}</Label>
              </div>
              {company.parent_company_id ? (
                <p className="text-xs text-muted-foreground italic">{t("admin.companyManagement.inheritedFromParent")}</p>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={company.eccairs_enabled ?? false}
                      onCheckedChange={() => onToggleEccairs(company)}
                    />
                    <Label className="text-sm">{t("admin.companyManagement.eccairs")}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={company.dji_flightlog_enabled}
                      onCheckedChange={() => onToggleDji(company)}
                    />
                    <Label className="text-sm">{t("admin.companyManagement.djiFlightlog")}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={company.ardupilot_enabled}
                      onCheckedChange={() => onToggleArdupilot(company)}
                    />
                    <Label className="text-sm">{t("admin.companyManagement.ardupilot")}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={company.dronetag_enabled}
                      onCheckedChange={() => onToggleDronetag(company)}
                    />
                    <Label className="text-sm">{t("admin.companyManagement.dronetag")}</Label>
                  </div>
                  {company.dji_flightlog_enabled && (
                    <>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={company.dji_auto_sync_enabled}
                          onCheckedChange={() => onToggleAutoSync(company)}
                        />
                        <Label className="text-sm">{t("admin.companyManagement.autoSync")}</Label>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">{t("admin.companyManagement.syncFromDate")}</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal", !company.dji_sync_from_date && "text-muted-foreground")}>
                              <CalendarIcon className="h-3 w-3 mr-1" />
                              {company.dji_sync_from_date ? format(new Date(company.dji_sync_from_date), "dd.MM.yyyy") : t("admin.companyManagement.notSet")}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={company.dji_sync_from_date ? new Date(company.dji_sync_from_date) : undefined}
                              onSelect={(date) => onSyncDateChange(company, date)}
                              disabled={(date) => date > new Date()}
                              initialFocus
                              className={cn("p-3 pointer-events-auto")}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(company)}
                className="flex-1"
              >
                <Pencil className="h-3 w-3 mr-1" />
                {t("admin.companyManagement.edit")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onDelete(company)}
                className="flex-1"
              >
                {t("admin.companyManagement.delete")}
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

export const CompanyManagementSection = () => {
  const { t } = useTranslation();
  const { companyId, isSuperAdmin, refetchUserInfo, user } = useAuth();
  const isMobile = useIsMobile();
  // iPad/kompakte skjermer: tabellen er for bred, bruk kortvisning i stedet
  const [isCompact, setIsCompact] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 1279px)");
    const onChange = () => setIsCompact(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [companyToDelete, setCompanyToDelete] = useState<Company | null>(null);
  const [usageDialogOpen, setUsageDialogOpen] = useState(false);
  const [usageData, setUsageData] = useState<any>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCompanies = useMemo(() => {
    if (!searchQuery.trim()) return companies;
    const q = searchQuery.toLowerCase();
    return companies.filter((c) =>
      c.navn.toLowerCase().includes(q) ||
      (c.org_nummer && c.org_nummer.toLowerCase().includes(q)) ||
      (c.kontakt_epost && c.kontakt_epost.toLowerCase().includes(q))
    );
  }, [companies, searchQuery]);

  useEffect(() => {
    fetchCompanies();

    const channel = createUniqueChannel("companies_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "companies",
        },
        () => {
          fetchCompanies();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .order("navn", { ascending: true });

      if (error) throw error;
      setCompanies(data || []);
    } catch (error: any) {
      console.error("Error fetching companies:", error);
      toast.error(t("admin.companyManagement.toastFetchError"));
    } finally {
      setLoading(false);
    }
  };

  const handleAddCompany = () => {
    setSelectedCompany(null);
    setDialogOpen(true);
  };

  const handleEditCompany = (company: Company) => {
    setSelectedCompany(company);
    setDialogOpen(true);
  };

  const handleToggleActive = async (company: Company) => {
    const newValue = !company.aktiv;
    // Optimistic update
    setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, aktiv: newValue } : c));
    
    try {
      const { error } = await supabase
        .from("companies")
        .update({ aktiv: newValue })
        .eq("id", company.id);

      if (error) throw error;
      toast.success(newValue ? t("admin.companyManagement.toastActivated") : t("admin.companyManagement.toastDeactivated"));
    } catch (error: any) {
      // Revert on error
      setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, aktiv: !newValue } : c));
      console.error("Error toggling company status:", error);
      toast.error(t("admin.companyManagement.toastActivateError"));
    }
  };

  const handleToggleEccairs = async (company: Company) => {
    const newValue = !company.eccairs_enabled;
    // Optimistic update
    setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, eccairs_enabled: newValue } : c));
    
    try {
      const { error } = await supabase
        .from("companies")
        .update({ eccairs_enabled: newValue })
        .eq("id", company.id);

      if (error) throw error;
      toast.success(newValue ? t("admin.companyManagement.toastEccairsOn") : t("admin.companyManagement.toastEccairsOff"));
    } catch (error: any) {
      // Revert on error
      setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, eccairs_enabled: !newValue } : c));
      console.error("Error toggling ECCAIRS status:", error);
      toast.error(t("admin.companyManagement.toastEccairsError"));
    }
  };

  const handleToggleDji = async (company: Company) => {
    const newValue = !company.dji_flightlog_enabled;
    // Optimistic update
    setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, dji_flightlog_enabled: newValue } : c));
    
    try {
      const { data, error } = await supabase.functions.invoke('manage-dronelog-key', {
        body: { companyId: company.id, enable: newValue },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
    toast.success(newValue ? t("admin.companyManagement.toastDjiOn") : t("admin.companyManagement.toastDjiOff"));
    } catch (error: any) {
      // Revert on error
      setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, dji_flightlog_enabled: !newValue } : c));
      console.error("Error toggling DJI status:", error);
      toast.error(t("admin.companyManagement.toastDjiError", { error: error.message || "Ukjent feil" }));
    }
  };

  const handleToggleDronetag = async (company: Company) => {
    const newValue = !company.dronetag_enabled;
    setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, dronetag_enabled: newValue } : c));
    
    try {
      const { error } = await supabase
        .from("companies")
        .update({ dronetag_enabled: newValue })
        .eq("id", company.id);

      if (error) throw error;
      toast.success(newValue ? t("admin.companyManagement.toastDronetagOn") : t("admin.companyManagement.toastDronetagOff"));
    } catch (error: any) {
      setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, dronetag_enabled: !newValue } : c));
      console.error("Error toggling DroneTag status:", error);
      toast.error(t("admin.companyManagement.toastDronetagError"));
    }
  };

  const handleToggleArdupilot = async (company: Company) => {
    const newValue = !company.ardupilot_enabled;
    setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, ardupilot_enabled: newValue } : c));
    
    try {
      const { error } = await supabase
        .from("companies")
        .update({ ardupilot_enabled: newValue } as any)
        .eq("id", company.id);

      if (error) throw error;
      toast.success(newValue ? t("admin.companyManagement.toastArdupilotOn") : t("admin.companyManagement.toastArdupilotOff"));
    } catch (error: any) {
      setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, ardupilot_enabled: !newValue } : c));
      console.error("Error toggling ArduPilot status:", error);
      toast.error(t("admin.companyManagement.toastArdupilotError"));
    }
  };

  const handleToggleAutoSync = async (company: Company) => {
    const newValue = !company.dji_auto_sync_enabled;
    setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, dji_auto_sync_enabled: newValue } : c));
    
    try {
      const { error } = await supabase
        .from("companies")
        .update({ dji_auto_sync_enabled: newValue })
        .eq("id", company.id);

      if (error) throw error;
      toast.success(newValue ? t("admin.companyManagement.toastAutoSyncOn") : t("admin.companyManagement.toastAutoSyncOff"));
    } catch (error: any) {
      setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, dji_auto_sync_enabled: !newValue } : c));
      console.error("Error toggling auto sync:", error);
      toast.error(t("admin.companyManagement.toastAutoSyncError"));
    }
  };

  const handleSyncDateChange = async (company: Company, date: Date | undefined) => {
    const newValue = date ? date.toISOString().split('T')[0] : null;
    const oldValue = company.dji_sync_from_date;
    setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, dji_sync_from_date: newValue } : c));
    
    try {
      const { error } = await supabase
        .from("companies")
        .update({ dji_sync_from_date: newValue })
        .eq("id", company.id);

      if (error) throw error;
      toast.success(newValue ? t("admin.companyManagement.toastSyncDateSet", { date: format(date!, "dd.MM.yyyy") }) : t("admin.companyManagement.toastSyncDateRemoved"));
    } catch (error: any) {
      setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, dji_sync_from_date: oldValue } : c));
      console.error("Error updating sync date:", error);
      toast.error(t("admin.companyManagement.toastSyncDateError"));
    }
  };

  const handleDeleteClick = (company: Company) => {
    setCompanyToDelete(company);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!companyToDelete) return;

    try {
      const { error } = await supabase
        .from("companies")
        .delete()
        .eq("id", companyToDelete.id);

      if (error) throw error;
      toast.success(t("admin.companyManagement.toastDeleted"));
      setDeleteDialogOpen(false);
      setCompanyToDelete(null);
    } catch (error: any) {
      console.error("Error deleting company:", error);
      toast.error(t("admin.companyManagement.toastDeleteError", { error: error.message }));
    }
  };

  const handleCompanySwitch = async (newCompanyId: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ company_id: newCompanyId })
        .eq('id', user?.id);
      
      if (error) throw error;
      
      await refetchUserInfo();
      const company = companies.find(c => c.id === newCompanyId);
      toast.success(t("admin.companyManagement.toastSwitched", { name: company?.navn }));
    } catch (error) {
      console.error("Error switching company:", error);
      toast.error(t("admin.companyManagement.toastSwitchError"));
    }
  };

  const [usageCompanyId, setUsageCompanyId] = useState<string>("");

  const handleFetchUsage = async (forCompanyId?: string) => {
    setUsageDialogOpen(true);
    setUsageLoading(true);
    try {
      const now = new Date();
      const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      const body: any = { from, to };
      if (forCompanyId) body.companyId = forCompanyId;

      const { data, error } = await supabase.functions.invoke('dronelog-usage', { body });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setUsageData(data);
    } catch (error: any) {
      console.error("Error fetching usage:", error);
      toast.error(t("admin.companyManagement.toastUsageError", { error: error.message || "Ukjent feil" }));
    } finally {
      setUsageLoading(false);
    }
  };

  if (loading) {
    return (
      <GlassCard className="p-3 sm:p-6">
        <div className="flex items-center justify-center py-6 sm:py-8">
          <p className="text-sm sm:text-base text-muted-foreground">{t("admin.companyManagement.loading")}</p>
        </div>
      </GlassCard>
    );
  }

  return (
    <>
      <GlassCard className="p-3 sm:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0 mb-4 sm:mb-6">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            <h2 className="text-base sm:text-xl font-semibold">{t("admin.companyManagement.title")}</h2>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => handleFetchUsage()} variant="outline" size={isMobile ? "sm" : "default"}>
              <BarChart3 className={`${isMobile ? 'h-3 w-3 mr-1' : 'h-4 w-4 mr-2'}`} />
              {isMobile ? t("admin.companyManagement.apiUsageMobile") : t("admin.companyManagement.apiUsageFull")}
            </Button>
            <Button onClick={handleAddCompany} size={isMobile ? "sm" : "default"}>
              <Plus className={`${isMobile ? 'h-3 w-3 mr-1' : 'h-4 w-4 mr-2'}`} />
              {isMobile ? t("admin.companyManagement.newCompanyMobile") : t("admin.companyManagement.newCompanyFull")}
            </Button>
          </div>
        </div>

        {/* Search field */}
        {companies.length > 0 && (
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t("admin.companyManagement.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        )}

        {companies.length === 0 ? (
          <div className="text-center py-6 sm:py-8 text-sm sm:text-base text-muted-foreground">
            {t("admin.companyManagement.empty")}
          </div>
        ) : filteredCompanies.length === 0 ? (
          <div className="text-center py-6 sm:py-8 text-sm sm:text-base text-muted-foreground">
            {t("admin.companyManagement.noSearchResults", { query: searchQuery })}
          </div>
        ) : isMobile || isCompact ? (
          // Mobile: Expandable cards
          <div className="space-y-2">
            {filteredCompanies.map((company) => (
              <MobileCompanyCard
                key={company.id}
                company={company}
                onToggleActive={handleToggleActive}
                onToggleEccairs={handleToggleEccairs}
                onToggleDji={handleToggleDji}
                onToggleAutoSync={handleToggleAutoSync}
                onToggleDronetag={handleToggleDronetag}
                onToggleArdupilot={handleToggleArdupilot}
                onSyncDateChange={handleSyncDateChange}
                onEdit={handleEditCompany}
                onDelete={handleDeleteClick}
              />
            ))}
          </div>
        ) : (
          // Desktop: Table view
          <ScrollArea className="w-full max-w-full overflow-x-auto">
            <div className="min-w-[1200px]">},
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs sm:text-sm">{t("admin.companyManagement.columnName")}</TableHead>
                    <TableHead className="text-xs sm:text-sm">{t("admin.companyManagement.columnType")}</TableHead>
                    <TableHead className="text-xs sm:text-sm">{t("admin.companyManagement.columnOrgNr")}</TableHead>
                    <TableHead className="text-xs sm:text-sm">{t("admin.companyManagement.columnContact")}</TableHead>
                    <TableHead className="text-xs sm:text-sm">{t("admin.companyManagement.columnStatus")}</TableHead>
                    <TableHead className="text-xs sm:text-sm">{t("admin.companyManagement.columnEccairs")}</TableHead>
                     <TableHead className="text-xs sm:text-sm">{t("admin.companyManagement.columnDji")}</TableHead>
                    <TableHead className="text-xs sm:text-sm">{t("admin.companyManagement.columnArdupilot")}</TableHead>
                    <TableHead className="text-xs sm:text-sm">{t("admin.companyManagement.columnDronetag")}</TableHead>
                    <TableHead className="text-xs sm:text-sm">{t("admin.companyManagement.columnAutoSync")}</TableHead>
                    <TableHead className="text-xs sm:text-sm">{t("admin.companyManagement.columnSyncDate")}</TableHead>
                    <TableHead className="text-right text-xs sm:text-sm">{t("admin.companyManagement.columnActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCompanies.map((company) => (
                    <TableRow key={company.id}>
                      <TableCell className="font-medium text-sm">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span>{company.navn}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-1">
                          {company.selskapstype === 'flyselskap' ? (
                            <>
                              <Plane className="h-3 w-3 text-muted-foreground" />
                              <span>{t("admin.companyManagement.flyselskap")}</span>
                            </>
                          ) : (
                            <>
                              <Radio className="h-3 w-3 text-muted-foreground" />
                              <span>{t("admin.companyManagement.droneoperator")}</span>
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {company.org_nummer ? (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Hash className="h-3 w-3 flex-shrink-0" />
                            {company.org_nummer}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-sm">
                          {company.kontakt_epost && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Mail className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate max-w-[150px]">{company.kontakt_epost}</span>
                            </div>
                          )}
                          {company.kontakt_telefon && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Phone className="h-3 w-3 flex-shrink-0" />
                              {company.kontakt_telefon}
                            </div>
                          )}
                          {company.adresse && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <MapPin className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate max-w-[150px]">{company.adresse}</span>
                            </div>
                          )}
                          {!company.kontakt_epost &&
                            !company.kontakt_telefon &&
                            !company.adresse && (
                              <span className="text-muted-foreground text-xs">
                                {t("admin.companyManagement.noContactInfo")}
                              </span>
                            )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={company.aktiv}
                            onCheckedChange={() => handleToggleActive(company)}
                          />
                          <Label className="cursor-pointer">
                            <Badge
                              variant={company.aktiv ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {company.aktiv ? t("admin.companyManagement.active") : t("admin.companyManagement.inactive")}
                            </Badge>
                          </Label>
                        </div>
                      </TableCell>
                      {company.parent_company_id ? (
                        <TableCell colSpan={6}>
                          <span className="text-xs text-muted-foreground italic">{t("admin.companyManagement.inheritedFromParentShort")}</span>
                        </TableCell>
                      ) : (
                        <>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={company.eccairs_enabled ?? false}
                                onCheckedChange={() => handleToggleEccairs(company)}
                              />
                              <Label className="cursor-pointer">
                                <Badge
                                  variant={company.eccairs_enabled ? "default" : "secondary"}
                                  className="text-xs"
                                >
                                  {company.eccairs_enabled ? t("admin.companyManagement.on") : t("admin.companyManagement.off")}
                                </Badge>
                              </Label>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={company.dji_flightlog_enabled}
                                onCheckedChange={() => handleToggleDji(company)}
                              />
                              <Label className="cursor-pointer">
                                <Badge
                                  variant={company.dji_flightlog_enabled ? "default" : "secondary"}
                                  className="text-xs"
                                >
                                  {company.dji_flightlog_enabled ? t("admin.companyManagement.on") : t("admin.companyManagement.off")}
                                </Badge>
                              </Label>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={company.ardupilot_enabled}
                                onCheckedChange={() => handleToggleArdupilot(company)}
                              />
                              <Label className="cursor-pointer">
                                <Badge
                                  variant={company.ardupilot_enabled ? "default" : "secondary"}
                                  className="text-xs"
                                >
                                  {company.ardupilot_enabled ? t("admin.companyManagement.on") : t("admin.companyManagement.off")}
                                </Badge>
                              </Label>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={company.dronetag_enabled}
                                onCheckedChange={() => handleToggleDronetag(company)}
                              />
                              <Label className="cursor-pointer">
                                <Badge
                                  variant={company.dronetag_enabled ? "default" : "secondary"}
                                  className="text-xs"
                                >
                                  {company.dronetag_enabled ? t("admin.companyManagement.on") : t("admin.companyManagement.off")}
                                </Badge>
                              </Label>
                            </div>
                          </TableCell>
                          <TableCell>
                            {company.dji_flightlog_enabled ? (
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={company.dji_auto_sync_enabled}
                                  onCheckedChange={() => handleToggleAutoSync(company)}
                                />
                                <Label className="cursor-pointer">
                                  <Badge
                                    variant={company.dji_auto_sync_enabled ? "default" : "secondary"}
                                    className="text-xs"
                                  >
                                    {company.dji_auto_sync_enabled ? t("admin.companyManagement.on") : t("admin.companyManagement.off")}
                                  </Badge>
                                </Label>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {company.dji_flightlog_enabled ? (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal text-xs", !company.dji_sync_from_date && "text-muted-foreground")}>
                                    <CalendarIcon className="h-3 w-3 mr-1" />
                                    {company.dji_sync_from_date ? format(new Date(company.dji_sync_from_date), "dd.MM.yyyy") : t("admin.companyManagement.notSet")}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={company.dji_sync_from_date ? new Date(company.dji_sync_from_date) : undefined}
                                    onSelect={(date) => handleSyncDateChange(company, date)}
                                    disabled={(date) => date > new Date()}
                                    initialFocus
                                    className={cn("p-3 pointer-events-auto")}
                                  />
                                </PopoverContent>
                              </Popover>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                        </>
                      )}
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditCompany(company)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteClick(company)}
                          >
                            {t("admin.companyManagement.delete")}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>
        )}
      </GlassCard>

      <CompanyManagementDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        company={selectedCompany}
        onSuccess={fetchCompanies}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.companyManagement.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("admin.companyManagement.deleteConfirmDesc", { name: companyToDelete?.navn })}
              <br />
              <br />
              <strong className="text-destructive">
                {t("admin.companyManagement.deleteConfirmWarning")}
              </strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("admin.companyManagement.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive hover:bg-destructive/90"
            >
              {t("admin.companyManagement.deleteConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={usageDialogOpen} onOpenChange={setUsageDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              {t("admin.companyManagement.usageDialogTitle")}
            </DialogTitle>
           <DialogDescription>
              {t("admin.companyManagement.usageDialogDesc")}
            </DialogDescription>
          </DialogHeader>

          {/* Company selector for scoped usage */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">{t("admin.companyManagement.usageShowFor")}</Label>
            <div className="flex gap-2">
              <Select value={usageCompanyId || "__all__"} onValueChange={(v) => { const val = v === "__all__" ? "" : v; setUsageCompanyId(val); handleFetchUsage(val || undefined); }}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={t("admin.companyManagement.masterKeyAll")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t("admin.companyManagement.masterKeyAll")}</SelectItem>
                  {companies.filter(c => c.dji_flightlog_enabled).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.navn}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {usageData?._keyScope && (
              <p className="text-xs text-muted-foreground">
                {t("admin.companyManagement.usageShowing", { scope: usageData._keyScope === 'company' ? t("admin.companyManagement.usageShowingCompanyKey", { name: usageData._companyName }) : t("admin.companyManagement.usageShowingMasterKey") })}
              </p>
            )}
          </div>

          {usageLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : usageData ? (
            <div className="space-y-4">
              {/* Summary from result */}
              {(() => {
                const summary = usageData?.result?.summary || usageData?.summary || usageData?.result || usageData;
                const used = summary?.used_this_month ?? summary?.used ?? summary?.total ?? '—';
                const limit = summary?.monthly_limit ?? summary?.limit ?? summary?.quota ?? '—';
                const remaining = summary?.remaining ?? (typeof used === 'number' && typeof limit === 'number' ? limit - used : '—');
                const plan = summary?.plan;
                const pct = typeof used === 'number' && typeof limit === 'number' && limit > 0 ? Math.round((used / limit) * 100) : null;

                return (
                  <>
                    {plan && (
                      <div className="text-sm text-muted-foreground text-center">
                        {t("admin.companyManagement.usagePlan")}: <span className="font-medium text-foreground capitalize">{plan}</span>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center p-3 rounded-lg bg-muted/50">
                        <p className="text-2xl font-bold">{used}</p>
                        <p className="text-xs text-muted-foreground">{t("admin.companyManagement.usageUsed")}</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-muted/50">
                        <p className="text-2xl font-bold">{limit}</p>
                        <p className="text-xs text-muted-foreground">{t("admin.companyManagement.usageLimit")}</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-muted/50">
                        <p className="text-2xl font-bold">{remaining}</p>
                        <p className="text-xs text-muted-foreground">{t("admin.companyManagement.usageRemaining")}</p>
                      </div>
                    </div>
                    {pct !== null && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{t("admin.companyManagement.usageConsumption")}</span>
                          <span>{pct}%</span>
                        </div>
                        <Progress value={pct} />
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Raw JSON fallback for debugging */}
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{t("admin.companyManagement.usageShowRaw")}</summary>
                <pre className="mt-2 p-2 rounded bg-muted overflow-auto max-h-48 text-xs">
                  {JSON.stringify(usageData, null, 2)}
                </pre>
              </details>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">{t("admin.companyManagement.usageNoData")}</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
