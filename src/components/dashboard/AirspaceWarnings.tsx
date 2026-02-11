import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertTriangle, AlertCircle, Info, Loader2, ChevronDown, ChevronUp } from "lucide-react";

interface AirspaceWarning {
  zone_type: string;
  zone_name: string;
  distance_meters: number;
  is_inside: boolean;
  level: "warning" | "caution" | "note";
  message: string;
}

interface RoutePoint {
  lat: number;
  lng: number;
}

interface AirspaceWarningsProps {
  latitude: number | null;
  longitude: number | null;
  routePoints?: RoutePoint[];
}

export const AirspaceWarnings = ({ latitude, longitude, routePoints }: AirspaceWarningsProps) => {
  const [warnings, setWarnings] = useState<AirspaceWarning[]>([]);
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

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
          p_lng: longitude,
          p_route: routePoints && routePoints.length > 0 ? JSON.parse(JSON.stringify(routePoints)) : null,
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
  }, [latitude, longitude, routePoints]);

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

  const firstWarning = warnings[0];
  const remainingWarnings = warnings.slice(1);
  const remainingCount = remainingWarnings.length;

  const renderAlert = (warning: AirspaceWarning, index: number) => {
    const isWarning = warning.level === "warning";
    const isCaution = warning.level === "caution";
    const isNote = warning.level === "note";

    return (
      <Alert
        key={index}
        variant="default"
        className={
          isWarning
            ? "border-destructive bg-destructive/20 text-foreground [&>svg]:text-foreground"
            : isCaution
            ? "border-amber-500 bg-amber-500/20 text-foreground [&>svg]:text-foreground"
            : "border-blue-500 bg-blue-500/20 text-foreground [&>svg]:text-foreground"
        }
      >
        {isWarning && <AlertTriangle className="h-5 w-5" />}
        {isCaution && <AlertCircle className="h-5 w-5" />}
        {isNote && <Info className="h-5 w-5" />}
        <AlertTitle className="font-semibold text-foreground">
          {isWarning && "ADVARSEL"}
          {isCaution && "FORSIKTIGHET"}
          {isNote && "INFORMASJON"}
        </AlertTitle>
        <AlertDescription className="text-sm mt-1 text-foreground">{warning.message}</AlertDescription>
      </Alert>
    );
  };

  return (
    <div className="space-y-2 mt-3">
      {/* Vis første (mest alvorlige) advarsel */}
      {renderAlert(firstWarning, 0)}
      
      {/* Vis dropdown for resten hvis det finnes flere */}
      {remainingCount > 0 && (
        <Collapsible 
          key={`collapsible-${warnings.length}`}
          open={isExpanded} 
          onOpenChange={setIsExpanded}
        >
          <CollapsibleTrigger asChild>
            <button 
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full py-2 cursor-pointer"
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <span>+{remainingCount} {remainingCount === 1 ? 'annen advarsel' : 'andre advarsler'}</span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 mt-2 overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
            {remainingWarnings.map((warning, index) => renderAlert(warning, index + 1))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};
