import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { Book, Plane, MapPin, Clock, Calendar, Plus, FileText } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
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
drone: {
    modell: string;
    serienummer: string;
  } | null;
  mission: {
    tittel: string;
  } | null;
}

export const FlightLogbookDialog = ({ open, onOpenChange, personId, personName }: FlightLogbookDialogProps) => {
  const { user, companyId } = useAuth();
  const [flightLogs, setFlightLogs] = useState<FlightLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [profileFlyvetimer, setProfileFlyvetimer] = useState(0);
  const [showAddHours, setShowAddHours] = useState(false);
  const [manualHours, setManualHours] = useState("");
  const [manualMinutes, setManualMinutes] = useState("");
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (open && personId) {
      fetchFlightLogs();
      fetchProfileFlyvetimer();
    }
  }, [open, personId]);

  const fetchProfileFlyvetimer = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("flyvetimer")
      .eq("id", personId)
      .single();
    setProfileFlyvetimer(Number(data?.flyvetimer) || 0);
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
    const additionalMinutes = (parseInt(manualHours) || 0) * 60 + (parseInt(manualMinutes) || 0);
    const additionalHours = additionalMinutes / 60;
    const newTotal = profileFlyvetimer + additionalHours;
    
    const { error } = await supabase
      .from("profiles")
      .update({ flyvetimer: newTotal })
      .eq("id", personId);

    if (error) {
      toast.error("Kunne ikke legge til flytimer");
      console.error(error);
    } else {
      toast.success("Flytimer lagt til");
      setProfileFlyvetimer(newTotal);
      setManualHours("");
      setManualMinutes("");
      setShowAddHours(false);
    }
    setConfirmDialogOpen(false);
  };

  const fetchFlightLogs = async () => {
    setLoading(true);
    try {
      // Get flight log IDs for this person
      const { data: personnelLogs } = await (supabase as any)
        .from("flight_log_personnel")
        .select("flight_log_id")
        .eq("profile_id", personId);

      if (!personnelLogs || personnelLogs.length === 0) {
        setFlightLogs([]);
        setTotalMinutes(0);
        setLoading(false);
        return;
      }

      const logIds = personnelLogs.map((p: any) => p.flight_log_id);

      // Fetch full flight log details
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
        const total = logs.reduce((sum: number, log: FlightLog) => sum + log.flight_duration_minutes, 0);
        setTotalMinutes(total);
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

  const totalFlytid = totalMinutes + (profileFlyvetimer * 60);

  const handleExportPDF = async () => {
    if (!companyId || !user) {
      toast.error("Mangler bruker- eller bedriftsinformasjon");
      return;
    }

    setExporting(true);
    try {
      const doc = new jsPDF();
      
      // Header
      doc.setFontSize(18);
      doc.text(`Loggbok - ${personName}`, 14, 20);
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Eksportert: ${format(new Date(), "d. MMMM yyyy", { locale: nb })}`, 14, 28);
      
      // Total flight time
      doc.setFontSize(12);
      doc.setTextColor(0);
      doc.text(`Total flytid: ${formatDuration(Math.round(totalFlytid))}`, 14, 40);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Fra loggførte flyturer: ${formatDuration(totalMinutes)}`, 14, 47);
      if (profileFlyvetimer > 0) {
        doc.text(`Manuelt lagt til: ${formatDuration(Math.round(profileFlyvetimer * 60))}`, 14, 54);
      }
      
      // Flight logs table
      const tableData = flightLogs.map(log => [
        format(new Date(log.flight_date), "dd.MM.yyyy"),
        log.departure_location,
        log.landing_location,
        formatDuration(log.flight_duration_minutes),
        log.drone?.modell || "-",
        log.mission?.tittel || "-"
      ]);
      
      autoTable(doc, {
        startY: profileFlyvetimer > 0 ? 62 : 55,
        head: [["Dato", "Avgang", "Landing", "Varighet", "Drone", "Oppdrag"]],
        body: tableData,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [59, 130, 246] }
      });
      
      // Generate filename
      const safeName = personName.replace(/[^a-zA-Z0-9æøåÆØÅ\s]/g, "").replace(/\s+/g, "_");
      const dateStr = format(new Date(), "yyyy-MM-dd");
      const fileName = `loggbok_${safeName}_${dateStr}.pdf`;
      
      // Upload to storage
      const pdfBlob = doc.output("blob");
      const filePath = `${companyId}/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, pdfBlob, { contentType: "application/pdf", upsert: true });
      
      if (uploadError) throw uploadError;
      
      // Create document record
      const { error: docError } = await supabase.from("documents").insert({
        company_id: companyId,
        user_id: user.id,
        tittel: `Loggbok - ${personName}`,
        kategori: "loggbok",
        fil_navn: fileName,
        fil_url: filePath,
        fil_storrelse: pdfBlob.size,
        beskrivelse: `Personlig flyloggbok eksportert ${format(new Date(), "d. MMMM yyyy", { locale: nb })}`
      });
      
      if (docError) throw docError;
      
      toast.success("Loggbok eksportert til dokumenter");
    } catch (error) {
      console.error("Error exporting PDF:", error);
      toast.error("Kunne ikke eksportere loggbok");
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Book className="w-5 h-5 text-primary" />
              Loggbok - {personName}
            </DialogTitle>
          </DialogHeader>

          {/* Summary */}
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg border border-primary/20">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                <span className="font-medium">Total flytid</span>
              </div>
              <Badge variant="secondary" className="text-lg px-3 py-1">
                {formatDuration(Math.round(totalFlytid))}
              </Badge>
            </div>

            {/* Breakdown */}
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground px-1">
              <span>Fra loggførte flyturer: {formatDuration(totalMinutes)}</span>
              {profileFlyvetimer > 0 && (
                <span>Manuelt lagt til: {formatDuration(Math.round(profileFlyvetimer * 60))}</span>
              )}
            </div>

            {/* Actions */}
            {!showAddHours ? (
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddHours(true)}
                  className="flex-1"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Legg til flytimer manuelt
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportPDF}
                  disabled={exporting}
                  className="flex-1"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  {exporting ? "Eksporterer..." : "Eksporter PDF"}
                </Button>
              </div>
            ) : (
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
                    onClick={() => {
                      setShowAddHours(false);
                      setManualHours("");
                      setManualMinutes("");
                    }}
                  >
                    Avbryt
                  </Button>
                  <Button size="sm" onClick={handleConfirmAddHours}>
                    Legg til
                  </Button>
                </div>
              </div>
            )}
          </div>

          <ScrollArea className="h-[calc(90vh-18rem)]">
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
                      <Badge variant="outline">{formatDuration(log.flight_duration_minutes)}</Badge>
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
          </ScrollArea>
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
    </>
  );
};