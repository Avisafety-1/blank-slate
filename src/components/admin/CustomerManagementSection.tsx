import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createUniqueChannel } from "@/lib/realtimeChannel";
import { useAuth } from "@/contexts/AuthContext";
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
import { CustomerManagementDialog } from "./CustomerManagementDialog";
import { CustomerDetailDialog } from "./CustomerDetailDialog";
import { Plus, Pencil, Users, Mail, Phone, MapPin, User, Eye, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useTranslation } from "react-i18next";

interface Customer {
  id: string;
  navn: string;
  kontaktperson: string | null;
  epost: string | null;
  telefon: string | null;
  adresse: string | null;
  merknader: string | null;
  aktiv: boolean;
  company_id: string;
  user_id: string;
  opprettet_dato: string;
  oppdatert_dato: string;
  intern_poc_id: string | null;
  intern_poc?: { id: string; full_name: string | null } | null;
}

export const CustomerManagementSection = () => {
  const { companyId, isSuperAdmin } = useAuth();
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [viewCustomer, setViewCustomer] = useState<Customer | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchCustomers();

    const channel = createUniqueChannel("customers_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "customers",
        },
        () => {
          fetchCustomers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  const fetchCustomers = async () => {
    try {
      let query = supabase
        .from("customers")
        .select("*, intern_poc:profiles!customers_intern_poc_id_fkey(id, full_name)")
        .order("navn", { ascending: true });

      const { data, error } = await query;

      if (error) throw error;
      setCustomers(data || []);
    } catch (error: any) {
      console.error("Error fetching customers:", error);
      toast.error(t("admin.customerManagement.toastFetchError"));
    } finally {
      setLoading(false);
    }
  };

  const handleAddCustomer = () => {
    setSelectedCustomer(null);
    setDialogOpen(true);
  };

  const handleEditCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setDialogOpen(true);
  };

  const handleViewCustomer = (customer: Customer) => {
    setViewCustomer(customer);
    setDetailDialogOpen(true);
  };

  const handleToggleActive = async (customer: Customer) => {
    try {
      const { error } = await supabase
        .from("customers")
        .update({ aktiv: !customer.aktiv })
        .eq("id", customer.id);

      if (error) throw error;
      toast.success(
        customer.aktiv
          ? t("admin.customerManagement.toastDeactivated")
          : t("admin.customerManagement.toastActivated")
      );
    } catch (error: any) {
      console.error("Error toggling customer status:", error);
      toast.error(t("admin.customerManagement.toastActivateError"));
    }
  };

  const handleDeleteClick = (customer: Customer) => {
    setCustomerToDelete(customer);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!customerToDelete) return;

    try {
      const { error } = await supabase
        .from("customers")
        .delete()
        .eq("id", customerToDelete.id);

      if (error) throw error;
      toast.success(t("admin.customerManagement.toastDeleted"));
      setDeleteDialogOpen(false);
      setCustomerToDelete(null);
    } catch (error: any) {
      console.error("Error deleting customer:", error);
      toast.error(t("admin.customerManagement.toastDeleteError", { error: error.message }));
    }
  };

  // Filter customers based on search query
  const filteredCustomers = customers.filter((customer) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;

    return (
      customer.navn.toLowerCase().includes(query) ||
      customer.kontaktperson?.toLowerCase().includes(query) ||
      customer.epost?.toLowerCase().includes(query)
    );
  });

  if (loading) {
    return (
      <GlassCard className="p-6">
        <div className="flex items-center justify-center py-8">
          <p className="text-muted-foreground">{t("admin.customerManagement.loading")}</p>
        </div>
      </GlassCard>
    );
  }

  return (
    <>
      <GlassCard className="p-3 sm:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0 mb-4 sm:mb-6">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            <h2 className="text-base sm:text-xl font-semibold">{t("admin.customerManagement.title")}</h2>
          </div>
          <Button onClick={handleAddCustomer} size={isMobile ? "sm" : "default"}>
            <Plus className={`${isMobile ? 'h-3 w-3 mr-1' : 'h-4 w-4 mr-2'}`} />
            {isMobile ? t("admin.customerManagement.newMobile") : t("admin.customerManagement.newFull")}
          </Button>
        </div>

        {/* Search Bar */}
        <div className="mb-4 sm:mb-6 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder={isMobile ? t("admin.customerManagement.searchPlaceholderMobile") : t("admin.customerManagement.searchPlaceholderFull")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`pl-9 sm:pl-10 ${isMobile ? 'text-sm h-9' : ''}`}
          />
        </div>

        {customers.length === 0 ? (
          <div className="text-center py-6 sm:py-8 text-sm sm:text-base text-muted-foreground">
            {t("admin.customerManagement.empty")}
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="text-center py-6 sm:py-8 text-sm sm:text-base text-muted-foreground">
            {t("admin.customerManagement.noSearchResults", { query: searchQuery })}
          </div>
        ) : isMobile ? (
          /* Mobile: Clickable cards */
          <div className="space-y-2">
            {filteredCustomers.map((customer) => (
              <div
                key={customer.id}
                className="bg-card border border-border rounded-lg p-3 cursor-pointer active:bg-accent/50 transition-colors"
                onClick={() => handleViewCustomer(customer)}
              >
                {/* Header row */}
                <div className="flex justify-between items-start gap-2 mb-1.5">
                  <h3 className="font-medium text-sm leading-tight break-words flex-1 min-w-0">
                    {customer.navn}
                  </h3>
                  <Badge 
                    variant={customer.aktiv ? "default" : "secondary"} 
                    className="text-[10px] px-1.5 py-0.5 flex-shrink-0"
                  >
                    {customer.aktiv ? t("admin.customerManagement.active") : t("admin.customerManagement.inactive")}
                  </Badge>
                </div>

                {/* Contact person */}
                {customer.kontaktperson && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                    <User className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{customer.kontaktperson}</span>
                  </p>
                )}
                {/* Intern POC */}
                {customer.intern_poc?.full_name && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1.5">
                    <User className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{t("admin.customerManagement.poc", { name: customer.intern_poc.full_name })}</span>
                  </p>
                )}

                {/* Contact info - inline */}
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  {customer.epost && (
                    <div className="flex items-center gap-1 min-w-0">
                      <Mail className="h-2.5 w-2.5 flex-shrink-0" />
                      <span className="truncate max-w-[140px]">{customer.epost}</span>
                    </div>
                  )}
                  {customer.telefon && (
                    <div className="flex items-center gap-1">
                      <Phone className="h-2.5 w-2.5 flex-shrink-0" />
                      <span>{customer.telefon}</span>
                    </div>
                  )}
                </div>

                {/* Actions - compact row */}
                <div 
                  className="flex justify-between items-center mt-2 pt-2 border-t border-border/50"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-1.5">
                    <Switch
                      checked={customer.aktiv}
                      onCheckedChange={() => handleToggleActive(customer)}
                      className="scale-[0.65]"
                    />
                    <span className="text-[10px] text-muted-foreground">
                      {customer.aktiv ? t("admin.customerManagement.active") : t("admin.customerManagement.inactive")}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-7 w-7 p-0"
                      onClick={() => handleEditCustomer(customer)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button 
                      variant="destructive" 
                      size="sm" 
                      className="h-7 px-2 text-[10px]"
                      onClick={() => handleDeleteClick(customer)}
                    >
                      {t("admin.customerManagement.delete")}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Desktop: Table view */
          <ScrollArea className="w-full">
            <div className="min-w-[700px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs sm:text-sm">{t("admin.customerManagement.columnName")}</TableHead>
                    <TableHead className="text-xs sm:text-sm">{t("admin.customerManagement.columnContactPerson")}</TableHead>
                    <TableHead className="text-xs sm:text-sm">{t("admin.customerManagement.columnInternPoc")}</TableHead>
                    <TableHead className="text-xs sm:text-sm">{t("admin.customerManagement.columnContactInfo")}</TableHead>
                    <TableHead className="text-xs sm:text-sm">{t("admin.customerManagement.columnStatus")}</TableHead>
                    <TableHead className="text-right text-xs sm:text-sm">{t("admin.customerManagement.columnActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium text-xs sm:text-sm">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="truncate">{customer.navn}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {customer.kontaktperson ? (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <User className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{customer.kontaktperson}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {customer.intern_poc?.full_name ? (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <User className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{customer.intern_poc.full_name}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-sm">
                          {customer.epost && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Mail className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate max-w-[150px]">{customer.epost}</span>
                            </div>
                          )}
                          {customer.telefon && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Phone className="h-3 w-3 flex-shrink-0" />
                              {customer.telefon}
                            </div>
                          )}
                          {customer.adresse && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <MapPin className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate max-w-[150px]">{customer.adresse}</span>
                            </div>
                          )}
                          {!customer.epost && !customer.telefon && !customer.adresse && (
                            <span className="text-muted-foreground text-xs">{t("admin.customerManagement.noContactInfo")}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={customer.aktiv}
                            onCheckedChange={() => handleToggleActive(customer)}
                          />
                          <Label className="cursor-pointer">
                            <Badge
                              variant={customer.aktiv ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {customer.aktiv ? t("admin.customerManagement.active") : t("admin.customerManagement.inactive")}
                            </Badge>
                          </Label>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewCustomer(customer)}
                            title={t("admin.customerManagement.viewHistory")}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditCustomer(customer)}
                            title={t("admin.customerManagement.edit")}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteClick(customer)}
                            title={t("admin.customerManagement.delete")}
                          >
                            {t("admin.customerManagement.delete")}
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

      <CustomerManagementDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        customer={selectedCustomer}
        onSuccess={fetchCustomers}
      />

      <CustomerDetailDialog
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        customer={viewCustomer}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.customerManagement.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("admin.customerManagement.deleteConfirmDesc", { name: customerToDelete?.navn })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("admin.customerManagement.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive hover:bg-destructive/90"
            >
              {t("admin.customerManagement.deleteConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
