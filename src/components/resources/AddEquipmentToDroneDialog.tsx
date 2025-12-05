import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { Search, Plus, AlertTriangle, Weight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface Equipment {
  id: string;
  navn: string;
  type: string;
  serienummer: string;
  status: string;
  vekt: number | null;
}

interface AddEquipmentToDroneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  droneId: string;
  existingEquipmentIds: string[];
  onEquipmentAdded: () => void;
  dronePayload: number | null;
  currentEquipmentWeight: number;
}

const statusColors: Record<string, string> = {
  Grønn: "bg-status-green/20 text-green-700 dark:text-green-300 border-status-green/30",
  Gul: "bg-status-yellow/20 text-yellow-700 dark:text-yellow-300 border-status-yellow/30",
  Rød: "bg-status-red/20 text-red-700 dark:text-red-300 border-status-red/30",
};

export const AddEquipmentToDroneDialog = ({ 
  open, 
  onOpenChange, 
  droneId, 
  existingEquipmentIds,
  onEquipmentAdded,
  dronePayload,
  currentEquipmentWeight
}: AddEquipmentToDroneDialogProps) => {
  const { user, companyId } = useAuth();
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchAvailableEquipment();
    }
  }, [open, existingEquipmentIds]);

  const fetchAvailableEquipment = async () => {
    const { data, error } = await supabase
      .from("equipment")
      .select("id, navn, type, serienummer, status, vekt")
      .eq("aktiv", true)
      .order("navn");

    if (error) {
      console.error("Error fetching equipment:", error);
      toast.error("Kunne ikke hente utstyr");
    } else {
      const available = (data || []).filter(
        (item) => !existingEquipmentIds.includes(item.id)
      );
      setEquipment(available);
    }
  };

  const logEquipmentHistory = async (equipmentId: string, equipmentName: string) => {
    if (!user || !companyId) return;
    try {
      await supabase.from("drone_equipment_history").insert({
        drone_id: droneId,
        company_id: companyId,
        user_id: user.id,
        action: 'added',
        item_type: 'equipment',
        item_id: equipmentId,
        item_name: equipmentName,
      });
    } catch (error) {
      console.error("Error logging equipment history:", error);
    }
  };

  const getWeightStatus = (equipmentWeight: number | null): "ok" | "warning" | "exceeded" => {
    if (!dronePayload || !equipmentWeight) return "ok";
    
    const newTotalWeight = currentEquipmentWeight + equipmentWeight;
    
    if (newTotalWeight > dronePayload) {
      return "exceeded";
    }
    if (newTotalWeight > dronePayload - 0.1) {
      return "warning";
    }
    return "ok";
  };

  const handleAddEquipment = async (equipmentItem: Equipment) => {
    setAdding(equipmentItem.id);
    
    try {
      const { error } = await supabase
        .from("drone_equipment")
        .insert({
          drone_id: droneId,
          equipment_id: equipmentItem.id,
        });

      if (error) throw error;

      await logEquipmentHistory(equipmentItem.id, equipmentItem.navn);

      toast.success("Utstyr lagt til");
      onEquipmentAdded();
      fetchAvailableEquipment();
    } catch (error: any) {
      console.error("Error adding equipment:", error);
      toast.error(`Kunne ikke legge til utstyr: ${error.message}`);
    } finally {
      setAdding(null);
    }
  };

  const filteredEquipment = equipment.filter((item) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      item.navn.toLowerCase().includes(searchLower) ||
      item.type.toLowerCase().includes(searchLower) ||
      item.serienummer.toLowerCase().includes(searchLower)
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Legg til utstyr</DialogTitle>
        </DialogHeader>

        {dronePayload !== null && (
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg text-sm">
            <Weight className="w-4 h-4 text-muted-foreground" />
            <span>
              Utstyrsvekt: <strong>{currentEquipmentWeight.toFixed(2)} kg</strong> / Payload: <strong>{dronePayload} kg</strong>
            </span>
          </div>
        )}

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Søk etter navn, type eller serienummer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
          {filteredEquipment.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {search ? `Ingen treff for "${search}"` : "Ingen tilgjengelig utstyr"}
            </p>
          ) : (
            filteredEquipment.map((item) => {
              const weightStatus = getWeightStatus(item.vekt);
              const newTotalWeight = currentEquipmentWeight + (item.vekt || 0);
              
              return (
                <div
                  key={item.id}
                  className="flex flex-col p-3 bg-background/50 rounded-lg border border-border hover:bg-background/70 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium">{item.navn}</h4>
                        <Badge className={`${statusColors[item.status] || ""} border text-xs`}>
                          {item.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{item.type}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span>SN: {item.serienummer}</span>
                        {item.vekt !== null && (
                          <span className="flex items-center gap-1">
                            <Weight className="w-3 h-3" />
                            {item.vekt} kg
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleAddEquipment(item)}
                      disabled={adding === item.id}
                      className="gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      {adding === item.id ? "Legger til..." : "Legg til"}
                    </Button>
                  </div>
                  
                  {dronePayload !== null && item.vekt !== null && weightStatus !== "ok" && (
                    <div className={`flex items-center gap-2 mt-2 p-2 rounded text-xs ${
                      weightStatus === "exceeded" 
                        ? "bg-destructive/10 text-destructive" 
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    }`}>
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span>
                        {weightStatus === "exceeded" 
                          ? `Overskrider payload! Ny totalvekt: ${newTotalWeight.toFixed(2)} kg`
                          : `Nær payload-grense. Ny totalvekt: ${newTotalWeight.toFixed(2)} kg`
                        }
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Lukk
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
