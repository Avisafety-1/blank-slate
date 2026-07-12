import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { useChecklists } from "@/hooks/useChecklists";
import { useEquipmentTypes } from "@/hooks/useEquipmentTypes";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface EquipmentDefaultValues {
  type?: string;
  serienummer?: string;
  internal_serial?: string;
  navn?: string;
  merknader?: string;
}

interface AddEquipmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEquipmentAdded: () => void;
  userId: string;
  defaultValues?: EquipmentDefaultValues;
  onEquipmentCreated?: (equipment: { id: string; navn: string; serienummer: string; type: string }) => void;
}

export const AddEquipmentDialog = ({ open, onOpenChange, onEquipmentAdded, userId, defaultValues, onEquipmentCreated }: AddEquipmentDialogProps) => {
  const { t } = useTranslation();
  const [companyId, setCompanyId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [vedlikeholdStartdato, setVedlikeholdStartdato] = useState<string>("");
  const [vedlikeholdsintervallDager, setVedlikeholdsintervallDager] = useState<string>("");
  const [nesteVedlikehold, setNesteVedlikehold] = useState<string>("");
  const [selectedChecklistId, setSelectedChecklistId] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string>("");
  const [customType, setCustomType] = useState<string>("");
  const [internalSerial, setInternalSerial] = useState<string>("");
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const { checklists } = useChecklists();
  const equipmentTypes = useEquipmentTypes(companyId, open);
  const selectableEquipmentTypes = useMemo(() => {
    const values = [...equipmentTypes];
    if (defaultValues?.type && !values.some((type) => type.toLowerCase() === defaultValues.type!.toLowerCase())) {
      values.unshift(defaultValues.type);
    }
    return values;
  }, [equipmentTypes, defaultValues?.type]);

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

  // Pre-populate from defaultValues when dialog opens
  useEffect(() => {
    if (open) {
      if (defaultValues?.type) {
        setSelectedType(defaultValues.type);
      }
      if (defaultValues?.internal_serial) {
        setInternalSerial(defaultValues.internal_serial);
      }
    } else {
      setSelectedType("");
      setCustomType("");
      setInternalSerial("");
    }
  }, [open, defaultValues]);

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
      toast.error(t('resourceDialogs.addEquipment.kunneIkkeHenteBruker'));
      setIsSubmitting(false);
      return;
    }

    const typeValue = selectedType === "__other__" ? customType.trim() : selectedType;
    if (!typeValue) {
      toast.error(t('resourceDialogs.addEquipment.maVelgeType'));
      setIsSubmitting(false);
      return;
    }
    
    try {
      const vektValue = formData.get("vekt") as string;
      const insertData = {
        user_id: userId,
        company_id: companyId,
        navn: formData.get("navn") as string,
        type: typeValue,
        serienummer: (formData.get("serienummer") as string) || '',
        internal_serial: internalSerial || null,
        status: (formData.get("status") as string) || "Grønn",
        merknader: (formData.get("merknader") as string) || null,
        sist_vedlikeholdt: (formData.get("sist_vedlikeholdt") as string) || null,
        neste_vedlikehold: nesteVedlikehold || null,
        flyvetimer: parseFloat(formData.get("flyvetimer") as string) || 0,
        vekt: vektValue ? parseFloat(vektValue) : null,
        vedlikeholdsintervall_dager: vedlikeholdsintervallDager ? parseInt(vedlikeholdsintervallDager) : null,
        vedlikehold_startdato: vedlikeholdStartdato || null,
        sjekkliste_id: selectedChecklistId && selectedChecklistId !== "none" ? selectedChecklistId : null,
        inspection_interval_hours: (formData.get("inspection_interval_hours") as string) ? parseFloat(formData.get("inspection_interval_hours") as string) : null,
        inspection_interval_missions: (formData.get("inspection_interval_missions") as string) ? parseInt(formData.get("inspection_interval_missions") as string) : null,
        varsel_timer: (formData.get("varsel_timer") as string) ? parseFloat(formData.get("varsel_timer") as string) : null,
        varsel_oppdrag: (formData.get("varsel_oppdrag") as string) ? parseInt(formData.get("varsel_oppdrag") as string) : null,
      };
      const { data: insertedData, error } = await (supabase as any).from("equipment").insert([insertData]).select('id, navn, serienummer, type').single();

      if (error) {
        console.error("Error adding equipment:", error);
        if (error.code === "42501" || error.message?.includes("policy")) {
          toast.error(t('resourceDialogs.addEquipment.ikkeTillatelse'));
        } else {
          toast.error(t('resourceDialogs.addEquipment.kunneIkkeLeggeTil', { message: error.message || t('resourceDialogs.addEquipment.ukjentFeil') }));
        }
      } else {
        toast.success(t('resourceDialogs.addEquipment.utstyrLagtTil'));
        if (insertedData && onEquipmentCreated) {
          onEquipmentCreated(insertedData);
        }
        form.reset();
        setVedlikeholdStartdato("");
        setVedlikeholdsintervallDager("");
        setNesteVedlikehold("");
        setSelectedChecklistId("");
        setSelectedType("");
        setCustomType("");
        setInternalSerial("");
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
        <span data-tour="add-equipment-marker" className="hidden" /><DialogHeader>
          <DialogTitle>{t('resourceDialogs.addEquipment.title')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleAddEquipment} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="navn">{t('resourceDialogs.addEquipment.navn')}</Label>
              <Input id="navn" name="navn" required defaultValue={defaultValues?.navn || ""} />
            </div>
            <div>
              <Label htmlFor="type">{t('resourceDialogs.addEquipment.type')}</Label>
              <Select value={selectedType} onValueChange={(val) => { setSelectedType(val); if (val !== "__other__") setCustomType(""); }}>
                <SelectTrigger>
                  <SelectValue placeholder={t('resourceDialogs.addEquipment.velgType')} />
                </SelectTrigger>
                <SelectContent>
                  {selectableEquipmentTypes.map((tp) => (
                    <SelectItem key={tp} value={tp}>{tp}</SelectItem>
                  ))}
                  <SelectItem value="__other__">{t('resourceDialogs.addEquipment.annet')}</SelectItem>
                </SelectContent>
              </Select>
              {selectedType === "__other__" && (
                <Input
                  className="mt-2"
                  placeholder={t('resourceDialogs.addEquipment.skrivInnNyType')}
                  value={customType}
                  onChange={(e) => setCustomType(e.target.value)}
                  required
                />
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="serienummer">{t('resourceDialogs.addEquipment.serienummer')}</Label>
              <Input id="serienummer" name="serienummer" defaultValue={defaultValues?.serienummer || ""} />
            </div>
            <div>
              <Label htmlFor="internal_serial">{t('resourceDialogs.addEquipment.internalSerial')}</Label>
              <Input 
                id="internal_serial" 
                value={internalSerial}
                onChange={(e) => setInternalSerial(e.target.value)}
                placeholder={t('resourceDialogs.addEquipment.valgfritt')}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="vekt">{t('resourceDialogs.addEquipment.vekt')}</Label>
              <Input id="vekt" name="vekt" type="number" step="0.01" min="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="status">{t('resourceDialogs.addEquipment.status')}</Label>
              <Select name="status" defaultValue="Grønn">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Grønn">{t('resourceDialogs.addEquipment.green')}</SelectItem>
                  <SelectItem value="Gul">{t('resourceDialogs.addEquipment.yellow')}</SelectItem>
                  <SelectItem value="Rød">{t('resourceDialogs.addEquipment.red')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="flyvetimer">{t('resourceDialogs.addEquipment.flyvetimer')}</Label>
              <Input id="flyvetimer" name="flyvetimer" type="number" step="0.01" min="0" defaultValue="0" />
            </div>
          </div>

          {/* Collapsible maintenance settings */}
          <Collapsible open={maintenanceOpen} onOpenChange={setMaintenanceOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 w-full border-t border-border pt-3">
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${maintenanceOpen ? 'rotate-180' : ''}`} />
              <span className="text-sm font-medium">{t('resourceDialogs.addEquipment.vedlikeholdsintervall')}</span>
            </CollapsibleTrigger>
            <p className="text-xs text-muted-foreground mt-1 ml-6">{t('resourceDialogs.addEquipment.vedlikeholdHint')}</p>
            <CollapsibleContent className="space-y-4 pt-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="vedlikehold_startdato">{t('resourceDialogs.addEquipment.startdato')}</Label>
                  <Input 
                    id="vedlikehold_startdato" 
                    name="vedlikehold_startdato" 
                    type="date" 
                    value={vedlikeholdStartdato}
                    onChange={(e) => setVedlikeholdStartdato(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="vedlikeholdsintervall_dager">{t('resourceDialogs.addEquipment.intervallDager')}</Label>
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
                <p className="text-xs text-muted-foreground">
                  {t('resourceDialogs.addEquipment.nesteVedlikehold', { date: format(new Date(nesteVedlikehold), "dd.MM.yyyy") })}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="inspection_interval_hours">{t('resourceDialogs.addEquipment.intervallTimer')}</Label>
                  <Input id="inspection_interval_hours" name="inspection_interval_hours" type="number" step="0.1" min="0" placeholder={t('resourceDialogs.addEquipment.intervallTimerPlaceholder')} />
                </div>
                <div>
                  <Label htmlFor="inspection_interval_missions">{t('resourceDialogs.addEquipment.intervallOppdrag')}</Label>
                  <Input id="inspection_interval_missions" name="inspection_interval_missions" type="number" min="1" placeholder={t('resourceDialogs.addEquipment.intervallOppdragPlaceholder')} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="varsel_timer">{t('resourceDialogs.addEquipment.varselTimer')}</Label>
                  <Input id="varsel_timer" name="varsel_timer" type="number" step="0.1" min="0" placeholder={t('resourceDialogs.addEquipment.varselTimerPlaceholder')} />
                </div>
                <div>
                  <Label htmlFor="varsel_oppdrag">{t('resourceDialogs.addEquipment.varselOppdrag')}</Label>
                  <Input id="varsel_oppdrag" name="varsel_oppdrag" type="number" min="1" placeholder={t('resourceDialogs.addEquipment.varselOppdragPlaceholder')} />
                </div>
              </div>

              <div>
                <Label htmlFor="sist_vedlikeholdt">{t('resourceDialogs.addEquipment.sistVedlikeholdt')}</Label>
                <Input id="sist_vedlikeholdt" name="sist_vedlikeholdt" type="date" />
              </div>

              {/* Checklist selection */}
              {checklists.length > 0 && (
                <div>
                  <Label htmlFor="sjekkliste">{t('resourceDialogs.addEquipment.sjekklisteVedlikehold')}</Label>
                  <Select value={selectedChecklistId} onValueChange={setSelectedChecklistId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('resourceDialogs.addEquipment.velgSjekkliste')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('resourceDialogs.addEquipment.ingenSjekkliste')}</SelectItem>
                      {checklists.map((checklist) => (
                        <SelectItem key={checklist.id} value={checklist.id}>
                          {checklist.tittel}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('resourceDialogs.addEquipment.sjekklisteHint')}
                  </p>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          <div>
            <Label htmlFor="merknader">{t('resourceDialogs.addEquipment.merknader')}</Label>
            <Textarea id="merknader" name="merknader" defaultValue={defaultValues?.merknader || ""} />
          </div>
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? t('resourceDialogs.addEquipment.leggerTil') : t('resourceDialogs.addEquipment.leggTil')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
