import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Search, User, Plus } from "lucide-react";

interface Person {
  id: string;
  full_name: string;
  email: string | null;
  tittel: string | null;
}

interface AddPersonnelToDroneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  droneId: string;
  existingPersonnelIds: string[];
  onPersonnelAdded: () => void;
}

export const AddPersonnelToDroneDialog = ({
  open,
  onOpenChange,
  droneId,
  existingPersonnelIds,
  onPersonnelAdded,
}: AddPersonnelToDroneDialogProps) => {
  const { companyId } = useAuth();
  const [personnel, setPersonnel] = useState<Person[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    if (open && companyId) {
      fetchAvailablePersonnel();
    }
  }, [open, companyId, existingPersonnelIds]);

  const fetchAvailablePersonnel = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, tittel")
      .eq("approved", true)
      .order("full_name");

    if (error) {
      console.error("Error fetching personnel:", error);
      return;
    }

    // Filter out already linked personnel
    const availablePersonnel = (data || []).filter(
      (p) => !existingPersonnelIds.includes(p.id)
    );
    setPersonnel(availablePersonnel);
  };

  const handleAddPersonnel = async (personId: string) => {
    if (!droneId) return;

    setAddingId(personId);
    try {
      const { error } = await (supabase as any)
        .from("drone_personnel")
        .insert({
          drone_id: droneId,
          profile_id: personId,
        });

      if (error) throw error;

      toast.success("Personell lagt til");
      onPersonnelAdded();
      
      // Remove from local list
      setPersonnel((prev) => prev.filter((p) => p.id !== personId));
    } catch (error: any) {
      console.error("Error adding personnel:", error);
      toast.error(`Kunne ikke legge til personell: ${error.message}`);
    } finally {
      setAddingId(null);
    }
  };

  const filteredPersonnel = personnel.filter((p) =>
    p.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.tittel?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-md max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            Legg til personell
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Søk etter personell..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <ScrollArea className="h-[300px]">
          {filteredPersonnel.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <User className="w-12 h-12 text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">
                {searchTerm ? "Ingen treff" : "Ingen tilgjengelig personell"}
              </p>
            </div>
          ) : (
            <div className="space-y-2 pr-4">
              {filteredPersonnel.map((person) => (
                <div
                  key={person.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-card border border-border rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm sm:text-base truncate">{person.full_name || "Ukjent"}</p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs sm:text-sm text-muted-foreground">
                      {person.tittel && <span>{person.tittel}</span>}
                      {person.email && person.tittel && <span className="hidden sm:inline">•</span>}
                      {person.email && <span className="truncate max-w-[180px] sm:max-w-none">{person.email}</span>}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAddPersonnel(person.id)}
                    disabled={addingId === person.id}
                    className="gap-1 w-full sm:w-auto shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    {addingId === person.id ? "..." : "Legg til"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Lukk
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};