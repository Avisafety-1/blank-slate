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
import { Plane, Calendar, AlertTriangle, Trash2, Plus, X, Package, User } from "lucide-react";
import { AddEquipmentToDroneDialog } from "./AddEquipmentToDroneDialog";
import { AddPersonnelToDroneDialog } from "./AddPersonnelToDroneDialog";
import { useTerminology } from "@/hooks/useTerminology";

interface Drone {
  id: string;
  modell: string;
  registrering: string;
  status: string;
  flyvetimer: number;
  merknader: string | null;
  sist_inspeksjon: string | null;
  neste_inspeksjon: string | null;
  tilgjengelig: boolean;
  aktiv: boolean;
}

interface DroneDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drone: Drone | null;
  onDroneUpdated: () => void;
}

const statusColors: Record<string, string> = {
  Grønn: "bg-status-green/20 text-green-700 dark:text-green-300 border-status-green/30",
  Gul: "bg-status-yellow/20 text-yellow-700 dark:text-yellow-300 border-status-yellow/30",
  Rød: "bg-status-red/20 text-red-700 dark:text-red-300 border-status-red/30",
};

export const DroneDetailDialog = ({ open, onOpenChange, drone, onDroneUpdated }: DroneDetailDialogProps) => {
  const { isAdmin } = useAdminCheck();
  const terminology = useTerminology();
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [linkedEquipment, setLinkedEquipment] = useState<any[]>([]);
  const [linkedPersonnel, setLinkedPersonnel] = useState<any[]>([]);
  const [addEquipmentDialogOpen, setAddEquipmentDialogOpen] = useState(false);
  const [addPersonnelDialogOpen, setAddPersonnelDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    modell: "",
    registrering: "",
    status: "Grønn",
    flyvetimer: 0,
    merknader: "",
    sist_inspeksjon: "",
    neste_inspeksjon: "",
  });

  useEffect(() => {
    if (drone) {
      setFormData({
        modell: drone.modell,
        registrering: drone.registrering,
        status: drone.status,
        flyvetimer: drone.flyvetimer,
        merknader: drone.merknader || "",
        sist_inspeksjon: drone.sist_inspeksjon ? new Date(drone.sist_inspeksjon).toISOString().split('T')[0] : "",
        neste_inspeksjon: drone.neste_inspeksjon ? new Date(drone.neste_inspeksjon).toISOString().split('T')[0] : "",
      });
      setIsEditing(false);
      fetchLinkedEquipment();
      fetchLinkedPersonnel();
    }
  }, [drone]);

  const fetchLinkedEquipment = async () => {
    if (!drone) return;

    const { data, error } = await supabase
      .from("drone_equipment")
      .select(`
        id,
        equipment:equipment_id (
          id,
          navn,
          type,
          serienummer,
          status
        )
      `)
      .eq("drone_id", drone.id);

    if (error) {
      console.error("Error fetching linked equipment:", error);
    } else {
      setLinkedEquipment(data || []);
    }
  };

  const fetchLinkedPersonnel = async () => {
    if (!drone) return;

    const { data, error } = await (supabase as any)
      .from("drone_personnel")
      .select(`
        id,
        profile:profile_id (
          id,
          full_name,
          email,
          tittel
        )
      `)
      .eq("drone_id", drone.id);

    if (error) {
      console.error("Error fetching linked personnel:", error);
    } else {
      setLinkedPersonnel(data || []);
    }
  };

  const handleRemovePersonnel = async (linkId: string, personName: string) => {
    try {
      const { error } = await (supabase as any)
        .from("drone_personnel")
        .delete()
        .eq("id", linkId);

      if (error) throw error;

      toast.success(`${personName} fjernet`);
      fetchLinkedPersonnel();
    } catch (error: any) {
      console.error("Error removing personnel:", error);
      toast.error(`Kunne ikke fjerne personell: ${error.message}`);
    }
  };

  const handleRemoveEquipment = async (linkId: string, equipmentName: string) => {
    try {
      const { error } = await supabase
        .from("drone_equipment")
        .delete()
        .eq("id", linkId);

      if (error) throw error;

      toast.success(`${equipmentName} fjernet`);
      fetchLinkedEquipment();
    } catch (error: any) {
      console.error("Error removing equipment:", error);
      toast.error(`Kunne ikke fjerne utstyr: ${error.message}`);
    }
  };

  const handleSave = async () => {
    if (!drone || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("drones")
        .update({
          modell: formData.modell,
          registrering: formData.registrering,
          status: formData.status,
          flyvetimer: formData.flyvetimer,
          merknader: formData.merknader || null,
          sist_inspeksjon: formData.sist_inspeksjon || null,
          neste_inspeksjon: formData.neste_inspeksjon || null,
        })
        .eq("id", drone.id);

      if (error) throw error;

      toast.success(`${terminology.vehicle} oppdatert`);
      setIsEditing(false);
      onDroneUpdated();
    } catch (error: any) {
      console.error("Error updating drone:", error);
      toast.error(`Kunne ikke oppdatere ${terminology.vehicleLower}: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!drone || !isAdmin) return;

    try {
      const { error } = await supabase
        .from("drones")
        .delete()
        .eq("id", drone.id);

      if (error) throw error;

      toast.success(`${terminology.vehicle} slettet`);
      onOpenChange(false);
      onDroneUpdated();
    } catch (error: any) {
      console.error("Error deleting drone:", error);
      toast.error(`Kunne ikke slette ${terminology.vehicleLower}: ${error.message}`);
    }
  };

  if (!drone) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Plane className="w-5 h-5 text-primary" />
              {isEditing ? `Rediger ${terminology.vehicleLower}` : drone.modell}
            </DialogTitle>
            {!isEditing && (
              <Badge className={`${statusColors[drone.status] || ""} border`}>
                {drone.status}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {!isEditing ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Modell</p>
                  <p className="text-base">{drone.modell}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Registrering</p>
                  <p className="text-base">{drone.registrering}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Flyvetimer</p>
                  <p className="text-base">{Number(drone.flyvetimer).toFixed(2)} timer</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Status</p>
                  <Badge className={`${statusColors[drone.status] || ""} border`}>
                    {drone.status}
                  </Badge>
                </div>
              </div>

              {(drone.sist_inspeksjon || drone.neste_inspeksjon) && (
                <div className="border-t border-border pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    {drone.sist_inspeksjon && (
                      <div className="flex items-start gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Sist inspeksjon</p>
                          <p className="text-base">{new Date(drone.sist_inspeksjon).toLocaleDateString('nb-NO')}</p>
                        </div>
                      </div>
                    )}
                    {drone.neste_inspeksjon && (
                      <div className="flex items-start gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Neste inspeksjon</p>
                          <p className="text-base">{new Date(drone.neste_inspeksjon).toLocaleDateString('nb-NO')}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {drone.merknader && (
                <div className="border border-amber-500/30 bg-amber-500/10 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Merknader</p>
                      <p className="text-sm mt-1 text-amber-900 dark:text-amber-100 whitespace-pre-wrap">{drone.merknader}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Linked Equipment Section */}
              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm font-medium text-muted-foreground">Tilknyttet utstyr</p>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => setAddEquipmentDialogOpen(true)}
                    className="gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Legg til
                  </Button>
                </div>
                
                {linkedEquipment.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Ingen utstyr tilknyttet
                  </p>
                ) : (
                  <div className="space-y-2">
                    {linkedEquipment.map((link: any) => {
                      const eq = link.equipment;
                      if (!eq) return null;
                      return (
                        <div
                          key={link.id}
                          className="flex items-center justify-between p-2 bg-background/50 rounded border border-border"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium">{eq.navn}</p>
                              <Badge className={`${statusColors[eq.status] || ""} border text-xs`}>
                                {eq.status}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">{eq.type} • SN: {eq.serienummer}</p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRemoveEquipment(link.id, eq.navn)}
                            className="h-8 w-8 p-0"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Linked Personnel Section */}
              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm font-medium text-muted-foreground">Tilknyttet personell</p>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => setAddPersonnelDialogOpen(true)}
                    className="gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Legg til
                  </Button>
                </div>
                
                {linkedPersonnel.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Ingen personell tilknyttet
                  </p>
                ) : (
                  <div className="space-y-2">
                    {linkedPersonnel.map((link: any) => {
                      const person = link.profile;
                      if (!person) return null;
                      return (
                        <div
                          key={link.id}
                          className="flex items-center justify-between p-2 bg-background/50 rounded border border-border"
                        >
                          <div className="flex-1">
                            <p className="text-sm font-medium">{person.full_name || "Ukjent"}</p>
                            <p className="text-xs text-muted-foreground">
                              {person.tittel || person.email || ""}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRemovePersonnel(link.id, person.full_name)}
                            className="h-8 w-8 p-0"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="modell">Modell</Label>
                  <Input
                    id="modell"
                    value={formData.modell}
                    onChange={(e) => setFormData({ ...formData, modell: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="registrering">Registrering</Label>
                  <Input
                    id="registrering"
                    value={formData.registrering}
                    onChange={(e) => setFormData({ ...formData, registrering: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
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
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="sist_inspeksjon">Sist inspeksjon</Label>
                  <Input
                    id="sist_inspeksjon"
                    type="date"
                    value={formData.sist_inspeksjon}
                    onChange={(e) => setFormData({ ...formData, sist_inspeksjon: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="neste_inspeksjon">Neste inspeksjon</Label>
                  <Input
                    id="neste_inspeksjon"
                    type="date"
                    value={formData.neste_inspeksjon}
                    onChange={(e) => setFormData({ ...formData, neste_inspeksjon: e.target.value })}
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
                    Dette vil permanent slette dronen "{drone.modell}". Denne handlingen kan ikke angres.
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

      <AddEquipmentToDroneDialog
        open={addEquipmentDialogOpen}
        onOpenChange={setAddEquipmentDialogOpen}
        droneId={drone?.id || ""}
        existingEquipmentIds={linkedEquipment.map((link) => link.equipment?.id).filter(Boolean)}
        onEquipmentAdded={fetchLinkedEquipment}
      />

      <AddPersonnelToDroneDialog
        open={addPersonnelDialogOpen}
        onOpenChange={setAddPersonnelDialogOpen}
        droneId={drone?.id || ""}
        existingPersonnelIds={linkedPersonnel.map((link) => link.profile?.id).filter(Boolean)}
        onPersonnelAdded={fetchLinkedPersonnel}
      />
    </Dialog>
  );
};
