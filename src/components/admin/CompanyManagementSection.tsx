import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Plus, Pencil, Building2, Mail, Phone, MapPin, Hash, Plane, Radio, ChevronDown } from "lucide-react";
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
}

// Mobile expandable company card component
const MobileCompanyCard = ({
  company,
  onToggleActive,
  onToggleEccairs,
  onEdit,
  onDelete,
}: {
  company: Company;
  onToggleActive: (company: Company) => void;
  onToggleEccairs: (company: Company) => void;
  onEdit: (company: Company) => void;
  onDelete: (company: Company) => void;
}) => {
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
                  <span>Flyselskap</span>
                </>
              ) : (
                <>
                  <Radio className="h-3 w-3 text-muted-foreground" />
                  <span>Droneoperatør</span>
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
                <Label className="text-sm">Status</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={company.eccairs_enabled ?? false}
                  onCheckedChange={() => onToggleEccairs(company)}
                />
                <Label className="text-sm">ECCAIRS</Label>
              </div>
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
                Rediger
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onDelete(company)}
                className="flex-1"
              >
                Slett
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

export const CompanyManagementSection = () => {
  const { companyId, isSuperAdmin, refetchUserInfo, user } = useAuth();
  const isMobile = useIsMobile();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [companyToDelete, setCompanyToDelete] = useState<Company | null>(null);

  useEffect(() => {
    fetchCompanies();

    const channel = supabase
      .channel("companies_changes")
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
      toast.error("Kunne ikke laste selskaper");
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
      toast.success(newValue ? "Selskap aktivert" : "Selskap deaktivert");
    } catch (error: any) {
      // Revert on error
      setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, aktiv: !newValue } : c));
      console.error("Error toggling company status:", error);
      toast.error("Kunne ikke oppdatere status");
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
      toast.success(newValue ? "ECCAIRS aktivert" : "ECCAIRS deaktivert");
    } catch (error: any) {
      // Revert on error
      setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, eccairs_enabled: !newValue } : c));
      console.error("Error toggling ECCAIRS status:", error);
      toast.error("Kunne ikke oppdatere ECCAIRS-status");
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
      toast.success("Selskap slettet");
      setDeleteDialogOpen(false);
      setCompanyToDelete(null);
    } catch (error: any) {
      console.error("Error deleting company:", error);
      toast.error("Kunne ikke slette selskap: " + error.message);
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
      toast.success(`Byttet til ${company?.navn}`);
    } catch (error) {
      console.error("Error switching company:", error);
      toast.error("Kunne ikke bytte selskap");
    }
  };

  if (loading) {
    return (
      <GlassCard className="p-3 sm:p-6">
        <div className="flex items-center justify-center py-6 sm:py-8">
          <p className="text-sm sm:text-base text-muted-foreground">Laster selskaper...</p>
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
            <h2 className="text-base sm:text-xl font-semibold">Selskapsadministrasjon</h2>
          </div>
          <Button onClick={handleAddCompany} size={isMobile ? "sm" : "default"}>
            <Plus className={`${isMobile ? 'h-3 w-3 mr-1' : 'h-4 w-4 mr-2'}`} />
            {isMobile ? "Nytt" : "Nytt selskap"}
          </Button>
        </div>

        {companies.length === 0 ? (
          <div className="text-center py-6 sm:py-8 text-sm sm:text-base text-muted-foreground">
            Ingen selskaper funnet. Opprett ditt første selskap.
          </div>
        ) : isMobile ? (
          // Mobile: Expandable cards
          <div className="space-y-2">
            {companies.map((company) => (
              <MobileCompanyCard
                key={company.id}
                company={company}
                onToggleActive={handleToggleActive}
                onToggleEccairs={handleToggleEccairs}
                onEdit={handleEditCompany}
                onDelete={handleDeleteClick}
              />
            ))}
          </div>
        ) : (
          // Desktop: Table view
          <ScrollArea className="w-full">
            <div className="min-w-[700px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs sm:text-sm">Navn</TableHead>
                    <TableHead className="text-xs sm:text-sm">Type</TableHead>
                    <TableHead className="text-xs sm:text-sm">Org.nr</TableHead>
                    <TableHead className="text-xs sm:text-sm">Kontaktinfo</TableHead>
                    <TableHead className="text-xs sm:text-sm">Status</TableHead>
                    <TableHead className="text-xs sm:text-sm">ECCAIRS</TableHead>
                    <TableHead className="text-right text-xs sm:text-sm">Handlinger</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companies.map((company) => (
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
                              <span>Flyselskap</span>
                            </>
                          ) : (
                            <>
                              <Radio className="h-3 w-3 text-muted-foreground" />
                              <span>Droneoperatør</span>
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
                                Ingen kontaktinfo
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
                              {company.aktiv ? "Aktiv" : "Inaktiv"}
                            </Badge>
                          </Label>
                        </div>
                      </TableCell>
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
                              {company.eccairs_enabled ? "På" : "Av"}
                            </Badge>
                          </Label>
                        </div>
                      </TableCell>
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
                            Slett
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
            <AlertDialogTitle>Bekreft sletting</AlertDialogTitle>
            <AlertDialogDescription>
              Er du sikker på at du vil slette selskapet "
              {companyToDelete?.navn}"? Denne handlingen kan ikke angres.
              <br />
              <br />
              <strong className="text-destructive">
                Advarsel: Alle brukere og data tilknyttet dette selskapet vil
                også bli påvirket.
              </strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive hover:bg-destructive/90"
            >
              Slett selskap
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
