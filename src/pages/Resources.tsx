import droneBackground from "@/assets/drone-background.png";
import { Plane, Plus, Gauge, Users, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Header } from "@/components/Header";
import { GlassCard } from "@/components/GlassCard";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { StatusBadge } from "@/components/StatusBadge";
import { format } from "date-fns";
import { AddDroneDialog } from "@/components/resources/AddDroneDialog";
import { AddEquipmentDialog } from "@/components/resources/AddEquipmentDialog";
import { AddCompetencyDialog } from "@/components/resources/AddCompetencyDialog";
import { PersonCompetencyDialog } from "@/components/resources/PersonCompetencyDialog";
import { DroneDetailDialog } from "@/components/resources/DroneDetailDialog";
import { EquipmentDetailDialog } from "@/components/resources/EquipmentDetailDialog";

const Resources = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [drones, setDrones] = useState<any[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [personnel, setPersonnel] = useState<any[]>([]);
  const [droneDialogOpen, setDroneDialogOpen] = useState(false);
  const [equipmentDialogOpen, setEquipmentDialogOpen] = useState(false);
  const [personnelDialogOpen, setPersonnelDialogOpen] = useState(false);
  const [personCompetencyDialogOpen, setPersonCompetencyDialogOpen] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<typeof personnel[0] | null>(null);
  const [selectedDrone, setSelectedDrone] = useState<any>(null);
  const [droneDetailOpen, setDroneDetailOpen] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState<any>(null);
  const [equipmentDetailOpen, setEquipmentDetailOpen] = useState(false);
  const [personnelSearch, setPersonnelSearch] = useState("");
  const [droneSearch, setDroneSearch] = useState("");
  const [equipmentSearch, setEquipmentSearch] = useState("");

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchDrones();
      fetchEquipment();
      fetchPersonnel();
    }
  }, [user]);

  const fetchDrones = async () => {
    const { data, error } = await (supabase as any)
      .from("drones")
      .select("*")
      .eq("aktiv", true)
      .order("opprettet_dato", { ascending: false });
    
    if (error) {
      console.error("Error fetching drones:", error);
      toast.error("Kunne ikke hente droner");
    } else {
      setDrones(data || []);
    }
  };

  const fetchEquipment = async () => {
    const { data, error } = await (supabase as any)
      .from("equipment")
      .select("*")
      .eq("aktiv", true)
      .order("opprettet_dato", { ascending: false });
    
    if (error) {
      console.error("Error fetching equipment:", error);
      toast.error("Kunne ikke hente utstyr");
    } else {
      setEquipment(data || []);
    }
  };

  const fetchPersonnel = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*, personnel_competencies(*)")
      .eq("approved", true)
      .order("created_at", { ascending: false });
    
    if (error) {
      console.error("Error fetching personnel:", error);
      toast.error("Kunne ikke hente personell");
    } else {
      setPersonnel(data || []);
    }
  };




  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-foreground">Laster...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative w-full overflow-x-hidden">
      {/* Background with gradient overlay */}
      <div 
        className="fixed inset-0 z-0"
        style={{
          backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.5)), url(${droneBackground})`,
          backgroundSize: "cover",
          backgroundPosition: "center center",
          backgroundAttachment: "fixed",
          backgroundRepeat: "no-repeat",
        }}
      />

      {/* Content */}
      <div className="relative z-10 w-full">
        <Header />

        {/* Main Content */}
        <main className="w-full px-3 sm:px-4 py-4 sm:py-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            {/* Droner Section */}
            <GlassCard>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Plane className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-semibold">Droner</h2>
                </div>
                <Button onClick={() => setDroneDialogOpen(true)} size="sm" className="gap-2">
                  <Plus className="w-4 h-4" />
                  Legg til
                </Button>
              </div>
              
              {/* Search field */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Søk etter modell eller registrering..."
                  value={droneSearch}
                  onChange={(e) => setDroneSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              
              <div className="space-y-3">
                {drones
                  .filter((drone) => {
                    if (!droneSearch) return true;
                    const searchLower = droneSearch.toLowerCase();
                    return (
                      drone.modell?.toLowerCase().includes(searchLower) ||
                      drone.registrering?.toLowerCase().includes(searchLower) ||
                      drone.merknader?.toLowerCase().includes(searchLower)
                    );
                  })
                  .map((drone) => (
                  <div 
                    key={drone.id} 
                    className="p-3 bg-background/50 rounded-lg border border-border cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02] hover:border-primary/50 hover:bg-background/70"
                    onClick={() => {
                      setSelectedDrone(drone);
                      setDroneDetailOpen(true);
                    }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold">{drone.modell}</h3>
                        <p className="text-sm text-muted-foreground">{drone.registrering}</p>
                      </div>
                      <StatusBadge status={drone.status as any} />
                    </div>
                    <div className="text-sm space-y-1">
                      <p>Flyvetimer: {drone.flyvetimer}</p>
                      {drone.neste_inspeksjon && (
                        <p>Neste inspeksjon: {format(new Date(drone.neste_inspeksjon), "dd.MM.yyyy")}</p>
                      )}
                    </div>
                  </div>
                ))}
                {drones.filter((drone) => {
                  if (!droneSearch) return true;
                  const searchLower = droneSearch.toLowerCase();
                  return (
                    drone.modell?.toLowerCase().includes(searchLower) ||
                    drone.registrering?.toLowerCase().includes(searchLower) ||
                    drone.merknader?.toLowerCase().includes(searchLower)
                  );
                }).length === 0 && droneSearch && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Ingen treff for "{droneSearch}"
                  </p>
                )}
                {drones.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Ingen droner registrert
                  </p>
                )}
              </div>
            </GlassCard>

            {/* Utstyr Section */}
            <GlassCard>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Gauge className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-semibold">Utstyr</h2>
                </div>
                <Button onClick={() => setEquipmentDialogOpen(true)} size="sm" className="gap-2">
                  <Plus className="w-4 h-4" />
                  Legg til
                </Button>
              </div>
              
              {/* Search field */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Søk etter navn, type eller serienummer..."
                  value={equipmentSearch}
                  onChange={(e) => setEquipmentSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              
              <div className="space-y-3">
                {equipment
                  .filter((item) => {
                    if (!equipmentSearch) return true;
                    const searchLower = equipmentSearch.toLowerCase();
                    return (
                      item.navn?.toLowerCase().includes(searchLower) ||
                      item.type?.toLowerCase().includes(searchLower) ||
                      item.serienummer?.toLowerCase().includes(searchLower) ||
                      item.merknader?.toLowerCase().includes(searchLower)
                    );
                  })
                  .map((item) => (
                  <div 
                    key={item.id} 
                    className="p-3 bg-background/50 rounded-lg border border-border cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02] hover:border-primary/50 hover:bg-background/70"
                    onClick={() => {
                      setSelectedEquipment(item);
                      setEquipmentDetailOpen(true);
                    }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold">{item.navn}</h3>
                        <p className="text-sm text-muted-foreground">{item.type}</p>
                      </div>
                      <StatusBadge status={item.status as any} />
                    </div>
                    <div className="text-sm space-y-1">
                      <p>SN: {item.serienummer}</p>
                      {item.neste_vedlikehold && (
                        <p>Neste vedlikehold: {format(new Date(item.neste_vedlikehold), "dd.MM.yyyy")}</p>
                      )}
                    </div>
                  </div>
                ))}
                {equipment.filter((item) => {
                  if (!equipmentSearch) return true;
                  const searchLower = equipmentSearch.toLowerCase();
                  return (
                    item.navn?.toLowerCase().includes(searchLower) ||
                    item.type?.toLowerCase().includes(searchLower) ||
                    item.serienummer?.toLowerCase().includes(searchLower) ||
                    item.merknader?.toLowerCase().includes(searchLower)
                  );
                }).length === 0 && equipmentSearch && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Ingen treff for "{equipmentSearch}"
                  </p>
                )}
                {equipment.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Ingen utstyr registrert
                  </p>
                )}
              </div>
            </GlassCard>

            {/* Personell Section */}
            <GlassCard>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-semibold">Personell</h2>
                </div>
                <Button
                  onClick={() => setPersonnelDialogOpen(true)}
                  size="sm"
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Legg til kompetanse
                </Button>
              </div>
              
              {/* Search field */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Søk etter navn eller kompetanse..."
                  value={personnelSearch}
                  onChange={(e) => setPersonnelSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              
              <div className="space-y-3">
                {personnel
                  .filter((person) => {
                    if (!personnelSearch) return true;
                    const searchLower = personnelSearch.toLowerCase();
                    const nameMatch = person.full_name?.toLowerCase().includes(searchLower);
                    const competencyMatch = person.personnel_competencies?.some((comp: any) =>
                      comp.navn?.toLowerCase().includes(searchLower) ||
                      comp.type?.toLowerCase().includes(searchLower)
                    );
                    return nameMatch || competencyMatch;
                  })
                  .map((person) => (
                  <div 
                    key={person.id} 
                    className="p-3 bg-background/50 rounded-lg border border-border cursor-pointer hover:bg-accent/20 hover:border-accent transition-all duration-200"
                    onClick={() => {
                      setSelectedPerson(person);
                      setPersonCompetencyDialogOpen(true);
                    }}
                  >
                    <h3 className="font-semibold mb-2">
                      {person.full_name || "Ukjent navn"}
                    </h3>
                    <div className="text-sm space-y-1">
                      {person.personnel_competencies && person.personnel_competencies.length > 0 ? (
                        person.personnel_competencies.map((comp: any) => (
                          <div key={comp.id} className="flex justify-between items-center py-1">
                            <span>{comp.navn}</span>
                            {comp.utloper_dato && (
                              <span className="text-xs text-muted-foreground">
                                Utløper: {format(new Date(comp.utloper_dato), "dd.MM.yyyy")}
                              </span>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-muted-foreground">Ingen kompetanser registrert</p>
                      )}
                    </div>
                  </div>
                ))}
                {personnel.filter((person) => {
                  if (!personnelSearch) return true;
                  const searchLower = personnelSearch.toLowerCase();
                  const nameMatch = person.full_name?.toLowerCase().includes(searchLower);
                  const competencyMatch = person.personnel_competencies?.some((comp: any) =>
                    comp.navn?.toLowerCase().includes(searchLower) ||
                    comp.type?.toLowerCase().includes(searchLower)
                  );
                  return nameMatch || competencyMatch;
                }).length === 0 && personnelSearch && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Ingen treff for "{personnelSearch}"
                  </p>
                )}
                {personnel.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Ingen personell registrert
                  </p>
                )}
              </div>
            </GlassCard>
          </div>
        </main>
      </div>

      <AddDroneDialog 
        open={droneDialogOpen} 
        onOpenChange={setDroneDialogOpen}
        onDroneAdded={fetchDrones}
        userId={user?.id!}
      />

      <AddEquipmentDialog
        open={equipmentDialogOpen}
        onOpenChange={setEquipmentDialogOpen}
        onEquipmentAdded={fetchEquipment}
        userId={user?.id!}
      />

      <AddCompetencyDialog
        open={personnelDialogOpen}
        onOpenChange={setPersonnelDialogOpen}
        onCompetencyAdded={fetchPersonnel}
        personnel={personnel}
      />

      <PersonCompetencyDialog
        open={personCompetencyDialogOpen}
        onOpenChange={setPersonCompetencyDialogOpen}
        person={selectedPerson}
        onCompetencyUpdated={fetchPersonnel}
      />

      <DroneDetailDialog
        open={droneDetailOpen}
        onOpenChange={setDroneDetailOpen}
        drone={selectedDrone}
        onDroneUpdated={fetchDrones}
      />

      <EquipmentDetailDialog
        open={equipmentDetailOpen}
        onOpenChange={setEquipmentDetailOpen}
        equipment={selectedEquipment}
        onEquipmentUpdated={fetchEquipment}
      />
    </div>
  );
};

export default Resources;
