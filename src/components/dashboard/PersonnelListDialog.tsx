import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { useState } from "react";
import { PersonCompetencyDialog } from "@/components/resources/PersonCompetencyDialog";

interface PersonnelListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personnel: any[];
  onPersonnelUpdated?: () => void;
}

export const PersonnelListDialog = ({ open, onOpenChange, personnel, onPersonnelUpdated }: PersonnelListDialogProps) => {
  const [selectedPerson, setSelectedPerson] = useState<any>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const handlePersonClick = (person: any) => {
    setSelectedPerson(person);
    setDetailDialogOpen(true);
  };

  const handlePersonUpdated = () => {
    if (onPersonnelUpdated) {
      onPersonnelUpdated();
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Personell ({personnel.length})</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {personnel.map((person) => (
            <div 
              key={person.id} 
              onClick={() => handlePersonClick(person)}
              className="border border-border rounded-lg p-4 space-y-2 cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{person.full_name || "Ukjent navn"}</h3>
                  {person.created_at && (
                    <p className="text-sm text-muted-foreground">
                      Opprettet: {format(new Date(person.created_at), "dd.MM.yyyy", { locale: nb })}
                    </p>
                  )}
                </div>
                <StatusBadge status={person.status} />
              </div>
              
              {person.personnel_competencies && person.personnel_competencies.length > 0 && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Kompetanser:</span>
                  <div className="space-y-2 mt-2">
                    {person.personnel_competencies.map((comp: any) => (
                      <div key={comp.id} className="flex justify-between items-start p-2 bg-muted/50 rounded">
                        <div>
                          <span className="font-medium">{comp.navn}</span>
                          <p className="text-xs text-muted-foreground">{comp.type}</p>
                        </div>
                        {comp.utloper_dato && (
                          <span className="text-xs text-muted-foreground">
                            Utløper: {format(new Date(comp.utloper_dato), "dd.MM.yyyy")}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {(!person.personnel_competencies || person.personnel_competencies.length === 0) && (
                <div className="text-sm text-muted-foreground">
                  Ingen kompetanser registrert
                </div>
              )}
            </div>
          ))}
        </div>
      </DialogContent>

      {selectedPerson && (
        <PersonCompetencyDialog
          open={detailDialogOpen}
          onOpenChange={setDetailDialogOpen}
          person={selectedPerson}
          onCompetencyUpdated={handlePersonUpdated}
        />
      )}
    </Dialog>
  );
};