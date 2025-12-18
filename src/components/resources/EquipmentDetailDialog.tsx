import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { useAdminCheck } from "@/hooks/useAdminCheck";
import { useAuth } from "@/contexts/AuthContext";
import { useChecklists } from "@/hooks/useChecklists";
import { Gauge, Calendar, AlertTriangle, Trash2, Wrench, Book, ClipboardList } from "lucide-react";
import { EquipmentLogbookDialog } from "./EquipmentLogbookDialog";
import { ChecklistExecutionDialog } from "./ChecklistExecutionDialog";

interface Equipment {
  id: string;
  navn: string;
  type: string;
  serienummer: string;
  status: string;
  merknader: string | null;
  sist_vedlikeholdt: string | null;
  neste_vedlikehold: string | null;
  tilgjengelig: boolean;
  aktiv: boolean;
  flyvetimer?: number;
  varsel_dager?: number | null;
  vekt?: number | null;
  vedlikeholdsintervall_dager?: number | null;
  sjekkliste_id?: string | null;
}

interface EquipmentDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipment: Equipment | null;
  onEquipmentUpdated: () => void;
}

export const EquipmentDetailDialog = ({ open, onOpenChange, equipment, onEquipmentUpdated }: EquipmentDetailDialogProps) => {
  const { isAdmin } = useAdminCheck();
  const { user, companyId } = useAuth();
  const { checklists } = useChecklists();
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLogbook, setShowLogbook] = useState(false);
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    navn: "",
    type: "",
    serienummer: "",
    merknader: "",
    sist_vedlikeholdt: "",
    neste_vedlikehold: "",
    flyvetimer: 0,
    varsel_dager: "14",
    vekt: "",
    vedlikeholdsintervall_dager: "",
    sjekkliste_id: "",
  });

  useEffect(() => {
    if (equipment) {
      setFormData({
        navn: equipment.navn,
        type: equipment.type,
        serienummer: equipment.serienummer,
        merknader: equipment.merknader || "",
        sist_vedlikeholdt: equipment.sist_vedlikeholdt ? new Date(equipment.sist_vedlikeholdt).toISOString().split('T')[0] : "",
        neste_vedlikehold: equipment.neste_vedlikehold ? new Date(equipment.neste_vedlikehold).toISOString().split('T')[0] : "",
        flyvetimer: equipment.flyvetimer || 0,
        varsel_dager: equipment.varsel_dager !== null && equipment.varsel_dager !== undefined ? String(equipment.varsel_dager) : "14",
        vekt: equipment.vekt !== null && equipment.vekt !== undefined ? String(equipment.vekt) : "",
        vedlikeholdsintervall_dager: equipment.vedlikeholdsintervall_dager !== null && equipment.vedlikeholdsintervall_dager !== undefined ? String(equipment.vedlikeholdsintervall_dager) : "",
        sjekkliste_id: equipment.sjekkliste_id || "",
      });
      setIsEditing(false);
    }
  }, [equipment]);

  // Calculate next maintenance when last maintenance or interval changes
  useEffect(() => {
    if (isEditing && formData.sist_vedlikeholdt && formData.vedlikeholdsintervall_dager) {
      const days = parseInt(formData.vedlikeholdsintervall_dager);
      if (!isNaN(days) && days > 0) {
        const nextDate = new Date(formData.sist_vedlikeholdt);
        nextDate.setDate(nextDate.getDate() + days);
        const calculatedDate = nextDate.toISOString().split('T')[0];
        if (calculatedDate !== formData.neste_vedlikehold) {
          setFormData(prev => ({ ...prev, neste_vedlikehold: calculatedDate }));
        }
      }
    }
  }, [isEditing, formData.sist_vedlikeholdt, formData.vedlikeholdsintervall_dager]);

  const performMaintenanceUpdate = async () => {
    if (!equipment || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      let neste_vedlikehold: string | null = null;
      
      if (equipment.vedlikeholdsintervall_dager) {
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + equipment.vedlikeholdsintervall_dager);
        neste_vedlikehold = nextDate.toISOString().split('T')[0];
      }

      const { error } = await supabase
        .from("equipment")
        .update({
          sist_vedlikeholdt: today,
          neste_vedlikehold,
        })
        .eq("id", equipment.id);

      if (error) throw error;

      // Log maintenance to equipment_log_entries
      if (user && companyId) {
        await supabase.from("equipment_log_entries").insert({
          equipment_id: equipment.id,
          company_id: companyId,
          user_id: user.id,
          entry_date: today,
          entry_type: "vedlikehold",
          title: "Vedlikehold utført",
          description: "Utført via utstyrskort",
        });
      }

      toast.success(`Vedlikehold utført for ${equipment.navn}`);
      onEquipmentUpdated();
    } catch (error: any) {
      console.error("Error performing maintenance:", error);
      toast.error(`Kunne ikke oppdatere vedlikehold: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePerformMaintenance = async () => {
    if (!equipment || isSubmitting) return;
    
    // If equipment has a checklist, open checklist dialog first
    if (equipment.sjekkliste_id) {
      setChecklistDialogOpen(true);
      return;
    }
    
    // Otherwise perform maintenance directly
    await performMaintenanceUpdate();
  };

  const handleChecklistComplete = async () => {
    setChecklistDialogOpen(false);
    await performMaintenanceUpdate();
  };

  const handleSave = async () => {
    if (!equipment || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("equipment")
        .update({
          navn: formData.navn,
          type: formData.type,
          serienummer: formData.serienummer,
          merknader: formData.merknader || null,
          sist_vedlikeholdt: formData.sist_vedlikeholdt || null,
          neste_vedlikehold: formData.neste_vedlikehold || null,
          flyvetimer: formData.flyvetimer,
          varsel_dager: formData.varsel_dager ? parseInt(formData.varsel_dager) : 14,
          vekt: formData.vekt ? parseFloat(formData.vekt) : null,
          vedlikeholdsintervall_dager: formData.vedlikeholdsintervall_dager ? parseInt(formData.vedlikeholdsintervall_dager) : null,
          sjekkliste_id: formData.sjekkliste_id || null,
        })
        .eq("id", equipment.id);

      if (error) throw error;

      toast.success("Utstyr oppdatert");
      setIsEditing(false);
      onEquipmentUpdated();
    } catch (error: any) {
      console.error("Error updating equipment:", error);
      toast.error(`Kunne ikke oppdatere utstyr: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!equipment || !isAdmin) return;

    try {
      const { error } = await supabase
        .from("equipment")
        .delete()
        .eq("id", equipment.id);

      if (error) throw error;

      toast.success("Utstyr slettet");
      onOpenChange(false);
      onEquipmentUpdated();
    } catch (error: any) {
      console.error("Error deleting equipment:", error);
      toast.error(`Kunne ikke slette utstyr: ${error.message}`);
    }
  };

  // Get linked checklist name for display
  const linkedChecklist = equipment?.sjekkliste_id 
    ? checklists.find(c => c.id === equipment.sjekkliste_id) 
    : null;

  if (!equipment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Gauge className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            <span className="truncate">{isEditing ? "Rediger utstyr" : equipment.navn}</span>
          </DialogTitle>
          {!isEditing && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowLogbook(true)}
              className="w-full mt-2"
            >
              <Book className="w-4 h-4 mr-2" />
              Loggbok
            </Button>
          )}
        </DialogHeader>

        <div className="space-y-3 sm:space-y-4">
          {!isEditing ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="flex justify-between sm:block">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">Navn</p>
                  <p className="text-sm sm:text-base">{equipment.navn}</p>
                </div>
                <div className="flex justify-between sm:block">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">Type</p>
                  <p className="text-sm sm:text-base">{equipment.type}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="flex justify-between sm:block">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">Serienummer</p>
                  <p className="text-sm sm:text-base">{equipment.serienummer}</p>
                </div>
                <div className="flex justify-between sm:block">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">Vekt</p>
                  <p className="text-sm sm:text-base">{equipment.vekt ? `${equipment.vekt} kg` : "Ikke angitt"}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="flex justify-between sm:block">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">Flyvetimer</p>
                  <p className="text-sm sm:text-base">{Number(equipment.flyvetimer || 0).toFixed(2)} timer</p>
                </div>
                <div className="flex justify-between sm:block">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">Vedl.intervall</p>
                  <p className="text-sm sm:text-base">{equipment.vedlikeholdsintervall_dager ? `${equipment.vedlikeholdsintervall_dager} dager` : "Ikke angitt"}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="flex justify-between sm:block">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">Varsel dager</p>
                  <p className="text-sm sm:text-base">{equipment.varsel_dager ?? 14} dager før gul</p>
                </div>
                <div className="flex justify-between sm:block">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">Sjekkliste</p>
                  <p className="text-sm sm:text-base flex items-center gap-1">
                    {linkedChecklist ? (
                      <>
                        <ClipboardList className="w-3 h-3 text-primary" />
                        {linkedChecklist.tittel}
                      </>
                    ) : (
                      "Ingen"
                    )}
                  </p>
                </div>
              </div>

              <div className="border-t border-border pt-3 sm:pt-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                  <p className="text-sm font-medium">Vedlikehold</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePerformMaintenance}
                    disabled={isSubmitting}
                    className="text-xs gap-1 w-full sm:w-auto"
                  >
                    <Wrench className="w-3 h-3" />
                    Utfør vedlikehold
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="flex items-center justify-between sm:justify-start gap-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground">Sist vedl.</p>
                    </div>
                    <p className="text-sm sm:text-base">{equipment.sist_vedlikeholdt ? new Date(equipment.sist_vedlikeholdt).toLocaleDateString('nb-NO') : "Ikke utført"}</p>
                  </div>
                  <div className="flex items-center justify-between sm:justify-start gap-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground">Neste vedl.</p>
                    </div>
                    <p className="text-sm sm:text-base">{equipment.neste_vedlikehold ? new Date(equipment.neste_vedlikehold).toLocaleDateString('nb-NO') : "Ikke satt"}</p>
                  </div>
                </div>
              </div>

              {equipment.merknader && (
                <div className="border border-amber-500/30 bg-amber-500/10 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-amber-700 dark:text-amber-300">Merknader</p>
                      <p className="text-xs sm:text-sm mt-1 text-amber-900 dark:text-amber-100 whitespace-pre-wrap break-words">{equipment.merknader}</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label htmlFor="navn" className="text-xs sm:text-sm">Navn</Label>
                  <Input
                    id="navn"
                    value={formData.navn}
                    onChange={(e) => setFormData({ ...formData, navn: e.target.value })}
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="type" className="text-xs sm:text-sm">Type</Label>
                  <Input
                    id="type"
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label htmlFor="serienummer" className="text-xs sm:text-sm">Serienummer</Label>
                  <Input
                    id="serienummer"
                    value={formData.serienummer}
                    onChange={(e) => setFormData({ ...formData, serienummer: e.target.value })}
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="vekt" className="text-xs sm:text-sm">Vekt (kg)</Label>
                  <Input
                    id="vekt"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.vekt}
                    onChange={(e) => setFormData({ ...formData, vekt: e.target.value })}
                    className="text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label htmlFor="flyvetimer" className="text-xs sm:text-sm">Flyvetimer</Label>
                  <Input
                    id="flyvetimer"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.flyvetimer === 0 ? '' : formData.flyvetimer}
                    onChange={(e) => setFormData({ ...formData, flyvetimer: e.target.value === '' ? 0 : parseFloat(e.target.value) })}
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="vedlikeholdsintervall_dager" className="text-xs sm:text-sm">Vedl.intervall (dager)</Label>
                  <Input
                    id="vedlikeholdsintervall_dager"
                    type="number"
                    min="1"
                    placeholder="30"
                    value={formData.vedlikeholdsintervall_dager}
                    onChange={(e) => setFormData({ ...formData, vedlikeholdsintervall_dager: e.target.value })}
                    className="text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label htmlFor="varsel_dager" className="text-xs sm:text-sm">Varsel dager før gul</Label>
                  <Input
                    id="varsel_dager"
                    type="number"
                    min="1"
                    placeholder="14"
                    value={formData.varsel_dager}
                    onChange={(e) => setFormData({ ...formData, varsel_dager: e.target.value })}
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs sm:text-sm">Sjekkliste for vedlikehold</Label>
                  <Select
                    value={formData.sjekkliste_id}
                    onValueChange={(value) => setFormData({ ...formData, sjekkliste_id: value === "none" ? "" : value })}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Velg sjekkliste (valgfritt)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Ingen sjekkliste</SelectItem>
                      {checklists.map((checklist) => (
                        <SelectItem key={checklist.id} value={checklist.id}>
                          {checklist.tittel}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label htmlFor="sist_vedlikeholdt" className="text-xs sm:text-sm">Sist vedlikeholdt</Label>
                  <Input
                    id="sist_vedlikeholdt"
                    type="date"
                    value={formData.sist_vedlikeholdt}
                    onChange={(e) => setFormData({ ...formData, sist_vedlikeholdt: e.target.value })}
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="neste_vedlikehold" className="text-xs sm:text-sm">Neste vedlikehold</Label>
                  <Input
                    id="neste_vedlikehold"
                    type="date"
                    value={formData.neste_vedlikehold}
                    onChange={(e) => setFormData({ ...formData, neste_vedlikehold: e.target.value })}
                    className="text-sm"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="merknader" className="text-xs sm:text-sm">Merknader</Label>
                <Textarea
                  id="merknader"
                  value={formData.merknader}
                  onChange={(e) => setFormData({ ...formData, merknader: e.target.value })}
                  rows={3}
                  className="text-sm"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          {isAdmin && !isEditing && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-2">
                  <Trash2 className="w-4 h-4" />
                  Slett
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Er du sikker?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Dette vil permanent slette utstyret "{equipment.navn}". Denne handlingen kan ikke angres.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Avbryt</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Slett
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          
          <div className="flex gap-2 ml-auto">
            {!isEditing ? (
              <Button onClick={() => setIsEditing(true)}>Rediger</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setIsEditing(false)} disabled={isSubmitting}>
                  Avbryt
                </Button>
                <Button onClick={handleSave} disabled={isSubmitting}>
                  {isSubmitting ? "Lagrer..." : "Lagre"}
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>

      <EquipmentLogbookDialog
        open={showLogbook}
        onOpenChange={setShowLogbook}
        equipmentId={equipment.id}
        equipmentNavn={equipment.navn}
        flyvetimer={equipment.flyvetimer || 0}
      />

      {equipment.sjekkliste_id && (
        <ChecklistExecutionDialog
          open={checklistDialogOpen}
          onOpenChange={setChecklistDialogOpen}
          checklistId={equipment.sjekkliste_id}
          itemName={`${equipment.navn} (${equipment.serienummer})`}
          onComplete={handleChecklistComplete}
        />
      )}
    </Dialog>
  );
};
