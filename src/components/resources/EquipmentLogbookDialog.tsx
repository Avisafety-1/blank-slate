import { useNavigate } from "react-router-dom";
import { isBatteryType } from "@/config/equipmentCategories";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/contexts/AuthContext";
import { 
  Book, 
  Plane, 
  PackagePlus, 
  PackageMinus, 
  Edit, 
  Plus, 
  User,
  Trash2,
  FileText,
  Wrench,
  ImagePlus,
  X,
  ZoomIn,
  Battery,
  Heart,
  TrendingDown,
  Calendar,
  Thermometer,
  Zap,
  AlertTriangle,
  Pencil,
  Loader2,
  Settings2,
} from "lucide-react";
import { useRoleCheck } from "@/hooks/useRoleCheck";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import autoTable from "jspdf-autotable";
import { createPdfDocument, sanitizeForPdf, sanitizeFilenameForPdf, formatDateForPdf, addSignatureToPdf, getPdfFontName } from "@/lib/pdfUtils";
import { BatteryHealthSettingsDialog } from "@/components/resources/BatteryHealthSettingsDialog";
import {
  computeBatteryHealth,
  batteryHealthLevel,
  cellDeviationLevel,
  levelColorClass,
} from "@/lib/batteryHealth";
import { useBatteryHealth, type BatteryTrendEntry } from "@/hooks/useBatteryHealth";

interface EquipmentLogbookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipmentId: string;
  equipmentNavn: string;
  flyvetimer: number;
  equipmentType?: string;
  equipmentSerienummer?: string;
}

interface LogEntry {
  id: string;
  type: 'flight' | 'drone_added' | 'drone_removed' | 'manual';
  date: Date;
  title: string;
  description?: string;
  userName?: string;
  icon: React.ReactNode;
  badgeColor: string;
  badgeText: string;
  imageUrl?: string;
  incidentId?: string;
  manualEntryId?: string;
  rawEntry?: { entry_type: string | null; title: string; description: string | null; entry_date: string };
}

export const EquipmentLogbookDialog = ({ 
  open, 
  onOpenChange, 
  equipmentId, 
  equipmentNavn,
  flyvetimer,
  equipmentType,
  equipmentSerienummer,
}: EquipmentLogbookDialogProps) => {
  const { user, companyId } = useAuth();
  const { isAdmin } = useRoleCheck();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [allLogs, setAllLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [batterySettingsOpen, setBatterySettingsOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; logId: string | null }>({ open: false, logId: null });
  const [newEntry, setNewEntry] = useState({
    entry_type: "merknad",
    title: "",
    description: "",
    entry_date: new Date().toISOString().split('T')[0],
  });

  const isBattery = isBatteryType(equipmentType);

  // Shared battery-health logic — same source as the equipment detail card.
  const {
    trend: batteryTrend,
    config: batteryConfig,
    suggestion: batterySuggestion,
    reload: reloadBatteryHealth,
  } = useBatteryHealth(equipmentId, equipmentSerienummer, companyId, open && isBattery);

  useEffect(() => {
    if (open && equipmentId) {
      fetchAllLogs();
      fetchSignature();
    }
  }, [open, equipmentId]);

  const fetchSignature = async () => {
    if (!user) return;
    const { data } = await (supabase as any)
      .from("profiles")
      .select("signature_url")
      .eq("id", user.id)
      .single();
    setSignatureUrl(data?.signature_url || null);
  };




  const fetchAllLogs = async () => {
    setIsLoading(true);
    try {
      const logs: LogEntry[] = [];

      // Fetch flight logs where this equipment was used
      const { data: flightLogEquipment } = await supabase
        .from("flight_log_equipment")
        .select("flight_log_id")
        .eq("equipment_id", equipmentId);

      if (flightLogEquipment && flightLogEquipment.length > 0) {
        const flightLogIds = flightLogEquipment.map(f => f.flight_log_id);
        
        const { data: flightLogs } = await supabase
          .from("flight_logs")
          .select(`id, flight_date, flight_duration_minutes, departure_location, landing_location, notes, movements, user_id`)
          .in("id", flightLogIds)
          .order("flight_date", { ascending: false });

        if (flightLogs) {
          const { data: pilotLinks } = await (supabase as any)
            .from("flight_log_personnel")
            .select("flight_log_id, profile_id")
            .in("flight_log_id", flightLogIds);

          const pilotByLogId = new Map<string, string>();
          (pilotLinks || []).forEach((p: any) => {
            if (!pilotByLogId.has(p.flight_log_id)) pilotByLogId.set(p.flight_log_id, p.profile_id);
          });

          const allUserIds = new Set<string>();
          flightLogs.forEach(f => { if (f.user_id) allUserIds.add(f.user_id); });
          pilotByLogId.forEach(pid => allUserIds.add(pid));

          const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", Array.from(allUserIds));
          const userMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

          flightLogs.forEach(log => {
            logs.push({
              id: `flight-${log.id}`,
              type: 'flight',
              date: new Date(log.flight_date),
              title: t('resourceDialogs.equipmentLogbook.logTitles.flight', { from: log.departure_location, to: log.landing_location }),
              description: log.notes
                ? t('resourceDialogs.equipmentLogbook.logTitles.flightDescriptionWithNotes', { minutes: log.flight_duration_minutes, movements: log.movements, notes: log.notes })
                : t('resourceDialogs.equipmentLogbook.logTitles.flightDescription', { minutes: log.flight_duration_minutes, movements: log.movements }),
              userName: userMap.get(pilotByLogId.get(log.id) || log.user_id) || t('resourceDialogs.equipmentLogbook.unknownUser'),
              icon: <Plane className="w-4 h-4" />,
              badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
              badgeText: t('resourceDialogs.equipmentLogbook.badges.flight'),
            });
          });

        }
      }

      // Fetch drone assignment history
      const { data: droneHistory } = await supabase
        .from("drone_equipment_history")
        .select("id, action, item_name, created_at, user_id, drone_id")
        .eq("item_id", equipmentId)
        .eq("item_type", "equipment")
        .order("created_at", { ascending: false });

      if (droneHistory) {
        const userIds = [...new Set(droneHistory.map(e => e.user_id))];
        const droneIds = [...new Set(droneHistory.map(e => e.drone_id))];
        
        const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
        const { data: drones } = await supabase.from("drones").select("id, modell").in("id", droneIds);
        
        const userMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);
        const droneMap = new Map(drones?.map(d => [d.id, d.modell]) || []);

        droneHistory.forEach(entry => {
          const isAdded = entry.action === 'added';
          const droneName = droneMap.get(entry.drone_id) || t('resourceDialogs.equipmentLogbook.unknownDrone');
          logs.push({
            id: `drone-${entry.id}`,
            type: isAdded ? 'drone_added' : 'drone_removed',
            date: new Date(entry.created_at),
            title: isAdded
              ? t('resourceDialogs.equipmentLogbook.logTitles.droneAdded', { drone: droneName })
              : t('resourceDialogs.equipmentLogbook.logTitles.droneRemoved', { drone: droneName }),
            description: t('resourceDialogs.equipmentLogbook.logTitles.droneConnection'),
            userName: userMap.get(entry.user_id) || t('resourceDialogs.equipmentLogbook.unknownUser'),
            icon: isAdded ? <PackagePlus className="w-4 h-4" /> : <PackageMinus className="w-4 h-4" />,
            badgeColor: isAdded 
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
              : 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
            badgeText: isAdded ? t('resourceDialogs.equipmentLogbook.badges.added') : t('resourceDialogs.equipmentLogbook.badges.removed'),
          });
        });

      }

      // Fetch manual entries (with image_url)
      const { data: manualEntries } = await (supabase as any)
        .from("equipment_log_entries")
        .select("id, entry_date, entry_type, title, description, user_id, image_url")
        .eq("equipment_id", equipmentId)
        .order("entry_date", { ascending: false });

      if (manualEntries) {
        const allUserIds: string[] = (manualEntries as any[]).map((e) => e.user_id as string);
        const userIds = [...new Set(allUserIds)];
        const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
        const userMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

        for (const entry of manualEntries as any[]) {
          const isVedlikehold = entry.entry_type === 'vedlikehold';
          let imagePublicUrl: string | undefined;
          if (entry.image_url) {
            const { data } = await supabase.storage.from("logbook-images").createSignedUrl(entry.image_url, 3600);
            imagePublicUrl = data?.signedUrl || undefined;
          }
          const isHendelse = entry.entry_type === 'hendelse';
          const incidentIdMatch = entry.description?.match(/^incident_id:(.+)$/);
          logs.push({
            id: `manual-${entry.id}`,
            type: 'manual',
            date: new Date(entry.entry_date),
            title: entry.title,
            description: incidentIdMatch ? undefined : (entry.description || undefined),
            userName: userMap.get(entry.user_id) || t('resourceDialogs.equipmentLogbook.unknownUser'),
            icon: isHendelse ? <AlertTriangle className="w-4 h-4" /> : (isVedlikehold ? <Wrench className="w-4 h-4" /> : <Edit className="w-4 h-4" />),
            badgeColor: isHendelse
              ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
              : (isVedlikehold
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                : 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'),
            badgeText: entry.entry_type
              ? t(`resourceDialogs.equipmentLogbook.entryTypes.${entry.entry_type}`, { defaultValue: entry.entry_type })
              : t('resourceDialogs.equipmentLogbook.badges.note'),

            imageUrl: imagePublicUrl,
            incidentId: incidentIdMatch?.[1] || undefined,
            manualEntryId: entry.id,
            rawEntry: { entry_type: entry.entry_type, title: entry.title, description: entry.description, entry_date: entry.entry_date },
          });
        }
      }

      logs.sort((a, b) => b.date.getTime() - a.date.getTime());
      setAllLogs(logs);
    } catch (error) {
      console.error("Error fetching logs:", error);
      toast.error(t('resourceDialogs.equipmentLogbook.toasts.fetchError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t('resourceDialogs.equipmentLogbook.toasts.imageTooLarge'));
      return;
    }
    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleAddEntry = async () => {
    if (!user || !companyId || !newEntry.title.trim()) {
      toast.error(t('resourceDialogs.equipmentLogbook.toasts.titleRequired'));
      return;
    }
    setIsSaving(true);
    try {
      let entryId = editingEntryId;
      if (editingEntryId) {
        const { error } = await (supabase as any)
          .from("equipment_log_entries")
          .update({
            entry_date: newEntry.entry_date,
            entry_type: newEntry.entry_type,
            title: newEntry.title.trim(),
            description: newEntry.description.trim() || null,
          })
          .eq("id", editingEntryId);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await (supabase as any)
          .from("equipment_log_entries")
          .insert({
            equipment_id: equipmentId,
            company_id: companyId,
            user_id: user.id,
            entry_date: newEntry.entry_date,
            entry_type: newEntry.entry_type,
            title: newEntry.title.trim(),
            description: newEntry.description.trim() || null,
          })
          .select("id")
          .single();
        if (error) throw error;
        entryId = inserted?.id;
      }

      if (imageFile && entryId) {
        const ext = imageFile.name.split('.').pop();
        const filePath = `${companyId}/equipment-${entryId}-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("logbook-images")
          .upload(filePath, imageFile, { contentType: imageFile.type });
        
        if (uploadError) {
          toast.error(t('resourceDialogs.equipmentLogbook.toasts.imageUploadError'));
        } else {
          await (supabase as any)
            .from("equipment_log_entries")
            .update({ image_url: filePath })
            .eq("id", entryId);
        }
      }

      toast.success(editingEntryId ? t('resourceDialogs.equipmentLogbook.toasts.entryUpdated') : t('resourceDialogs.equipmentLogbook.toasts.entryAdded'));
      setNewEntry({ entry_type: "merknad", title: "", description: "", entry_date: new Date().toISOString().split('T')[0] });
      clearImage();
      setShowAddEntry(false);
      setEditingEntryId(null);
      fetchAllLogs();
    } catch (error: any) {
      console.error("Error saving entry:", error);
      toast.error(t('resourceDialogs.equipmentLogbook.toasts.saveError', { message: error.message }));
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditManualEntry = (log: LogEntry) => {
    if (!log.manualEntryId || !log.rawEntry) return;
    setEditingEntryId(log.manualEntryId);
    setNewEntry({
      entry_type: log.rawEntry.entry_type || "merknad",
      title: log.rawEntry.title,
      description: log.rawEntry.description || "",
      entry_date: log.rawEntry.entry_date.split('T')[0],
    });
    clearImage();
    setShowAddEntry(true);
  };

  const handleDeleteEntry = async (logId: string) => {
    const parts = logId.split('-');
    const type = parts[0];
    const id = parts.slice(1).join('-');
    if (type !== 'manual') return;

    try {
      const { error } = await supabase
        .from("equipment_log_entries")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success(t('resourceDialogs.equipmentLogbook.toasts.entryDeleted'));
      fetchAllLogs();
    } catch (error: any) {
      toast.error(t('resourceDialogs.equipmentLogbook.toasts.deleteError', { message: error.message }));

    }
  };

  const handleExportPDF = async () => {
    if (!user || !companyId) {
      toast.error(t('resourceDialogs.equipmentLogbook.toasts.loginRequired'));
      return;
    }

    setExporting(true);
    try {
      const pdf = await createPdfDocument();
      const dateStr = format(new Date(), 'dd.MM.yyyy');
      const timeStr = format(new Date(), 'HH:mm');
      
      pdf.setFontSize(18);
      pdf.text(sanitizeForPdf(t('resourceDialogs.equipmentLogbook.pdf.title', { name: equipmentNavn })), 14, 20);
      pdf.setFontSize(11);
      pdf.text(sanitizeForPdf(t('resourceDialogs.equipmentLogbook.pdf.totalHours', { hours: Number(flyvetimer).toFixed(2) })), 14, 28);
      pdf.text(sanitizeForPdf(t('resourceDialogs.equipmentLogbook.pdf.exportedAt', { date: dateStr, time: timeStr })), 14, 35);
      
      if (allLogs.length === 0) {
        pdf.setFontSize(10);
        pdf.text(sanitizeForPdf(t('resourceDialogs.equipmentLogbook.pdf.noEntries')), 14, 55);
      } else {
        const tableData = allLogs.map(log => [
          formatDateForPdf(log.date, 'dd.MM.yyyy HH:mm'),
          sanitizeForPdf(log.badgeText),
          sanitizeForPdf(log.title),
          sanitizeForPdf(log.description) || '',
          sanitizeForPdf(log.userName) || t('resourceDialogs.equipmentLogbook.unknownUser'),
        ]);

        autoTable(pdf, {
          startY: 45,
          head: [[
            t('resourceDialogs.equipmentLogbook.pdf.columns.date'),
            t('resourceDialogs.equipmentLogbook.pdf.columns.type'),
            t('resourceDialogs.equipmentLogbook.pdf.columns.title'),
            t('resourceDialogs.equipmentLogbook.pdf.columns.description'),
            t('resourceDialogs.equipmentLogbook.pdf.columns.user'),
          ]],
          body: tableData,
          styles: { fontSize: 8, cellPadding: 2, font: getPdfFontName() },
          headStyles: { fillColor: [59, 130, 246], font: getPdfFontName() },
          columnStyles: {
            0: { cellWidth: 30 },
            1: { cellWidth: 25 },
            2: { cellWidth: 45 },
            3: { cellWidth: 55 },
            4: { cellWidth: 30 },
          },
        });
      }


      if (signatureUrl) {
        const finalY = allLogs.length > 0 ? ((pdf as any).lastAutoTable?.finalY || 150) : 70;
        await addSignatureToPdf(pdf, signatureUrl, finalY + 20, t('resourceDialogs.equipmentLogbook.pdf.signatureLabel'));
      }

      const pdfBlob = pdf.output('blob');
      const safeName = sanitizeFilenameForPdf(equipmentNavn);
      const fileName = `${t('resourceDialogs.equipmentLogbook.pdf.fileName')}-${safeName}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      const filePath = `${companyId}/${user.id}/${Date.now()}-${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, pdfBlob, { contentType: 'application/pdf' });

      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from('documents').insert({
        tittel: sanitizeForPdf(t('resourceDialogs.equipmentLogbook.pdf.documentTitle', { name: equipmentNavn, date: dateStr })),
        kategori: 'loggbok',
        fil_url: filePath,
        fil_navn: fileName,
        fil_storrelse: pdfBlob.size,
        company_id: companyId,
        user_id: user.id,
      });

      if (insertError) throw insertError;
      toast.success(t('resourceDialogs.equipmentLogbook.toasts.exportSuccess'));
    } catch (error: any) {
      console.error('Error exporting PDF:', error);
      toast.error(t('resourceDialogs.equipmentLogbook.toasts.exportError', { message: error.message }));
    } finally {
      setExporting(false);
    }
  };


  const filteredLogs = activeTab === 'all' 
    ? allLogs 
    : allLogs.filter(log => {
        switch (activeTab) {
          case 'flights': return log.type === 'flight';
          case 'drones': return log.type === 'drone_added' || log.type === 'drone_removed';
          case 'manual': return log.type === 'manual';
          default: return true;
        }
      });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          <span data-tour="equipment-logbook-add" className="hidden" /><DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Book className="w-5 h-5 text-primary shrink-0" />
              <span className="break-words hyphens-auto">{t('resourceDialogs.equipmentLogbook.title', { name: equipmentNavn })}</span>
            </DialogTitle>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {t('resourceDialogs.equipmentLogbook.totalHours', { hours: Number(flyvetimer).toFixed(2) })}
              </p>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowAddEntry(!showAddEntry)}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  {t('resourceDialogs.equipmentLogbook.addEntry')}
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleExportPDF}
                  disabled={exporting}
                >
                  {exporting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />}
                  {exporting ? t('resourceDialogs.equipmentLogbook.exporting') : t('resourceDialogs.equipmentLogbook.exportPdf')}
                </Button>
              </div>
            </div>
          </DialogHeader>


          <Tabs value={activeTab} onValueChange={setActiveTab} className={cn("flex-1 flex flex-col min-h-0", showAddEntry && "hidden sm:flex")}>
            <TabsList className="flex w-full overflow-x-auto no-scrollbar mb-2">
              <TabsTrigger value="all" className="flex-1 min-w-[50px] text-xs sm:text-sm">{t('resourceDialogs.equipmentLogbook.tabs.all')}</TabsTrigger>
              <TabsTrigger value="flights" className="flex-1 min-w-[50px] text-xs sm:text-sm">{t('resourceDialogs.equipmentLogbook.tabs.flights')}</TabsTrigger>
              <TabsTrigger value="drones" className="flex-1 min-w-[50px] text-xs sm:text-sm">{t('resourceDialogs.equipmentLogbook.tabs.drones')}</TabsTrigger>
              <TabsTrigger value="manual" className="flex-1 min-w-[50px] text-xs sm:text-sm">{t('resourceDialogs.equipmentLogbook.tabs.manual')}</TabsTrigger>
              {isBattery && <TabsTrigger value="battery" className="flex-1 min-w-[50px] text-xs sm:text-sm"><span className="sm:hidden">{t('resourceDialogs.equipmentLogbook.tabs.batteryShort')}</span><span className="hidden sm:inline">{t('resourceDialogs.equipmentLogbook.tabs.battery')}</span></TabsTrigger>}
            </TabsList>


            {showAddEntry && (
              <div className="border rounded-lg p-3 sm:p-4 space-y-3 bg-muted/30 mb-3 max-h-[60vh] overflow-y-auto">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs sm:text-sm">{t('resourceDialogs.equipmentLogbook.type')}</Label>
                      <Select 
                        value={newEntry.entry_type} 
                        onValueChange={(v) => setNewEntry(prev => ({ ...prev, entry_type: v }))}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="merknad">{t('resourceDialogs.equipmentLogbook.entryTypes.merknad')}</SelectItem>
                          <SelectItem value="hendelse">{t('resourceDialogs.equipmentLogbook.entryTypes.hendelse')}</SelectItem>
                          <SelectItem value="reparasjon">{t('resourceDialogs.equipmentLogbook.entryTypes.reparasjon')}</SelectItem>
                          <SelectItem value="vedlikehold">{t('resourceDialogs.equipmentLogbook.entryTypes.vedlikehold')}</SelectItem>
                          <SelectItem value="annet">{t('resourceDialogs.equipmentLogbook.entryTypes.annet')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs sm:text-sm">{t('resourceDialogs.equipmentLogbook.date')}</Label>
                      <Input
                        type="date"
                        className="h-9"
                        value={newEntry.entry_date}
                        onChange={(e) => setNewEntry(prev => ({ ...prev, entry_date: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>{t('resourceDialogs.equipmentLogbook.titleField')}</Label>
                    <Input
                      value={newEntry.title}
                      onChange={(e) => setNewEntry(prev => ({ ...prev, title: e.target.value }))}
                      placeholder={t('resourceDialogs.equipmentLogbook.titlePlaceholder')}
                    />
                  </div>
                  <div>
                    <Label>{t('resourceDialogs.equipmentLogbook.description')}</Label>
                    <Textarea
                      value={newEntry.description}
                      onChange={(e) => setNewEntry(prev => ({ ...prev, description: e.target.value }))}
                      placeholder={t('resourceDialogs.equipmentLogbook.descriptionPlaceholder')}
                      rows={2}
                    />
                  </div>
                  {/* Image upload */}
                  <div>
                    <Label className="text-xs sm:text-sm">{t('resourceDialogs.equipmentLogbook.image')}</Label>
                    {imagePreviewUrl ? (
                      <div className="relative inline-block mt-1">
                        <img
                          src={imagePreviewUrl}
                          alt={t('resourceDialogs.equipmentLogbook.imagePreviewAlt')}
                          className="h-20 sm:h-24 w-auto rounded-md border object-cover"
                        />
                        <button
                          type="button"
                          onClick={clearImage}
                          className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="mt-1 flex items-center gap-2 px-3 py-2 border border-dashed rounded-md text-sm text-muted-foreground hover:text-foreground hover:border-foreground transition-colors w-full"
                      >
                        <ImagePlus className="w-4 h-4" />
                        {t('resourceDialogs.equipmentLogbook.uploadImage')}
                      </button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageSelect}
                    />
                  </div>
                  <div className="flex gap-2 sticky bottom-0 bg-muted/30 pt-2 -mx-3 sm:-mx-4 px-3 sm:px-4 pb-1">
                    <Button size="sm" onClick={handleAddEntry} disabled={isSaving}>
                      {isSaving ? t('resourceDialogs.equipmentLogbook.saving') : t('resourceDialogs.equipmentLogbook.save')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setShowAddEntry(false); clearImage(); }}>{t('resourceDialogs.equipmentLogbook.cancel')}</Button>
                  </div>
                </div>

            )}

            {activeTab !== 'battery' && (
            <TabsContent value={activeTab} className="flex-1 min-h-0 mt-0 overflow-y-auto">
              <div className="overflow-y-auto flex-1 min-h-0 pr-2 sm:pr-4">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    {t('resourceDialogs.equipmentLogbook.loading')}
                  </div>
                ) : filteredLogs.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    {t('resourceDialogs.equipmentLogbook.noEntries')}

                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredLogs.map((log) => (
                      <div 
                        key={log.id} 
                        className="border rounded-lg p-2 sm:p-3 bg-card hover:bg-accent/50 transition-colors overflow-hidden"
                      >
                        <div className="flex items-start gap-2 min-w-0">
                          <div className="text-muted-foreground mt-0.5 shrink-0">
                            {log.icon}
                          </div>
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <div className="flex items-start justify-between gap-1">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <Badge className={`${log.badgeColor} text-[10px] sm:text-xs shrink-0`}>
                                    {log.badgeText}
                                  </Badge>
                                </div>
                                <p className="font-medium text-xs sm:text-sm mt-1 break-words">
                                  {log.title}
                                </p>
                              </div>
                              {log.type === 'manual' && !log.incidentId && log.badgeText !== 'hendelse' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground hover:text-destructive shrink-0"
                                  onClick={() => setDeleteConfirm({ open: true, logId: log.id })}
                                >
                                  <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                </Button>
                              )}
                              {log.incidentId && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground hover:text-primary shrink-0"
                                  title={t('resourceDialogs.equipmentLogbook.openIncident')}
                                  onClick={() => {
                                    onOpenChange(false);
                                    navigate('/hendelser', { state: { openIncidentId: log.incidentId } });
                                  }}
                                >
                                  <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                </Button>
                              )}
                            </div>
                            {log.description && (
                              <p className="text-xs sm:text-sm text-muted-foreground mt-1 line-clamp-2 break-words">
                                {log.description}
                              </p>
                            )}
                            {log.imageUrl && (
                              <button
                                type="button"
                                onClick={() => setLightboxUrl(log.imageUrl!)}
                                className="mt-2 relative group"
                              >
                                <img
                                  src={log.imageUrl}
                                  alt={t('resourceDialogs.equipmentLogbook.attachmentAlt')}
                                  className="h-16 w-auto rounded-md border object-cover max-w-[120px]"
                                />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 rounded-md transition-opacity">
                                  <ZoomIn className="w-4 h-4 text-white" />
                                </div>
                              </button>
                            )}
                            <div className="flex items-center gap-2 mt-1.5 text-[10px] sm:text-xs text-muted-foreground">
                              <span className="flex items-center gap-1 shrink-0">
                                <Calendar className="w-3 h-3" />
                                <span className="sm:hidden">{format(log.date, 'dd.MM.yy', { locale: nb })}</span>
                                <span className="hidden sm:inline">{format(log.date, 'dd.MM.yyyy', { locale: nb })}</span>
                              </span>
                              <span className="flex items-center gap-1 min-w-0">
                                <User className="w-3 h-3 shrink-0" />
                                <span className="truncate">{log.userName}</span>
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
            )}

            {isBattery && (
              <TabsContent value="battery" className="flex-1 min-h-0 mt-2">
                <ScrollArea className="h-[calc(60vh-200px)] sm:h-[400px] min-h-[200px] max-h-[400px] pr-2 sm:pr-4">
                  {batteryTrend.length === 0 ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <div className="text-center space-y-2">
                        <Battery className="w-8 h-8 mx-auto opacity-50" />
                        <p>{t('resourceDialogs.equipmentLogbook.battery.empty')}</p>
                        <p className="text-xs">{t('resourceDialogs.equipmentLogbook.battery.emptyHint')}</p>

                      </div>
                    </div>
                  ) : (() => {
                    const latest = batteryTrend[batteryTrend.length - 1];
                    const first = batteryTrend[0];
                    const latestTempMax = latest?.tempMax;
                    const latestVoltageMin = latest?.voltageMin;
                    const latestCapacity = latest?.capacityMah;
                    const latestCellDev = latest?.cellDeviation;
                    const cellDevColor = levelColorClass(cellDeviationLevel(latestCellDev, batteryConfig));
                    const firstCapacity = first?.capacityMah;

                    const computeHealth = (e?: BatteryTrendEntry) =>
                      computeBatteryHealth(
                        { capacityMah: e?.capacityMah ?? null, cycles: e?.cycles ?? null, djiHealthPct: e?.health ?? null },
                        batteryConfig,
                      ).value;
                    const latestHealthValue = computeHealth(latest);
                    const firstHealthValue = computeHealth(first);
                    const healthColor = levelColorClass(batteryHealthLevel(latestHealthValue, batteryConfig));
                    const tempColor = latestTempMax == null ? '' : latestTempMax > 50 ? 'text-destructive' : latestTempMax > 40 ? 'text-yellow-600 dark:text-yellow-400' : 'text-emerald-600 dark:text-emerald-400';
                    const voltageColor = latestVoltageMin == null ? '' : latestVoltageMin < 3.0 ? 'text-destructive' : latestVoltageMin < 3.3 ? 'text-yellow-600 dark:text-yellow-400' : 'text-emerald-600 dark:text-emerald-400';

                    return (
                      <div className="space-y-4">
                        {/* Summary cards - 4 cols on desktop, 2 on mobile */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                          <div className="border rounded-lg p-3 bg-card">
                            <p className="text-xs text-muted-foreground flex items-center gap-1"><TrendingDown className="w-3 h-3" /> {t('resourceDialogs.equipmentLogbook.battery.cycles')}</p>
                            <p className="text-lg font-bold">
                              {latest?.cycles ?? '—'}
                              {batteryConfig.maxCycles ? <span className="text-xs font-normal text-muted-foreground"> / {batteryConfig.maxCycles}</span> : null}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {first?.cycles ?? '?'} → {latest?.cycles ?? '?'}
                            </p>
                          </div>
                          <div className="border rounded-lg p-3 bg-card">
                            <div className="flex items-start justify-between gap-1">
                              <p className="text-xs text-muted-foreground flex items-center gap-1"><Heart className="w-3 h-3" /> {t('resourceDialogs.equipmentLogbook.battery.health')}</p>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 -mt-1 -mr-1 shrink-0"
                                onClick={() => setBatterySettingsOpen(true)}
                                aria-label={t('resourceDialogs.batteryHealthSettings.title')}
                                title={t('resourceDialogs.batteryHealthSettings.title')}
                              >
                                <Settings2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                            <p className={`text-lg font-bold ${healthColor}`}>
                              {latestHealthValue != null ? `${latestHealthValue}%` : '—'}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {latestHealthValue == null
                                ? t('resourceDialogs.equipmentLogbook.battery.healthUnknown')
                                : `${firstHealthValue ?? '?'}% → ${latestHealthValue}%${batteryConfig.typeName ? ` · ${batteryConfig.typeName}` : ''}`}
                            </p>
                          </div>

                          <div className="border rounded-lg p-3 bg-card">
                            <p className="text-xs text-muted-foreground flex items-center gap-1"><Thermometer className="w-3 h-3" /> {t('resourceDialogs.equipmentLogbook.battery.maxTemp')}</p>
                            <p className={`text-lg font-bold ${tempColor}`}>
                              {latestTempMax != null ? `${latestTempMax}°C` : '—'}
                            </p>
                            {latest?.tempMin != null && (
                              <p className="text-[10px] text-muted-foreground">
                                {t('resourceDialogs.equipmentLogbook.battery.minTempLabel', { temp: latest.tempMin })}
                              </p>
                            )}

                          </div>
                          <div className="border rounded-lg p-3 bg-card">
                            <p className="text-xs text-muted-foreground flex items-center gap-1"><Zap className="w-3 h-3" /> {t('resourceDialogs.equipmentLogbook.battery.minVoltage')}</p>
                            <p className={`text-lg font-bold ${voltageColor}`}>
                              {latestVoltageMin != null ? `${latestVoltageMin.toFixed(2)}V` : '—'}
                            </p>
                            {latestCapacity != null && (
                              <p className="text-[10px] text-muted-foreground">
                                {latestCapacity} mAh
                              </p>
                            )}
                          </div>
                          {latestCellDev != null && (
                            <div className="border rounded-lg p-3 bg-card">
                              <p className="text-xs text-muted-foreground flex items-center gap-1"><Zap className="w-3 h-3" /> {t('resourceDialogs.equipmentLogbook.battery.cellDeviation')}</p>
                              <p className={`text-lg font-bold ${cellDevColor}`}>
                                {latestCellDev.toFixed(3)}V
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {latestCellDev > 0.1 ? t('resourceDialogs.equipmentLogbook.battery.cellHigh') : latestCellDev > 0.05 ? t('resourceDialogs.equipmentLogbook.battery.cellModerate') : t('resourceDialogs.equipmentLogbook.battery.cellOk')}
                              </p>

                            </div>
                          )}
                        </div>

                        {/* Capacity degradation trend */}
                        {firstCapacity != null && latestCapacity != null && firstCapacity !== latestCapacity && (
                          <div className="border rounded-lg p-3 bg-card">
                            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                              <Battery className="w-3 h-3" /> {t('resourceDialogs.equipmentLogbook.battery.capacityTrend')}
                            </p>
                            <p className="text-sm">
                              {firstCapacity} mAh → {latestCapacity} mAh
                              <span className={`ml-2 text-xs ${latestCapacity < firstCapacity ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                ({latestCapacity < firstCapacity ? '' : '+'}{Math.round(((latestCapacity - firstCapacity) / firstCapacity) * 100)}%)
                              </span>
                            </p>
                          </div>
                        )}

                        {/* History table */}
                        <div className="space-y-2">
                          <p className="text-sm font-medium">{t('resourceDialogs.equipmentLogbook.battery.history', { count: batteryTrend.length })}</p>
                          {/* Header row - hidden on mobile */}
                          <div className="hidden sm:grid sm:grid-cols-7 gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground border-b">
                            <span>{t('resourceDialogs.equipmentLogbook.battery.colDate')}</span>
                            <span>{t('resourceDialogs.equipmentLogbook.battery.colCycles')}</span>
                            <span>{t('resourceDialogs.equipmentLogbook.battery.colHealth')}</span>
                            <span>{t('resourceDialogs.equipmentLogbook.battery.colTemp')}</span>
                            <span>{t('resourceDialogs.equipmentLogbook.battery.colVoltage')}</span>
                            <span>{t('resourceDialogs.equipmentLogbook.battery.colCellDev')}</span>
                            <span>{t('resourceDialogs.equipmentLogbook.battery.colCapacity')}</span>
                          </div>

                          {batteryTrend.slice().reverse().map((entry, idx) => {
                            const rowHealth = computeHealth(entry);
                            const rowHealthColor = levelColorClass(batteryHealthLevel(rowHealth, batteryConfig));
                            return (
                            <div key={idx} className="border rounded-md px-3 py-2 text-sm">
                              {/* Desktop layout */}
                              <div className="hidden sm:grid sm:grid-cols-7 gap-2 items-center">
                                <span className="text-muted-foreground">{format(entry.date, 'dd.MM.yyyy')}</span>
                                <span>{entry.cycles != null ? `${entry.cycles}` : '—'}</span>
                                <span className={rowHealth != null ? rowHealthColor : ''}>
                                  {rowHealth != null ? `${rowHealth}%` : '—'}
                                </span>

                                <span className={entry.tempMax != null ? (entry.tempMax > 50 ? 'text-destructive' : entry.tempMax > 40 ? 'text-yellow-600 dark:text-yellow-400' : '') : ''}>
                                  {entry.tempMin != null || entry.tempMax != null
                                    ? `${entry.tempMin ?? '?'}–${entry.tempMax ?? '?'}°C`
                                    : '—'}
                                </span>
                                <span className={entry.voltageMin != null ? (entry.voltageMin < 3.0 ? 'text-destructive' : entry.voltageMin < 3.3 ? 'text-yellow-600 dark:text-yellow-400' : '') : ''}>
                                  {entry.voltageMin != null ? `${entry.voltageMin.toFixed(2)}V` : '—'}
                                </span>
                                <span className={entry.cellDeviation != null ? (entry.cellDeviation > 0.1 ? 'text-destructive' : entry.cellDeviation > 0.05 ? 'text-yellow-600 dark:text-yellow-400' : '') : ''}>
                                  {entry.cellDeviation != null ? `${entry.cellDeviation.toFixed(3)}V` : '—'}
                                </span>
                                <span>{entry.capacityMah != null ? `${entry.capacityMah} mAh` : '—'}</span>
                              </div>
                              {/* Mobile layout */}
                              <div className="sm:hidden">
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground text-xs">{format(entry.date, 'dd.MM.yyyy')}</span>
                                  <div className="flex gap-3 text-xs">
                                    {entry.cycles != null && <span>🔄 {entry.cycles}</span>}
                                    {rowHealth != null && (
                                      <span className={rowHealthColor}>
                                        ❤️ {rowHealth}%
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {(entry.tempMax != null || entry.voltageMin != null || entry.capacityMah != null || entry.cellDeviation != null) && (
                                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                                    {entry.tempMax != null && <span>🌡 {entry.tempMax}°C</span>}
                                    {entry.voltageMin != null && <span>⚡ {entry.voltageMin.toFixed(2)}V</span>}
                                    {entry.cellDeviation != null && (
                                      <span className={levelColorClass(cellDeviationLevel(entry.cellDeviation, batteryConfig))}>
                                        📊 {entry.cellDeviation.toFixed(3)}V
                                      </span>
                                    )}
                                    {entry.capacityMah != null && <span>🔋 {entry.capacityMah} mAh</span>}
                                  </div>
                                )}
                              </div>
                            </div>
                            );
                          })}

                        </div>
                      </div>
                    );
                  })()}
                </ScrollArea>
              </TabsContent>
            )}
          </Tabs>
        </DialogContent>
      </Dialog>

      {isBattery && batterySettingsOpen && (
        <BatteryHealthSettingsDialog
          open={batterySettingsOpen}
          onOpenChange={setBatterySettingsOpen}
          equipmentId={equipmentId}
          equipmentNavn={equipmentNavn}
          latest={{
            capacityMah: batteryTrend[batteryTrend.length - 1]?.capacityMah ?? null,
            cycles: batteryTrend[batteryTrend.length - 1]?.cycles ?? null,
          }}
          suggestion={batterySuggestion}
          onSaved={() => {
            reloadBatteryHealth();
          }}
        />
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <Dialog open={!!lightboxUrl} onOpenChange={() => setLightboxUrl(null)}>
          <DialogContent className="max-w-3xl p-2 bg-background/95">
            <img
              src={lightboxUrl}
              alt={t('resourceDialogs.equipmentLogbook.lightboxAlt')}
              className="w-full h-auto rounded-md max-h-[80vh] object-contain"
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={deleteConfirm.open} onOpenChange={(open) => setDeleteConfirm({ open, logId: open ? deleteConfirm.logId : null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('resourceDialogs.equipmentLogbook.deleteConfirm.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('resourceDialogs.equipmentLogbook.deleteConfirm.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirm({ open: false, logId: null })}>
              {t('resourceDialogs.equipmentLogbook.deleteConfirm.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deleteConfirm.logId) {
                  await handleDeleteEntry(deleteConfirm.logId);
                  setDeleteConfirm({ open: false, logId: null });
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('resourceDialogs.equipmentLogbook.deleteConfirm.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
