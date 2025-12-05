import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { addDays, format } from "date-fns";

interface AddEquipmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEquipmentAdded: () => void;
  userId: string;
}

export const AddEquipmentDialog = ({ open, onOpenChange, onEquipmentAdded, userId }: AddEquipmentDialogProps) => {
  const [companyId, setCompanyId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [vedlikeholdStartdato, setVedlikeholdStartdato] = useState<string>("");
  const [vedlikeholdsintervallDager, setVedlikeholdsintervallDager] = useState<string>("");
  const [nesteVedlikehold, setNesteVedlikehold] = useState<string>("");

  useEffect(() => {
    const fetchCompanyId = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", userId)
        .single();
      
      if (data) {
        setCompanyId(data.company_id);
      }
    };
    
    if (userId) {
      fetchCompanyId();
    }
  }, [userId]);

  // Calculate neste_vedlikehold when start date or interval changes
  useEffect(() => {
    if (vedlikeholdStartdato && vedlikeholdsintervallDager) {
      const intervalDays = parseInt(vedlikeholdsintervallDager);
      if (!isNaN(intervalDays) && intervalDays > 0) {
        const startDate = new Date(vedlikeholdStartdato);
        const nextDate = addDays(startDate, intervalDays);
        setNesteVedlikehold(format(nextDate, "yyyy-MM-dd"));
      }
    } else {
      setNesteVedlikehold("");
    }
  }, [vedlikeholdStartdato, vedlikeholdsintervallDager]);

  const handleAddEquipment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (isSubmitting) return;
    setIsSubmitting(true);
    
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    if (!companyId) {
      toast.error("Kunne ikke hente brukerinformasjon");
      setIsSubmitting(false);
      return;
    }
    
    try {
      const vektValue = formData.get("vekt") as string;
      const { error } = await (supabase as any).from("equipment").insert([{
        user_id: userId,
        company_id: companyId,
        navn: formData.get("navn") as string,
        type: formData.get("type") as string,
        serienummer: formData.get("serienummer") as string,
        status: (formData.get("status") as string) || "Grønn",
        merknader: (formData.get("merknader") as string) || null,
        sist_vedlikeholdt: (formData.get("sist_vedlikeholdt") as string) || null,
        neste_vedlikehold: nesteVedlikehold || null,
        flyvetimer: parseFloat(formData.get("flyvetimer") as string) || 0,
        vekt: vektValue ? parseFloat(vektValue) : null,
        vedlikeholdsintervall_dager: vedlikeholdsintervallDager ? parseInt(vedlikeholdsintervallDager) : null,
        vedlikehold_startdato: vedlikeholdStartdato || null,
      }]);

      if (error) {
        console.error("Error adding equipment:", error);
        console.error("Error details:", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        
        if (error.code === "42501" || error.message?.includes("policy")) {
          toast.error("Du har ikke tillatelse til å legge til utstyr");
        } else {
          toast.error(`Kunne ikke legge til utstyr: ${error.message || "Ukjent feil"}`);
        }
      } else {
        toast.success("Utstyr lagt til");
        form.reset();
        setVedlikeholdStartdato("");
        setVedlikeholdsintervallDager("");
        setNesteVedlikehold("");
        onEquipmentAdded();
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Legg til nytt utstyr</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleAddEquipment} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="navn">Navn</Label>
              <Input id="navn" name="navn" required />
            </div>
            <div>
              <Label htmlFor="type">Type</Label>
              <Input id="type" name="type" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="serienummer">Serienummer</Label>
              <Input id="serienummer" name="serienummer" required />
            </div>
            <div>
              <Label htmlFor="vekt">Vekt (kg)</Label>
              <Input id="vekt" name="vekt" type="number" step="0.01" min="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="status">Status</Label>
              <Select name="status" defaultValue="Grønn">
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
            <div>
              <Label htmlFor="flyvetimer">Flyvetimer</Label>
              <Input id="flyvetimer" name="flyvetimer" type="number" step="0.01" min="0" defaultValue="0" />
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-sm font-medium text-muted-foreground mb-3">Vedlikeholdsintervall</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="vedlikehold_startdato">Startdato</Label>
                <Input 
                  id="vedlikehold_startdato" 
                  name="vedlikehold_startdato" 
                  type="date" 
                  value={vedlikeholdStartdato}
                  onChange={(e) => setVedlikeholdStartdato(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="vedlikeholdsintervall_dager">Intervall (dager)</Label>
                <Input 
                  id="vedlikeholdsintervall_dager" 
                  name="vedlikeholdsintervall_dager" 
                  type="number" 
                  min="1"
                  value={vedlikeholdsintervallDager}
                  onChange={(e) => setVedlikeholdsintervallDager(e.target.value)}
                />
              </div>
            </div>
            {nesteVedlikehold && (
              <p className="text-xs text-muted-foreground mt-2">
                Neste vedlikehold: {format(new Date(nesteVedlikehold), "dd.MM.yyyy")}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="sist_vedlikeholdt">Sist vedlikeholdt</Label>
            <Input id="sist_vedlikeholdt" name="sist_vedlikeholdt" type="date" />
          </div>
          <div>
            <Label htmlFor="merknader">Merknader</Label>
            <Textarea id="merknader" name="merknader" />
          </div>
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Legger til..." : "Legg til utstyr"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
