import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Clock, Ruler, ArrowUpFromLine, User, MapPin, Loader2, Route as RouteIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { nb, enUS } from "date-fns/locale";
import type { FlightLogListItem } from "@/hooks/useFlightLogsList";

interface Props {
  log: FlightLogListItem;
  onOpen: (log: FlightLogListItem) => void;
  opening?: boolean;
}

export const FlightLogCard = ({ log, onOpen, opening }: Props) => {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === "en" ? enUS : nb;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [visible, setVisible] = useState(false);
  const [positions, setPositions] = useState<any[] | null>(null);
  const [trackLoaded, setTrackLoaded] = useState(false);

  // Lazy: only fetch the track / build the map once the card scrolls into view
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || trackLoaded) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("flight_logs")
        .select("flight_track")
        .eq("id", log.id)
        .maybeSingle();
      if (cancelled) return;
      const pos = (data?.flight_track?.positions || []).filter(
        (p: any) => typeof p?.lat === "number" && typeof p?.lng === "number"
      );
      setPositions(pos);
      setTrackLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, trackLoaded, log.id]);

  useEffect(() => {
    if (!positions || positions.length < 2 || !mapElRef.current || mapRef.current) return;

    // Downsample for a light thumbnail
    const step = Math.max(1, Math.floor(positions.length / 200));
    const latLngs = positions
      .filter((_, i) => i % step === 0)
      .map(p => [p.lat, p.lng] as [number, number]);

    const map = L.map(mapElRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
      tap: false,
    });
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(map);
    const line = L.polyline(latLngs, { color: "hsl(210, 90%, 55%)", weight: 3, opacity: 0.9 }).addTo(map);
    try {
      map.fitBounds(line.getBounds(), { padding: [12, 12] });
    } catch {
      map.setView(latLngs[0], 13);
    }
    const timer = window.setTimeout(() => {
      if (mapRef.current === map && (map as any)._container?.isConnected) {
        try { map.invalidateSize(); } catch { /* map torn down */ }
      }
    }, 60);

    return () => {
      window.clearTimeout(timer);
      mapRef.current = null;
      try { map.remove(); } catch { /* already detached */ }
    };
  }, [positions]);

  const sourceLabel =
    log.source === "ardupilot"
      ? "ArduPilot"
      : log.source === "dji" || log.source === "dronelog"
        ? "DJI"
        : t("flightLogs.sourceManual");

  const duration = log.flight_duration_minutes ?? null;
  const distanceKm = log.total_distance_m != null ? (log.total_distance_m / 1000).toFixed(2) : null;

  return (
    <button
      type="button"
      ref={containerRef as any}
      onClick={() => onOpen(log)}
      className="group text-left rounded-xl border border-border/60 bg-card/70 backdrop-blur-sm overflow-hidden hover:border-primary/60 hover:bg-card transition-colors flex flex-col"
    >
      <div className="relative h-28 bg-muted/40">
        {positions && positions.length >= 2 ? (
          <div ref={mapElRef} className="absolute inset-0" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            {!trackLoaded && visible ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RouteIcon className="w-5 h-5 opacity-50" />
            )}
          </div>
        )}
        {opening && (
          <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        )}
        <Badge variant="secondary" className="absolute top-1.5 right-1.5 text-[10px] py-0 px-1.5 h-4">
          {sourceLabel}
        </Badge>
      </div>

      <div className="p-2.5 space-y-1 min-w-0 flex-1">
        <p className="text-xs font-semibold truncate">
          {log.droneLabel || log.drone_model || t("flightLogs.unknownDrone")}
        </p>
        <p className="text-[11px] text-muted-foreground truncate">
          {log.flight_date
            ? format(new Date(log.flight_date), "dd. MMM yyyy HH:mm", { locale: dateLocale })
            : "—"}
        </p>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          {duration != null && (
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {duration} min
            </span>
          )}
          {distanceKm && (
            <span className="inline-flex items-center gap-1">
              <Ruler className="w-3 h-3" />
              {distanceKm} km
            </span>
          )}
          {log.max_height_m != null && (
            <span className="inline-flex items-center gap-1">
              <ArrowUpFromLine className="w-3 h-3" />
              {Math.round(log.max_height_m)} m
            </span>
          )}
        </div>
        {log.pilotName && (
          <p className="text-[11px] text-muted-foreground truncate inline-flex items-center gap-1">
            <User className="w-3 h-3 shrink-0" />
            {log.pilotName}
          </p>
        )}
        {log.departure_location && (
          <p className="text-[11px] text-muted-foreground truncate inline-flex items-center gap-1">
            <MapPin className="w-3 h-3 shrink-0" />
            {log.departure_location}
          </p>
        )}
        <div className="flex flex-wrap gap-1">
          {log.companyName && (
            <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4 max-w-full truncate">
              {log.companyName}
            </Badge>
          )}
          {log.missionName && (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 max-w-full truncate">
              {log.missionName}
            </Badge>
          )}
        </div>

      </div>
    </button>
  );
};
