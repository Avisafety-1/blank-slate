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
  Trash2
} from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

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
}

export const DroneLogbookDialog = ({ 
  open, 
  onOpenChange, 
  droneId, 
  droneModell,
  flyvetimer 
}: DroneLogbookDialogProps) => {
  const { user, companyId } = useAuth();
  const terminology = useTerminology();
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
    if (open && droneId) {
      fetchAllLogs();
    }
  }, [open, droneId]);

  const fetchAllLogs = async () => {
    setIsLoading(true);
    try {
      const logs: LogEntry[] = [];

      // Fetch flight logs
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
        .eq("drone_id", droneId)
        .order("flight_date", { ascending: false });

      if (flightLogs) {
        // Fetch user names for flights
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

      // Fetch inspections
      const { data: inspections } = await supabase
        .from("drone_inspections")
        .select("id, inspection_date, inspection_type, notes, user_id")
        .eq("drone_id", droneId)
        .order("inspection_date", { ascending: false });

      if (inspections) {
        const userIds = [...new Set(inspections.map(i => i.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);
        
        const userMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

        inspections.forEach(insp => {
          logs.push({
            id: `inspection-${insp.id}`,
            type: 'inspection',
            date: new Date(insp.inspection_date),
            title: `Inspeksjon${insp.inspection_type ? `: ${insp.inspection_type}` : ''}`,
            description: insp.notes || undefined,
            userName: userMap.get(insp.user_id) || 'Ukjent',
            icon: <Search className="w-4 h-4" />,
            badgeColor: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
            badgeText: 'Inspeksjon',
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
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);
        
        const userMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

        equipmentHistory.forEach(entry => {
          const isAdded = entry.action === 'added';
          logs.push({
            id: `equipment-${entry.id}`,
            type: isAdded ? 'equipment_added' : 'equipment_removed',
            date: new Date(entry.created_at),
            title: `${entry.item_name} ${isAdded ? 'lagt til' : 'fjernet'}`,
            description: `${entry.item_type === 'accessory' ? 'Tilleggsutstyr' : 'Utstyr'}`,
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
        .from("drone_log_entries")
        .select("id, entry_date, entry_type, title, description, user_id")
        .eq("drone_id", droneId)
        .order("entry_date", { ascending: false });

      if (manualEntries) {
        const userIds = [...new Set(manualEntries.map(e => e.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);
        
        const userMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

        manualEntries.forEach(entry => {
          logs.push({
            id: `manual-${entry.id}`,
            type: 'manual',
            date: new Date(entry.entry_date),
            title: entry.title,
            description: entry.description || undefined,
            userName: userMap.get(entry.user_id) || 'Ukjent',
            icon: <Edit className="w-4 h-4" />,
            badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
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
      const { error } = await supabase.from("drone_log_entries").insert({
        drone_id: droneId,
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
        .from("drone_log_entries")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Innlegg slettet");
      fetchAllLogs();
    } catch (error: any) {
      toast.error(`Kunne ikke slette: ${error.message}`);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Book className="w-5 h-5 text-primary" />
            Loggbok - {droneModell}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Totalt {Number(flyvetimer).toFixed(2)} flyvetimer
          </p>
        </DialogHeader>

        <div className="flex items-center justify-between mb-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowAddEntry(!showAddEntry)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Legg til innlegg
          </Button>
        </div>

        {showAddEntry && (
          <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select 
                  value={newEntry.entry_type} 
                  onValueChange={(v) => setNewEntry(prev => ({ ...prev, entry_type: v }))}
                >
                  <SelectTrigger>
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
                <Label>Dato</Label>
                <Input
                  type="date"
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
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="all">Alle</TabsTrigger>
            <TabsTrigger value="flights">Flyturer</TabsTrigger>
            <TabsTrigger value="inspections">Insp.</TabsTrigger>
            <TabsTrigger value="equipment">Utstyr</TabsTrigger>
            <TabsTrigger value="manual">Manuell</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="flex-1 min-h-0 mt-2">
            <ScrollArea className="h-[400px] pr-4">
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
                              <span className="font-medium text-sm truncate">
                                {log.title}
                              </span>
                              <Badge className={`${log.badgeColor} text-xs`}>
                                {log.badgeText}
                              </Badge>
                            </div>
                            {log.description && (
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                {log.description}
                              </p>
                            )}
                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {format(log.date, 'dd.MM.yyyy HH:mm', { locale: nb })}
                              </span>
                              <span className="flex items-center gap-1">
                                <User className="w-3 h-3" />
                                {log.userName}
                              </span>
                            </div>
                          </div>
                        </div>
                        {log.type === 'manual' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
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
