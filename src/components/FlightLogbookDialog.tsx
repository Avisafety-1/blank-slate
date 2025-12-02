import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { Book, Plane, MapPin, Clock, Calendar } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

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
    registrering: string;
  } | null;
  mission: {
    tittel: string;
  } | null;
}

export const FlightLogbookDialog = ({ open, onOpenChange, personId, personName }: FlightLogbookDialogProps) => {
  const [flightLogs, setFlightLogs] = useState<FlightLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalMinutes, setTotalMinutes] = useState(0);

  useEffect(() => {
    if (open && personId) {
      fetchFlightLogs();
    }
  }, [open, personId]);

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
            registrering
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Book className="w-5 h-5 text-primary" />
            Loggbok - {personName}
          </DialogTitle>
        </DialogHeader>

        {/* Summary */}
        <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg border border-primary/20">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            <span className="font-medium">Total flytid</span>
          </div>
          <Badge variant="secondary" className="text-lg px-3 py-1">
            {formatDuration(totalMinutes)}
          </Badge>
        </div>

        <ScrollArea className="h-[calc(90vh-12rem)]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-muted-foreground">Laster...</div>
            </div>
          ) : flightLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Book className="w-12 h-12 text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">Ingen flytid registrert</p>
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
                        <span>{log.drone.modell} ({log.drone.registrering})</span>
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
  );
};