import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { useAdminCheck } from "@/hooks/useAdminCheck";
import { Gauge, Calendar, AlertTriangle, Trash2 } from "lucide-react";
import { calculateMaintenanceStatus, getStatusColorClasses } from "@/lib/maintenanceStatus";

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
}

interface EquipmentDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipment: Equipment | null;
  onEquipmentUpdated: () => void;
}

export const EquipmentDetailDialog = ({ open, onOpenChange, equipment, onEquipmentUpdated }: EquipmentDetailDialogProps) => {
  const { isAdmin } = useAdminCheck();
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    navn: "",
    type: "",
    serienummer: "",
    status: "Grønn",
    merknader: "",
    sist_vedlikeholdt: "",
    neste_vedlikehold: "",
    flyvetimer: 0,
    varsel_dager: "14",
  });

  useEffect(() => {
    if (equipment) {
      setFormData({
        navn: equipment.navn,
        type: equipment.type,
        serienummer: equipment.serienummer,
        status: equipment.status,
        merknader: equipment.merknader || "",
        sist_vedlikeholdt: equipment.sist_vedlikeholdt ? new Date(equipment.sist_vedlikeholdt).toISOString().split('T')[0] : "",
        neste_vedlikehold: equipment.neste_vedlikehold ? new Date(equipment.neste_vedlikehold).toISOString().split('T')[0] : "",
        flyvetimer: equipment.flyvetimer || 0,
        varsel_dager: equipment.varsel_dager !== null && equipment.varsel_dager !== undefined ? String(equipment.varsel_dager) : "14",
      });
      setIsEditing(false);
    }
  }, [equipment]);

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
          status: formData.status,
          merknader: formData.merknader || null,
          sist_vedlikeholdt: formData.sist_vedlikeholdt || null,
          neste_vedlikehold: formData.neste_vedlikehold || null,
          flyvetimer: formData.flyvetimer,
          varsel_dager: formData.varsel_dager ? parseInt(formData.varsel_dager) : 14,
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

  if (!equipment) return null;

  const calculatedStatus = calculateMaintenanceStatus(equipment.neste_vedlikehold, equipment.varsel_dager ?? 14);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Gauge className="w-5 h-5 text-primary" />
              {isEditing ? "Rediger utstyr" : equipment.navn}
            </DialogTitle>
            {!isEditing && (
              <Badge className={`${getStatusColorClasses(calculatedStatus)} border`}>
                {calculatedStatus}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {!isEditing ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Navn</p>
                  <p className="text-base">{equipment.navn}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Type</p>
                  <p className="text-base">{equipment.type}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Serienummer</p>
                  <p className="text-base">{equipment.serienummer}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Flyvetimer</p>
                  <p className="text-base">{Number(equipment.flyvetimer || 0).toFixed(2)} timer</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Status</p>
                  <Badge className={`${getStatusColorClasses(calculatedStatus)} border`}>
                    {calculatedStatus}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Varsel dager</p>
                  <p className="text-base">{equipment.varsel_dager ?? 14} dager før gul</p>
                </div>
              </div>

              {(equipment.sist_vedlikeholdt || equipment.neste_vedlikehold) && (
                <div className="border-t border-border pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    {equipment.sist_vedlikeholdt && (
                      <div className="flex items-start gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Sist vedlikeholdt</p>
                          <p className="text-base">{new Date(equipment.sist_vedlikeholdt).toLocaleDateString('nb-NO')}</p>
                        </div>
                      </div>
                    )}
                    {equipment.neste_vedlikehold && (
                      <div className="flex items-start gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Neste vedlikehold</p>
                          <p className="text-base">{new Date(equipment.neste_vedlikehold).toLocaleDateString('nb-NO')}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {equipment.merknader && (
                <div className="border border-amber-500/30 bg-amber-500/10 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Merknader</p>
                      <p className="text-sm mt-1 text-amber-900 dark:text-amber-100 whitespace-pre-wrap">{equipment.merknader}</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="navn">Navn</Label>
                  <Input
                    id="navn"
                    value={formData.navn}
                    onChange={(e) => setFormData({ ...formData, navn: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="type">Type</Label>
                  <Input
                    id="type"
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="serienummer">Serienummer</Label>
                  <Input
                    id="serienummer"
                    value={formData.serienummer}
                    onChange={(e) => setFormData({ ...formData, serienummer: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="flyvetimer">Flyvetimer</Label>
                  <Input
                    id="flyvetimer"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.flyvetimer}
                    onChange={(e) => setFormData({ ...formData, flyvetimer: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Grønn">Grønn</SelectItem>
                      <SelectItem value="Gul">Gul</SelectItem>
                      <SelectItem value="Rød">Rød</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="varsel_dager">Varsel dager før gul</Label>
                  <Input
                    id="varsel_dager"
                    type="number"
                    min="1"
                    placeholder="14"
                    value={formData.varsel_dager}
                    onChange={(e) => setFormData({ ...formData, varsel_dager: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="sist_vedlikeholdt">Sist vedlikeholdt</Label>
                  <Input
                    id="sist_vedlikeholdt"
                    type="date"
                    value={formData.sist_vedlikeholdt}
                    onChange={(e) => setFormData({ ...formData, sist_vedlikeholdt: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="neste_vedlikehold">Neste vedlikehold</Label>
                  <Input
                    id="neste_vedlikehold"
                    type="date"
                    value={formData.neste_vedlikehold}
                    onChange={(e) => setFormData({ ...formData, neste_vedlikehold: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="merknader">Merknader</Label>
                <Textarea
                  id="merknader"
                  value={formData.merknader}
                  onChange={(e) => setFormData({ ...formData, merknader: e.target.value })}
                  rows={3}
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
    </Dialog>
  );
};
