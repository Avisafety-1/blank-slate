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
import { Plane, Calendar, AlertTriangle, Trash2, Plus, X, Package, User, Weight, Wrench, Book } from "lucide-react";
import { AddEquipmentToDroneDialog } from "./AddEquipmentToDroneDialog";
import { AddPersonnelToDroneDialog } from "./AddPersonnelToDroneDialog";
import { DroneLogbookDialog } from "./DroneLogbookDialog";
import { useTerminology } from "@/hooks/useTerminology";
import { useAuth } from "@/contexts/AuthContext";
import { calculateMaintenanceStatus, getStatusColorClasses, calculateDroneAggregatedStatus } from "@/lib/maintenanceStatus";

interface Drone {
  id: string;
  modell: string;
  serienummer: string;
  status: string;
  flyvetimer: number;
  merknader: string | null;
  sist_inspeksjon: string | null;
  neste_inspeksjon: string | null;
  tilgjengelig: boolean;
  aktiv: boolean;
  kjøpsdato: string | null;
  klasse: string | null;
  vekt: number | null;
  payload: number | null;
  inspection_start_date: string | null;
  inspection_interval_days: number | null;
  varsel_dager: number | null;
}

interface Accessory {
  id: string;
  navn: string;
  vedlikeholdsintervall_dager: number | null;
  sist_vedlikehold: string | null;
  neste_vedlikehold: string | null;
  varsel_dager: number | null;
}

interface DroneDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drone: Drone | null;
  onDroneUpdated: () => void;
}

export const DroneDetailDialog = ({ open, onOpenChange, drone, onDroneUpdated }: DroneDetailDialogProps) => {
  const { isAdmin } = useAdminCheck();
  const { user, companyId } = useAuth();
  const terminology = useTerminology();
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [linkedEquipment, setLinkedEquipment] = useState<any[]>([]);
  const [linkedPersonnel, setLinkedPersonnel] = useState<any[]>([]);
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [addEquipmentDialogOpen, setAddEquipmentDialogOpen] = useState(false);
  const [addPersonnelDialogOpen, setAddPersonnelDialogOpen] = useState(false);
  const [logbookOpen, setLogbookOpen] = useState(false);
  const [showAddAccessory, setShowAddAccessory] = useState(false);
  const [newAccessory, setNewAccessory] = useState({
    navn: "",
    vedlikeholdsintervall_dager: "",
    sist_vedlikehold: "",
  });
  const [formData, setFormData] = useState({
    modell: "",
    serienummer: "",
    status: "Grønn",
    flyvetimer: 0,
    merknader: "",
    sist_inspeksjon: "",
    neste_inspeksjon: "",
    kjøpsdato: "",
    klasse: "",
    vekt: "",
    payload: "",
    inspection_start_date: "",
    inspection_interval_days: "",
    varsel_dager: "14",
  });

  useEffect(() => {
    if (drone) {
      setFormData({
        modell: drone.modell,
        serienummer: drone.serienummer,
        status: drone.status,
        flyvetimer: drone.flyvetimer,
        merknader: drone.merknader || "",
        sist_inspeksjon: drone.sist_inspeksjon ? new Date(drone.sist_inspeksjon).toISOString().split('T')[0] : "",
        neste_inspeksjon: drone.neste_inspeksjon ? new Date(drone.neste_inspeksjon).toISOString().split('T')[0] : "",
        kjøpsdato: drone.kjøpsdato ? new Date(drone.kjøpsdato).toISOString().split('T')[0] : "",
        klasse: drone.klasse || "",
        vekt: drone.vekt !== null ? String(drone.vekt) : "",
        payload: drone.payload !== null ? String(drone.payload) : "",
        inspection_start_date: drone.inspection_start_date ? new Date(drone.inspection_start_date).toISOString().split('T')[0] : "",
        inspection_interval_days: drone.inspection_interval_days !== null ? String(drone.inspection_interval_days) : "",
        varsel_dager: drone.varsel_dager !== null ? String(drone.varsel_dager) : "14",
      });
      setIsEditing(false);
      setShowAddAccessory(false);
      setNewAccessory({ navn: "", vedlikeholdsintervall_dager: "", sist_vedlikehold: "" });
      fetchLinkedEquipment();
      fetchLinkedPersonnel();
      fetchAccessories();
    }
  }, [drone]);

  // Calculate next inspection when start date, interval, or sist_inspeksjon changes
  useEffect(() => {
    if (formData.inspection_start_date && formData.inspection_interval_days) {
      const days = parseInt(formData.inspection_interval_days);
      if (!isNaN(days) && days > 0) {
        // Use sist_inspeksjon if it's after start date, otherwise use start date
        let baseDate = new Date(formData.inspection_start_date);
        if (formData.sist_inspeksjon) {
          const sistInspDate = new Date(formData.sist_inspeksjon);
          if (sistInspDate > baseDate) {
            baseDate = sistInspDate;
          }
        }
        const nextDate = new Date(baseDate);
        nextDate.setDate(nextDate.getDate() + days);
        const calculatedDate = nextDate.toISOString().split('T')[0];
        if (calculatedDate !== formData.neste_inspeksjon) {
          setFormData(prev => ({ ...prev, neste_inspeksjon: calculatedDate }));
        }
      }
    }
  }, [formData.inspection_start_date, formData.inspection_interval_days, formData.sist_inspeksjon]);

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
          status,
          neste_vedlikehold,
          varsel_dager
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

  const fetchAccessories = async () => {
    if (!drone) return;

    const { data, error } = await supabase
      .from("drone_accessories")
      .select("*")
      .eq("drone_id", drone.id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching accessories:", error);
    } else {
      setAccessories(data || []);
    }
  };

  const logEquipmentHistory = async (action: 'added' | 'removed', itemType: 'equipment' | 'accessory', itemId: string | null, itemName: string) => {
    if (!user || !companyId || !drone) return;
    try {
      await supabase.from("drone_equipment_history").insert({
        drone_id: drone.id,
        company_id: companyId,
        user_id: user.id,
        action,
        item_type: itemType,
        item_id: itemId,
        item_name: itemName,
      });
    } catch (error) {
      console.error("Error logging equipment history:", error);
    }
  };

  const handleAddAccessory = async () => {
    if (!drone || !user || !companyId || !newAccessory.navn.trim()) {
      toast.error("Fyll inn navn på utstyret");
      return;
    }

    try {
      let neste_vedlikehold: string | null = null;
      if (newAccessory.vedlikeholdsintervall_dager && newAccessory.sist_vedlikehold) {
        const days = parseInt(newAccessory.vedlikeholdsintervall_dager);
        if (!isNaN(days) && days > 0) {
          const nextDate = new Date(newAccessory.sist_vedlikehold);
          nextDate.setDate(nextDate.getDate() + days);
          neste_vedlikehold = nextDate.toISOString().split('T')[0];
        }
      }

      const { data, error } = await supabase.from("drone_accessories").insert({
        drone_id: drone.id,
        company_id: companyId,
        user_id: user.id,
        navn: newAccessory.navn.trim(),
        vedlikeholdsintervall_dager: newAccessory.vedlikeholdsintervall_dager ? parseInt(newAccessory.vedlikeholdsintervall_dager) : null,
        sist_vedlikehold: newAccessory.sist_vedlikehold || null,
        neste_vedlikehold,
      }).select().single();

      if (error) throw error;

      // Log to equipment history
      await logEquipmentHistory('added', 'accessory', data?.id || null, newAccessory.navn.trim());

      toast.success("Utstyr lagt til");
      setNewAccessory({ navn: "", vedlikeholdsintervall_dager: "", sist_vedlikehold: "" });
      setShowAddAccessory(false);
      fetchAccessories();
    } catch (error: any) {
      console.error("Error adding accessory:", error);
      toast.error(`Kunne ikke legge til utstyr: ${error.message}`);
    }
  };

  const handleDeleteAccessory = async (accessory: Accessory) => {
    try {
      const { error } = await supabase
        .from("drone_accessories")
        .delete()
        .eq("id", accessory.id);

      if (error) throw error;

      // Log to equipment history
      await logEquipmentHistory('removed', 'accessory', accessory.id, accessory.navn);

      toast.success(`${accessory.navn} slettet`);
      fetchAccessories();
    } catch (error: any) {
      console.error("Error deleting accessory:", error);
      toast.error(`Kunne ikke slette utstyr: ${error.message}`);
    }
  };

  const getMaintenanceStatusColor = (neste_vedlikehold: string | null) => {
    if (!neste_vedlikehold) return "";
    const today = new Date();
    const nextDate = new Date(neste_vedlikehold);
    const daysUntil = Math.ceil((nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntil < 0) return "text-red-600 dark:text-red-400";
    if (daysUntil <= 14) return "text-amber-600 dark:text-amber-400";
    return "text-green-600 dark:text-green-400";
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

  const handleRemoveEquipment = async (linkId: string, equipmentName: string, equipmentId?: string) => {
    try {
      const { error } = await supabase
        .from("drone_equipment")
        .delete()
        .eq("id", linkId);

      if (error) throw error;

      // Log to equipment history
      await logEquipmentHistory('removed', 'equipment', equipmentId || null, equipmentName);

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
          serienummer: formData.serienummer,
          status: formData.status,
          flyvetimer: formData.flyvetimer,
          merknader: formData.merknader || null,
          sist_inspeksjon: formData.sist_inspeksjon || null,
          neste_inspeksjon: formData.neste_inspeksjon || null,
          kjøpsdato: formData.kjøpsdato || null,
          klasse: formData.klasse || null,
          vekt: formData.vekt ? parseFloat(formData.vekt) : null,
          payload: formData.payload ? parseFloat(formData.payload) : null,
          inspection_start_date: formData.inspection_start_date || null,
          inspection_interval_days: formData.inspection_interval_days ? parseInt(formData.inspection_interval_days) : null,
          varsel_dager: formData.varsel_dager ? parseInt(formData.varsel_dager) : 14,
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

  // Calculate aggregated status based on drone + accessories + linked equipment
  const linkedEquipmentData = linkedEquipment.map((link: any) => link.equipment).filter(Boolean);
  const { status: aggregatedStatus, affectedItems } = calculateDroneAggregatedStatus(
    { neste_inspeksjon: drone.neste_inspeksjon, varsel_dager: drone.varsel_dager },
    accessories,
    linkedEquipmentData
  );
  const droneOwnStatus = calculateMaintenanceStatus(drone.neste_inspeksjon, drone.varsel_dager ?? 14);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Plane className="w-5 h-5 text-primary" />
              {isEditing ? `Rediger ${terminology.vehicleLower}` : drone.modell}
            </DialogTitle>
            <div className="flex items-center gap-2">
              {!isEditing && (
                <>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setLogbookOpen(true)}
                  >
                    <Book className="w-4 h-4 mr-2" />
                    Loggbok
                  </Button>
                  <Badge className={`${getStatusColorClasses(aggregatedStatus)} border`}>
                    {aggregatedStatus}
                  </Badge>
                </>
              )}
            </div>
          </div>
          {!isEditing && affectedItems.length > 0 && aggregatedStatus !== "Grønn" && (
            <p className="text-xs text-muted-foreground mt-1">
              ⚠️ Status påvirket av: {affectedItems.join(", ")}
            </p>
          )}
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
                  <p className="text-sm font-medium text-muted-foreground">Serienummer</p>
                  <p className="text-base">{drone.serienummer}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Klasse</p>
                  <p className="text-base">{drone.klasse || "-"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Kjøpsdato</p>
                  <p className="text-base">{drone.kjøpsdato ? new Date(drone.kjøpsdato).toLocaleDateString('nb-NO') : "-"}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Vekt MTOM</p>
                  <p className="text-base">{drone.vekt !== null ? `${drone.vekt} kg` : "-"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Payload</p>
                  <p className="text-base">{drone.payload !== null ? `${drone.payload} kg` : "-"}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Flyvetimer</p>
                  <p className="text-base">{Number(drone.flyvetimer).toFixed(2)} timer</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Status</p>
                  <Badge className={`${getStatusColorClasses(aggregatedStatus)} border`}>
                    {aggregatedStatus}
                  </Badge>
                </div>
              </div>

              {(drone.sist_inspeksjon || drone.neste_inspeksjon || drone.inspection_interval_days) && (
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
                  {drone.inspection_interval_days && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Inspeksjonsintervall: {drone.inspection_interval_days} dager
                    </p>
                  )}
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
                              <Badge className={`${getStatusColorClasses(calculateMaintenanceStatus(eq.neste_vedlikehold, eq.varsel_dager ?? 14))} border text-xs`}>
                                {calculateMaintenanceStatus(eq.neste_vedlikehold, eq.varsel_dager ?? 14)}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">{eq.type} • SN: {eq.serienummer}</p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRemoveEquipment(link.id, eq.navn, eq.id)}
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

              {/* Valgfritt utstyr Section */}
              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm font-medium text-muted-foreground">Valgfritt utstyr</p>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => setShowAddAccessory(true)}
                    className="gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Legg til
                  </Button>
                </div>

                {showAddAccessory && (
                  <div className="p-3 border border-border rounded-lg bg-background/50 mb-3 space-y-3">
                    <div>
                      <Label htmlFor="acc-navn" className="text-xs">Navn</Label>
                      <Input
                        id="acc-navn"
                        placeholder="f.eks. ND-filter, Ekstra propeller"
                        value={newAccessory.navn}
                        onChange={(e) => setNewAccessory({ ...newAccessory, navn: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor="acc-interval" className="text-xs">Vedlikeholdsintervall (dager)</Label>
                        <Input
                          id="acc-interval"
                          type="number"
                          placeholder="f.eks. 90"
                          value={newAccessory.vedlikeholdsintervall_dager}
                          onChange={(e) => setNewAccessory({ ...newAccessory, vedlikeholdsintervall_dager: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="acc-sist" className="text-xs">Sist vedlikehold</Label>
                        <Input
                          id="acc-sist"
                          type="date"
                          value={newAccessory.sist_vedlikehold}
                          onChange={(e) => setNewAccessory({ ...newAccessory, sist_vedlikehold: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => {
                        setShowAddAccessory(false);
                        setNewAccessory({ navn: "", vedlikeholdsintervall_dager: "", sist_vedlikehold: "" });
                      }}>
                        Avbryt
                      </Button>
                      <Button size="sm" onClick={handleAddAccessory}>
                        Legg til
                      </Button>
                    </div>
                  </div>
                )}
                
                {accessories.length === 0 && !showAddAccessory ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Ingen valgfritt utstyr lagt til
                  </p>
                ) : (
                  <div className="space-y-2">
                    {accessories.map((acc) => (
                      <div
                        key={acc.id}
                        className="flex items-center justify-between p-2 bg-background/50 rounded border border-border"
                      >
                        <div className="flex-1">
                          <p className="text-sm font-medium">{acc.navn}</p>
                          <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                            {acc.vedlikeholdsintervall_dager && (
                              <span>Intervall: {acc.vedlikeholdsintervall_dager} dager</span>
                            )}
                            {acc.neste_vedlikehold && (
                              <span className={getMaintenanceStatusColor(acc.neste_vedlikehold)}>
                                Neste: {new Date(acc.neste_vedlikehold).toLocaleDateString('nb-NO')}
                              </span>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteAccessory(acc)}
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
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
                  <Label htmlFor="serienummer">Serienummer</Label>
                  <Input
                    id="serienummer"
                    value={formData.serienummer}
                    onChange={(e) => setFormData({ ...formData, serienummer: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="klasse">Klasse</Label>
                  <Select value={formData.klasse || ""} onValueChange={(value) => setFormData({ ...formData, klasse: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Velg klasse" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="C0">C0</SelectItem>
                      <SelectItem value="C1">C1</SelectItem>
                      <SelectItem value="C2">C2</SelectItem>
                      <SelectItem value="C3">C3</SelectItem>
                      <SelectItem value="C4">C4</SelectItem>
                      <SelectItem value="C5">C5</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="kjøpsdato">Kjøpsdato</Label>
                  <Input
                    id="kjøpsdato"
                    type="date"
                    value={formData.kjøpsdato}
                    onChange={(e) => setFormData({ ...formData, kjøpsdato: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="vekt">Vekt MTOM (kg)</Label>
                  <Input
                    id="vekt"
                    type="number"
                    step="0.01"
                    value={formData.vekt}
                    onChange={(e) => setFormData({ ...formData, vekt: e.target.value })}
                    placeholder="f.eks. 0.9"
                  />
                </div>
                <div>
                  <Label htmlFor="payload">Payload (kg)</Label>
                  <Input
                    id="payload"
                    type="number"
                    step="0.01"
                    value={formData.payload}
                    onChange={(e) => setFormData({ ...formData, payload: e.target.value })}
                    placeholder="f.eks. 0.5"
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
                    disabled={!!formData.inspection_interval_days}
                  />
                </div>
              </div>

              {/* Inspection interval section */}
              <div className="border-t pt-4 mt-4">
                <Label className="text-sm font-medium text-muted-foreground mb-2 block">Inspeksjonsintervall</Label>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="inspection_start_date">Startdato</Label>
                    <Input 
                      id="inspection_start_date" 
                      type="date" 
                      value={formData.inspection_start_date}
                      onChange={(e) => setFormData({ ...formData, inspection_start_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="inspection_interval_days">Intervall (dager)</Label>
                    <Input 
                      id="inspection_interval_days" 
                      type="number" 
                      placeholder="f.eks. 90"
                      value={formData.inspection_interval_days}
                      onChange={(e) => setFormData({ ...formData, inspection_interval_days: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="varsel_dager">Varsel dager før gul</Label>
                    <Input 
                      id="varsel_dager" 
                      type="number" 
                      placeholder="14"
                      value={formData.varsel_dager}
                      onChange={(e) => setFormData({ ...formData, varsel_dager: e.target.value })}
                    />
                  </div>
                </div>
                {formData.inspection_start_date && formData.inspection_interval_days && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Neste inspeksjon beregnes automatisk basert på intervall
                  </p>
                )}
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

      <DroneLogbookDialog
        open={logbookOpen}
        onOpenChange={setLogbookOpen}
        droneId={drone?.id || ""}
        droneModell={drone?.modell || ""}
        flyvetimer={drone?.flyvetimer || 0}
      />
    </Dialog>
  );
};
