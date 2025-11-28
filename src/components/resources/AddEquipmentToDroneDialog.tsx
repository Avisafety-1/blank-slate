import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { Search, Plus } from "lucide-react";

interface Equipment {
  id: string;
  navn: string;
  type: string;
  serienummer: string;
  status: string;
}

interface AddEquipmentToDroneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  droneId: string;
  existingEquipmentIds: string[];
  onEquipmentAdded: () => void;
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
  onEquipmentAdded 
}: AddEquipmentToDroneDialogProps) => {
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
      .select("id, navn, type, serienummer, status")
      .eq("aktiv", true)
      .order("navn");

    if (error) {
      console.error("Error fetching equipment:", error);
      toast.error("Kunne ikke hente utstyr");
    } else {
      // Filter out equipment that's already linked
      const available = (data || []).filter(
        (item) => !existingEquipmentIds.includes(item.id)
      );
      setEquipment(available);
    }
  };

  const handleAddEquipment = async (equipmentId: string) => {
    setAdding(equipmentId);
    
    try {
      const { error } = await supabase
        .from("drone_equipment")
        .insert({
          drone_id: droneId,
          equipment_id: equipmentId,
        });

      if (error) throw error;

      toast.success("Utstyr lagt til");
      onEquipmentAdded();
      fetchAvailableEquipment(); // Refresh list
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
            filteredEquipment.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between p-3 bg-background/50 rounded-lg border border-border hover:bg-background/70 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium">{item.navn}</h4>
                    <Badge className={`${statusColors[item.status] || ""} border text-xs`}>
                      {item.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{item.type}</p>
                  <p className="text-xs text-muted-foreground mt-1">SN: {item.serienummer}</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleAddEquipment(item.id)}
                  disabled={adding === item.id}
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" />
                  {adding === item.id ? "Legger til..." : "Legg til"}
                </Button>
              </div>
            ))
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
