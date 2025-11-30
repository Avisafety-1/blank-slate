import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, AlertCircle, Info, Loader2 } from "lucide-react";

interface AirspaceWarning {
  zone_type: string;
  zone_name: string;
  distance_meters: number;
  is_inside: boolean;
  level: "warning" | "caution" | "note";
  message: string;
}

interface AirspaceWarningsProps {
  latitude: number | null;
  longitude: number | null;
}

export const AirspaceWarnings = ({ latitude, longitude }: AirspaceWarningsProps) => {
  const [warnings, setWarnings] = useState<AirspaceWarning[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!latitude || !longitude) {
      setWarnings([]);
      return;
    }

    const checkAirspace = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc("check_mission_airspace", {
          p_lat: latitude,
          p_lon: longitude,
        });

        if (error) {
          console.error("Error checking airspace:", error);
          return;
        }

        // Cast data to array and sort warnings by severity: warning > caution > note
        const warningsArray = (data as unknown as AirspaceWarning[]) || [];
        const severityOrder = { warning: 0, caution: 1, note: 2 };
        const sortedWarnings = warningsArray.sort(
          (a, b) => severityOrder[a.level] - severityOrder[b.level]
        );

        setWarnings(sortedWarnings);
      } catch (error) {
        console.error("Error checking airspace:", error);
      } finally {
        setLoading(false);
      }
    };

    // Debounce to avoid too many calls
    const timeoutId = setTimeout(checkAirspace, 500);
    return () => clearTimeout(timeoutId);
  }, [latitude, longitude]);

  if (!latitude || !longitude) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Sjekker luftrom...</span>
      </div>
    );
  }

  if (warnings.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 mt-3">
      {warnings.map((warning, index) => {
        const isWarning = warning.level === "warning";
        const isCaution = warning.level === "caution";
        const isNote = warning.level === "note";

        return (
          <Alert
            key={index}
            variant={isWarning ? "destructive" : "default"}
            className={
              isWarning
                ? "border-destructive bg-destructive/10"
                : isCaution
                ? "border-amber-500 bg-amber-50 dark:bg-amber-950 text-amber-900 dark:text-amber-100"
                : "border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-900 dark:text-blue-100"
            }
          >
            {isWarning && <AlertTriangle className="h-5 w-5 text-destructive" />}
            {isCaution && <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />}
            {isNote && <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
            <AlertTitle className="font-semibold">
              {isWarning && "ADVARSEL"}
              {isCaution && "FORSIKTIGHET"}
              {isNote && "INFORMASJON"}
            </AlertTitle>
            <AlertDescription className="text-sm mt-1">{warning.message}</AlertDescription>
          </Alert>
        );
      })}
    </div>
  );
};
