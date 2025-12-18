import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Check, ChevronsUpDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface AddCompetencyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompetencyAdded: () => void;
  personnel: any[];
}

export const AddCompetencyDialog = ({ open, onOpenChange, onCompetencyAdded, personnel }: AddCompetencyDialogProps) => {
  const [selectedPersonId, setSelectedPersonId] = useState<string>("");
  const [personSearchOpen, setPersonSearchOpen] = useState(false);

  const handleAddCompetency = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    if (!selectedPersonId) {
      toast.error("Vennligst velg en person");
      return;
    }
    
    const typeValue = formData.get("type") as string;
    const navnValue = formData.get("navn") as string;
    
    if (!typeValue || !navnValue) {
      toast.error("Type og navn er påkrevd");
      return;
    }
    
    const { error } = await (supabase as any).from("personnel_competencies").insert([{
      profile_id: selectedPersonId,
      type: typeValue,
      navn: navnValue,
      beskrivelse: (formData.get("beskrivelse") as string) || null,
      utstedt_dato: (formData.get("utstedt_dato") as string) || null,
      utloper_dato: (formData.get("utloper_dato") as string) || null,
    }]);

    if (error) {
      console.error("Error adding competency:", error);
      console.error("Error details:", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      });
      
      if (error.code === "42501" || error.message?.includes("policy")) {
        toast.error("Du har ikke tillatelse til å legge til kompetanse for denne personen");
      } else {
        toast.error(`Kunne ikke legge til kompetanse: ${error.message || "Ukjent feil"}`);
      }
    } else {
      toast.success("Kompetanse lagt til");
      onOpenChange(false);
      setSelectedPersonId("");
      onCompetencyAdded();
      e.currentTarget.reset();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="w-4 h-4" />
          Legg til kompetanse
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Legg til kompetanse/kurs</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleAddCompetency} className="space-y-4 px-2">
          <div>
            <Label>Person</Label>
            <Popover open={personSearchOpen} onOpenChange={setPersonSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={personSearchOpen}
                  className="w-full justify-between"
                >
                  {selectedPersonId
                    ? personnel.find((p) => p.id === selectedPersonId)?.full_name || "Velg person..."
                    : "Velg person..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0 z-[9999] bg-popover" align="start">
                <Command className="bg-popover">
                  <CommandInput placeholder="Søk etter person..." className="h-9" />
                  <CommandList>
                    <CommandEmpty>Ingen personer funnet.</CommandEmpty>
                    <CommandGroup>
                      {personnel.map((person) => (
                        <CommandItem
                          key={person.id}
                          value={person.full_name || ""}
                          onSelect={() => {
                            setSelectedPersonId(person.id);
                            setPersonSearchOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedPersonId === person.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {person.full_name || "Ukjent navn"}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <Label htmlFor="type">Type</Label>
            <Select name="type" defaultValue="Kurs">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Kurs">Kurs</SelectItem>
                <SelectItem value="Sertifikat">Sertifikat</SelectItem>
                <SelectItem value="Lisens">Lisens</SelectItem>
                <SelectItem value="Utdanning">Utdanning</SelectItem>
                <SelectItem value="Godkjenning">Godkjenning</SelectItem>
                <SelectItem value="Kompetanse">Kompetanse</SelectItem>
                <SelectItem value="Annet">Annet</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="navn">Navn</Label>
            <Input id="navn" name="navn" required />
          </div>
          <div>
            <Label htmlFor="beskrivelse">Beskrivelse</Label>
            <Textarea id="beskrivelse" name="beskrivelse" />
          </div>
          <div>
            <Label htmlFor="utstedt_dato">Utstedt dato</Label>
            <Input id="utstedt_dato" name="utstedt_dato" type="date" />
          </div>
          <div>
            <Label htmlFor="utloper_dato">Utløper dato</Label>
            <Input id="utloper_dato" name="utloper_dato" type="date" />
          </div>
          <Button type="submit" className="w-full">Legg til kompetanse</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
