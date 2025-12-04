import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { useTerminology } from "@/hooks/useTerminology";

interface AddDroneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDroneAdded: () => void;
  userId: string;
}

export const AddDroneDialog = ({ open, onOpenChange, onDroneAdded, userId }: AddDroneDialogProps) => {
  const [companyId, setCompanyId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inspectionStartDate, setInspectionStartDate] = useState<string>("");
  const [inspectionIntervalDays, setInspectionIntervalDays] = useState<string>("");
  const [calculatedNextInspection, setCalculatedNextInspection] = useState<string>("");
  const terminology = useTerminology();

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

  // Calculate next inspection when start date or interval changes
  useEffect(() => {
    if (inspectionStartDate && inspectionIntervalDays) {
      const startDate = new Date(inspectionStartDate);
      const days = parseInt(inspectionIntervalDays);
      if (!isNaN(days) && days > 0) {
        const nextDate = new Date(startDate);
        nextDate.setDate(nextDate.getDate() + days);
        setCalculatedNextInspection(nextDate.toISOString().split('T')[0]);
      }
    } else {
      setCalculatedNextInspection("");
    }
  }, [inspectionStartDate, inspectionIntervalDays]);

  const handleAddDrone = async (e: React.FormEvent<HTMLFormElement>) => {
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

    const nesteInspeksjon = calculatedNextInspection || (formData.get("neste_inspeksjon") as string) || null;
    
    try {
      const { data: droneData, error } = await (supabase as any).from("drones").insert([{
        user_id: userId,
        company_id: companyId,
        modell: formData.get("modell") as string,
        serienummer: formData.get("serienummer") as string,
        status: (formData.get("status") as string) || "Grønn",
        flyvetimer: parseInt(formData.get("flyvetimer") as string) || 0,
        merknader: (formData.get("merknader") as string) || null,
        sist_inspeksjon: (formData.get("sist_inspeksjon") as string) || null,
        neste_inspeksjon: nesteInspeksjon,
        kjøpsdato: (formData.get("kjøpsdato") as string) || null,
        klasse: (formData.get("klasse") as string) || null,
        vekt: formData.get("vekt") ? parseFloat(formData.get("vekt") as string) : null,
        payload: formData.get("payload") ? parseFloat(formData.get("payload") as string) : null,
        inspection_start_date: inspectionStartDate || null,
        inspection_interval_days: inspectionIntervalDays ? parseInt(inspectionIntervalDays) : null,
      }]).select().single();

      if (error) {
        console.error("Error adding drone:", error);
        if (error.code === "42501" || error.message?.includes("policy")) {
          toast.error(`Du har ikke tillatelse til å legge til ${terminology.vehicleLower}`);
        } else {
          toast.error(`Kunne ikke legge til ${terminology.vehicleLower}: ${error.message || "Ukjent feil"}`);
        }
      } else {
        // Create calendar event for next inspection if set
        if (nesteInspeksjon && droneData) {
          const modell = formData.get("modell") as string;
          await supabase.from("calendar_events").insert({
            user_id: userId,
            company_id: companyId,
            title: `Inspeksjon: ${modell}`,
            type: "Vedlikehold",
            description: `drone_inspection:${droneData.id}`,
            event_date: nesteInspeksjon,
          });
        }
        
        toast.success(`${terminology.vehicle} lagt til`);
        form.reset();
        setInspectionStartDate("");
        setInspectionIntervalDays("");
        setCalculatedNextInspection("");
        onDroneAdded();
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
          <DialogTitle>{terminology.addVehicle}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleAddDrone} className="space-y-4">
          <div>
            <Label htmlFor="modell">Modell</Label>
            <Input id="modell" name="modell" required />
          </div>
          <div>
            <Label htmlFor="serienummer">Serienummer</Label>
            <Input id="serienummer" name="serienummer" required />
          </div>
          <div>
            <Label htmlFor="klasse">Klasse</Label>
            <Select name="klasse">
              <SelectTrigger>
                <SelectValue placeholder="Velg klasse" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="C0">C0</SelectItem>
                <SelectItem value="C1">C1</SelectItem>
                <SelectItem value="C2">C2</SelectItem>
                <SelectItem value="C3">C3</SelectItem>
                <SelectItem value="C4">C4</SelectItem>
                <SelectItem value="C5">C5</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="vekt">Vekt MTOM (kg)</Label>
              <Input id="vekt" name="vekt" type="number" step="0.01" placeholder="f.eks. 0.9" />
            </div>
            <div>
              <Label htmlFor="payload">Payload (kg)</Label>
              <Input id="payload" name="payload" type="number" step="0.01" placeholder="f.eks. 0.5" />
            </div>
          </div>
          <div>
            <Label htmlFor="kjøpsdato">Kjøpsdato</Label>
            <Input id="kjøpsdato" name="kjøpsdato" type="date" />
          </div>
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
            <Label htmlFor="flyvetimer">{terminology.flightHours}</Label>
            <Input id="flyvetimer" name="flyvetimer" type="number" defaultValue={0} />
          </div>
          <div>
            <Label htmlFor="sist_inspeksjon">Sist inspeksjon</Label>
            <Input id="sist_inspeksjon" name="sist_inspeksjon" type="date" />
          </div>
          
          {/* Inspection interval section */}
          <div className="border-t pt-4 mt-4">
            <Label className="text-sm font-medium text-muted-foreground mb-2 block">Inspeksjonsintervall</Label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="inspection_start_date">Startdato</Label>
                <Input 
                  id="inspection_start_date" 
                  type="date" 
                  value={inspectionStartDate}
                  onChange={(e) => setInspectionStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="inspection_interval_days">Intervall (dager)</Label>
                <Input 
                  id="inspection_interval_days" 
                  type="number" 
                  placeholder="f.eks. 90"
                  value={inspectionIntervalDays}
                  onChange={(e) => setInspectionIntervalDays(e.target.value)}
                />
              </div>
            </div>
            {calculatedNextInspection && (
              <p className="text-sm text-muted-foreground mt-2">
                Beregnet neste inspeksjon: <span className="font-medium">{new Date(calculatedNextInspection).toLocaleDateString('nb-NO')}</span>
              </p>
            )}
          </div>
          
          <div>
            <Label htmlFor="neste_inspeksjon">Neste inspeksjon {calculatedNextInspection && "(overstyrt av intervall)"}</Label>
            <Input 
              id="neste_inspeksjon" 
              name="neste_inspeksjon" 
              type="date" 
              value={calculatedNextInspection}
              onChange={(e) => {
                if (!inspectionIntervalDays) {
                  setCalculatedNextInspection(e.target.value);
                }
              }}
              disabled={!!calculatedNextInspection}
            />
          </div>
          <div>
            <Label htmlFor="merknader">Merknader</Label>
            <Textarea id="merknader" name="merknader" />
          </div>
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Legger til..." : terminology.addVehicle}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
