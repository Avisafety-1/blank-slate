import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Pencil, Trash2, Calendar } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

interface Competency {
  id: string;
  navn: string;
  type: string;
  beskrivelse: string | null;
  utstedt_dato: string | null;
  utloper_dato: string | null;
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
  person,
  onCompetencyUpdated,
}: PersonCompetencyDialogProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [competencyToDelete, setCompetencyToDelete] = useState<string | null>(null);
  
  // New competency form state
  const [newType, setNewType] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newIssueDate, setNewIssueDate] = useState("");
  const [newExpiryDate, setNewExpiryDate] = useState("");

  // Edit competency form state
  const [editType, setEditType] = useState("");
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editIssueDate, setEditIssueDate] = useState("");
  const [editExpiryDate, setEditExpiryDate] = useState("");

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
    
    onCompetencyUpdated();
  };

  const handleStartEdit = (competency: Competency) => {
    setEditingId(competency.id);
    setEditType(competency.type);
    setEditName(competency.navn);
    setEditDescription(competency.beskrivelse || "");
    setEditIssueDate(competency.utstedt_dato || "");
    setEditExpiryDate(competency.utloper_dato || "");
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditType("");
    setEditName("");
    setEditDescription("");
    setEditIssueDate("");
    setEditExpiryDate("");
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
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Kompetanser - {person.full_name}</DialogTitle>
          </DialogHeader>

          <ScrollArea className="h-[calc(90vh-8rem)] px-1">
            {/* Existing Competencies */}
            <div className="space-y-4 mb-6 px-3">
              <h3 className="text-sm font-semibold text-muted-foreground">📋 Eksisterende kompetanser</h3>
              
              {(person.personnel_competencies || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Ingen kompetanser registrert</p>
              ) : (
                (person.personnel_competencies || []).map((competency) => (
                  <div key={competency.id} className="border rounded-lg p-4 space-y-3 bg-card">
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
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>Utstedt dato</Label>
                            <Input
                              type="date"
                              value={editIssueDate}
                              onChange={(e) => setEditIssueDate(e.target.value)}
                            />
                          </div>
                          <div>
                            <Label>Utløper dato</Label>
                            <Input
                              type="date"
                              value={editExpiryDate}
                              onChange={(e) => setEditExpiryDate(e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
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
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-semibold">{competency.navn}</h4>
                            <p className="text-sm text-muted-foreground">({competency.type})</p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleStartEdit(competency)}
                              variant="ghost"
                              size="sm"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              onClick={() => handleDeleteClick(competency.id)}
                              variant="ghost"
                              size="sm"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        {competency.beskrivelse && (
                          <p className="text-sm">{competency.beskrivelse}</p>
                        )}
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          {competency.utstedt_dato && (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              <span>
                                Utstedt: {format(new Date(competency.utstedt_dato), "dd.MM.yyyy", { locale: nb })}
                              </span>
                            </div>
                          )}
                          {competency.utloper_dato && (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              <span>
                                Utløper: {format(new Date(competency.utloper_dato), "dd.MM.yyyy", { locale: nb })}
                              </span>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Add New Competency Form */}
            <div className="border-t pt-6 px-3">
              <h3 className="text-sm font-semibold mb-4">➕ Legg til ny kompetanse</h3>
              <form onSubmit={handleAddCompetency} className="space-y-4">
                <div>
                  <Label htmlFor="new-type">Type *</Label>
                  <Select value={newType} onValueChange={setNewType}>
                    <SelectTrigger id="new-type">
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
                  <Label htmlFor="new-name">Navn *</Label>
                  <Input
                    id="new-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="F.eks. A3 drone"
                  />
                </div>

                <div>
                  <Label htmlFor="new-description">Beskrivelse</Label>
                  <Textarea
                    id="new-description"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Valgfri beskrivelse"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="new-issue-date">Utstedt dato</Label>
                    <Input
                      id="new-issue-date"
                      type="date"
                      value={newIssueDate}
                      onChange={(e) => setNewIssueDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-expiry-date">Utløper dato</Label>
                    <Input
                      id="new-expiry-date"
                      type="date"
                      value={newExpiryDate}
                      onChange={(e) => setNewExpiryDate(e.target.value)}
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full">
                  Legg til kompetanse
                </Button>
              </form>
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
    </>
  );
}
