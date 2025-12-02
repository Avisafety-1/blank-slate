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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format } from "date-fns";
import { AddDroneDialog } from "@/components/resources/AddDroneDialog";
import { AddEquipmentDialog } from "@/components/resources/AddEquipmentDialog";
import { AddCompetencyDialog } from "@/components/resources/AddCompetencyDialog";
import { PersonCompetencyDialog } from "@/components/resources/PersonCompetencyDialog";
import { DroneDetailDialog } from "@/components/resources/DroneDetailDialog";
import { EquipmentDetailDialog } from "@/components/resources/EquipmentDetailDialog";
import { useTerminology } from "@/hooks/useTerminology";

const Resources = () => {
  const navigate = useNavigate();
  const { user, loading, companyId } = useAuth();
  const terminology = useTerminology();
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

    // Real-time subscriptions
    const dronesChannel = supabase
      .channel('drones-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drones' }, fetchDrones)
      .subscribe();

    const equipmentChannel = supabase
      .channel('equipment-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipment' }, fetchEquipment)
      .subscribe();

    const profilesChannel = supabase
      .channel('profiles-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchPersonnel)
      .subscribe();

    const competenciesChannel = supabase
      .channel('competencies-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'personnel_competencies' }, fetchPersonnel)
      .subscribe();

    return () => {
      supabase.removeChannel(dronesChannel);
      supabase.removeChannel(equipmentChannel);
      supabase.removeChannel(profilesChannel);
      supabase.removeChannel(competenciesChannel);
    };
  }, [user, companyId]);

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
          backgroundRepeat: "no-repeat",
        }}
      />

      {/* Content */}
      <div className="relative z-10 w-full">
        <Header />

        {/* Main Content */}
        <main className="w-full px-3 sm:px-4 py-4 sm:py-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            {/* Droner/Fly Section */}
            <GlassCard>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Plane className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-semibold">{terminology.vehicles}</h2>
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
                  placeholder={`Søk etter ${terminology.vehicleLower}modell eller registrering...`}
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
                    {terminology.noVehicles}
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
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarImage src={person.avatar_url || ""} />
                        <AvatarFallback>
                          {person.full_name?.charAt(0) || person.email?.charAt(0).toUpperCase() || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">
                          {person.full_name || "Ukjent navn"}
                        </h3>
                        {person.tittel && (
                          <p className="text-xs text-muted-foreground truncate">{person.tittel}</p>
                        )}
                      </div>
                    </div>
                    
                    {/* Competencies - compact mobile layout */}
                    {person.personnel_competencies && person.personnel_competencies.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-border/50">
                        <div className="flex flex-wrap gap-1.5">
                          {person.personnel_competencies.slice(0, 3).map((comp: any) => {
                            const isExpired = comp.utloper_dato && new Date(comp.utloper_dato) < new Date();
                            const isExpiringSoon = comp.utloper_dato && 
                              new Date(comp.utloper_dato) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) &&
                              !isExpired;
                            
                            return (
                              <span 
                                key={comp.id} 
                                className={`text-xs px-2 py-0.5 rounded-full ${
                                  isExpired 
                                    ? 'bg-destructive/20 text-destructive' 
                                    : isExpiringSoon
                                    ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                                    : 'bg-primary/10 text-primary'
                                }`}
                              >
                                {comp.navn}
                              </span>
                            );
                          })}
                          {person.personnel_competencies.length > 3 && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                              +{person.personnel_competencies.length - 3}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {(!person.personnel_competencies || person.personnel_competencies.length === 0) && (
                      <p className="text-xs text-muted-foreground mt-2">Ingen kompetanser</p>
                    )}
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
