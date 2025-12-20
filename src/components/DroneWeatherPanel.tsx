import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertCircle, Wind, Droplets, Thermometer, CloudRain, Loader2, AlertTriangle, Info, Clock, Sparkles } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useTerminology } from "@/hooks/useTerminology";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface DroneWeatherPanelProps {
  latitude: number | null;
  longitude: number | null;
  compact?: boolean;
}

interface WeatherWarning {
  level: 'warning' | 'caution' | 'note';
  type: string;
  message: string;
  value: number;
  unit: string;
}

interface HourlyForecast {
  time: string;
  temperature: number | null;
  wind_speed: number | null;
  wind_gust: number | null;
  precipitation: number;
  symbol: string;
  recommendation: 'ok' | 'caution' | 'warning';
}

interface BestFlightWindow {
  start_time: string;
  end_time: string;
  duration_hours: number;
}

interface WeatherData {
  location: { lat: number; lon: number };
  timestamp: string;
  current: {
    temperature: number | null;
    wind_speed: number | null;
    wind_gust: number | null;
    wind_direction: number | null;
    humidity: number | null;
    precipitation: number;
    symbol: string;
  };
  warnings: WeatherWarning[];
  hourly_forecast: HourlyForecast[];
  best_flight_window: BestFlightWindow | null;
  forecast_6h: {
    temperature: number | null;
    wind_speed: number | null;
    precipitation: number;
  } | null;
  drone_flight_recommendation: 'ok' | 'caution' | 'warning' | 'unknown';
}

export const DroneWeatherPanel = ({ latitude, longitude, compact = false }: DroneWeatherPanelProps) => {
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const terminology = useTerminology();

  useEffect(() => {
    if (latitude && longitude) {
      fetchWeather();
    } else {
      setWeatherData(null);
    }
  }, [latitude, longitude]);

  const fetchWeather = async () => {
    if (!latitude || !longitude) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error: functionError } = await supabase.functions.invoke('drone-weather', {
        body: { lat: latitude, lon: longitude }
      });

      if (functionError) throw functionError;
      
      setWeatherData(data);
    } catch (err: any) {
      console.error('Error fetching drone weather:', err);
      setError(err.message || 'Kunne ikke hente værdata');
    } finally {
      setLoading(false);
    }
  };

  if (!latitude || !longitude) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Henter {terminology.vehicleWeather.toLowerCase()}...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mt-2">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!weatherData) {
    return null;
  }

  const getRecommendationColor = (recommendation: string) => {
    switch (recommendation) {
      case 'warning':
        return 'bg-destructive/10 border-destructive text-destructive';
      case 'caution':
        return 'bg-warning/10 border-warning text-warning';
      case 'ok':
        return 'bg-success/10 border-success text-success';
      default:
        return 'bg-muted border-border text-muted-foreground';
    }
  };

  const getRecommendationIcon = (recommendation: string) => {
    switch (recommendation) {
      case 'warning':
        return <AlertCircle className="w-4 h-4" />;
      case 'caution':
        return <AlertTriangle className="w-4 h-4" />;
      case 'ok':
        return <Info className="w-4 h-4" />;
      default:
        return <Info className="w-4 h-4" />;
    }
  };

  const getRecommendationText = (recommendation: string) => {
    switch (recommendation) {
      case 'warning':
        return 'Anbefales ikke å fly';
      case 'caution':
        return 'Fly med forsiktighet';
      case 'ok':
        return 'Gode flyforhold';
      default:
        return 'Ukjent';
    }
  };

  const getTimelineBlockColor = (recommendation: string) => {
    switch (recommendation) {
      case 'warning':
        return 'bg-destructive';
      case 'caution':
        return 'bg-warning';
      case 'ok':
        return 'bg-success';
      default:
        return 'bg-muted';
    }
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
  };

  const formatHour = (isoString: string) => {
    return new Date(isoString).getHours().toString().padStart(2, '0');
  };

  // Get only 12 hours for compact timeline
  const displayForecast = weatherData.hourly_forecast?.slice(0, 12) || [];

  if (compact) {
    return (
      <Card className="mt-3 p-3 space-y-3 bg-card/50 border">
        {/* Header with status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold">{terminology.vehicleWeather}</h4>
            <span className="text-xs text-muted-foreground">
              • {new Date(weatherData.timestamp).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <div className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium",
            getRecommendationColor(weatherData.drone_flight_recommendation)
          )}>
            {getRecommendationIcon(weatherData.drone_flight_recommendation)}
            <span>{getRecommendationText(weatherData.drone_flight_recommendation)}</span>
          </div>
        </div>

        {/* Warnings */}
        {weatherData.warnings.length > 0 && (
          <div className="space-y-1">
            {weatherData.warnings.map((warning, index) => (
              <Alert
                key={index}
                variant={warning.level === 'warning' ? 'destructive' : 'default'}
                className={cn(
                  "py-1.5",
                  warning.level === 'caution' && "bg-warning/10 border-warning text-warning",
                  warning.level === 'note' && "bg-muted border-border text-muted-foreground"
                )}
              >
                <AlertDescription className="text-xs">{warning.message}</AlertDescription>
              </Alert>
            ))}
          </div>
        )}

        {/* Current conditions */}
        <div className="grid grid-cols-3 gap-3 py-2 px-3 rounded-md bg-muted/50">
          <div className="flex items-center gap-1.5 text-sm">
            <Wind className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">{weatherData.current.wind_speed?.toFixed(1) || '-'} m/s</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <Thermometer className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">{weatherData.current.temperature?.toFixed(1) || '-'}°C</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <Droplets className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">{weatherData.current.precipitation?.toFixed(1) || '0'} mm</span>
          </div>
        </div>

        {/* Forecast section */}
        {displayForecast.length > 0 && (
          <div className="pt-2 border-t space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                <span>Prognose neste 12 timer</span>
              </div>
              {/* Legend */}
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <div className="flex items-center gap-0.5">
                  <div className="w-2 h-2 rounded-sm bg-success" />
                  <span>OK</span>
                </div>
                <div className="flex items-center gap-0.5">
                  <div className="w-2 h-2 rounded-sm bg-warning" />
                  <span>Forsiktig</span>
                </div>
                <div className="flex items-center gap-0.5">
                  <div className="w-2 h-2 rounded-sm bg-destructive" />
                  <span>Ikke fly</span>
                </div>
              </div>
            </div>
            
            {/* Timeline */}
            <TooltipProvider>
              <div className="flex gap-1 py-1">
                {displayForecast.map((hour, index) => (
                  <Tooltip key={index}>
                    <TooltipTrigger asChild>
                      <div className="flex-1 flex flex-col items-center gap-0.5">
                        <div
                          className={cn(
                            "w-full h-5 rounded cursor-pointer transition-all hover:scale-y-110",
                            getTimelineBlockColor(hour.recommendation)
                          )}
                        />
                        <span className="text-[9px] text-muted-foreground">{formatHour(hour.time)}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      <div className="font-medium">{formatTime(hour.time)}</div>
                      <div>{hour.temperature?.toFixed(0)}°C • {hour.wind_speed?.toFixed(0)} m/s • {hour.precipitation?.toFixed(1)} mm</div>
                      <div className={cn(
                        "font-medium",
                        hour.recommendation === 'ok' && "text-success",
                        hour.recommendation === 'caution' && "text-warning",
                        hour.recommendation === 'warning' && "text-destructive"
                      )}>{getRecommendationText(hour.recommendation)}</div>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </TooltipProvider>

            {/* Best flight window */}
            {weatherData.best_flight_window && (
              <div className="flex items-center gap-1.5 text-xs text-success font-medium">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Beste flyvindu: {formatTime(weatherData.best_flight_window.start_time)} - {formatTime(weatherData.best_flight_window.end_time)} ({weatherData.best_flight_window.duration_hours}t)</span>
              </div>
            )}
          </div>
        )}
      </Card>
    );
  }

  // Extended view with tabs
  return (
    <Card className="mt-2 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{terminology.vehicleWeather}</h3>
        <div className={cn(
          "flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium",
          getRecommendationColor(weatherData.drone_flight_recommendation)
        )}>
          {getRecommendationIcon(weatherData.drone_flight_recommendation)}
          <span>{getRecommendationText(weatherData.drone_flight_recommendation)}</span>
        </div>
      </div>

      <Tabs defaultValue="now" className="w-full">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="now">Nå</TabsTrigger>
          <TabsTrigger value="forecast">Prognose 24t</TabsTrigger>
        </TabsList>

        <TabsContent value="now" className="space-y-3 mt-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Wind className="w-4 h-4" />
                <span>Vind</span>
              </div>
              <div className="font-medium">
                {weatherData.current.wind_speed?.toFixed(1) || '-'} m/s
                {weatherData.current.wind_gust && weatherData.current.wind_gust > 0 && (
                  <span className="text-xs text-muted-foreground ml-1">
                    (kast {weatherData.current.wind_gust.toFixed(1)} m/s)
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Thermometer className="w-4 h-4" />
                <span>Temperatur</span>
              </div>
              <div className="font-medium">{weatherData.current.temperature?.toFixed(1) || '-'}°C</div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Droplets className="w-4 h-4" />
                <span>Nedbør</span>
              </div>
              <div className="font-medium">{weatherData.current.precipitation?.toFixed(1) || '0'} mm/t</div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <CloudRain className="w-4 h-4" />
                <span>Fuktighet</span>
              </div>
              <div className="font-medium">{weatherData.current.humidity?.toFixed(0) || '-'}%</div>
            </div>
          </div>

          {weatherData.warnings.length > 0 && (
            <div className="space-y-2 pt-2 border-t">
              <h4 className="text-xs font-semibold text-muted-foreground">Væradvarsler</h4>
              {weatherData.warnings.map((warning, index) => (
                <Alert
                  key={index}
                  variant={warning.level === 'warning' ? 'destructive' : 'default'}
                  className={cn(
                    warning.level === 'caution' && "bg-warning/10 border-warning text-warning",
                    warning.level === 'note' && "bg-info/10 border-info text-info"
                  )}
                >
                  <AlertDescription className="text-xs">{warning.message}</AlertDescription>
                </Alert>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="forecast" className="space-y-3 mt-3">
          {/* Best flight window highlight */}
          {weatherData.best_flight_window && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-success/10 border border-success text-success text-sm">
              <Sparkles className="w-4 h-4" />
              <span className="font-medium">
                Beste flyvindu: {formatTime(weatherData.best_flight_window.start_time)} - {formatTime(weatherData.best_flight_window.end_time)} ({weatherData.best_flight_window.duration_hours} timer)
              </span>
            </div>
          )}

          {/* Timeline */}
          <div className="space-y-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>Timeprognose</span>
            </div>
            
            <TooltipProvider>
              <div className="flex gap-0.5">
                {weatherData.hourly_forecast?.slice(0, 24).map((hour, index) => (
                  <Tooltip key={index}>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          "flex-1 h-6 rounded-sm cursor-pointer transition-all hover:scale-y-110 flex items-end justify-center",
                          getTimelineBlockColor(hour.recommendation)
                        )}
                      >
                        {index % 3 === 0 && (
                          <span className="text-[8px] text-white/80 font-medium pb-0.5">
                            {formatHour(hour.time)}
                          </span>
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs space-y-1">
                      <div className="font-semibold">{formatTime(hour.time)}</div>
                      <div className="flex items-center gap-2">
                        <Thermometer className="w-3 h-3" />
                        <span>{hour.temperature?.toFixed(1)}°C</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Wind className="w-3 h-3" />
                        <span>{hour.wind_speed?.toFixed(1)} m/s</span>
                        {hour.wind_gust && hour.wind_gust > 0 && (
                          <span className="text-muted-foreground">(kast {hour.wind_gust.toFixed(1)})</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Droplets className="w-3 h-3" />
                        <span>{hour.precipitation?.toFixed(1)} mm</span>
                      </div>
                      <div className={cn(
                        "font-medium pt-1 border-t",
                        hour.recommendation === 'ok' && "text-success",
                        hour.recommendation === 'caution' && "text-warning",
                        hour.recommendation === 'warning' && "text-destructive"
                      )}>
                        {getRecommendationText(hour.recommendation)}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </TooltipProvider>

            {/* Legend */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm bg-success" />
                <span>OK</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm bg-warning" />
                <span>Forsiktighet</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm bg-destructive" />
                <span>Ikke fly</span>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <div className="text-xs text-muted-foreground pt-2 border-t">
        Værdata fra MET Norway • Oppdatert {new Date(weatherData.timestamp).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}
      </div>
    </Card>
  );
};
