import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertCircle, Wind, Droplets, Thermometer, Eye, CloudRain, Loader2, AlertTriangle, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useTerminology } from "@/hooks/useTerminology";

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

  if (compact) {
    return (
      <div className="mt-2 space-y-2">
        <div className={cn(
          "flex items-center gap-2 p-2 rounded-lg border text-sm font-medium",
          getRecommendationColor(weatherData.drone_flight_recommendation)
        )}>
          {getRecommendationIcon(weatherData.drone_flight_recommendation)}
          <span>{terminology.vehicleWeather}: {getRecommendationText(weatherData.drone_flight_recommendation)}</span>
        </div>

        {weatherData.warnings.length > 0 && (
          <div className="space-y-1">
            {weatherData.warnings.map((warning, index) => (
              <Alert
                key={index}
                variant={warning.level === 'warning' ? 'destructive' : 'default'}
                className={cn(
                  "py-2",
                  warning.level === 'caution' && "bg-warning/10 border-warning text-warning",
                  warning.level === 'note' && "bg-info/10 border-info text-info"
                )}
              >
                <AlertDescription className="text-xs">{warning.message}</AlertDescription>
              </Alert>
            ))}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="flex items-center gap-1">
            <Wind className="w-3 h-3 text-muted-foreground" />
            <span>{weatherData.current.wind_speed?.toFixed(1) || '-'} m/s</span>
          </div>
          <div className="flex items-center gap-1">
            <Thermometer className="w-3 h-3 text-muted-foreground" />
            <span>{weatherData.current.temperature?.toFixed(1) || '-'}°C</span>
          </div>
          <div className="flex items-center gap-1">
            <Droplets className="w-3 h-3 text-muted-foreground" />
            <span>{weatherData.current.precipitation?.toFixed(1) || '0'} mm</span>
          </div>
        </div>
      </div>
    );
  }

  // Extended view
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

      <div className="text-xs text-muted-foreground pt-2 border-t">
        Værdata fra MET Norway • Oppdatert {new Date(weatherData.timestamp).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}
      </div>
    </Card>
  );
};
