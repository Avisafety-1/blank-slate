import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Clock, Plane, MapPin, Navigation, User, CheckCircle, Map, Timer } from "lucide-react";
import { useTerminology } from "@/hooks/useTerminology";
import { LocationPickerDialog } from "./LocationPickerDialog";

interface LogFlightTimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFlightLogged?: () => void;
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

export const LogFlightTimeDialog = ({ open, onOpenChange, onFlightLogged }: LogFlightTimeDialogProps) => {
  const { user, companyId } = useAuth();
  const terminology = useTerminology();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [drones, setDrones] = useState<Drone[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [linkedEquipment, setLinkedEquipment] = useState<string[]>([]);
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
    }
  }, [open, companyId]);

  useEffect(() => {
    if (formData.droneId) {
      fetchDroneLinks(formData.droneId);
    } else {
      setLinkedEquipment([]);
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

  const fetchDroneLinks = async (droneId: string) => {
    // Fetch linked equipment
    const { data: equipmentData } = await supabase
      .from("drone_equipment")
      .select("equipment_id")
      .eq("drone_id", droneId);
    
    if (equipmentData) {
      setLinkedEquipment(equipmentData.map(e => e.equipment_id));
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
      for (const equipmentId of linkedEquipment) {
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
              Pilot (valgfritt)
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
            <p className="text-xs text-muted-foreground mt-1">
              Piloten får flytiden logget i sin loggbok
            </p>
            {selectedDrone && (linkedEquipment.length > 0 || linkedPersonnel.length > 0) && (
              <p className="text-xs text-muted-foreground mt-1">
                {linkedEquipment.length} utstyr og {linkedPersonnel.length} personell tilknyttet
              </p>
            )}
          </div>

          {/* Mission selection (optional) */}
          <div>
            <Label htmlFor="mission">Tilknytt oppdrag (valgfritt)</Label>
            <Select 
              value={formData.missionId || "none"} 
              onValueChange={(value) => setFormData({ 
                ...formData, 
                missionId: value === "none" ? "" : value,
                markMissionCompleted: false 
              })}
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
    </Dialog>
  );
};