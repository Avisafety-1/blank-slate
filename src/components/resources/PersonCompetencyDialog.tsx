import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Pencil, Trash2, Book } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { FlightLogbookDialog } from "@/components/FlightLogbookDialog";

interface Competency {
  id: string;
  navn: string;
  type: string;
  beskrivelse: string | null;
  utstedt_dato: string | null;
  utloper_dato: string | null;
  påvirker_status?: boolean;
}

interface Person {
  id: string;
  full_name: string;
  personnel_competencies?: Competency[];
}

interface PersonCompetencyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: Person | null;
  onCompetencyUpdated: () => void;
}

export function PersonCompetencyDialog({
  open,
  onOpenChange,
  person: initialPerson,
  onCompetencyUpdated,
}: PersonCompetencyDialogProps) {
  const [person, setPerson] = useState<Person | null>(initialPerson);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [competencyToDelete, setCompetencyToDelete] = useState<string | null>(null);
  const [logbookDialogOpen, setLogbookDialogOpen] = useState(false);
  
  // New competency form state
  const [newType, setNewType] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newIssueDate, setNewIssueDate] = useState("");
  const [newExpiryDate, setNewExpiryDate] = useState("");
  const [newAffectsStatus, setNewAffectsStatus] = useState(true);

  // Edit competency form state
  const [editType, setEditType] = useState("");
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editIssueDate, setEditIssueDate] = useState("");
  const [editExpiryDate, setEditExpiryDate] = useState("");
  const [editAffectsStatus, setEditAffectsStatus] = useState(true);

  // Update local person state when prop changes
  useEffect(() => {
    setPerson(initialPerson);
  }, [initialPerson]);

  // Real-time subscription for competency updates
  useEffect(() => {
    if (!person?.id || !open) return;

    const channel = supabase
      .channel(`person-competencies-${person.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'personnel_competencies',
          filter: `profile_id=eq.${person.id}`,
        },
        async () => {
          // Refetch person with competencies when changes occur
          const { data } = await supabase
            .from('profiles')
            .select('id, full_name, personnel_competencies(*)')
            .eq('id', person.id)
            .single();
          
          if (data) {
            console.log('Person competencies updated via realtime:', data);
            setPerson(data as Person);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [person?.id, open]);

  const handleAddCompetency = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newType || !newName || !person) {
      toast({
        title: "Feil",
        description: "Type og navn er påkrevd",
        variant: "destructive",
      });
      return;
    }

    const { error } = await supabase.from("personnel_competencies").insert({
      profile_id: person.id,
      type: newType,
      navn: newName,
      beskrivelse: newDescription || null,
      utstedt_dato: newIssueDate || null,
      utloper_dato: newExpiryDate || null,
      påvirker_status: newAffectsStatus,
    });

    if (error) {
      console.error("Error adding competency:", error);
      console.error("Error details:", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      });
      
      if (error.code === "42501" || error.message?.includes("policy")) {
        toast({
          title: "Ingen tillatelse",
          description: "Du har ikke tillatelse til å legge til kompetanse for denne personen",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Feil",
          description: error.message || "Kunne ikke legge til kompetanse",
          variant: "destructive",
        });
      }
      return;
    }

    toast({
      title: "Suksess",
      description: "Kompetanse lagt til",
    });

    // Reset form
    setNewType("");
    setNewName("");
    setNewDescription("");
    setNewIssueDate("");
    setNewExpiryDate("");
    setNewAffectsStatus(true);
    
    onCompetencyUpdated();
  };

  const handleStartEdit = (competency: Competency) => {
    setEditingId(competency.id);
    setEditType(competency.type);
    setEditName(competency.navn);
    setEditDescription(competency.beskrivelse || "");
    setEditIssueDate(competency.utstedt_dato || "");
    setEditExpiryDate(competency.utloper_dato || "");
    setEditAffectsStatus(competency.påvirker_status !== false);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditType("");
    setEditName("");
    setEditDescription("");
    setEditIssueDate("");
    setEditExpiryDate("");
    setEditAffectsStatus(true);
  };

  const handleUpdateCompetency = async (competencyId: string) => {
    if (!editType || !editName) {
      toast({
        title: "Feil",
        description: "Type og navn er påkrevd",
        variant: "destructive",
      });
      return;
    }

    const { error } = await supabase
      .from("personnel_competencies")
      .update({
        type: editType,
        navn: editName,
        beskrivelse: editDescription || null,
        utstedt_dato: editIssueDate || null,
        utloper_dato: editExpiryDate || null,
        påvirker_status: editAffectsStatus,
      })
      .eq("id", competencyId);

    if (error) {
      toast({
        title: "Feil",
        description: "Kunne ikke oppdatere kompetanse",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Suksess",
      description: "Kompetanse oppdatert",
    });

    setEditingId(null);
    onCompetencyUpdated();
  };

  const handleDeleteClick = (competencyId: string) => {
    setCompetencyToDelete(competencyId);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!competencyToDelete) return;

    const { error } = await supabase
      .from("personnel_competencies")
      .delete()
      .eq("id", competencyToDelete);

    if (error) {
      toast({
        title: "Feil",
        description: "Kunne ikke slette kompetanse",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Suksess",
      description: "Kompetanse slettet",
    });

    setDeleteDialogOpen(false);
    setCompetencyToDelete(null);
    onCompetencyUpdated();
  };

  if (!person) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] p-3 sm:p-6 overflow-hidden">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-base sm:text-lg pr-8">{person.full_name}</DialogTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLogbookDialogOpen(true)}
              className="gap-2 w-full sm:w-auto"
            >
              <Book className="w-4 h-4" />
              Loggbok
            </Button>
          </DialogHeader>

          <ScrollArea className="h-[calc(90vh-10rem)] sm:h-[calc(90vh-8rem)]">
            <div className="pr-2 sm:pr-4">
            {/* Existing Competencies */}
            <div className="space-y-3 mb-6 min-w-0">
              <h3 className="text-sm font-semibold text-muted-foreground">Kompetanser</h3>
              
              {(person.personnel_competencies || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Ingen kompetanser registrert</p>
              ) : (
                (person.personnel_competencies || []).map((competency) => (
                  <div key={competency.id} className="border rounded-lg p-2.5 sm:p-4 space-y-2 bg-card min-w-0 overflow-hidden">
                    {editingId === competency.id ? (
                      // Edit mode
                      <div className="space-y-3">
                        <div>
                          <Label>Type</Label>
                          <Select value={editType} onValueChange={setEditType}>
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
                          <Label>Navn</Label>
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label>Beskrivelse</Label>
                          <Textarea
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Utstedt</Label>
                            <Input
                              type="date"
                              value={editIssueDate}
                              onChange={(e) => setEditIssueDate(e.target.value)}
                              className="h-9"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Utløper</Label>
                            <Input
                              type="date"
                              value={editExpiryDate}
                              onChange={(e) => setEditExpiryDate(e.target.value)}
                              className="h-9"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pt-2">
                          <Switch
                            id={`edit-affects-status-${competency.id}`}
                            checked={editAffectsStatus}
                            onCheckedChange={setEditAffectsStatus}
                          />
                          <Label htmlFor={`edit-affects-status-${competency.id}`} className="text-xs">
                            Påvirker status
                          </Label>
                        </div>
                        <div className="flex gap-2 pt-2">
                          <Button
                            onClick={() => handleUpdateCompetency(competency.id)}
                            size="sm"
                          >
                            Lagre
                          </Button>
                          <Button
                            onClick={handleCancelEdit}
                            variant="outline"
                            size="sm"
                          >
                            Avbryt
                          </Button>
                        </div>
                      </div>
                    ) : (
                      // View mode
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <h4 className="font-semibold text-sm sm:text-base truncate">{competency.navn}</h4>
                            <span className="text-xs text-muted-foreground">{competency.type}</span>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button
                              onClick={() => handleStartEdit(competency)}
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              onClick={() => handleDeleteClick(competency.id)}
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        {competency.beskrivelse && (
                          <p className="text-xs sm:text-sm text-muted-foreground">{competency.beskrivelse}</p>
                        )}
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {competency.utstedt_dato && (
                            <span>Utstedt: {format(new Date(competency.utstedt_dato), "dd.MM.yy", { locale: nb })}</span>
                          )}
                          {competency.utloper_dato && (
                            <span className={new Date(competency.utloper_dato) < new Date() ? "text-destructive" : ""}>
                              Utløper: {format(new Date(competency.utloper_dato), "dd.MM.yy", { locale: nb })}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/50">
                          <Switch
                            id={`affects-status-${competency.id}`}
                            checked={competency.påvirker_status !== false}
                            onCheckedChange={async (checked) => {
                              setPerson(prev => {
                                if (!prev) return prev;
                                return {
                                  ...prev,
                                  personnel_competencies: (prev.personnel_competencies || []).map(c =>
                                    c.id === competency.id ? { ...c, påvirker_status: checked } : c
                                  ),
                                };
                              });

                              const { error } = await supabase
                                .from("personnel_competencies")
                                .update({ påvirker_status: checked })
                                .eq("id", competency.id);
                              if (error) {
                                setPerson(prev => {
                                  if (!prev) return prev;
                                  return {
                                    ...prev,
                                    personnel_competencies: (prev.personnel_competencies || []).map(c =>
                                      c.id === competency.id ? { ...c, påvirker_status: !checked } : c
                                    ),
                                  };
                                });
                                toast({
                                  title: "Feil",
                                  description: "Kunne ikke oppdatere innstilling",
                                  variant: "destructive",
                                });
                              } else {
                                onCompetencyUpdated();
                              }
                            }}
                          />
                          <Label htmlFor={`affects-status-${competency.id}`} className="text-xs text-muted-foreground">
                            Påvirker status
                          </Label>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Add New Competency Form */}
            <div className="border-t pt-4 mt-4">
              <h3 className="text-sm font-semibold mb-3">Legg til kompetanse</h3>
              <form onSubmit={handleAddCompetency} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="new-type" className="text-xs">Type *</Label>
                    <Select value={newType} onValueChange={setNewType}>
                      <SelectTrigger id="new-type" className="h-9">
                        <SelectValue placeholder="Velg type" />
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
                    <Label htmlFor="new-name" className="text-xs">Navn *</Label>
                    <Input
                      id="new-name"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="F.eks. A3 drone"
                      className="h-9"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="new-description" className="text-xs">Beskrivelse</Label>
                  <Textarea
                    id="new-description"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Valgfri"
                    className="min-h-[60px]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="new-issue-date" className="text-xs">Utstedt</Label>
                    <Input
                      id="new-issue-date"
                      type="date"
                      value={newIssueDate}
                      onChange={(e) => setNewIssueDate(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-expiry-date" className="text-xs">Utløper</Label>
                    <Input
                      id="new-expiry-date"
                      type="date"
                      value={newExpiryDate}
                      onChange={(e) => setNewExpiryDate(e.target.value)}
                      className="h-9"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    id="new-affects-status"
                    checked={newAffectsStatus}
                    onCheckedChange={setNewAffectsStatus}
                  />
                  <Label htmlFor="new-affects-status" className="text-xs">
                    Påvirker status
                  </Label>
                </div>

                <Button type="submit" className="w-full h-10">
                  Legg til
                </Button>
              </form>
            </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Er du sikker?</AlertDialogTitle>
            <AlertDialogDescription>
              Denne handlingen kan ikke angres. Kompetansen vil bli permanent slettet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>
              Slett
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FlightLogbookDialog
        open={logbookDialogOpen}
        onOpenChange={setLogbookDialogOpen}
        personId={person.id}
        personName={person.full_name}
      />
    </>
  );
}
