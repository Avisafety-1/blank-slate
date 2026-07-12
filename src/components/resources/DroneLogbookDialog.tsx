import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { useTerminology } from "@/hooks/useTerminology";
import { 
  Book, 
  Plane, 
  Search, 
  PackagePlus, 
  PackageMinus, 
  Edit, 
  Plus, 
  Calendar,
  User,
  Trash2,
  FileText,
  ImagePlus,
  X,
  ZoomIn,
  BarChart3,
  AlertTriangle,
  Pencil,
} from "lucide-react";
import { useRoleCheck } from "@/hooks/useRoleCheck";
import { EditFlightLogDialog } from "@/components/EditFlightLogDialog";
import { FlightAnalysisDialog } from "@/components/dashboard/FlightAnalysisDialog";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import autoTable from "jspdf-autotable";
import { createPdfDocument, sanitizeForPdf, sanitizeFilenameForPdf, formatDateForPdf, addSignatureToPdf, getPdfFontName } from "@/lib/pdfUtils";

interface DroneLogbookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  droneId: string;
  droneModell: string;
  flyvetimer: number;
}

interface LogEntry {
  id: string;
  type: 'flight' | 'inspection' | 'equipment_added' | 'equipment_removed' | 'manual';
  date: Date;
  title: string;
  description?: string;
  userName?: string;
  icon: React.ReactNode;
  badgeColor: string;
  badgeText: string;
  imageUrl?: string;
  flightTrack?: any;
  incidentId?: string;
  flightDate?: string;
  // Admin/edit metadata
  flightLogId?: string;
  manualEntryId?: string;
  rawEntry?: { entry_type: string | null; title: string; description: string | null; entry_date: string };
}

export const DroneLogbookDialog = ({ 
  open, 
  onOpenChange, 
  droneId, 
  droneModell,
  flyvetimer 
}: DroneLogbookDialogProps) => {
  const { user, companyId } = useAuth();
  const { isAdmin } = useRoleCheck();
  const terminology = useTerminology();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [allLogs, setAllLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [editingFlightLogId, setEditingFlightLogId] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [analysisTrack, setAnalysisTrack] = useState<any>(null);
  const [analysisDate, setAnalysisDate] = useState<string | undefined>();
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [newEntry, setNewEntry] = useState({
    entry_type: "merknad",
    title: "",
    description: "",
    entry_date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    if (open && droneId) {
      fetchAllLogs();
      fetchSignature();
    }
  }, [open, droneId]);

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

      // Fetch flight logs
      const { data: flightLogs } = await supabase
        .from("flight_logs")
        .select(`id, flight_date, flight_duration_minutes, departure_location, landing_location, notes, movements, user_id, flight_track, source, total_distance_m, max_distance_m, max_height_m, max_horiz_speed_ms, max_vert_speed_ms, rth_triggered, gps_sat_min, gps_sat_max, battery_cycles, battery_health_pct, battery_full_capacity_mah, battery_voltage_min_v, battery_temp_min_c, battery_temp_max_c, battery_cell_deviation_max_v`)
        .eq("drone_id", droneId)
        .order("flight_date", { ascending: false });

      if (flightLogs) {
        const flightLogIds = flightLogs.map(f => f.id);

        const [{ data: pilotLinks }, { data: flightEvents }] = await Promise.all([
          flightLogIds.length > 0
            ? (supabase as any)
                .from('flight_log_personnel')
                .select('flight_log_id, profile_id')
                .in('flight_log_id', flightLogIds)
            : Promise.resolve({ data: [] as any[] }),
          flightLogIds.length > 0
            ? supabase
                .from('flight_events' as any)
                .select('flight_log_id, t_offset_ms, type, message')
                .in('flight_log_id', flightLogIds)
                .order('t_offset_ms', { ascending: true })
            : Promise.resolve({ data: [] as any[] }),
        ]);

        const pilotByLogId = new Map<string, string>();
        (pilotLinks || []).forEach((p: any) => {
          if (!pilotByLogId.has(p.flight_log_id)) pilotByLogId.set(p.flight_log_id, p.profile_id);
        });

        const allUserIds = new Set<string>();
        flightLogs.forEach(f => { if (f.user_id) allUserIds.add(f.user_id); });
        pilotByLogId.forEach(pid => allUserIds.add(pid));

        const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", Array.from(allUserIds));
        const userMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);
        const eventsByLogId = new Map<string, any[]>();
        (flightEvents || []).forEach((event: any) => {
          const existing = eventsByLogId.get(event.flight_log_id) || [];
          existing.push(event);
          eventsByLogId.set(event.flight_log_id, existing);
        });

        flightLogs.forEach(log => {
          const existingTrack = (log.flight_track as any) || {};
          logs.push({
            id: `flight-${log.id}`,
            type: 'flight',
            date: new Date(log.flight_date),
            title: t('resourceDialogs.droneLogbook.logTitles.flight', { from: log.departure_location, to: log.landing_location }),
            description: log.notes
              ? t('resourceDialogs.droneLogbook.logTitles.flightDescriptionWithNotes', { minutes: log.flight_duration_minutes, movements: log.movements, notes: log.notes })
              : t('resourceDialogs.droneLogbook.logTitles.flightDescription', { minutes: log.flight_duration_minutes, movements: log.movements }),
            userName: userMap.get(pilotByLogId.get(log.id) || log.user_id) || t('resourceDialogs.droneLogbook.unknownUser'),
            icon: <Plane className="w-4 h-4" />,
            badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
            badgeText: t('resourceDialogs.droneLogbook.badges.flight'),
            flightTrack: {
              ...existingTrack,
              events: existingTrack.events || eventsByLogId.get(log.id) || [],
              batterySummary: {
                cycles: (log as any).battery_cycles ?? null,
                healthPct: (log as any).battery_health_pct ?? null,
                fullCapacityMah: (log as any).battery_full_capacity_mah ?? null,
                voltageMinV: (log as any).battery_voltage_min_v ?? null,
                tempMaxC: (log as any).battery_temp_max_c ?? null,
                cellDeviationV: (log as any).battery_cell_deviation_max_v ?? null,
              },
              summary: {
                durationMinutes: log.flight_duration_minutes ?? null,
                maxSpeedMs: (log as any).max_horiz_speed_ms ?? null,
                minBatteryV: (log as any).battery_voltage_min_v ?? null,
                totalRows: existingTrack?.positions?.length ?? null,
                totalDistanceM: (log as any).total_distance_m ?? null,
                maxAltitudeM: (log as any).max_height_m ?? null,
                minGpsSat: (log as any).gps_sat_min ?? null,
                maxGpsSat: (log as any).gps_sat_max ?? null,
                batteryTempMaxC: (log as any).battery_temp_max_c ?? null,
                batteryTempMinC: (log as any).battery_temp_min_c ?? null,
                batteryVoltageMinV: (log as any).battery_voltage_min_v ?? null,
                maxDistanceM: (log as any).max_distance_m ?? null,
                maxVSpeedMs: (log as any).max_vert_speed_ms ?? null,
                batteryCellDeviationV: (log as any).battery_cell_deviation_max_v ?? null,
                rthTriggered: (log as any).rth_triggered ?? false,
                source: (log as any).source ?? null,
              },
            },
            flightDate: log.flight_date,
            flightLogId: log.id,
          });
        });
      }

      // Fetch inspections
      const { data: inspections } = await supabase
        .from("drone_inspections")
        .select("id, inspection_date, inspection_type, notes, user_id")
        .eq("drone_id", droneId)
        .order("inspection_date", { ascending: false });

      if (inspections) {
        const userIds = [...new Set(inspections.map(i => i.user_id))];
        const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
        const userMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

        inspections.forEach(insp => {
          logs.push({
            id: `inspection-${insp.id}`,
            type: 'inspection',
            date: new Date(insp.inspection_date),
            title: insp.inspection_type
              ? t('resourceDialogs.droneLogbook.logTitles.inspectionWithType', { type: insp.inspection_type })
              : t('resourceDialogs.droneLogbook.logTitles.inspection'),
            description: insp.notes || undefined,
            userName: userMap.get(insp.user_id) || t('resourceDialogs.droneLogbook.unknownUser'),
            icon: <Search className="w-4 h-4" />,
            badgeColor: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
            badgeText: t('resourceDialogs.droneLogbook.badges.inspection'),
          });
        });
      }

      // Fetch equipment history
      const { data: equipmentHistory } = await supabase
        .from("drone_equipment_history")
        .select("id, action, item_type, item_name, created_at, user_id")
        .eq("drone_id", droneId)
        .order("created_at", { ascending: false });

      if (equipmentHistory) {
        const userIds = [...new Set(equipmentHistory.map(e => e.user_id))];
        const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
        const userMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

        equipmentHistory.forEach(entry => {
          const isAdded = entry.action === 'added';
          logs.push({
            id: `equipment-${entry.id}`,
            type: isAdded ? 'equipment_added' : 'equipment_removed',
            date: new Date(entry.created_at),
            title: isAdded
              ? t('resourceDialogs.droneLogbook.logTitles.equipmentAdded', { name: entry.item_name })
              : t('resourceDialogs.droneLogbook.logTitles.equipmentRemoved', { name: entry.item_name }),
            description: entry.item_type === 'accessory'
              ? t('resourceDialogs.droneLogbook.logTitles.equipmentTypeAccessory')
              : t('resourceDialogs.droneLogbook.logTitles.equipmentTypeEquipment'),
            userName: userMap.get(entry.user_id) || t('resourceDialogs.droneLogbook.unknownUser'),
            icon: isAdded ? <PackagePlus className="w-4 h-4" /> : <PackageMinus className="w-4 h-4" />,
            badgeColor: isAdded 
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
              : 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
            badgeText: isAdded ? t('resourceDialogs.droneLogbook.badges.added') : t('resourceDialogs.droneLogbook.badges.removed'),
          });
        });
      }

      // Fetch manual entries (with image_url)
      const { data: manualEntries } = await (supabase as any)
        .from("drone_log_entries")
        .select("id, entry_date, entry_type, title, description, user_id, image_url")
        .eq("drone_id", droneId)
        .order("entry_date", { ascending: false });

      if (manualEntries) {
        const allUserIds: string[] = (manualEntries as any[]).map((e) => e.user_id as string);
        const userIds = [...new Set(allUserIds)];
        const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
        const userMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

        for (const entry of manualEntries as any[]) {
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
            userName: userMap.get(entry.user_id) || t('resourceDialogs.droneLogbook.unknownUser'),
            icon: isHendelse ? <AlertTriangle className="w-4 h-4" /> : <Edit className="w-4 h-4" />,
            badgeColor: isHendelse
              ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
              : 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
            badgeText: entry.entry_type || t('resourceDialogs.droneLogbook.badges.note'),
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
      toast.error(t('resourceDialogs.droneLogbook.toasts.fetchError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t('resourceDialogs.droneLogbook.toasts.imageTooLarge'));
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
      toast.error(t('resourceDialogs.droneLogbook.toasts.titleRequired'));
      return;
    }
    setIsSaving(true);
    try {
      let entryId = editingEntryId;

      if (editingEntryId) {
        const { error } = await (supabase as any)
          .from("drone_log_entries")
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
          .from("drone_log_entries")
          .insert({
            drone_id: droneId,
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

      // Upload image if selected
      if (imageFile && entryId) {
        const ext = imageFile.name.split('.').pop();
        const filePath = `${companyId}/drone-${entryId}-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("logbook-images")
          .upload(filePath, imageFile, { contentType: imageFile.type });

        if (uploadError) {
          toast.error(t('resourceDialogs.droneLogbook.toasts.imageUploadError'));
        } else {
          await (supabase as any)
            .from("drone_log_entries")
            .update({ image_url: filePath })
            .eq("id", entryId);
        }
      }

      toast.success(editingEntryId ? t('resourceDialogs.droneLogbook.toasts.entryUpdated') : t('resourceDialogs.droneLogbook.toasts.entryAdded'));
      setNewEntry({ entry_type: "merknad", title: "", description: "", entry_date: new Date().toISOString().split('T')[0] });
      clearImage();
      setShowAddEntry(false);
      setEditingEntryId(null);
      fetchAllLogs();
    } catch (error: any) {
      console.error("Error saving entry:", error);
      toast.error(t('resourceDialogs.droneLogbook.toasts.saveError', { message: error.message }));
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
        .from("drone_log_entries")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success(t('resourceDialogs.droneLogbook.toasts.entryDeleted'));
      fetchAllLogs();
    } catch (error: any) {
      toast.error(t('resourceDialogs.droneLogbook.toasts.deleteError', { message: error.message }));
    }
  };

  const handleExportPDF = async () => {
    if (!user || !companyId) {
      toast.error(t('resourceDialogs.droneLogbook.toasts.loginRequired'));
      return;
    }

    try {
      const pdf = await createPdfDocument();
      const dateStr = format(new Date(), 'dd.MM.yyyy');
      const timeStr = format(new Date(), 'HH:mm');
      
      pdf.setFontSize(18);
      pdf.text(sanitizeForPdf(t('resourceDialogs.droneLogbook.pdf.title', { model: droneModell })), 14, 20);
      pdf.setFontSize(11);
      pdf.text(sanitizeForPdf(t('resourceDialogs.droneLogbook.pdf.totalHours', { hours: Number(flyvetimer).toFixed(2) })), 14, 28);
      pdf.text(sanitizeForPdf(t('resourceDialogs.droneLogbook.pdf.exportedAt', { date: dateStr, time: timeStr })), 14, 35);
      
      const tableData = allLogs.map(log => [
        formatDateForPdf(log.date, 'dd.MM.yyyy HH:mm'),
        sanitizeForPdf(log.badgeText),
        sanitizeForPdf(log.title),
        sanitizeForPdf(log.description) || '',
        sanitizeForPdf(log.userName) || t('resourceDialogs.droneLogbook.unknownUser')
      ]);

      autoTable(pdf, {
        startY: 45,
        head: [[
          t('resourceDialogs.droneLogbook.pdf.columns.date'),
          t('resourceDialogs.droneLogbook.pdf.columns.type'),
          t('resourceDialogs.droneLogbook.pdf.columns.title'),
          t('resourceDialogs.droneLogbook.pdf.columns.description'),
          t('resourceDialogs.droneLogbook.pdf.columns.user'),
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

      if (signatureUrl) {
        const finalY = (pdf as any).lastAutoTable?.finalY || 150;
        await addSignatureToPdf(pdf, signatureUrl, finalY + 20, t('resourceDialogs.droneLogbook.pdf.signatureLabel'));
      }

      const pdfBlob = pdf.output('blob');
      const safeModelName = sanitizeFilenameForPdf(droneModell);
      const fileName = `${t('resourceDialogs.droneLogbook.pdf.fileName')}-${safeModelName}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      const filePath = `${companyId}/${user.id}/${Date.now()}-${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, pdfBlob, { contentType: 'application/pdf' });

      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from('documents').insert({
        tittel: sanitizeForPdf(t('resourceDialogs.droneLogbook.pdf.documentTitle', { model: droneModell, date: dateStr })),
        kategori: 'loggbok',
        fil_url: filePath,
        fil_navn: fileName,
        fil_storrelse: pdfBlob.size,
        company_id: companyId,
        user_id: user.id,
      });

      if (insertError) throw insertError;
      toast.success(t('resourceDialogs.droneLogbook.toasts.exportSuccess'));
    } catch (error: any) {
      console.error('Error exporting PDF:', error);
      toast.error(t('resourceDialogs.droneLogbook.toasts.exportError', { message: error.message }));
    }
  };

  const filteredLogs = activeTab === 'all' 
    ? allLogs 
    : allLogs.filter(log => {
        switch (activeTab) {
          case 'flights': return log.type === 'flight';
          case 'inspections': return log.type === 'inspection';
          case 'equipment': return log.type === 'equipment_added' || log.type === 'equipment_removed';
          case 'manual': return log.type === 'manual';
          default: return true;
        }
      });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Book className="w-5 h-5 text-primary" />
              {t('resourceDialogs.droneLogbook.title', { model: droneModell })}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {t('resourceDialogs.droneLogbook.totalHours', { hours: Number(flyvetimer).toFixed(2) })}
            </p>
          </DialogHeader>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
            <Button 
              variant="outline" 
              size="sm" 
              data-tour="drone-logbook-add"
              onClick={() => setShowAddEntry(!showAddEntry)}
              className="w-full sm:w-auto"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t('resourceDialogs.droneLogbook.addEntry')}
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              data-tour="drone-logbook-export"
              onClick={handleExportPDF}
              className="w-full sm:w-auto"
            >
              <FileText className="w-4 h-4 mr-2" />
              {t('resourceDialogs.droneLogbook.exportPdf')}
            </Button>
          </div>

          {showAddEntry && (
            <div className="border rounded-lg p-3 sm:p-4 space-y-3 bg-muted/30 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs sm:text-sm">{t('resourceDialogs.droneLogbook.type')}</Label>
                  <Select 
                    value={newEntry.entry_type} 
                    onValueChange={(v) => setNewEntry(prev => ({ ...prev, entry_type: v }))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="merknad">{t('resourceDialogs.droneLogbook.entryTypes.merknad')}</SelectItem>
                      <SelectItem value="hendelse">{t('resourceDialogs.droneLogbook.entryTypes.hendelse')}</SelectItem>
                      <SelectItem value="reparasjon">{t('resourceDialogs.droneLogbook.entryTypes.reparasjon')}</SelectItem>
                      <SelectItem value="annet">{t('resourceDialogs.droneLogbook.entryTypes.annet')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs sm:text-sm">{t('resourceDialogs.droneLogbook.date')}</Label>
                  <Input
                    type="date"
                    className="h-9"
                    value={newEntry.entry_date}
                    onChange={(e) => setNewEntry(prev => ({ ...prev, entry_date: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <Label>{t('resourceDialogs.droneLogbook.titleField')}</Label>
                <Input
                  value={newEntry.title}
                  onChange={(e) => setNewEntry(prev => ({ ...prev, title: e.target.value }))}
                  placeholder={t('resourceDialogs.droneLogbook.titlePlaceholder')}
                />
              </div>
              <div>
                <Label>{t('resourceDialogs.droneLogbook.description')}</Label>
                <Textarea
                  value={newEntry.description}
                  onChange={(e) => setNewEntry(prev => ({ ...prev, description: e.target.value }))}
                  placeholder={t('resourceDialogs.droneLogbook.descriptionPlaceholder')}
                  rows={2}
                />
              </div>
              {/* Image upload */}
              <div>
                <Label className="text-xs sm:text-sm">{t('resourceDialogs.droneLogbook.image')}</Label>
                {imagePreviewUrl ? (
                  <div className="relative inline-block mt-1">
                    <img
                      src={imagePreviewUrl}
                      alt={t('resourceDialogs.droneLogbook.imagePreviewAlt')}
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
                    {t('resourceDialogs.droneLogbook.uploadImage')}
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
              <div className="flex gap-2">
                <Button size="sm" onClick={handleAddEntry} disabled={isSaving}>
                  {isSaving ? t('resourceDialogs.droneLogbook.saving') : (editingEntryId ? t('resourceDialogs.droneLogbook.update') : t('resourceDialogs.droneLogbook.save'))}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setShowAddEntry(false); setEditingEntryId(null); clearImage(); setNewEntry({ entry_type: "merknad", title: "", description: "", entry_date: new Date().toISOString().split('T')[0] }); }}>{t('resourceDialogs.droneLogbook.cancel')}</Button>
              </div>
            </div>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab} className={cn("flex-1 flex flex-col min-h-0", showAddEntry && "hidden sm:flex")}>
            <TabsList className="flex w-full overflow-x-auto no-scrollbar">
              <TabsTrigger value="all" className="flex-1 min-w-[50px] text-xs sm:text-sm">{t('resourceDialogs.droneLogbook.tabs.all')}</TabsTrigger>
              <TabsTrigger value="flights" className="flex-1 min-w-[50px] text-xs sm:text-sm">{t('resourceDialogs.droneLogbook.tabs.flights')}</TabsTrigger>
              <TabsTrigger value="inspections" className="flex-1 min-w-[50px] text-xs sm:text-sm">{t('resourceDialogs.droneLogbook.tabs.inspections')}</TabsTrigger>
              <TabsTrigger value="equipment" className="flex-1 min-w-[50px] text-xs sm:text-sm">{t('resourceDialogs.droneLogbook.tabs.equipment')}</TabsTrigger>
              <TabsTrigger value="manual" className="flex-1 min-w-[50px] text-xs sm:text-sm">{t('resourceDialogs.droneLogbook.tabs.manual')}</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="flex-1 min-h-0 mt-2">
              <ScrollArea className="h-[calc(60vh-200px)] sm:h-[400px] min-h-[200px] max-h-[400px] pr-2 sm:pr-4">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    {t('resourceDialogs.droneLogbook.loading')}
                  </div>
                ) : filteredLogs.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    {t('resourceDialogs.droneLogbook.noEntries')}
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
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground hover:text-primary shrink-0"
                                    title="Rediger"
                                    onClick={() => handleEditManualEntry(log)}
                                  >
                                    <Pencil className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground hover:text-destructive shrink-0"
                                    onClick={() => handleDeleteEntry(log.id)}
                                  >
                                    <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                  </Button>
                                </>
                              )}
                              {log.type === 'flight' && isAdmin && log.flightLogId && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground hover:text-primary shrink-0"
                                  title="Rediger flylogg (admin)"
                                  onClick={() => setEditingFlightLogId(log.flightLogId!)}
                                >
                                  <Pencil className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                </Button>
                              )}
                              {log.incidentId && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground hover:text-primary shrink-0"
                                  title="Åpne hendelse"
                                  onClick={() => {
                                    onOpenChange(false);
                                    navigate('/hendelser', { state: { openIncidentId: log.incidentId } });
                                  }}
                                >
                                  <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                </Button>
                              )}
                              {log.type === 'flight' && log.flightTrack?.positions?.length > 0 && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground hover:text-primary shrink-0"
                                  title="Analyser flytur"
                                  onClick={() => {
                                    setAnalysisTrack(log.flightTrack);
                                    setAnalysisDate(log.flightDate);
                                    setAnalysisOpen(true);
                                  }}
                                >
                                  <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
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
                                  alt="Vedlegg"
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
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      {lightboxUrl && (
        <Dialog open={!!lightboxUrl} onOpenChange={() => setLightboxUrl(null)}>
          <DialogContent className="max-w-3xl p-2 bg-background/95">
            <img
              src={lightboxUrl}
              alt="Bilde"
              className="w-full h-auto rounded-md max-h-[80vh] object-contain"
            />
          </DialogContent>
        </Dialog>
      )}

      <FlightAnalysisDialog
        open={analysisOpen}
        onOpenChange={setAnalysisOpen}
        flightTrack={analysisTrack}
        flightDate={analysisDate}
        droneName={droneModell}
      />

      <EditFlightLogDialog
        open={!!editingFlightLogId}
        onOpenChange={(o) => { if (!o) setEditingFlightLogId(null); }}
        flightLogId={editingFlightLogId}
        onSaved={() => fetchAllLogs()}
      />
    </>
  );
};
