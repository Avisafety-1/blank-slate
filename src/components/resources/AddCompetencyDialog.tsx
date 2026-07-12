import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Check, ChevronsUpDown, Upload, FileText, Paperclip, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { AttachmentPickerDialog } from "@/components/admin/AttachmentPickerDialog";

interface AddCompetencyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompetencyAdded: () => void;
  personnel: any[];
}

export const AddCompetencyDialog = ({ open, onOpenChange, onCompetencyAdded, personnel }: AddCompetencyDialogProps) => {
  const { t } = useTranslation();
  const { companyId } = useAuth();
  const [selectedPersonId, setSelectedPersonId] = useState<string>("");
  const [personSearchOpen, setPersonSearchOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<string>("Kurs");
  const [navnValue, setNavnValue] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);

  const KURS_PRESETS = ["STS", "A1/A3", "A2"];
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [docPickerOpen, setDocPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (f: File, competencyId: string): Promise<string | null> => {
    if (!companyId) return null;
    const ext = f.name.split('.').pop() || 'jpg';
    const filePath = `${companyId}/competency-${competencyId}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('logbook-images').upload(filePath, f);
    if (error) {
      console.error('Upload error:', error);
      return null;
    }
    return filePath;
  };

  const handleAddCompetency = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    if (!selectedPersonId) {
      toast.error(t('resourceDialogs.addCompetency.selectPersonError'));
      return;
    }
    
    const typeValue = formData.get("type") as string;
    const navnValue = formData.get("navn") as string;
    
    if (!typeValue || !navnValue) {
      toast.error(t('resourceDialogs.addCompetency.typeAndNameRequired'));
      return;
    }
    
    const { data, error } = await (supabase as any).from("personnel_competencies").insert([{
      profile_id: selectedPersonId,
      type: typeValue,
      navn: navnValue,
      beskrivelse: (formData.get("beskrivelse") as string) || null,
      utstedt_dato: (formData.get("utstedt_dato") as string) || null,
      utloper_dato: (formData.get("utloper_dato") as string) || null,
    }]).select('id').single();

    if (error) {
      console.error("Error adding competency:", error);
      if (error.code === "42501" || error.message?.includes("policy")) {
        toast.error(t('resourceDialogs.addCompetency.noPermission'));
      } else {
        toast.error(t('resourceDialogs.addCompetency.addFailed', { msg: error.message || t('resourceDialogs.addCompetency.unknownError') }));
      }
    } else {
      // Upload file if selected
      let filUrl: string | null = documentUrl;
      if (file && data?.id) {
        filUrl = await uploadFile(file, data.id);
      }
      if (filUrl && data?.id) {
        await (supabase as any).from("personnel_competencies").update({ fil_url: filUrl }).eq("id", data.id);
      }

      toast.success(t('resourceDialogs.addCompetency.added'));
      onOpenChange(false);
      setSelectedPersonId("");
      setSelectedType("Kurs");
      setNavnValue("");
      setFile(null);
      setDocumentUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onCompetencyAdded();
      e.currentTarget.reset();
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>
          <Button size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            {t('resourceDialogs.addCompetency.trigger')}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <span data-tour="add-competency-marker" className="hidden" /><DialogHeader>
            <DialogTitle>{t('resourceDialogs.addCompetency.title')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddCompetency} className="space-y-4 px-2">
            <div>
              <Label>{t('resourceDialogs.addCompetency.person')}</Label>
              <Popover open={personSearchOpen} onOpenChange={setPersonSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={personSearchOpen}
                    className="w-full justify-between"
                  >
                    {selectedPersonId
                      ? personnel.find((p) => p.id === selectedPersonId)?.full_name || t('resourceDialogs.addCompetency.selectPerson')
                      : t('resourceDialogs.addCompetency.selectPerson')}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0 z-[9999] bg-popover" align="start">
                  <Command className="bg-popover">
                    <CommandInput placeholder={t('resourceDialogs.addCompetency.searchPerson')} className="h-9" />
                    <CommandList>
                      <CommandEmpty>{t('resourceDialogs.addCompetency.noPersonFound')}</CommandEmpty>
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
                            {person.full_name || t('resourceDialogs.addCompetency.unknownName')}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label htmlFor="type">{t('resourceDialogs.addCompetency.type')}</Label>
              <Select name="type" value={selectedType} onValueChange={(v) => { setSelectedType(v); setNavnValue(""); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Kurs">{t('resourceDialogs.addCompetency.types.Kurs')}</SelectItem>
                  <SelectItem value="Sertifikat">{t('resourceDialogs.addCompetency.types.Sertifikat')}</SelectItem>
                  <SelectItem value="Lisens">{t('resourceDialogs.addCompetency.types.Lisens')}</SelectItem>
                  <SelectItem value="Utdanning">{t('resourceDialogs.addCompetency.types.Utdanning')}</SelectItem>
                  <SelectItem value="Godkjenning">{t('resourceDialogs.addCompetency.types.Godkjenning')}</SelectItem>
                  <SelectItem value="Kompetanse">{t('resourceDialogs.addCompetency.types.Kompetanse')}</SelectItem>
                  <SelectItem value="Annet">{t('resourceDialogs.addCompetency.types.Annet')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="navn">{t('resourceDialogs.addCompetency.name')}</Label>
              {selectedType === "Kurs" ? (
                <>
                  <Select
                    value={KURS_PRESETS.includes(navnValue) ? navnValue : (navnValue ? "__custom__" : "")}
                    onValueChange={(v) => setNavnValue(v === "__custom__" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('resourceDialogs.addCompetency.selectCourse')} />
                    </SelectTrigger>
                    <SelectContent>
                      {KURS_PRESETS.map((k) => (
                        <SelectItem key={k} value={k}>{k}</SelectItem>
                      ))}
                      <SelectItem value="__custom__">{t('resourceDialogs.addCompetency.customCourse')}</SelectItem>
                    </SelectContent>
                  </Select>
                  {!KURS_PRESETS.includes(navnValue) && (
                    <Input
                      id="navn"
                      name="navn"
                      className="mt-2"
                      placeholder={t('resourceDialogs.addCompetency.enterCourseName')}
                      value={navnValue}
                      onChange={(e) => setNavnValue(e.target.value)}
                      required
                    />
                  )}
                  {KURS_PRESETS.includes(navnValue) && (
                    <input type="hidden" name="navn" value={navnValue} />
                  )}
                </>
              ) : (
                <Input
                  id="navn"
                  name="navn"
                  value={navnValue}
                  onChange={(e) => setNavnValue(e.target.value)}
                  required
                />
              )}
            </div>
            <div>
              <Label htmlFor="beskrivelse">{t('resourceDialogs.addCompetency.description')}</Label>
              <Textarea id="beskrivelse" name="beskrivelse" />
            </div>
            <div>
              <Label htmlFor="utstedt_dato">{t('resourceDialogs.addCompetency.issuedDate')}</Label>
              <Input id="utstedt_dato" name="utstedt_dato" type="date" />
            </div>
            <div>
              <Label htmlFor="utloper_dato">{t('resourceDialogs.addCompetency.expiresDate')}</Label>
              <Input id="utloper_dato" name="utloper_dato" type="date" />
            </div>

            {/* File attachment section */}
            <div className="space-y-2">
              <Label className="text-xs">{t('resourceDialogs.addCompetency.attachment')}</Label>
              {(file || documentUrl) ? (
                <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/30">
                  <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-xs truncate flex-1">
                    {file ? file.name : t('resourceDialogs.addCompetency.docFromDocuments')}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => {
                      setFile(null);
                      setDocumentUrl(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5 shrink-0" />
                    {t('resourceDialogs.addCompetency.upload')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setDocPickerOpen(true)}
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                    {t('resourceDialogs.addCompetency.documents')}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      if (f) {
                        setFile(f);
                        setDocumentUrl(null);
                      }
                    }}
                  />
                </div>
              )}
            </div>

            <Button type="submit" className="w-full">{t('resourceDialogs.addCompetency.submit')}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <AttachmentPickerDialog
        open={docPickerOpen}
        onOpenChange={setDocPickerOpen}
        selectedDocumentIds={[]}
        onSelect={(docs) => {
          if (docs.length > 0 && docs[0].fil_url) {
            setDocumentUrl(docs[0].fil_url);
            setFile(null);
          }
        }}
      />
    </>
  );
};
