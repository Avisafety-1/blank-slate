import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect } from "react";
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
  Wrench
} from "lucide-react";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { sanitizeForPdf, sanitizeFilenameForPdf, formatDateForPdf } from "@/lib/pdfUtils";

interface EquipmentLogbookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipmentId: string;
  equipmentNavn: string;
  flyvetimer: number;
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
}

export const EquipmentLogbookDialog = ({ 
  open, 
  onOpenChange, 
  equipmentId, 
  equipmentNavn,
  flyvetimer 
}: EquipmentLogbookDialogProps) => {
  const { user, companyId } = useAuth();
  const [allLogs, setAllLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [newEntry, setNewEntry] = useState({
    entry_type: "merknad",
    title: "",
    description: "",
    entry_date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    if (open && equipmentId) {
      fetchAllLogs();
    }
  }, [open, equipmentId]);

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
          .select(`
            id,
            flight_date,
            flight_duration_minutes,
            departure_location,
            landing_location,
            notes,
            movements,
            user_id
          `)
          .in("id", flightLogIds)
          .order("flight_date", { ascending: false });

        if (flightLogs) {
          const userIds = [...new Set(flightLogs.map(f => f.user_id))];
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", userIds);
          
          const userMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

          flightLogs.forEach(log => {
            logs.push({
              id: `flight-${log.id}`,
              type: 'flight',
              date: new Date(log.flight_date),
              title: `Flytur: ${log.departure_location} → ${log.landing_location}`,
              description: `${log.flight_duration_minutes} min, ${log.movements} bevegelser${log.notes ? ` - ${log.notes}` : ''}`,
              userName: userMap.get(log.user_id) || 'Ukjent',
              icon: <Plane className="w-4 h-4" />,
              badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
              badgeText: 'Flytur',
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
        
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);
        
        const { data: drones } = await supabase
          .from("drones")
          .select("id, modell")
          .in("id", droneIds);
        
        const userMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);
        const droneMap = new Map(drones?.map(d => [d.id, d.modell]) || []);

        droneHistory.forEach(entry => {
          const isAdded = entry.action === 'added';
          const droneName = droneMap.get(entry.drone_id) || 'Ukjent drone';
          logs.push({
            id: `drone-${entry.id}`,
            type: isAdded ? 'drone_added' : 'drone_removed',
            date: new Date(entry.created_at),
            title: `${isAdded ? 'Lagt til' : 'Fjernet fra'} ${droneName}`,
            description: `Dronekobling`,
            userName: userMap.get(entry.user_id) || 'Ukjent',
            icon: isAdded ? <PackagePlus className="w-4 h-4" /> : <PackageMinus className="w-4 h-4" />,
            badgeColor: isAdded 
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
              : 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
            badgeText: isAdded ? 'Lagt til' : 'Fjernet',
          });
        });
      }

      // Fetch manual entries
      const { data: manualEntries } = await supabase
        .from("equipment_log_entries")
        .select("id, entry_date, entry_type, title, description, user_id")
        .eq("equipment_id", equipmentId)
        .order("entry_date", { ascending: false });

      if (manualEntries) {
        const userIds = [...new Set(manualEntries.map(e => e.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);
        
        const userMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

        manualEntries.forEach(entry => {
          const isVedlikehold = entry.entry_type === 'vedlikehold';
          logs.push({
            id: `manual-${entry.id}`,
            type: 'manual',
            date: new Date(entry.entry_date),
            title: entry.title,
            description: entry.description || undefined,
            userName: userMap.get(entry.user_id) || 'Ukjent',
            icon: isVedlikehold ? <Wrench className="w-4 h-4" /> : <Edit className="w-4 h-4" />,
            badgeColor: isVedlikehold
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
              : 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
            badgeText: entry.entry_type || 'Merknad',
          });
        });
      }

      // Sort all logs by date descending
      logs.sort((a, b) => b.date.getTime() - a.date.getTime());
      setAllLogs(logs);
    } catch (error) {
      console.error("Error fetching logs:", error);
      toast.error("Kunne ikke hente loggbok");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddEntry = async () => {
    if (!user || !companyId || !newEntry.title.trim()) {
      toast.error("Fyll inn tittel");
      return;
    }

    try {
      const { error } = await supabase.from("equipment_log_entries").insert({
        equipment_id: equipmentId,
        company_id: companyId,
        user_id: user.id,
        entry_date: newEntry.entry_date,
        entry_type: newEntry.entry_type,
        title: newEntry.title.trim(),
        description: newEntry.description.trim() || null,
      });

      if (error) throw error;

      toast.success("Innlegg lagt til");
      setNewEntry({
        entry_type: "merknad",
        title: "",
        description: "",
        entry_date: new Date().toISOString().split('T')[0],
      });
      setShowAddEntry(false);
      fetchAllLogs();
    } catch (error: any) {
      console.error("Error adding entry:", error);
      toast.error(`Kunne ikke legge til innlegg: ${error.message}`);
    }
  };

  const handleDeleteEntry = async (logId: string) => {
    const [type, id] = logId.split('-');
    if (type !== 'manual') return;

    try {
      const { error } = await supabase
        .from("equipment_log_entries")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Innlegg slettet");
      fetchAllLogs();
    } catch (error: any) {
      toast.error(`Kunne ikke slette: ${error.message}`);
    }
  };

  const handleExportPDF = async () => {
    if (!user || !companyId) {
      toast.error("Du må være innlogget");
      return;
    }

    try {
      const pdf = new jsPDF();
      const dateStr = format(new Date(), 'dd.MM.yyyy');
      const timeStr = format(new Date(), 'HH:mm');
      
      // Header
      pdf.setFontSize(18);
      pdf.text(sanitizeForPdf(`Loggbok - ${equipmentNavn}`), 14, 20);
      pdf.setFontSize(11);
      pdf.text(`Totalt ${Number(flyvetimer).toFixed(2)} flyvetimer`, 14, 28);
      pdf.text(`Eksportert: ${dateStr} ${timeStr}`, 14, 35);
      
      // Table with all entries
      const tableData = allLogs.map(log => [
        formatDateForPdf(log.date, 'dd.MM.yyyy HH:mm'),
        sanitizeForPdf(log.badgeText),
        sanitizeForPdf(log.title),
        sanitizeForPdf(log.description) || '',
        sanitizeForPdf(log.userName) || 'Ukjent'
      ]);

      autoTable(pdf, {
        startY: 45,
        head: [['Dato', 'Type', 'Tittel', 'Beskrivelse', 'Utfort av']],
        body: tableData,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [59, 130, 246] },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 25 },
          2: { cellWidth: 45 },
          3: { cellWidth: 55 },
          4: { cellWidth: 30 },
        },
      });

      // Convert PDF to blob
      const pdfBlob = pdf.output('blob');
      const safeName = sanitizeFilenameForPdf(equipmentNavn);
      const fileName = `loggbok-utstyr-${safeName}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      const filePath = `${companyId}/${user.id}/${Date.now()}-${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, pdfBlob, { contentType: 'application/pdf' });

      if (uploadError) throw uploadError;

      // Create document entry
      const { error: insertError } = await supabase.from('documents').insert({
        tittel: sanitizeForPdf(`Loggbok - ${equipmentNavn} - ${dateStr}`),
        kategori: 'loggbok',
        fil_url: filePath,
        fil_navn: fileName,
        fil_storrelse: pdfBlob.size,
        company_id: companyId,
        user_id: user.id,
      });

      if (insertError) throw insertError;

      toast.success('Loggbok eksportert til dokumenter');
    } catch (error: any) {
      console.error('Error exporting PDF:', error);
      toast.error(`Kunne ikke eksportere: ${error.message}`);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Book className="w-5 h-5 text-primary" />
            Loggbok - {equipmentNavn}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Totalt {Number(flyvetimer).toFixed(2)} flyvetimer
          </p>
        </DialogHeader>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowAddEntry(!showAddEntry)}
            className="w-full sm:w-auto"
          >
            <Plus className="w-4 h-4 mr-2" />
            Legg til innlegg
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleExportPDF}
            className="w-full sm:w-auto"
          >
            <FileText className="w-4 h-4 mr-2" />
            Eksporter PDF
          </Button>
        </div>

        {showAddEntry && (
          <div className="border rounded-lg p-3 sm:p-4 space-y-3 bg-muted/30">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs sm:text-sm">Type</Label>
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
                    <SelectItem value="vedlikehold">Vedlikehold</SelectItem>
                    <SelectItem value="annet">Annet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs sm:text-sm">Dato</Label>
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
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAddEntry}>Lagre</Button>
              <Button size="sm" variant="outline" onClick={() => setShowAddEntry(false)}>Avbryt</Button>
            </div>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="flex w-full overflow-x-auto no-scrollbar">
            <TabsTrigger value="all" className="flex-1 min-w-[50px] text-xs sm:text-sm">Alle</TabsTrigger>
            <TabsTrigger value="flights" className="flex-1 min-w-[50px] text-xs sm:text-sm">Flyturer</TabsTrigger>
            <TabsTrigger value="drones" className="flex-1 min-w-[50px] text-xs sm:text-sm">Droner</TabsTrigger>
            <TabsTrigger value="manual" className="flex-1 min-w-[50px] text-xs sm:text-sm">Manuelt</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="flex-1 min-h-0 mt-2">
            <ScrollArea className="h-[calc(60vh-200px)] sm:h-[400px] min-h-[200px] max-h-[400px] pr-2 sm:pr-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  Laster loggbok...
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  Ingen oppføringer
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredLogs.map((log) => (
                    <div 
                      key={log.id} 
                      className="border rounded-lg p-3 bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="text-muted-foreground mt-0.5">
                            {log.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge className={`${log.badgeColor} text-xs`}>
                                {log.badgeText}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {format(log.date, 'dd.MM.yyyy HH:mm')}
                              </span>
                            </div>
                            <p className="font-medium text-sm mt-1 break-words">{log.title}</p>
                            {log.description && (
                              <p className="text-sm text-muted-foreground mt-0.5 break-words">{log.description}</p>
                            )}
                            {log.userName && (
                              <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                                <User className="w-3 h-3" />
                                {log.userName}
                              </div>
                            )}
                          </div>
                        </div>
                        {log.type === 'manual' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeleteEntry(log.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
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
  );
};
