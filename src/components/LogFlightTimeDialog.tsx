import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Clock, Plane, MapPin, Navigation, User, CheckCircle, Map, Timer, Package, Info, ChevronDown } from "lucide-react";
import { useTerminology } from "@/hooks/useTerminology";
import { LocationPickerDialog } from "./LocationPickerDialog";

interface LogFlightTimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFlightLogged?: () => void;
  prefilledDuration?: number;
}

interface Drone {
  id: string;
  modell: string;
  serienummer: string;
}

interface Mission {
  id: string;
  tittel: string;
  tidspunkt: string;
}

interface Personnel {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface Equipment {
  id: string;
  navn: string;
  serienummer: string;
}

export const LogFlightTimeDialog = ({ open, onOpenChange, onFlightLogged, prefilledDuration }: LogFlightTimeDialogProps) => {
  const { user, companyId } = useAuth();
  const terminology = useTerminology();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [drones, setDrones] = useState<Drone[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [linkedPersonnel, setLinkedPersonnel] = useState<string[]>([]);
  
  const [formData, setFormData] = useState({
    droneId: "",
    missionId: "",
    pilotId: "",
    departureLocation: "",
    landingLocation: "",
    flightDurationMinutes: 0,
    movements: 1,
    flightDate: new Date().toISOString().split('T')[0],
    notes: "",
    markMissionCompleted: false,
  });

  const [departurePickerOpen, setDeparturePickerOpen] = useState(false);
  const [landingPickerOpen, setLandingPickerOpen] = useState(false);
  const [useTimeRange, setUseTimeRange] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  // Check if this dialog was opened from an active flight timer
  const isFromActiveTimer = prefilledDuration !== undefined;

  const handleCancel = () => {
    if (isFromActiveTimer) {
      setCancelConfirmOpen(true);
    } else {
      onOpenChange(false);
    }
  };

  const confirmCancel = () => {
    setCancelConfirmOpen(false);
    onOpenChange(false);
  };

  // Calculate duration from time range
  useEffect(() => {
    if (useTimeRange && startTime && endTime) {
      const [startHours, startMinutes] = startTime.split(':').map(Number);
      const [endHours, endMinutes] = endTime.split(':').map(Number);
      
      const startTotalMinutes = startHours * 60 + startMinutes;
      const endTotalMinutes = endHours * 60 + endMinutes;
      
      let durationMinutes = endTotalMinutes - startTotalMinutes;
      
      // Handle overnight flights (end time is earlier than start time)
      if (durationMinutes < 0) {
        durationMinutes += 24 * 60;
      }
      
      if (durationMinutes > 0) {
        setFormData(prev => ({ ...prev, flightDurationMinutes: durationMinutes }));
      }
    }
  }, [useTimeRange, startTime, endTime]);

  useEffect(() => {
    if (open && companyId) {
      fetchDrones();
      fetchMissions();
      fetchPersonnel();
      fetchEquipment();
      // Set logged-in user as default pilot
      if (user) {
        setFormData(prev => ({ ...prev, pilotId: user.id }));
      }
      // Set prefilled duration if provided
      if (prefilledDuration !== undefined) {
        setFormData(prev => ({ ...prev, flightDurationMinutes: prefilledDuration }));
      }
    }
  }, [open, companyId, user, prefilledDuration]);

  // Fetch mission details when a mission is selected
  useEffect(() => {
    if (formData.missionId) {
      fetchMissionDetails(formData.missionId);
    }
  }, [formData.missionId]);

  // Fetch drone links when drone is selected (but not from mission auto-fill)
  useEffect(() => {
    if (formData.droneId) {
      fetchDroneLinks(formData.droneId);
    } else {
      setLinkedPersonnel([]);
    }
  }, [formData.droneId]);

  const fetchDrones = async () => {
    const { data } = await supabase
      .from("drones")
      .select("id, modell, serienummer")
      .eq("aktiv", true)
      .order("modell");
    
    if (data) setDrones(data);
  };

  const fetchMissions = async () => {
    const { data } = await supabase
      .from("missions")
      .select("id, tittel, tidspunkt")
      .order("tidspunkt", { ascending: false })
      .limit(50);
    
    if (data) setMissions(data);
  };

  const fetchPersonnel = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("approved", true)
      .order("full_name");
    
    if (data) setPersonnel(data);
  };

  const fetchEquipment = async () => {
    const { data } = await supabase
      .from("equipment")
      .select("id, navn, serienummer")
      .eq("aktiv", true)
      .order("navn");
    
    if (data) setEquipmentList(data);
  };

  const fetchMissionDetails = async (missionId: string) => {
    // Fetch mission drones
    const { data: missionDrones } = await supabase
      .from("mission_drones")
      .select("drone_id")
      .eq("mission_id", missionId);
    
    // Fetch mission personnel
    const { data: missionPersonnel } = await supabase
      .from("mission_personnel")
      .select("profile_id")
      .eq("mission_id", missionId);
    
    // Fetch mission equipment
    const { data: missionEquipment } = await supabase
      .from("mission_equipment")
      .select("equipment_id")
      .eq("mission_id", missionId);
    
    // Auto-fill drone if available
    if (missionDrones && missionDrones.length > 0) {
      setFormData(prev => ({ ...prev, droneId: missionDrones[0].drone_id }));
    }
    
    // Auto-fill pilot if available
    if (missionPersonnel && missionPersonnel.length > 0) {
      setFormData(prev => ({ ...prev, pilotId: missionPersonnel[0].profile_id }));
    }
    
    // Auto-fill equipment
    if (missionEquipment && missionEquipment.length > 0) {
      setSelectedEquipment(missionEquipment.map(e => e.equipment_id));
    }
  };

  const fetchDroneLinks = async (droneId: string) => {
    // Fetch linked equipment from drone
    const { data: equipmentData } = await supabase
      .from("drone_equipment")
      .select("equipment_id")
      .eq("drone_id", droneId);
    
    // Add drone-linked equipment to selected equipment (if not from mission)
    if (equipmentData && !formData.missionId) {
      const droneEquipmentIds = equipmentData.map(e => e.equipment_id);
      setSelectedEquipment(prev => {
        const combined = new Set([...prev, ...droneEquipmentIds]);
        return Array.from(combined);
      });
    }

    // Fetch linked personnel
    const { data: personnelData } = await (supabase as any)
      .from("drone_personnel")
      .select("profile_id")
      .eq("drone_id", droneId);
    
    if (personnelData) {
      setLinkedPersonnel(personnelData.map((p: any) => p.profile_id));
    }
  };

  const toggleEquipment = (equipmentId: string) => {
    setSelectedEquipment(prev => 
      prev.includes(equipmentId)
        ? prev.filter(id => id !== equipmentId)
        : [...prev, equipmentId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user || !companyId || isSubmitting) return;
    
    if (!formData.droneId) {
      toast.error(`Velg en ${terminology.vehicleLower}`);
      return;
    }
    
    if (!formData.departureLocation || !formData.landingLocation) {
      toast.error("Fyll ut avgangsted og landingssted");
      return;
    }
    
    if (formData.flightDurationMinutes <= 0) {
      toast.error("Flytid må være større enn 0");
      return;
    }

    setIsSubmitting(true);
    
    try {
      // 1. Create flight log entry
      const { data: flightLog, error: flightLogError } = await (supabase as any)
        .from("flight_logs")
        .insert({
          company_id: companyId,
          user_id: user.id,
          drone_id: formData.droneId,
          mission_id: formData.missionId || null,
          departure_location: formData.departureLocation,
          landing_location: formData.landingLocation,
          flight_duration_minutes: formData.flightDurationMinutes,
          movements: formData.movements,
          flight_date: formData.flightDate,
          notes: formData.notes || null,
        })
        .select()
        .single();

      if (flightLogError) throw flightLogError;

      // 2. Update drone flight hours using RPC function (bypasses RLS)
      const { error: droneUpdateError } = await supabase.rpc('add_drone_flight_hours', {
        p_drone_id: formData.droneId,
        p_minutes: formData.flightDurationMinutes
      });
      
      if (droneUpdateError) {
        console.error("Error updating drone flight hours:", droneUpdateError);
      }

      // 3. Update equipment flight hours and create flight_log_equipment entries
      for (const equipmentId of selectedEquipment) {
        // Create flight log equipment entry
        await (supabase as any)
          .from("flight_log_equipment")
          .insert({
            flight_log_id: flightLog.id,
            equipment_id: equipmentId,
          });

        // Update equipment flight hours using RPC function (bypasses RLS)
        const { error: equipmentUpdateError } = await supabase.rpc('add_equipment_flight_hours', {
          p_equipment_id: equipmentId,
          p_minutes: formData.flightDurationMinutes
        });
        
        if (equipmentUpdateError) {
          console.error("Error updating equipment flight hours:", equipmentUpdateError);
        }
      }

      // 4. Create flight_log_personnel entries for linked personnel
      for (const profileId of linkedPersonnel) {
        await (supabase as any)
          .from("flight_log_personnel")
          .insert({
            flight_log_id: flightLog.id,
            profile_id: profileId,
          });
      }

      // 5. Add pilot to flight log personnel if selected and not already linked
      if (formData.pilotId && !linkedPersonnel.includes(formData.pilotId)) {
        await (supabase as any)
          .from("flight_log_personnel")
          .insert({
            flight_log_id: flightLog.id,
            profile_id: formData.pilotId,
          });
      }

      // 6. Update mission status to "Fullført" if checkbox is checked
      if (formData.missionId && formData.markMissionCompleted) {
        const { error: missionUpdateError } = await supabase
          .from("missions")
          .update({ status: "Fullført" })
          .eq("id", formData.missionId);
        
        if (missionUpdateError) {
          console.error("Error updating mission status:", missionUpdateError);
          toast.warning("Flytid logget, men kunne ikke oppdatere oppdragsstatus");
        } else {
          toast.success("Flytid logget og oppdrag markert som fullført!");
        }
      } else {
        toast.success("Flytid logget!");
      }
      
      // Reset form
      setFormData({
        droneId: "",
        missionId: "",
        pilotId: "",
        departureLocation: "",
        landingLocation: "",
        flightDurationMinutes: 0,
        movements: 1,
        flightDate: new Date().toISOString().split('T')[0],
        notes: "",
        markMissionCompleted: false,
      });
      setSelectedEquipment([]);
      setLinkedPersonnel([]);
      setStartTime("");
      setEndTime("");
      
      onOpenChange(false);
      onFlightLogged?.();
    } catch (error: any) {
      console.error("Error logging flight time:", error);
      toast.error(`Kunne ikke logge flytid: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedDrone = drones.find(d => d.id === formData.droneId);
  const selectedPilot = personnel.find(p => p.id === formData.pilotId);

  // Build flight time summary
  const buildFlightTimeSummary = () => {
    const items: string[] = [];
    
    if (selectedPilot) {
      items.push(selectedPilot.full_name || selectedPilot.email || 'Pilot');
    }
    
    if (selectedDrone) {
      items.push(selectedDrone.modell);
    }
    
    if (selectedEquipment.length > 0) {
      const equipmentNames = selectedEquipment
        .map(id => equipmentList.find(e => e.id === id)?.navn)
        .filter(Boolean);
      items.push(...equipmentNames as string[]);
    }
    
    return items;
  };

  const flightTimeSummary = buildFlightTimeSummary();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Logg flytid
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Mission selection - NOW AT TOP */}
          <div>
            <Label htmlFor="mission">Tilknytt oppdrag</Label>
            <Select 
              value={formData.missionId || "none"} 
              onValueChange={(value) => {
                const newMissionId = value === "none" ? "" : value;
                setFormData({ 
                  ...formData, 
                  missionId: newMissionId,
                  markMissionCompleted: false,
                  // Clear auto-filled fields when removing mission
                  ...(newMissionId === "" ? { droneId: "", pilotId: "" } : {})
                });
                if (newMissionId === "") {
                  setSelectedEquipment([]);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Velg oppdrag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ingen</SelectItem>
                {missions.map((mission) => (
                  <SelectItem key={mission.id} value={mission.id}>
                    {mission.tittel} - {new Date(mission.tidspunkt).toLocaleDateString('nb-NO')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Option to mark mission as completed */}
            {formData.missionId && (
              <div className="flex items-center justify-between mt-3 p-3 bg-muted/50 rounded-lg border border-border/50">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <Label htmlFor="markCompleted" className="text-sm cursor-pointer">
                    Sett oppdrag til fullført
                  </Label>
                </div>
                <Switch
                  id="markCompleted"
                  checked={formData.markMissionCompleted}
                  onCheckedChange={(checked) => 
                    setFormData({ ...formData, markMissionCompleted: checked })
                  }
                />
              </div>
            )}
          </div>

          {/* Drone/Fly selection */}
          <div>
            <Label htmlFor="drone">{terminology.vehicle} *</Label>
            <Select 
              value={formData.droneId} 
              onValueChange={(value) => setFormData({ ...formData, droneId: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder={terminology.selectVehicle} />
              </SelectTrigger>
              <SelectContent>
                {drones.map((drone) => (
                  <SelectItem key={drone.id} value={drone.id}>
                    <span className="flex items-center gap-2">
                      <Plane className="w-4 h-4" />
                      {drone.modell} (SN: {drone.serienummer})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
          </Select>
          </div>

          {/* Pilot selection */}
          <div>
            <Label htmlFor="pilot" className="flex items-center gap-1">
              <User className="w-3 h-3" />
              Pilot
            </Label>
            <Select 
              value={formData.pilotId || "none"} 
              onValueChange={(value) => setFormData({ ...formData, pilotId: value === "none" ? "" : value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Velg pilot" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ingen</SelectItem>
                {personnel.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.full_name || person.email || 'Ukjent'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Equipment selection - Dropdown */}
          <div>
            <Label className="flex items-center gap-1">
              <Package className="w-3 h-3" />
              Utstyr
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between font-normal mt-1"
                >
                  {selectedEquipment.length === 0 
                    ? "Velg utstyr" 
                    : `${selectedEquipment.length} utstyr valgt`}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-popover border border-border" align="start">
                <div className="max-h-48 overflow-y-auto p-2 space-y-1">
                  {equipmentList.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-2">Ingen utstyr tilgjengelig</p>
                  ) : (
                    equipmentList.map((equipment) => (
                      <div 
                        key={equipment.id} 
                        className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer"
                        onClick={() => toggleEquipment(equipment.id)}
                      >
                        <Checkbox
                          id={`equipment-${equipment.id}`}
                          checked={selectedEquipment.includes(equipment.id)}
                          onCheckedChange={() => toggleEquipment(equipment.id)}
                        />
                        <label 
                          htmlFor={`equipment-${equipment.id}`}
                          className="text-sm cursor-pointer flex-1"
                        >
                          {equipment.navn} (SN: {equipment.serienummer})
                        </label>
                      </div>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Flight date */}
          <div>
            <Label htmlFor="flightDate">Dato *</Label>
            <Input
              id="flightDate"
              type="date"
              value={formData.flightDate}
              onChange={(e) => setFormData({ ...formData, flightDate: e.target.value })}
              required
            />
          </div>

          {/* Locations */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="departure" className="flex items-center gap-1">
                <Navigation className="w-3 h-3" />
                Avgangssted *
              </Label>
              <div className="flex gap-2">
                <Input
                  id="departure"
                  value={formData.departureLocation}
                  onChange={(e) => setFormData({ ...formData, departureLocation: e.target.value })}
                  placeholder="F.eks. Oslo"
                  required
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setDeparturePickerOpen(true)}
                  title="Velg på kart"
                >
                  <Map className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label htmlFor="landing" className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                Landingssted *
              </Label>
              <div className="flex gap-2">
                <Input
                  id="landing"
                  value={formData.landingLocation}
                  onChange={(e) => setFormData({ ...formData, landingLocation: e.target.value })}
                  placeholder="F.eks. Bergen"
                  required
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setLandingPickerOpen(true)}
                  title="Velg på kart"
                >
                  <Map className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Flight duration toggle and inputs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1">
                <Timer className="w-3 h-3" />
                Flytid *
              </Label>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${!useTimeRange ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                  Minutter
                </span>
                <Switch
                  checked={useTimeRange}
                  onCheckedChange={(checked) => {
                    setUseTimeRange(checked);
                    if (!checked) {
                      setStartTime("");
                      setEndTime("");
                    }
                  }}
                />
                <span className={`text-xs ${useTimeRange ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                  Klokkeslett
                </span>
              </div>
            </div>

            {useTimeRange ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="startTime" className="text-xs text-muted-foreground">Fra</Label>
                  <Input
                    id="startTime"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="endTime" className="text-xs text-muted-foreground">Til</Label>
                  <Input
                    id="endTime"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    required
                  />
                </div>
              </div>
            ) : (
              <Input
                id="duration"
                type="number"
                min="1"
                value={formData.flightDurationMinutes || ""}
                onChange={(e) => setFormData({ ...formData, flightDurationMinutes: parseInt(e.target.value) || 0 })}
                placeholder="45"
                required
              />
            )}

            {formData.flightDurationMinutes > 0 && (
              <p className="text-xs text-muted-foreground">
                = {formData.flightDurationMinutes} minutter ({(formData.flightDurationMinutes / 60).toFixed(2)} timer)
              </p>
            )}
          </div>

          {/* Movements */}
          <div>
            <Label htmlFor="movements">Antall bevegelser</Label>
            <Input
              id="movements"
              type="number"
              min="1"
              value={formData.movements}
              onChange={(e) => setFormData({ ...formData, movements: parseInt(e.target.value) || 1 })}
            />
            <p className="text-xs text-muted-foreground mt-1">Antall landinger</p>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Merknad</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Valgfri merknad..."
              rows={2}
            />
          </div>

          {/* Flight time summary */}
          {flightTimeSummary.length > 0 && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950/50 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <span className="font-medium">Flytid logges på:</span>{" "}
                  {flightTimeSummary.join(", ")}
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel}>
              Avbryt
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Logger..." : "Logg flytid"}
            </Button>
          </DialogFooter>
        </form>

        {/* Location picker dialogs */}
        <LocationPickerDialog
          open={departurePickerOpen}
          onOpenChange={setDeparturePickerOpen}
          onLocationSelected={(location) => setFormData({ ...formData, departureLocation: location })}
          title="Velg avgangssted"
        />
        <LocationPickerDialog
          open={landingPickerOpen}
          onOpenChange={setLandingPickerOpen}
          onLocationSelected={(location) => setFormData({ ...formData, landingLocation: location })}
          title="Velg landingssted"
        />
      </DialogContent>

      {/* Cancel confirmation dialog for active flight timer */}
      <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Avbryt logging av flytid?</AlertDialogTitle>
            <AlertDialogDescription>
              Du har en pågående flytur som ikke er logget. Hvis du avbryter nå vil flytiden ikke bli lagret.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Fortsett logging</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel} className="bg-destructive hover:bg-destructive/90">
              Avbryt uten å lagre
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};
