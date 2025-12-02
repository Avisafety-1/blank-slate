import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Clock, Plane, MapPin, Navigation } from "lucide-react";

interface LogFlightTimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFlightLogged?: () => void;
}

interface Drone {
  id: string;
  modell: string;
  registrering: string;
}

interface Mission {
  id: string;
  tittel: string;
  tidspunkt: string;
}

export const LogFlightTimeDialog = ({ open, onOpenChange, onFlightLogged }: LogFlightTimeDialogProps) => {
  const { user, companyId } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [drones, setDrones] = useState<Drone[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [linkedEquipment, setLinkedEquipment] = useState<string[]>([]);
  const [linkedPersonnel, setLinkedPersonnel] = useState<string[]>([]);
  
  const [formData, setFormData] = useState({
    droneId: "",
    missionId: "",
    departureLocation: "",
    landingLocation: "",
    flightDurationMinutes: 0,
    movements: 1,
    flightDate: new Date().toISOString().split('T')[0],
    notes: "",
  });

  useEffect(() => {
    if (open && companyId) {
      fetchDrones();
      fetchMissions();
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
      .select("id, modell, registrering")
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
      toast.error("Velg en drone");
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

      // 4. Create flight_log_personnel entries
      for (const profileId of linkedPersonnel) {
        await (supabase as any)
          .from("flight_log_personnel")
          .insert({
            flight_log_id: flightLog.id,
            profile_id: profileId,
          });
      }

      toast.success("Flytid logget!");
      
      // Reset form
      setFormData({
        droneId: "",
        missionId: "",
        departureLocation: "",
        landingLocation: "",
        flightDurationMinutes: 0,
        movements: 1,
        flightDate: new Date().toISOString().split('T')[0],
        notes: "",
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
          {/* Drone selection */}
          <div>
            <Label htmlFor="drone">Drone *</Label>
            <Select 
              value={formData.droneId} 
              onValueChange={(value) => setFormData({ ...formData, droneId: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Velg drone" />
              </SelectTrigger>
              <SelectContent>
                {drones.map((drone) => (
                  <SelectItem key={drone.id} value={drone.id}>
                    <span className="flex items-center gap-2">
                      <Plane className="w-4 h-4" />
                      {drone.modell} ({drone.registrering})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              onValueChange={(value) => setFormData({ ...formData, missionId: value === "none" ? "" : value })}
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="departure" className="flex items-center gap-1">
                <Navigation className="w-3 h-3" />
                Avgangssted *
              </Label>
              <Input
                id="departure"
                value={formData.departureLocation}
                onChange={(e) => setFormData({ ...formData, departureLocation: e.target.value })}
                placeholder="F.eks. Oslo"
                required
              />
            </div>
            <div>
              <Label htmlFor="landing" className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                Landingssted *
              </Label>
              <Input
                id="landing"
                value={formData.landingLocation}
                onChange={(e) => setFormData({ ...formData, landingLocation: e.target.value })}
                placeholder="F.eks. Bergen"
                required
              />
            </div>
          </div>

          {/* Flight duration and movements */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="duration">Flytid (minutter) *</Label>
              <Input
                id="duration"
                type="number"
                min="1"
                value={formData.flightDurationMinutes || ""}
                onChange={(e) => setFormData({ ...formData, flightDurationMinutes: parseInt(e.target.value) || 0 })}
                placeholder="45"
                required
              />
              {formData.flightDurationMinutes > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  = {(formData.flightDurationMinutes / 60).toFixed(2)} timer
                </p>
              )}
            </div>
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
      </DialogContent>
    </Dialog>
  );
};