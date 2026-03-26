import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Trash2, Plus, FileText, Pencil, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DocumentDetailDialog } from "@/components/dashboard/DocumentDetailDialog";
import { Document } from "@/types";

interface FolderDetailDialogProps {
  folder: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => void;
  isAdmin: boolean;
}

interface FolderDoc {
  id: string;
  document_id: string;
  tittel: string;
  kategori: string;
}

export const FolderDetailDialog = ({ folder, open, onOpenChange, onRefresh, isAdmin }: FolderDetailDialogProps) => {
  const { companyId } = useAuth();
  const [folderDocs, setFolderDocs] = useState<FolderDoc[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [allDocs, setAllDocs] = useState<{ id: string; tittel: string; kategori: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchPicker, setSearchPicker] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [docDetailOpen, setDocDetailOpen] = useState(false);

  const getDocumentStatus = (doc: { gyldig_til?: string | null; varsel_dager_for_utløp?: number | null }): string => {
    if (!doc.gyldig_til) return "Grønn";
    const today = new Date();
    const expiryDate = new Date(doc.gyldig_til);
    const daysUntil = Math.floor((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil < 0) return "Rød";
    if (daysUntil <= (doc.varsel_dager_for_utløp || 30)) return "Gul";
    return "Grønn";
  };

  const handleDocClick = async (documentId: string) => {
    const { data } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();
    if (data) {
      const doc: Document = {
        id: data.id,
        tittel: data.tittel,
        kategori: data.kategori as any,
        versjon: data.versjon || "1.0",
        varsel_dager_for_utløp: data.varsel_dager_for_utløp || 30,
        synlighet: (data.global_visibility ? "Alle" : "Internt") as any,
        sist_endret: new Date(data.oppdatert_dato || data.opprettet_dato || new Date()),
        gyldig_til: data.gyldig_til ? new Date(data.gyldig_til) : undefined,
        utsteder: data.beskrivelse ? undefined : undefined,
        fil_url: data.fil_url || undefined,
        fil_navn: data.fil_navn || undefined,
        nettside_url: data.nettside_url || undefined,
        beskrivelse: data.beskrivelse,
        merknader: undefined,
      };
      setSelectedDocument(doc);
      setDocDetailOpen(true);
    }
  };

  const loadFolderDocs = async () => {
    if (!folder) return;
    const { data } = await supabase
      .from("document_folder_items")
      .select("id, document_id, documents:document_id(tittel, kategori)")
      .eq("folder_id", folder.id);
    setFolderDocs(
      (data || []).map((d: any) => ({
        id: d.id,
        document_id: d.document_id,
        tittel: d.documents?.tittel || "Ukjent",
        kategori: d.documents?.kategori || "",
      }))
    );
  };

  useEffect(() => {
    if (open && folder) {
      loadFolderDocs();
      setShowPicker(false);
      setEditing(false);
    }
  }, [open, folder]);

  const openPicker = async () => {
    const { data } = await supabase
      .from("documents")
      .select("id, tittel, kategori")
      .order("tittel");
    setAllDocs(data || []);
    const existing = new Set(folderDocs.map((d) => d.document_id));
    setSelectedIds(existing);
    setShowPicker(true);
    setSearchPicker("");
  };

  const toggleDoc = (docId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const savePicker = async () => {
    if (!folder) return;
    const existingIds = new Set(folderDocs.map((d) => d.document_id));
    const toAdd = [...selectedIds].filter((id) => !existingIds.has(id));
    const toRemove = folderDocs.filter((d) => !selectedIds.has(d.document_id));

    if (toRemove.length) {
      await supabase.from("document_folder_items").delete().in("id", toRemove.map((d) => d.id));
    }
    if (toAdd.length) {
      await supabase.from("document_folder_items").insert(
        toAdd.map((document_id) => ({ folder_id: folder.id, document_id }))
      );
    }
    toast.success("Mappeinnhold oppdatert");
    setShowPicker(false);
    loadFolderDocs();
    onRefresh();
  };

  const removeDoc = async (itemId: string) => {
    await supabase.from("document_folder_items").delete().eq("id", itemId);
    toast.success("Dokument fjernet fra mappen");
    loadFolderDocs();
    onRefresh();
  };

  const deleteFolder = async () => {
    if (!folder) return;
    const { error } = await supabase.from("document_folders").delete().eq("id", folder.id);
    if (error) {
      toast.error("Kunne ikke slette mappen");
      return;
    }
    toast.success("Mappe slettet");
    onOpenChange(false);
    onRefresh();
  };

  const saveRename = async () => {
    if (!folder || !editName.trim()) return;
    await supabase.from("document_folders").update({ name: editName.trim() }).eq("id", folder.id);
    toast.success("Mappenavn oppdatert");
    setEditing(false);
    onRefresh();
  };

  const filteredPickerDocs = allDocs.filter(
    (d) => !searchPicker || d.tittel.toLowerCase().includes(searchPicker.toLowerCase())
  );

  if (!folder) return null;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader>
          {editing ? (
            <div className="flex items-center gap-2">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="text-lg font-semibold"
                onKeyDown={(e) => e.key === "Enter" && saveRename()}
                autoFocus
              />
              <Button size="sm" onClick={saveRename}>Lagre</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}><X className="h-4 w-4" /></Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <DialogTitle>{folder.name}</DialogTitle>
              {isAdmin && (
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditName(folder.name); setEditing(true); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
          <DialogDescription>{folderDocs.length} dokument{folderDocs.length !== 1 ? "er" : ""}</DialogDescription>
        </DialogHeader>

        {showPicker ? (
          <div className="flex-1 flex flex-col gap-3 min-h-0">
            <Input
              placeholder="Søk dokumenter..."
              value={searchPicker}
              onChange={(e) => setSearchPicker(e.target.value)}
            />
            <ScrollArea className="flex-1 min-h-0 max-h-[50vh] border rounded-md p-2">
              {filteredPickerDocs.map((doc) => (
                <label key={doc.id} className="flex items-center gap-2 py-1.5 px-1 hover:bg-accent/10 rounded cursor-pointer">
                  <Checkbox
                    checked={selectedIds.has(doc.id)}
                    onCheckedChange={() => toggleDoc(doc.id)}
                  />
                  <span className="text-sm truncate">{doc.tittel}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{doc.kategori}</span>
                </label>
              ))}
              {filteredPickerDocs.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Ingen dokumenter funnet</p>
              )}
            </ScrollArea>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowPicker(false)}>Avbryt</Button>
              <Button size="sm" onClick={savePicker}>Lagre endringer</Button>
            </div>
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1 max-h-[40vh]">
              {folderDocs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Ingen dokumenter i denne mappen</p>
              ) : (
                <div className="space-y-1">
                  {folderDocs.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-2 p-2 rounded hover:bg-accent/10 cursor-pointer" onClick={() => handleDocClick(doc.document_id)}>
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate flex-1">{doc.tittel}</span>
                      {isAdmin && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={(e) => { e.stopPropagation(); removeDoc(doc.id); }}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
            {isAdmin && (
              <div className="flex gap-2 justify-between pt-2 border-t">
                <Button variant="destructive" size="sm" onClick={deleteFolder}>
                  <Trash2 className="h-4 w-4 mr-1" /> Slett mappe
                </Button>
                <Button size="sm" onClick={openPicker}>
                  <Plus className="h-4 w-4 mr-1" /> Legg til dokumenter
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>

    <DocumentDetailDialog
      open={docDetailOpen}
      onOpenChange={setDocDetailOpen}
      document={selectedDocument}
      status={selectedDocument ? getDocumentStatus(selectedDocument as any) : "Grønn"}
    />
    </>
  );
};
