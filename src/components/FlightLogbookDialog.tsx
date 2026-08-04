import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Book, Plane, MapPin, Clock, Calendar, Plus, FileText, Edit, Trash2, ImagePlus, X, ZoomIn, User, Pencil } from "lucide-react";
import { useRoleCheck } from "@/hooks/useRoleCheck";
import { EditFlightLogDialog } from "@/components/EditFlightLogDialog";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { toast } from "sonner";
import autoTable from "jspdf-autotable";
import { createPdfDocument, setFontStyle, sanitizeForPdf, sanitizeFilenameForPdf, formatDateForPdf, formatDurationForPdf, addSignatureToPdf, getPdfFontName } from "@/lib/pdfUtils";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";

interface FlightLogbookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personId: string;
  personName: string;
}

interface FlightLog {
  id: string;
  flight_date: string;
  departure_location: string;
  landing_location: string;
  flight_duration_minutes: number;
  movements: number;
  notes: string | null;
  entry_source?: 'logged' | 'manual' | null;
  drone: {
    modell: string;
    serienummer: string;
  } | null;
  mission: {
    tittel: string;
  } | null;
}

interface PersonnelLogEntry {
  id: string;
  entry_date: string;
  entry_type: string | null;
  title: string;
  description: string | null;
  image_url: string | null;
  imagePublicUrl?: string;
  flight_log_id?: string | null;
}

export const FlightLogbookDialog = ({ open, onOpenChange, personId, personName }: FlightLogbookDialogProps) => {
  const { t } = useTranslation();
  const { user, companyId } = useAuth();
  const { isAdmin } = useRoleCheck();
  const queryClient = useQueryClient();
  const [editingFlightLogId, setEditingFlightLogId] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [flightLogs, setFlightLogs] = useState<FlightLog[]>([]);
  const [personnelLogs, setPersonnelLogs] = useState<PersonnelLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [loggedMinutes, setLoggedMinutes] = useState(0);
  const [manualMinutes2, setManualMinutes2] = useState(0);
  const [profileFlyvetimer, setProfileFlyvetimer] = useState(0);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [showAddHours, setShowAddHours] = useState(false);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [manualHours, setManualHours] = useState("");
  const [manualMinutes, setManualMinutes] = useState("");
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [isSavingEntry, setIsSavingEntry] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newEntry, setNewEntry] = useState({
    entry_type: "merknad",
    title: "",
    description: "",
    entry_date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    if (open && personId) {
      fetchFlightLogs();
      fetchProfileData();
      fetchPersonnelLogs();
    }
  }, [open, personId]);

  const fetchProfileData = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("flyvetimer")
      .eq("id", personId)
      .single();
    setProfileFlyvetimer(Number(data?.flyvetimer) || 0);
    
    const { data: signatureData } = await (supabase as any)
      .from("profiles")
      .select("signature_url")
      .eq("id", personId)
      .single();
    setSignatureUrl(signatureData?.signature_url || null);
  };

  const fetchPersonnelLogs = async () => {
    const { data, error } = await (supabase as any)
      .from("personnel_log_entries")
      .select("id, entry_date, entry_type, title, description, image_url, flight_log_id")
      .eq("profile_id", personId)
      .order("entry_date", { ascending: false });

    if (error) {
      console.error("Error fetching personnel logs:", error);
      return;
    }

    const entries: PersonnelLogEntry[] = [];
    for (const e of (data || [])) {
      let imagePublicUrl: string | undefined;
      if (e.image_url) {
        const { data: urlData } = await supabase.storage.from("logbook-images").createSignedUrl(e.image_url, 3600);
        imagePublicUrl = urlData?.signedUrl || undefined;
      }
      entries.push({ ...e, imagePublicUrl });
    }
    setPersonnelLogs(entries);
  };

  const handleConfirmAddHours = () => {
    const hours = parseInt(manualHours) || 0;
    const mins = parseInt(manualMinutes) || 0;
    if (hours === 0 && mins === 0) {
      toast.error("Angi timer eller minutter");
      return;
    }
    setConfirmDialogOpen(true);
  };

  const handleAddManualHours = async () => {
    const hours = parseInt(manualHours) || 0;
    const mins = parseInt(manualMinutes) || 0;
    const additionalMinutes = hours * 60 + mins;
    if (additionalMinutes <= 0) {
      toast.error("Angi timer eller minutter");
      setConfirmDialogOpen(false);
      return;
    }

    // Hent profil for company_id
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", personId)
      .single();

    if (profileErr || !profile?.company_id) {
      toast.error("Kunne ikke hente profilinformasjon");
      console.error(profileErr);
      setConfirmDialogOpen(false);
      return;
    }

    // Opprett en flight_logs-rad for den manuelt registrerte tiden.
    // DB-triggeren oppdaterer profiles.flyvetimer automatisk når personnel-kobling lages.
    const { data: newLog, error: logErr } = await (supabase as any)
      .from("flight_logs")
      .insert({
        company_id: profile.company_id,
        user_id: personId,
        drone_id: null,
        mission_id: null,
        flight_date: new Date().toISOString(),
        flight_duration_minutes: additionalMinutes,
        movements: 0,
        departure_location: "Manuell",
        landing_location: "Manuell",
        operation_type: "VLOS",
        notes: "Manuelt registrert tilleggstid",
        entry_source: "manual",
      })
      .select("id")
      .single();

    if (logErr || !newLog) {
      toast.error("Kunne ikke legge til flytimer");
      console.error(logErr);
      setConfirmDialogOpen(false);
      return;
    }

    const { error: flpErr } = await (supabase as any)
      .from("flight_log_personnel")
      .insert({ flight_log_id: newLog.id, profile_id: personId });

    if (flpErr) {
      toast.error("Flytur opprettet, men kunne ikke knytte til pilot");
      console.error(flpErr);
      setConfirmDialogOpen(false);
      return;
    }

    // Skriv en tekstnotat i tidslinjen for sporbarhet
    const durationLabel = hours > 0 && mins > 0
      ? `${hours} t ${mins} min`
      : hours > 0
        ? `${hours} t`
        : `${mins} min`;

    await (supabase as any)
      .from("personnel_log_entries")
      .insert({
        profile_id: personId,
        company_id: profile.company_id,
        user_id: user?.id,
        entry_date: new Date().toISOString().split('T')[0],
        entry_type: "flytid",
        title: `Manuelt lagt til ${durationLabel} flytid`,
        description: null,
        flight_log_id: newLog.id,
      });

    toast.success("Flytimer lagt til");
    setManualHours("");
    setManualMinutes("");
    setShowAddHours(false);
    setConfirmDialogOpen(false);
    // Refresh både logger og profil (cache)
    await Promise.all([fetchFlightLogs(), fetchProfileData(), fetchPersonnelLogs()]);
    queryClient.invalidateQueries({ queryKey: ['profiles'] });
  };

  const fetchFlightLogs = async () => {
    setLoading(true);
    try {
      const { data: personnelLogs } = await (supabase as any)
        .from("flight_log_personnel")
        .select("flight_log_id")
        .eq("profile_id", personId);

      if (!personnelLogs || personnelLogs.length === 0) {
        setFlightLogs([]);
        setTotalMinutes(0);
        setLoggedMinutes(0);
        setManualMinutes2(0);
        setLoading(false);
        return;
      }

      const logIds = personnelLogs.map((p: any) => p.flight_log_id);

      const { data: logs } = await (supabase as any)
        .from("flight_logs")
        .select(`
          id,
          flight_date,
          departure_location,
          landing_location,
          flight_duration_minutes,
          movements,
          notes,
          entry_source,
          drone:drone_id (
            modell,
            serienummer
          ),
          mission:mission_id (
            tittel
          )
        `)
        .in("id", logIds)
        .order("flight_date", { ascending: false });

      if (logs) {
        setFlightLogs(logs);
        let logged = 0;
        let manual = 0;
        for (const log of logs as FlightLog[]) {
          const mins = log.flight_duration_minutes || 0;
          if (log.entry_source === 'manual') manual += mins;
          else logged += mins;
        }
        setLoggedMinutes(logged);
        setManualMinutes2(manual);
        setTotalMinutes(logged + manual);
      }
    } catch (error) {
      console.error("Error fetching flight logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins} min`;
    if (mins === 0) return `${hours} t`;
    return `${hours} t ${mins} min`;
  };

  // Sannhetskilde: summen av flight_logs koblet til piloten via flight_log_personnel.
  // profiles.flyvetimer holdes synk'et av DB-trigger trg_flp_recompute_pilot.
  const totalFlytid = totalMinutes;

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Bildet er for stort (maks 10 MB)");
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
      toast.error("Fyll inn tittel");
      return;
    }
    setIsSavingEntry(true);
    try {
      let entryId = editingEntryId;

      if (editingEntryId) {
        const { error } = await (supabase as any)
          .from("personnel_log_entries")
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
          .from("personnel_log_entries")
          .insert({
            profile_id: personId,
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
        const filePath = `${companyId}/personnel-${entryId}-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("logbook-images")
          .upload(filePath, imageFile, { contentType: imageFile.type });

        if (uploadError) {
          toast.error("Innlegg lagret, men bilde kunne ikke lastes opp");
        } else {
          await (supabase as any)
            .from("personnel_log_entries")
            .update({ image_url: filePath })
            .eq("id", entryId);
        }
      }

      toast.success(editingEntryId ? "Innlegg oppdatert" : "Innlegg lagt til");
      setNewEntry({ entry_type: "merknad", title: "", description: "", entry_date: new Date().toISOString().split('T')[0] });
      clearImage();
      setShowAddEntry(false);
      setEditingEntryId(null);
      fetchPersonnelLogs();
    } catch (error: any) {
      console.error("Error saving entry:", error);
      toast.error(`Kunne ikke lagre innlegg: ${error.message}`);
    } finally {
      setIsSavingEntry(false);
    }
  };

  const handleEditEntry = (entry: PersonnelLogEntry) => {
    setEditingEntryId(entry.id);
    setNewEntry({
      entry_type: entry.entry_type || "merknad",
      title: entry.title,
      description: entry.description || "",
      entry_date: entry.entry_date.split('T')[0],
    });
    clearImage();
    setShowAddEntry(true);
    setShowAddHours(false);
  };

  const parseManualDurationMinutes = (title: string): number | null => {
    const both = title.match(/(\d+)\s*t\s+(\d+)\s*min/i);
    if (both) return parseInt(both[1], 10) * 60 + parseInt(both[2], 10);
    const onlyH = title.match(/(\d+)\s*t(?!\w)/i);
    if (onlyH) return parseInt(onlyH[1], 10) * 60;
    const onlyM = title.match(/(\d+)\s*min/i);
    if (onlyM) return parseInt(onlyM[1], 10);
    return null;
  };

  const ambiguousToast = () =>
    toast.error(
      "Kunne ikke entydig identifisere tilhørende flytur. Slett eller kontroller flyturen manuelt fra Flyturer-fanen."
    );

  const deleteFlightLogThenEntry = async (flightLogId: string, entryId: string) => {
    // CASCADE on flight_log_personnel.flight_log_id removes related FLP rows automatically.
    const { data: flDel, error: flErr } = await (supabase as any)
      .from("flight_logs")
      .delete()
      .eq("id", flightLogId)
      .select("id");
    if (flErr) throw flErr;
    if (!flDel || flDel.length === 0) {
      // RLS silently blocked or row already gone — do NOT delete personnel_log_entries
      ambiguousToast();
      await Promise.all([fetchFlightLogs(), fetchProfileData(), fetchPersonnelLogs()]);
      return false;
    }

    const { error: pleErr } = await (supabase as any)
      .from("personnel_log_entries")
      .delete()
      .eq("id", entryId)
      .select("id");
    if (pleErr) throw pleErr;

    toast.success("Innlegg og tilhørende flytur slettet");
    await Promise.all([fetchFlightLogs(), fetchProfileData(), fetchPersonnelLogs()]);
    queryClient.invalidateQueries({ queryKey: ['profiles'] });
    return true;
  };

  const handleDeleteEntry = async (entry: PersonnelLogEntry) => {
    try {
      // Case 1: entry is linked to a flight_log
      if (entry.flight_log_id) {
        // Owner verification — two simple queries
        const { data: fl, error: flGetErr } = await (supabase as any)
          .from("flight_logs")
          .select("id, entry_source")
          .eq("id", entry.flight_log_id)
          .maybeSingle();
        if (flGetErr) throw flGetErr;
        if (!fl || fl.entry_source !== "manual") {
          ambiguousToast();
          return;
        }

        const { data: flpRows, error: flpGetErr } = await (supabase as any)
          .from("flight_log_personnel")
          .select("profile_id")
          .eq("flight_log_id", entry.flight_log_id);
        if (flpGetErr) throw flpGetErr;
        if (!flpRows?.some((r: any) => r.profile_id === personId)) {
          ambiguousToast();
          return;
        }

        await deleteFlightLogThenEntry(entry.flight_log_id, entry.id);
        return;
      }

      // Case 2: legacy manual "flytid" entry without flight_log_id — fallback match
      if (entry.entry_type === "flytid" && entry.title?.startsWith("Manuelt lagt til")) {
        const minutes = parseManualDurationMinutes(entry.title);
        if (minutes == null) {
          ambiguousToast();
          return;
        }

        const { data: candidates, error: candErr } = await (supabase as any)
          .from("flight_logs")
          .select("id, flight_date, flight_duration_minutes, flight_log_personnel!inner(profile_id)")
          .eq("entry_source", "manual")
          .eq("flight_duration_minutes", minutes)
          .eq("flight_log_personnel.profile_id", personId);

        if (candErr) throw candErr;

        // Normalize entry.entry_date (timestamptz string) to YYYY-MM-DD
        const entryDateStr = String(entry.entry_date).slice(0, 10);
        const sameDay = (candidates || []).filter((c: any) => {
          const d = new Date(c.flight_date);
          const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const utc = d.toISOString().slice(0, 10);
          return local === entryDateStr || utc === entryDateStr;
        });

        if (sameDay.length === 0) {
          ambiguousToast();
          return;
        }

        // Filter out flight_logs already linked from another personnel_log_entries
        const ids = sameDay.map((c: any) => c.id);
        const { data: alreadyLinked } = await (supabase as any)
          .from("personnel_log_entries")
          .select("flight_log_id")
          .in("flight_log_id", ids);
        const linkedSet = new Set((alreadyLinked || []).map((r: any) => r.flight_log_id));
        const free = sameDay.filter((c: any) => !linkedSet.has(c.id));

        if (free.length !== 1) {
          ambiguousToast();
          return;
        }

        await deleteFlightLogThenEntry(free[0].id, entry.id);
        return;
      }

      // Case 3: regular note — delete entry only
      const { error } = await (supabase as any)
        .from("personnel_log_entries")
        .delete()
        .eq("id", entry.id);
      if (error) throw error;
      toast.success(i18n.t("flightLogbook.toasts.entryDeleted", { ns: "pdf" }));
      fetchPersonnelLogs();
    } catch (error: any) {
      toast.error(i18n.t("flightLogbook.toasts.deleteFailed", { ns: "pdf", message: error.message }));
    }
  };

  const handleExportPDF = async () => {
    if (!companyId || !user) {
      toast.error(i18n.t("flightLogbook.toasts.missingInfo", { ns: "pdf" }));
      return;
    }

    setExporting(true);
    try {
      const doc = await createPdfDocument();
      const title = i18n.t("flightLogbook.title", { ns: "pdf", name: personName });

      doc.setFontSize(18);
      doc.text(sanitizeForPdf(title), 14, 20);

      doc.setFontSize(10);
      doc.setTextColor(100);
      const exportedDateFmt = i18n.language?.toLowerCase().startsWith("en")
        ? "'Exported:' d MMMM yyyy 'at' HH:mm"
        : "'Eksportert:' d. MMMM yyyy 'kl.' HH:mm";
      doc.text(formatDateForPdf(new Date(), exportedDateFmt), 14, 28);

      doc.setFontSize(12);
      doc.setTextColor(0);
      doc.text(`${i18n.t("flightLogbook.totalFlightTime", { ns: "pdf" })}: ${formatDurationForPdf(Math.round(totalFlytid))}`, 14, 40);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`${i18n.t("flightLogbook.fromLogged", { ns: "pdf" })}: ${formatDurationForPdf(loggedMinutes)}`, 14, 47);
      doc.text(`${i18n.t("flightLogbook.manuallyAdded", { ns: "pdf" })}: ${formatDurationForPdf(manualMinutes2)}`, 14, 54);

      const tableData = flightLogs.map(log => [
        format(new Date(log.flight_date), "dd.MM.yyyy"),
        sanitizeForPdf(log.departure_location),
        sanitizeForPdf(log.landing_location),
        formatDurationForPdf(log.flight_duration_minutes),
        sanitizeForPdf(log.drone?.modell) || "-",
        sanitizeForPdf(log.mission?.tittel) || "-"
      ]);

      autoTable(doc, {
        startY: 62,
        head: [[
          i18n.t("flightLogbook.headers.date", { ns: "pdf" }),
          i18n.t("flightLogbook.headers.departure", { ns: "pdf" }),
          i18n.t("flightLogbook.headers.landing", { ns: "pdf" }),
          i18n.t("flightLogbook.headers.duration", { ns: "pdf" }),
          i18n.t("flightLogbook.headers.drone", { ns: "pdf" }),
          i18n.t("flightLogbook.headers.mission", { ns: "pdf" }),
        ]],
        body: tableData,
        styles: { fontSize: 8, font: getPdfFontName() },
        headStyles: { fillColor: [59, 130, 246], font: getPdfFontName() }
      });

      if (signatureUrl) {
        const finalY = (doc as any).lastAutoTable?.finalY || 150;
        await addSignatureToPdf(doc, signatureUrl, finalY + 20);
      }

      const safeName = sanitizeFilenameForPdf(personName);
      const dateStr = format(new Date(), "yyyy-MM-dd");
      const fileName = `${i18n.t("flightLogbook.filenamePrefix", { ns: "pdf" })}_${safeName}_${dateStr}.pdf`;

      const pdfBlob = doc.output("blob");
      const filePath = `${companyId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, pdfBlob, { contentType: "application/pdf", upsert: true });

      if (uploadError) throw uploadError;

      const isEn = i18n.language?.toLowerCase().startsWith("en");
      const descDate = format(new Date(), "d MMMM yyyy", { locale: isEn ? undefined as any : nb });
      const { error: docError } = await supabase.from("documents").insert({
        company_id: companyId,
        user_id: user.id,
        tittel: sanitizeForPdf(title),
        kategori: "loggbok",
        fil_navn: fileName,
        fil_url: filePath,
        fil_storrelse: pdfBlob.size,
        beskrivelse: sanitizeForPdf(i18n.t("flightLogbook.documentDescription", { ns: "pdf", date: descDate })),
      });

      if (docError) throw docError;

      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success(i18n.t("flightLogbook.toasts.exported", { ns: "pdf" }));
    } catch (error) {
      console.error("Error exporting PDF:", error);
      toast.error(i18n.t("flightLogbook.toasts.exportFailed", { ns: "pdf" }));
    } finally {
      setExporting(false);
    }
  };



  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Book className="w-5 h-5 text-primary" />
              {t("logbook.title")} - {personName}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-2 pr-1">
            <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg border border-primary/20">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                <span className="font-medium">{t("logbook.totalFlightTime")}</span>
              </div>
              <Badge variant="secondary" className="text-lg px-3 py-1">
                {formatDuration(Math.round(totalFlytid))}
              </Badge>
            </div>

            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground px-1">
              <span>{t("logbook.fromLoggedFlights")}: {formatDuration(loggedMinutes)}</span>
              <span>{t("logbook.manuallyAdded")}: {formatDuration(manualMinutes2)}</span>
            </div>


            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowAddHours(!showAddHours); setShowAddEntry(false); }}
                className="flex-1"
              >
                <Plus className="w-4 h-4 mr-2" />
                {t("logbook.addManualHours")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowAddEntry(!showAddEntry); setShowAddHours(false); }}
                className="flex-1"
              >
                <Edit className="w-4 h-4 mr-2" />
                {t("logbook.addLogEntry")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportPDF}
                disabled={exporting}
                className="flex-1"
              >
                <FileText className="w-4 h-4 mr-2" />
                {exporting ? t("logbook.exporting") : t("logbook.exportPdf")}
              </Button>
            </div>

            {showAddHours && (
              <div className="p-3 bg-muted/50 rounded-lg border space-y-3">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Label htmlFor="manual-hours" className="text-xs">Timer</Label>
                    <Input
                      id="manual-hours"
                      type="number"
                      min="0"
                      value={manualHours}
                      onChange={(e) => setManualHours(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="flex-1">
                    <Label htmlFor="manual-minutes" className="text-xs">Minutter</Label>
                    <Input
                      id="manual-minutes"
                      type="number"
                      min="0"
                      max="59"
                      value={manualMinutes}
                      onChange={(e) => setManualMinutes(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setShowAddHours(false); setManualHours(""); setManualMinutes(""); }}
                  >
                    Avbryt
                  </Button>
                  <Button size="sm" onClick={handleConfirmAddHours}>
                    Legg til
                  </Button>
                </div>
              </div>
            )}

            {showAddEntry && (
              <div className="border rounded-lg p-3 space-y-3 bg-muted/30 max-h-[60vh] overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Type</Label>
                    <Select
                      value={newEntry.entry_type}
                      onValueChange={(v) => setNewEntry(prev => ({ ...prev, entry_type: v }))}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="merknad">Merknad</SelectItem>
                        <SelectItem value="hendelse">Hendelse</SelectItem>
                        <SelectItem value="reparasjon">Reparasjon</SelectItem>
                        <SelectItem value="annet">Annet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Dato</Label>
                    <Input
                      type="date"
                      className="h-9"
                      value={newEntry.entry_date}
                      onChange={(e) => setNewEntry(prev => ({ ...prev, entry_date: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <Label>Tittel *</Label>
                  <Input
                    value={newEntry.title}
                    onChange={(e) => setNewEntry(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Kort beskrivelse"
                  />
                </div>
                <div>
                  <Label>Beskrivelse</Label>
                  <Textarea
                    value={newEntry.description}
                    onChange={(e) => setNewEntry(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Utfyllende detaljer (valgfritt)"
                    rows={2}
                  />
                </div>
                <div>
                  <Label className="text-xs">Bilde (valgfritt)</Label>
                  {imagePreviewUrl ? (
                    <div className="relative inline-block mt-1">
                      <img
                        src={imagePreviewUrl}
                        alt="Forhåndsvisning"
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
                      Last opp bilde
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
                <div className="flex gap-2 sticky bottom-0 bg-muted/30 pt-2 -mx-3 px-3 pb-1">
                  <Button size="sm" onClick={handleAddEntry} disabled={isSavingEntry}>
                    {isSavingEntry ? "Lagrer..." : (editingEntryId ? "Oppdater" : "Lagre")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setShowAddEntry(false); setEditingEntryId(null); clearImage(); setNewEntry({ entry_type: "merknad", title: "", description: "", entry_date: new Date().toISOString().split('T')[0] }); }}>Avbryt</Button>
                </div>
              </div>
            )}
          </div>

          <Tabs defaultValue="flyturer" className={cn("mt-2", showAddEntry && "hidden sm:block")}>
            <TabsList className="w-full">
              <TabsTrigger value="flyturer" className="flex-1">Flyturer</TabsTrigger>
              <TabsTrigger value="innlegg" className="flex-1">
                Logginnlegg {personnelLogs.length > 0 && `(${personnelLogs.length})`}
              </TabsTrigger>
              {evaluations.length > 0 && (
                <TabsTrigger value="evalueringer" className="flex-1">
                  {t("evaluation.logbook.tab")} ({evaluations.length})
                </TabsTrigger>
              )}
            </TabsList>

            {evaluations.length > 0 && (
              <TabsContent value="evalueringer" className="mt-2">
                <div className="space-y-3 pr-4">
                  {evaluations.map((ev) => (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => setOpenEvaluationId(ev.id)}
                      className="w-full text-left p-4 bg-card border border-border rounded-lg space-y-1 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">
                          {ev.mission_name || t("evaluation.logbook.noMission")}
                        </span>
                        <Badge variant={ev.status === "completed" ? "default" : "secondary"}>
                          {ev.status === "completed"
                            ? t("evaluation.mission.statusCompleted")
                            : t("evaluation.mission.statusDraft")}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {ev.evaluated_at
                          ? format(new Date(ev.evaluated_at), "d. MMMM yyyy", {
                              locale: i18n.language === "no" ? nb : undefined,
                            })
                          : "—"}
                        {ev.instructor_name ? ` · ${ev.instructor_name}` : ""}
                      </div>
                      {typeof ev.overall_average === "number" && (
                        <div className="text-sm">
                          {t("evaluation.logbook.average")}: {ev.overall_average.toFixed(1)}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </TabsContent>
            )}


            <TabsContent value="flyturer" className="mt-2">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-muted-foreground">Laster...</div>
                  </div>
                ) : flightLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Book className="w-12 h-12 text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground">Ingen loggførte flyturer</p>
                  </div>
                ) : (
                  <div className="space-y-3 pr-4">
                    {flightLogs.map((log) => (
                      <div
                        key={log.id}
                        className="p-4 bg-card border border-border rounded-lg space-y-2"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">
                              {format(new Date(log.flight_date), "d. MMMM yyyy", { locale: nb })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{formatDuration(log.flight_duration_minutes)}</Badge>
                            {isAdmin && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-primary"
                                title="Rediger flylogg (admin)"
                                onClick={() => setEditingFlightLogId(log.id)}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          {log.drone && (
                            <div className="flex items-center gap-1">
                              <Plane className="w-3 h-3" />
                              <span>{log.drone.modell} (SN: {log.drone.serienummer})</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-sm">
                          <MapPin className="w-3 h-3 text-muted-foreground" />
                          <span>{log.departure_location}</span>
                          <span className="text-muted-foreground">→</span>
                          <span>{log.landing_location}</span>
                          {log.movements > 1 && (
                            <Badge variant="secondary" className="text-xs">
                              {log.movements} landinger
                            </Badge>
                          )}
                        </div>

                        {log.mission && (
                          <div className="text-sm text-muted-foreground">
                            Oppdrag: {log.mission.tittel}
                          </div>
                        )}

                        {log.notes && (
                          <p className="text-sm text-muted-foreground border-t border-border pt-2 mt-2">
                            {log.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
            </TabsContent>

            <TabsContent value="innlegg" className="mt-2">
                {personnelLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Edit className="w-12 h-12 text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground">Ingen logginnlegg ennå</p>
                    <p className="text-xs text-muted-foreground mt-1">Klikk «Legg til logginnlegg» for å legge til</p>
                  </div>
                ) : (
                  <div className="space-y-3 pr-4">
                    {personnelLogs.map((entry) => (
                      <div
                        key={entry.id}
                        className="p-3 bg-card border border-border rounded-lg"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="secondary" className="text-xs">
                                {entry.entry_type || 'Merknad'}
                              </Badge>
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {format(new Date(entry.entry_date), "d. MMMM yyyy", { locale: nb })}
                              </span>
                            </div>
                            <p className="font-medium text-sm mt-1">{entry.title}</p>
                            {entry.description && (
                              <p className="text-sm text-muted-foreground mt-0.5">{entry.description}</p>
                            )}
                            {entry.imagePublicUrl && (
                              <button
                                type="button"
                                onClick={() => setLightboxUrl(entry.imagePublicUrl!)}
                                className="mt-2 relative group"
                              >
                                <img
                                  src={entry.imagePublicUrl}
                                  alt="Vedlegg"
                                  className="h-16 w-auto rounded-md border object-cover max-w-[120px]"
                                />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 rounded-md transition-opacity">
                                  <ZoomIn className="w-4 h-4 text-white" />
                                </div>
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {(isAdmin || entry.id) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-primary"
                                onClick={() => handleEditEntry(entry)}
                                title="Rediger"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeleteEntry(entry)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </TabsContent>
          </Tabs>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bekreft manuell registrering</AlertDialogTitle>
            <AlertDialogDescription>
              Er du sikker på at du ønsker å legge til {manualHours || "0"} timer og {manualMinutes || "0"} minutter manuelt? 
              Dette vil øke den totale flytiden permanent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleAddManualHours}>
              Bekreft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      <EditFlightLogDialog
        open={!!editingFlightLogId}
        onOpenChange={(o) => { if (!o) setEditingFlightLogId(null); }}
        flightLogId={editingFlightLogId}
        onSaved={() => { fetchFlightLogs(); fetchPersonnelLogs(); fetchProfileData(); }}
      />
    </>
  );
};
