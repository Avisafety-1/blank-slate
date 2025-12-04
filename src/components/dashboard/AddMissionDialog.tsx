import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Check, ChevronsUpDown, Plus, X, Route, MapPin, Ruler } from "lucide-react";
import { Tables } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { AirspaceWarnings } from "@/components/dashboard/AirspaceWarnings";
import { DroneWeatherPanel } from "@/components/DroneWeatherPanel";
import { useTerminology } from "@/hooks/useTerminology";

export interface RouteData {
  coordinates: { lat: number; lng: number }[];
  totalDistance: number;
}

interface AddMissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMissionAdded: () => void;
  mission?: any;
  initialRouteData?: RouteData | null;
  initialFormData?: any;
  initialSelectedPersonnel?: string[];
  initialSelectedEquipment?: string[];
  initialSelectedDrones?: string[];
  initialSelectedCustomer?: string;
}

type Profile = Tables<"profiles">;
type Equipment = any;
type Customer = any;
type Drone = any;

export const AddMissionDialog = ({ 
  open, 
  onOpenChange, 
  onMissionAdded, 
  mission,
  initialRouteData,
  initialFormData,
  initialSelectedPersonnel,
  initialSelectedEquipment,
  initialSelectedDrones,
  initialSelectedCustomer
}: AddMissionDialogProps) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [drones, setDrones] = useState<Drone[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedPersonnel, setSelectedPersonnel] = useState<string[]>(initialSelectedPersonnel || []);
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>(initialSelectedEquipment || []);
  const [selectedDrones, setSelectedDrones] = useState<string[]>(initialSelectedDrones || []);
  const [selectedCustomer, setSelectedCustomer] = useState<string>(initialSelectedCustomer || "");
  const [openPersonnelPopover, setOpenPersonnelPopover] = useState(false);
  const [openEquipmentPopover, setOpenEquipmentPopover] = useState(false);
  const [openDronePopover, setOpenDronePopover] = useState(false);
  const [openCustomerPopover, setOpenCustomerPopover] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [showNewCustomerInput, setShowNewCustomerInput] = useState(false);
  const [routeData, setRouteData] = useState<RouteData | null>(initialRouteData || null);
  const terminology = useTerminology();
  
  const [formData, setFormData] = useState({
    tittel: initialFormData?.tittel || "",
    lokasjon: initialFormData?.lokasjon || "",
    tidspunkt: initialFormData?.tidspunkt || "",
    beskrivelse: initialFormData?.beskrivelse || "",
    merknader: initialFormData?.merknader || "",
    status: initialFormData?.status || "Planlagt",
    risk_nivå: initialFormData?.risk_nivå || "Lav",
    latitude: initialFormData?.latitude || null as number | null,
    longitude: initialFormData?.longitude || null as number | null,
  });

  useEffect(() => {
    if (open) {
      fetchProfiles();
      fetchEquipment();
      fetchDrones();
      fetchCustomers();
      
      // Pre-fylle skjemaet hvis vi redigerer
      if (mission) {
        setFormData({
          tittel: mission.tittel || "",
          lokasjon: mission.lokasjon || "",
          tidspunkt: mission.tidspunkt ? new Date(mission.tidspunkt).toISOString().slice(0, 16) : "",
          beskrivelse: mission.beskrivelse || "",
          merknader: mission.merknader || "",
          status: mission.status || "Planlagt",
          risk_nivå: mission.risk_nivå || "Lav",
          latitude: mission.latitude || null,
          longitude: mission.longitude || null,
        });
        setSelectedCustomer(mission.customer_id || "");
        // Load existing route data from mission
        if (mission.route) {
          setRouteData(mission.route as RouteData);
        } else {
          setRouteData(initialRouteData || null);
        }
        fetchMissionPersonnel(mission.id);
        fetchMissionEquipment(mission.id);
        fetchMissionDrones(mission.id);
      } else if (initialFormData) {
        // Restore form data from navigation state (returning from route planner)
        setFormData({
          tittel: initialFormData.tittel || "",
          lokasjon: initialFormData.lokasjon || "",
          tidspunkt: initialFormData.tidspunkt || "",
          beskrivelse: initialFormData.beskrivelse || "",
          merknader: initialFormData.merknader || "",
          status: initialFormData.status || "Planlagt",
          risk_nivå: initialFormData.risk_nivå || "Lav",
          latitude: initialFormData.latitude || null,
          longitude: initialFormData.longitude || null,
        });
        setRouteData(initialRouteData || null);
        if (initialSelectedPersonnel) setSelectedPersonnel(initialSelectedPersonnel);
        if (initialSelectedEquipment) setSelectedEquipment(initialSelectedEquipment);
        if (initialSelectedDrones) setSelectedDrones(initialSelectedDrones);
        if (initialSelectedCustomer) setSelectedCustomer(initialSelectedCustomer);
      } else {
        // Reset form når vi oppretter nytt oppdrag
        setFormData({
          tittel: "",
          lokasjon: "",
          tidspunkt: "",
          beskrivelse: "",
          merknader: "",
          status: "Planlagt",
          risk_nivå: "Lav",
          latitude: null,
          longitude: null,
        });
        setSelectedPersonnel([]);
        setSelectedEquipment([]);
        setSelectedDrones([]);
        setSelectedCustomer("");
        setRouteData(null);
      }
    }
  }, [open, mission, initialFormData, initialRouteData, initialSelectedPersonnel, initialSelectedEquipment, initialSelectedDrones, initialSelectedCustomer]);

  const fetchProfiles = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("approved", true);
    
    if (error) {
      toast.error("Kunne ikke hente personell");
      console.error(error);
    } else {
      setProfiles(data || []);
    }
  };

  const fetchEquipment = async () => {
    const { data, error } = await (supabase as any)
      .from("equipment")
      .select("*")
      .eq("aktiv", true);
    
    if (error) {
      toast.error("Kunne ikke hente utstyr");
      console.error(error);
    } else {
      setEquipment(data || []);
    }
  };

  const fetchDrones = async () => {
    const { data, error } = await (supabase as any)
      .from("drones")
      .select("*")
      .eq("aktiv", true);
    
    if (error) {
      toast.error(`Kunne ikke hente ${terminology.vehiclesLower}`);
      console.error(error);
    } else {
      setDrones(data || []);
    }
  };

  const fetchCustomers = async () => {
    const { data, error } = await (supabase as any)
      .from("customers")
      .select("*")
      .eq("aktiv", true)
      .order("navn");
    
    if (error) {
      toast.error("Kunne ikke hente kunder");
      console.error(error);
    } else {
      setCustomers(data || []);
    }
  };

  const fetchMissionPersonnel = async (missionId: string) => {
    const { data, error } = await supabase
      .from("mission_personnel")
      .select("profile_id")
      .eq("mission_id", missionId);
    
    if (error) {
      console.error("Error fetching mission personnel:", error);
    } else {
      setSelectedPersonnel(data?.map(p => p.profile_id) || []);
    }
  };

  const fetchMissionEquipment = async (missionId: string) => {
    const { data, error } = await supabase
      .from("mission_equipment")
      .select("equipment_id")
      .eq("mission_id", missionId);
    
    if (error) {
      console.error("Error fetching mission equipment:", error);
    } else {
      setSelectedEquipment(data?.map(e => e.equipment_id) || []);
    }
  };

  const fetchMissionDrones = async (missionId: string) => {
    const { data, error } = await supabase
      .from("mission_drones")
      .select("drone_id")
      .eq("mission_id", missionId);
    
    if (error) {
      console.error("Error fetching mission drones:", error);
    } else {
      setSelectedDrones(data?.map(d => d.drone_id) || []);
    }
  };

  const handleCreateCustomer = async () => {
    if (!newCustomerName.trim()) {
      toast.error("Kundenavn kan ikke være tomt");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Ikke innlogget");

      // Get user's company_id
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .single();

      if (!profile?.company_id) {
        throw new Error("Kunne ikke hente brukerinformasjon");
      }

      const { data, error } = await (supabase as any)
        .from("customers")
        .insert({
          navn: newCustomerName.trim(),
          user_id: user.id,
          company_id: profile.company_id,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success("Kunde opprettet!");
      setCustomers([...customers, data]);
      setSelectedCustomer(data.id);
      setNewCustomerName("");
      setShowNewCustomerInput(false);
      setOpenCustomerPopover(false);
    } catch (error) {
      console.error("Error creating customer:", error);
      toast.error("Kunne ikke opprette kunde");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Ikke innlogget");

      // Get user's company_id
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .single();

      if (!profile?.company_id) {
        throw new Error("Kunne ikke hente brukerinformasjon");
      }

      if (mission) {
        // UPDATE mode
        const { error: missionError } = await (supabase as any)
          .from("missions")
          .update({
            tittel: formData.tittel,
            lokasjon: formData.lokasjon,
            tidspunkt: formData.tidspunkt,
            beskrivelse: formData.beskrivelse,
            merknader: formData.merknader,
            status: formData.status,
            risk_nivå: formData.risk_nivå,
            customer_id: selectedCustomer || null,
            latitude: formData.latitude,
            longitude: formData.longitude,
            route: routeData,
            oppdatert_dato: new Date().toISOString(),
          })
          .eq("id", mission.id);

        if (missionError) throw missionError;

        // Delete existing personnel, equipment, and drones
        await supabase.from("mission_personnel").delete().eq("mission_id", mission.id);
        await supabase.from("mission_equipment").delete().eq("mission_id", mission.id);
        await supabase.from("mission_drones").delete().eq("mission_id", mission.id);

        // Insert new personnel
        if (selectedPersonnel.length > 0) {
          const personnelData = selectedPersonnel.map(profileId => ({
            mission_id: mission.id,
            profile_id: profileId,
          }));
          
          const { error: personnelError } = await supabase
            .from("mission_personnel")
            .insert(personnelData);
          
          if (personnelError) throw personnelError;
        }

        // Insert new equipment
        if (selectedEquipment.length > 0) {
          const equipmentData = selectedEquipment.map(equipmentId => ({
            mission_id: mission.id,
            equipment_id: equipmentId,
          }));
          
          const { error: equipmentError } = await supabase
            .from("mission_equipment")
            .insert(equipmentData);
          
          if (equipmentError) throw equipmentError;
        }

        // Insert new drones
        if (selectedDrones.length > 0) {
          const dronesData = selectedDrones.map(droneId => ({
            mission_id: mission.id,
            drone_id: droneId,
          }));
          
          const { error: dronesError } = await supabase
            .from("mission_drones")
            .insert(dronesData);
          
          if (dronesError) throw dronesError;
        }

        toast.success("Oppdrag oppdatert!");
      } else {
        // INSERT mode
        const { data: newMission, error: missionError } = await (supabase as any)
          .from("missions")
          .insert({
            tittel: formData.tittel,
            lokasjon: formData.lokasjon,
            tidspunkt: formData.tidspunkt,
            beskrivelse: formData.beskrivelse,
            merknader: formData.merknader,
            status: formData.status,
            risk_nivå: formData.risk_nivå,
            customer_id: selectedCustomer || null,
            user_id: user.id,
            company_id: profile.company_id,
            latitude: formData.latitude,
            longitude: formData.longitude,
            route: routeData,
          })
          .select()
          .single();

        if (missionError) throw missionError;

        // Insert mission personnel
        if (selectedPersonnel.length > 0) {
          const personnelData = selectedPersonnel.map(profileId => ({
            mission_id: newMission.id,
            profile_id: profileId,
          }));
          
          const { error: personnelError } = await (supabase as any)
            .from("mission_personnel")
            .insert(personnelData);
          
          if (personnelError) throw personnelError;
        }

        // Insert mission equipment
        if (selectedEquipment.length > 0) {
          const equipmentData = selectedEquipment.map(equipmentId => ({
            mission_id: newMission.id,
            equipment_id: equipmentId,
          }));
          
          const { error: equipmentError } = await (supabase as any)
            .from("mission_equipment")
            .insert(equipmentData);
          
          if (equipmentError) throw equipmentError;
        }

        // Insert mission drones
        if (selectedDrones.length > 0) {
          const dronesData = selectedDrones.map(droneId => ({
            mission_id: newMission.id,
            drone_id: droneId,
          }));
          
          const { error: dronesError } = await (supabase as any)
            .from("mission_drones")
            .insert(dronesData);
          
          if (dronesError) throw dronesError;
        }

        // Send email notification for new mission
        try {
          await supabase.functions.invoke('send-notification-email', {
            body: {
              type: 'notify_new_mission',
              companyId: profile.company_id,
              mission: {
                tittel: formData.tittel,
                lokasjon: formData.lokasjon,
                tidspunkt: formData.tidspunkt,
                beskrivelse: formData.beskrivelse
              }
            }
          });
        } catch (emailError) {
          console.error('Error sending new mission notification:', emailError);
        }

        toast.success("Oppdrag opprettet!");
      }
      
      onMissionAdded();
      onOpenChange(false);
      
      // Reset form
      setFormData({
        tittel: "",
        lokasjon: "",
        tidspunkt: "",
        beskrivelse: "",
        merknader: "",
        status: "Planlagt",
        risk_nivå: "Lav",
        latitude: null,
        longitude: null,
      });
      setSelectedPersonnel([]);
      setSelectedEquipment([]);
      setSelectedDrones([]);
      setSelectedCustomer("");
      setNewCustomerName("");
      setShowNewCustomerInput(false);
    } catch (error) {
      console.error("Error saving mission:", error);
      toast.error(mission ? "Kunne ikke oppdatere oppdrag" : "Kunne ikke opprette oppdrag");
    } finally {
      setLoading(false);
    }
  };

  const togglePersonnel = (profileId: string) => {
    setSelectedPersonnel(prev =>
      prev.includes(profileId)
        ? prev.filter(id => id !== profileId)
        : [...prev, profileId]
    );
    setOpenPersonnelPopover(false);
  };

  const removePersonnel = (profileId: string) => {
    setSelectedPersonnel(prev => prev.filter(id => id !== profileId));
  };

  const toggleEquipment = (equipmentId: string) => {
    setSelectedEquipment(prev =>
      prev.includes(equipmentId)
        ? prev.filter(id => id !== equipmentId)
        : [...prev, equipmentId]
    );
    setOpenEquipmentPopover(false);
  };

  const removeEquipment = (equipmentId: string) => {
    setSelectedEquipment(prev => prev.filter(id => id !== equipmentId));
  };

  const toggleDrone = (droneId: string) => {
    setSelectedDrones(prev =>
      prev.includes(droneId)
        ? prev.filter(id => id !== droneId)
        : [...prev, droneId]
    );
    setOpenDronePopover(false);
  };

  const removeDrone = (droneId: string) => {
    setSelectedDrones(prev => prev.filter(id => id !== droneId));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6 !z-[1000]">
        <DialogHeader>
          <DialogTitle>{mission ? "Rediger oppdrag" : "Legg til oppdrag"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="tittel">Tittel *</Label>
            <Input
              id="tittel"
              value={formData.tittel}
              onChange={(e) => setFormData({ ...formData, tittel: e.target.value })}
              required
            />
          </div>

          <div>
            <AddressAutocomplete
              label="Adresse / lokasjon *"
              value={formData.lokasjon}
              onChange={(value) => setFormData({ ...formData, lokasjon: value })}
              onSelectLocation={(location) => {
                setFormData({ 
                  ...formData, 
                  lokasjon: location.address,
                  latitude: location.lat,
                  longitude: location.lon
                });
              }}
              placeholder="Søk etter adresse..."
            />
            
            <AirspaceWarnings 
              latitude={formData.latitude} 
              longitude={formData.longitude} 
            />
            
            <DroneWeatherPanel 
              latitude={formData.latitude} 
              longitude={formData.longitude}
              compact={true}
            />
          </div>

          {/* Route Planning */}
          <div>
            <Label>Flyrute</Label>
            <div className="mt-1.5">
              {routeData ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-2 text-sm bg-secondary/50 px-3 py-2 rounded-md">
                    <MapPin className="h-4 w-4 text-primary" />
                    <span>{routeData.coordinates.length} punkter</span>
                    <span className="text-muted-foreground">•</span>
                    <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{routeData.totalDistance.toFixed(2)} km</span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigate('/kart/planlegg', {
                        state: {
                          returnTo: '/oppdrag',
                          missionId: mission?.id,
                          existingRoute: routeData,
                          formData,
                          selectedPersonnel,
                          selectedEquipment,
                          selectedDrones,
                          selectedCustomer
                        }
                      });
                      onOpenChange(false);
                    }}
                  >
                    <Route className="h-4 w-4 mr-1" />
                    Rediger
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setRouteData(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    navigate('/kart/planlegg', {
                      state: {
                        returnTo: '/oppdrag',
                        missionId: mission?.id,
                        existingRoute: null,
                        formData,
                        selectedPersonnel,
                        selectedEquipment,
                        selectedDrones,
                        selectedCustomer
                      }
                    });
                    onOpenChange(false);
                  }}
                >
                  <Route className="h-4 w-4 mr-2" />
                  Planlegg rute på kart
                </Button>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="tidspunkt">Tidspunkt *</Label>
            <Input
              id="tidspunkt"
              type="datetime-local"
              value={formData.tidspunkt}
              onChange={(e) => setFormData({ ...formData, tidspunkt: e.target.value })}
              required
            />
          </div>

          <div>
            <Label htmlFor="beskrivelse">Beskrivelse</Label>
            <Textarea
              id="beskrivelse"
              value={formData.beskrivelse}
              onChange={(e) => setFormData({ ...formData, beskrivelse: e.target.value })}
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="merknader">Merknader</Label>
            <Textarea
              id="merknader"
              value={formData.merknader}
              onChange={(e) => setFormData({ ...formData, merknader: e.target.value })}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="status">Status</Label>
              <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[1001]">
                  <SelectItem value="Planlagt">Planlagt</SelectItem>
                  <SelectItem value="Pågående">Pågående</SelectItem>
                  <SelectItem value="Fullført">Fullført</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="risk">Risiko</Label>
              <Select value={formData.risk_nivå} onValueChange={(value) => setFormData({ ...formData, risk_nivå: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[1001]">
                  <SelectItem value="Lav">Lav</SelectItem>
                  <SelectItem value="Middels">Middels</SelectItem>
                  <SelectItem value="Høy">Høy</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="kunde">Kunde</Label>
            <Popover open={openCustomerPopover} onOpenChange={setOpenCustomerPopover}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openCustomerPopover}
                  className="w-full justify-between"
                >
                  {selectedCustomer
                    ? customers.find((c) => c.id === selectedCustomer)?.navn
                    : "Velg kunde..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0 z-[1001]">
                <Command>
                  <CommandInput placeholder="Søk kunde..." />
                  <CommandList>
                    <CommandEmpty>
                      <div className="p-2">
                        {showNewCustomerInput ? (
                          <div className="space-y-2">
                            <Input
                              placeholder="Kundenavn"
                              value={newCustomerName}
                              onChange={(e) => setNewCustomerName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleCreateCustomer();
                                }
                              }}
                            />
                            <div className="flex gap-2">
                              <Button size="sm" onClick={handleCreateCustomer}>
                                Opprett
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setShowNewCustomerInput(false);
                                  setNewCustomerName("");
                                }}
                              >
                                Avbryt
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            className="w-full justify-start"
                            onClick={() => setShowNewCustomerInput(true)}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Legg til ny kunde
                          </Button>
                        )}
                      </div>
                    </CommandEmpty>
                    <CommandGroup>
                      {customers.map((customer) => (
                        <CommandItem
                          key={customer.id}
                          value={customer.navn}
                          onSelect={() => {
                            setSelectedCustomer(customer.id);
                            setOpenCustomerPopover(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedCustomer === customer.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {customer.navn}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label>Personell</Label>
            <Popover open={openPersonnelPopover} onOpenChange={setOpenPersonnelPopover}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openPersonnelPopover}
                  className="w-full justify-between"
                >
                  Velg personell...
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0 z-[1001]">
                <Command>
                  <CommandInput placeholder="Søk personell..." />
                  <CommandList>
                    <CommandEmpty>Ingen personell funnet.</CommandEmpty>
                    <CommandGroup>
                      {profiles.map((profile) => (
                        <CommandItem
                          key={profile.id}
                          value={profile.full_name || "Ukjent"}
                          onSelect={() => togglePersonnel(profile.id)}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedPersonnel.includes(profile.id) ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {profile.full_name || "Ukjent"}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            
            {selectedPersonnel.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedPersonnel.map((id) => {
                  const profile = profiles.find((p) => p.id === id);
                  return (
                    <div
                      key={id}
                      className="flex items-center gap-1 bg-secondary text-secondary-foreground px-2 py-1 rounded-md text-sm"
                    >
                      <span>{profile?.full_name || "Ukjent"}</span>
                      <button
                        type="button"
                        onClick={() => removePersonnel(id)}
                        className="hover:bg-secondary-foreground/20 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <Label>Utstyr</Label>
            <Popover open={openEquipmentPopover} onOpenChange={setOpenEquipmentPopover}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openEquipmentPopover}
                  className="w-full justify-between"
                >
                  Velg utstyr...
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0 z-[1001]">
                <Command>
                  <CommandInput placeholder="Søk utstyr..." />
                  <CommandList>
                    <CommandEmpty>Ingen utstyr funnet.</CommandEmpty>
                    <CommandGroup>
                      {equipment.map((eq) => (
                        <CommandItem
                          key={eq.id}
                          value={`${eq.navn} ${eq.type}`}
                          onSelect={() => toggleEquipment(eq.id)}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedEquipment.includes(eq.id) ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {eq.navn} ({eq.type})
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            
            {selectedEquipment.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedEquipment.map((id) => {
                  const eq = equipment.find((e) => e.id === id);
                  return (
                    <div
                      key={id}
                      className="flex items-center gap-1 bg-secondary text-secondary-foreground px-2 py-1 rounded-md text-sm"
                    >
                      <span>{eq?.navn} ({eq?.type})</span>
                      <button
                        type="button"
                        onClick={() => removeEquipment(id)}
                        className="hover:bg-secondary-foreground/20 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <Label>{terminology.vehicles}</Label>
            <Popover open={openDronePopover} onOpenChange={setOpenDronePopover}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openDronePopover}
                  className="w-full justify-between"
                >
                  {terminology.selectVehicle}...
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0 z-[1001]">
                <Command>
                  <CommandInput placeholder={`Søk ${terminology.vehicleLower}...`} />
                  <CommandList>
                    <CommandEmpty>{terminology.noVehicles}.</CommandEmpty>
                    <CommandGroup>
                      {drones.map((drone) => (
                        <CommandItem
                          key={drone.id}
                          value={`${drone.modell} ${drone.registrering}`}
                          onSelect={() => toggleDrone(drone.id)}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedDrones.includes(drone.id) ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {drone.modell} ({drone.registrering})
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            
            {selectedDrones.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedDrones.map((id) => {
                  const drone = drones.find((d) => d.id === id);
                  return (
                    <div
                      key={id}
                      className="flex items-center gap-1 bg-secondary text-secondary-foreground px-2 py-1 rounded-md text-sm"
                    >
                      <span>{drone?.modell} ({drone?.registrering})</span>
                      <button
                        type="button"
                        onClick={() => removeDrone(id)}
                        className="hover:bg-secondary-foreground/20 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Avbryt
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mission ? "Lagre endringer" : "Opprett oppdrag"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
