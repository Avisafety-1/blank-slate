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
import { CompanyManagementDialog } from "./CompanyManagementDialog";
import { Plus, Pencil, Building2, Mail, Phone, MapPin, Hash } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface Company {
  id: string;
  navn: string;
  org_nummer: string | null;
  adresse: string | null;
  kontakt_epost: string | null;
  kontakt_telefon: string | null;
  aktiv: boolean;
  created_at: string;
  updated_at: string;
}

export const CompanyManagementSection = () => {
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
    try {
      const { error } = await supabase
        .from("companies")
        .update({ aktiv: !company.aktiv })
        .eq("id", company.id);

      if (error) throw error;
      toast.success(
        company.aktiv
          ? "Selskap deaktivert"
          : "Selskap aktivert"
      );
    } catch (error: any) {
      console.error("Error toggling company status:", error);
      toast.error("Kunne ikke oppdatere status");
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

  if (loading) {
    return (
      <GlassCard className="p-6">
        <div className="flex items-center justify-center py-8">
          <p className="text-muted-foreground">Laster selskaper...</p>
        </div>
      </GlassCard>
    );
  }

  return (
    <>
      <GlassCard className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Selskapsadministrasjon</h2>
          </div>
          <Button onClick={handleAddCompany}>
            <Plus className="h-4 w-4 mr-2" />
            Nytt selskap
          </Button>
        </div>

        {companies.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Ingen selskaper funnet. Opprett ditt første selskap.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Navn</TableHead>
                  <TableHead>Org.nr</TableHead>
                  <TableHead>Kontaktinfo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Handlinger</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((company) => (
                  <TableRow key={company.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {company.navn}
                      </div>
                    </TableCell>
                    <TableCell>
                      {company.org_nummer ? (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Hash className="h-3 w-3" />
                          {company.org_nummer}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm">
                        {company.kontakt_epost && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            {company.kontakt_epost}
                          </div>
                        )}
                        {company.kontakt_telefon && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            {company.kontakt_telefon}
                          </div>
                        )}
                        {company.adresse && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            {company.adresse}
                          </div>
                        )}
                        {!company.kontakt_epost &&
                          !company.kontakt_telefon &&
                          !company.adresse && (
                            <span className="text-muted-foreground">
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
                          >
                            {company.aktiv ? "Aktiv" : "Inaktiv"}
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
