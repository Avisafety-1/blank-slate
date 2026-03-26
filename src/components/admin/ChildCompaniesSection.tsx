import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invalidateCompanySettingsCache } from "@/hooks/useCompanySettings";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CompanyManagementDialog } from "./CompanyManagementDialog";
import { Plus, Pencil, Building2, Settings, Hash, ChevronDown, ChevronUp } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

interface ChildCompany {
  id: string;
  navn: string;
  org_nummer: string | null;
  adresse: string | null;
  adresse_lat?: number | null;
  adresse_lon?: number | null;
  kontakt_epost: string | null;
  kontakt_telefon: string | null;
  aktiv: boolean;
  selskapstype: string | null;
  stripe_exempt?: boolean;
  parent_company_id?: string | null;
}

export const ChildCompaniesSection = () => {
  const { companyId } = useAuth();
  const isMobile = useIsMobile();
  const [children, setChildren] = useState<ChildCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<ChildCompany | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [companyToDelete, setCompanyToDelete] = useState<ChildCompany | null>(null);
  const [parentCompanyName, setParentCompanyName] = useState<string>("");
  const [showAllAirspaceWarnings, setShowAllAirspaceWarnings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [hideReporterIdentity, setHideReporterIdentity] = useState(false);
  const [applyToChildren, setApplyToChildren] = useState(false);

  const fetchChildren = async () => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from("companies")
        .select("id, navn, org_nummer, adresse, adresse_lat, adresse_lon, kontakt_epost, kontakt_telefon, aktiv, selskapstype, stripe_exempt, parent_company_id")
        .eq("parent_company_id", companyId)
        .order("navn");

      if (error) throw error;
      setChildren(data || []);
    } catch (error) {
      console.error("Error fetching child companies:", error);
      toast.error("Kunne ikke laste avdelinger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChildren();
    fetchParentSettings();
  }, [companyId]);

  const fetchParentSettings = async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from("companies")
      .select("navn, show_all_airspace_warnings, hide_reporter_identity")
      .eq("id", companyId)
      .single();
    if (data) {
      setParentCompanyName(data.navn);
      setShowAllAirspaceWarnings((data as any).show_all_airspace_warnings ?? false);
      setHideReporterIdentity((data as any).hide_reporter_identity ?? false);
    }
  };

  const handleToggleAirspaceWarnings = async (checked: boolean) => {
    if (!companyId) return;
    setSavingSettings(true);
    const { error } = await supabase
      .from("companies")
      .update({ show_all_airspace_warnings: checked } as any)
      .eq("id", companyId);
    if (error) {
      setSavingSettings(false);
      toast.error("Kunne ikke lagre innstilling");
      return;
    }

    // If "apply to children" is on, propagate to all child companies
    if (applyToChildren) {
      await supabase
        .from("companies")
        .update({ show_all_airspace_warnings: checked } as any)
        .eq("parent_company_id", companyId);
    }

    setSavingSettings(false);
    setShowAllAirspaceWarnings(checked);
    invalidateCompanySettingsCache();
    toast.success("Innstilling lagret");
  };

  const handleToggleApplyToChildren = async (checked: boolean) => {
    if (!companyId) return;
    setApplyToChildren(checked);
    if (checked) {
      // Propagate current setting to all children now
      setSavingSettings(true);
      await supabase
        .from("companies")
        .update({ show_all_airspace_warnings: showAllAirspaceWarnings } as any)
        .eq("parent_company_id", companyId);
      setSavingSettings(false);
      toast.success("Innstilling anvendt på alle avdelinger");
    }
  };

  const handleAdd = () => {
    setSelectedCompany(null);
    setDialogOpen(true);
  };

  const handleEdit = (company: ChildCompany) => {
    setSelectedCompany(company);
    setDialogOpen(true);
  };

  const handleDeleteClick = (company: ChildCompany) => {
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
      toast.success("Avdeling slettet");
      setDeleteDialogOpen(false);
      setCompanyToDelete(null);
      fetchChildren();
    } catch (error: any) {
      console.error("Error deleting child company:", error);
      toast.error("Kunne ikke slette avdeling: " + error.message);
    }
  };

  // Build the company object passed to dialog, with parent_company_id pre-set
  const dialogCompany = selectedCompany || undefined;

  return (
    <div className="space-y-4">
      <Collapsible>
        <GlassCard>
          <CollapsibleTrigger className="w-full text-left">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Selskapsinnstillinger — {parentCompanyName}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Innstillinger som gjelder for ditt selskap
                </p>
              </div>
              <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="show-all-airspace" className="flex-1 cursor-pointer pr-4">
                  <div className="font-medium text-sm">Vis alle luftromsadvarsler på oppdragskortene</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Når aktivert vises alle advarsler direkte i stedet for kun den viktigste med resten i en ekspanderbar liste
                  </div>
                </Label>
                <Switch
                  id="show-all-airspace"
                  checked={showAllAirspaceWarnings}
                  onCheckedChange={handleToggleAirspaceWarnings}
                  disabled={savingSettings}
                />
              </div>
              <div className="flex items-center justify-between pl-4 border-l-2 border-muted ml-1">
                <Label htmlFor="apply-children" className="flex-1 cursor-pointer pr-4">
                  <div className="font-medium text-sm">Gjelder for alle underavdelinger</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Når aktivert vil innstillingen også settes på alle avdelinger i selskapet
                  </div>
                </Label>
                <Switch
                  id="apply-children"
                  checked={applyToChildren}
                  onCheckedChange={handleToggleApplyToChildren}
                  disabled={savingSettings}
                />
              </div>
            </div>
          </CollapsibleContent>
        </GlassCard>
      </Collapsible>

      <GlassCard>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Avdelinger
            </h3>
            <p className="text-sm text-muted-foreground">
              Opprett og administrer avdelinger tilknyttet ditt selskap
            </p>
          </div>
          <Button onClick={handleAdd} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Ny avdeling
          </Button>
        </div>

        {loading ? (
          <p className="text-muted-foreground text-sm">Laster...</p>
        ) : children.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">
            Ingen avdelinger opprettet ennå.
          </p>
        ) : isMobile ? (
          <div className="space-y-2">
            {children.map((c) => (
              <div key={c.id} className="border rounded-lg p-3 bg-card space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{c.navn}</span>
                  <Badge variant={c.aktiv ? "default" : "secondary"} className="text-xs">
                    {c.aktiv ? "Aktiv" : "Inaktiv"}
                  </Badge>
                </div>
                {c.org_nummer && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Hash className="h-3 w-3" /> {c.org_nummer}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEdit(c)}>
                    <Pencil className="h-3 w-3 mr-1" /> Rediger
                  </Button>
                  <Button variant="destructive" size="sm" className="flex-1" onClick={() => handleDeleteClick(c)}>
                    Slett
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Navn</TableHead>
                <TableHead>Org.nr</TableHead>
                <TableHead>E-post</TableHead>
                <TableHead>Telefon</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Handlinger</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {children.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.navn}</TableCell>
                  <TableCell>{c.org_nummer || "–"}</TableCell>
                  <TableCell>{c.kontakt_epost || "–"}</TableCell>
                  <TableCell>{c.kontakt_telefon || "–"}</TableCell>
                  <TableCell>
                    <Badge variant={c.aktiv ? "default" : "secondary"}>
                      {c.aktiv ? "Aktiv" : "Inaktiv"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="outline" size="sm" onClick={() => handleEdit(c)}>
                      <Pencil className="h-3 w-3 mr-1" /> Rediger
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDeleteClick(c)}>
                      Slett
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </GlassCard>

      <CompanyManagementDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        company={dialogCompany ? dialogCompany : null}
        onSuccess={fetchChildren}
        forceParentCompanyId={companyId || undefined}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slett avdeling</AlertDialogTitle>
            <AlertDialogDescription>
              Er du sikker på at du vil slette «{companyToDelete?.navn}»? Denne handlingen kan ikke angres.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>Slett</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
