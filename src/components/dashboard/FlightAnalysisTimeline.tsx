import { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import { 
  Mountain, Gauge, Battery, Radio, Gamepad2, Wind, Satellite, Navigation, AlertTriangle, Thermometer
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StickWidget } from "./StickWidget";

interface TelemetryPoint {
  lat: number; lng: number; alt: number; height: number; timestamp: string;
  speed?: number; vSpeed?: number; battery?: number; voltage?: number;
  current?: number; temp?: number; gpsNum?: number; gpsLevel?: number;
  pitch?: number; roll?: number; yaw?: number;
  rcAileron?: number; rcElevator?: number; rcRudder?: number; rcThrottle?: number;
  gimbalPitch?: number; gimbalRoll?: number; gimbalYaw?: number;
  dist2D?: number; dist3D?: number; elevation?: number;
  flycState?: string; groundOrSky?: string;
  windSpeed?: number; windDir?: number;
  // Dual-battery fields
  battery1?: number; voltage1?: number; current1?: number; temp1?: number;
  battery2?: number; voltage2?: number; current2?: number; temp2?: number;
}

interface FlightAnalysisTimelineProps {
  positions: TelemetryPoint[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  events?: Array<{ type: string; message: string; t_offset_ms: number | null }>;
  showWarnings?: boolean;
}

const formatTime = (idx: number, positions: TelemetryPoint[]) => {
  const ts = positions[idx]?.timestamp;
  if (!ts) return `#${idx}`;
  const match = ts.match(/PT(\d+)S/);
  if (match) {
    const sec = parseInt(match[1]);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  try {
    return new Date(ts).toLocaleTimeString("nb-NO", { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return `#${idx}`; }
};

const ChartTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover text-popover-foreground border border-border rounded-lg p-2 text-xs shadow-lg">
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.stroke || p.color }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
        </div>
      ))}
    </div>
  );
};

const hasData = (positions: TelemetryPoint[], key: keyof TelemetryPoint) =>
  positions.some(p => p[key] !== undefined && p[key] !== null);

export const FlightAnalysisTimeline = ({ positions, currentIndex, onIndexChange, events, showWarnings = true }: FlightAnalysisTimelineProps) => {
  const [activeChart, setActiveChart] = useState("altitude");

  const isDualBattery = useMemo(() => hasData(positions, 'battery1'), [positions]);

  const chartData = useMemo(() => 
    positions.map((p, i) => ({ ...p, idx: i, time: formatTime(i, positions) })),
    [positions]
  );

  const current = positions[currentIndex];

  const availableTabs = useMemo(() => {
    const tabs: Array<{ id: string; label: string; icon: any; always?: boolean; key?: keyof TelemetryPoint; custom?: boolean }> = [
      { id: "altitude", label: "Høyde", icon: Mountain, always: true },
      { id: "speed", label: "Hastighet", icon: Gauge, key: "speed" as keyof TelemetryPoint },
      { id: "battery", label: "Batteri", icon: Battery, key: "battery" as keyof TelemetryPoint },
      { id: "batteryInfo", label: "Batt.info", icon: Thermometer, key: "temp" as keyof TelemetryPoint },
      { id: "gps", label: "GPS", icon: Satellite, key: "gpsNum" as keyof TelemetryPoint },
      { id: "rc", label: "RC", icon: Gamepad2, key: "rcAileron" as keyof TelemetryPoint },
      { id: "gimbal", label: "Gimbal", icon: Navigation, key: "gimbalPitch" as keyof TelemetryPoint },
      { id: "distance", label: "Avstand", icon: Radio, key: "dist2D" as keyof TelemetryPoint },
      { id: "wind", label: "Vind", icon: Wind, key: "windSpeed" as keyof TelemetryPoint },
    ];
    // Also show batteryInfo if we have voltage or current data
    const result = tabs.filter(t => t.always || (t.key && hasData(positions, t.key)));
    // Add batteryInfo if we have voltage/current/temp even if temp is missing
    if (!result.find(t => t.id === 'batteryInfo') && (hasData(positions, 'voltage') || hasData(positions, 'current'))) {
      const battIdx = result.findIndex(t => t.id === 'battery');
      result.splice(battIdx + 1, 0, { id: "batteryInfo", label: "Batt.info", icon: Thermometer, custom: true });
    }
    // Add warnings tab if events exist
    if (events && events.length > 0) {
      result.push({ id: "warnings", label: "Varsler", icon: AlertTriangle, custom: true });
    }
    return result;
  }, [positions, events]);

  const eventIndices = useMemo(() => {
    if (!events?.length || !positions.length) return [];
    return events.filter(e => e.t_offset_ms != null).map(e => {
      const targetSec = (e.t_offset_ms || 0) / 1000;
      let best = 0;
      let bestDiff = Infinity;
      positions.forEach((p, i) => {
        const match = p.timestamp?.match(/PT(\d+)S/);
        if (match) {
          const diff = Math.abs(parseInt(match[1]) - targetSec);
          if (diff < bestDiff) { bestDiff = diff; best = i; }
        }
      });
      return { ...e, index: best };
    });
  }, [events, positions]);

  return (
    <div className="space-y-3">
      {/* Scrubber */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatTime(0, positions)}</span>
          <span className="font-medium text-foreground">{formatTime(currentIndex, positions)}</span>
          <span>{formatTime(positions.length - 1, positions)}</span>
        </div>
        <div className="relative">
          <Slider
            value={[currentIndex]}
            min={0}
            max={positions.length - 1}
            step={1}
            onValueChange={([v]) => onIndexChange(v)}
            className="w-full"
          />
          {/* Event markers on slider track — clickable, toggle-controlled */}
          {showWarnings && eventIndices.map((e, i) => (
            <Popover key={i}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="absolute top-1/2 -translate-y-1/2 w-2 h-5 rounded-sm cursor-pointer hover:scale-125 transition-transform z-10"
                  style={{
                    left: `${(e.index / (positions.length - 1)) * 100}%`,
                    backgroundColor: e.type === 'RTH' || e.type === 'app_warning_critical' ? 'hsl(var(--destructive))' : 
                      e.type === 'LOW_BATTERY' || e.type === 'app_warning_important' ? 'hsl(38 92% 50%)' : 'hsl(25 95% 53%)',
                  }}
                  onClick={(ev) => { ev.stopPropagation(); onIndexChange(e.index); }}
                />
              </PopoverTrigger>
              <PopoverContent side="top" className="w-auto max-w-[240px] p-2 text-xs" sideOffset={8}>
                <p className="font-medium">{e.type}</p>
                <p className="text-muted-foreground mt-0.5 break-words">{e.message}</p>
              </PopoverContent>
            </Popover>
          ))}
        </div>
      </div>

      {/* Current values info panel */}
      {current && (
        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-1.5 text-[10px] sm:text-xs">
          <InfoCell label="Høyde" value={`${current.height?.toFixed(0) ?? '—'}m`} />
          <InfoCell label="MSL" value={`${current.alt?.toFixed(0) ?? '—'}m`} />
          {current.speed !== undefined && <InfoCell label="Hast." value={`${current.speed.toFixed(1)} m/s`} />}
          {current.vSpeed !== undefined && <InfoCell label="V.hast" value={`${current.vSpeed.toFixed(1)} m/s`} />}
          {current.battery !== undefined && <InfoCell label="Batteri" value={`${current.battery.toFixed(0)}%`} />}
          {current.gpsNum !== undefined && <InfoCell label="GPS" value={`${current.gpsNum} sat`} />}
          {current.dist2D !== undefined && <InfoCell label="Avstand" value={`${current.dist2D.toFixed(0)}m`} />}
          {current.gimbalPitch !== undefined && <InfoCell label="Gimbal" value={`${current.gimbalPitch.toFixed(0)}°`} />}
          {current.windSpeed !== undefined && <InfoCell label="Vind" value={`${current.windSpeed.toFixed(1)} m/s`} />}
          {current.flycState && <InfoCell label="Modus" value={current.flycState} />}
          {current.yaw !== undefined && <InfoCell label="Heading" value={`${current.yaw.toFixed(0)}°`} />}
        </div>
      )}

      {/* Charts */}
      <Tabs value={activeChart} onValueChange={setActiveChart}>
        <TabsList className="flex w-full overflow-x-auto no-scrollbar h-8">
          {availableTabs.map(t => (
            <TabsTrigger key={t.id} value={t.id} className="flex-1 min-w-[60px] text-[10px] sm:text-xs gap-1 px-1.5">
              <t.icon className="w-3 h-3 hidden sm:block" />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="altitude" className="mt-2">
          <MiniChart data={chartData} currentIndex={currentIndex} onIndexChange={onIndexChange} eventIndices={showWarnings ? eventIndices : []}>
            <Area type="monotone" dataKey="elevation" stroke="#8B7355" fill="#8B7355" fillOpacity={0.3} strokeWidth={1} name="Terreng" dot={false} isAnimationActive={false} />
            <Area type="monotone" dataKey="alt" stroke="hsl(210 80% 50%)" fill="hsl(210 80% 50%)" fillOpacity={0.1} strokeWidth={2} name="MSL" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="height" stroke="hsl(142 76% 36%)" strokeWidth={1.5} name="AGL" dot={false} isAnimationActive={false} />
          </MiniChart>
        </TabsContent>

        <TabsContent value="speed" className="mt-2">
          <MiniChart data={chartData} currentIndex={currentIndex} onIndexChange={onIndexChange} eventIndices={showWarnings ? eventIndices : []}>
            <Line type="monotone" dataKey="speed" stroke="hsl(210 80% 50%)" strokeWidth={2} name="H.hastighet" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="vSpeed" stroke="hsl(142 76% 36%)" strokeWidth={1.5} name="V.hastighet" dot={false} isAnimationActive={false} />
          </MiniChart>
        </TabsContent>

        <TabsContent value="battery" className="mt-2">
          <MiniChart data={chartData} currentIndex={currentIndex} onIndexChange={onIndexChange} eventIndices={showWarnings ? eventIndices : []}>
            {isDualBattery ? (
              <>
                <Line type="monotone" dataKey="battery1" stroke="hsl(142 76% 36%)" strokeWidth={2} name="Batteri 1 %" dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="battery2" stroke="hsl(210 80% 50%)" strokeWidth={2} name="Batteri 2 %" dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="voltage1" stroke="hsl(38 92% 50%)" strokeWidth={1.5} name="Spenning 1 V" dot={false} isAnimationActive={false} yAxisId="right" />
                <Line type="monotone" dataKey="voltage2" stroke="hsl(280 65% 60%)" strokeWidth={1.5} name="Spenning 2 V" dot={false} isAnimationActive={false} yAxisId="right" />
              </>
            ) : (
              <>
                <Line type="monotone" dataKey="battery" stroke="hsl(142 76% 36%)" strokeWidth={2} name="Batteri %" dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="voltage" stroke="hsl(38 92% 50%)" strokeWidth={1.5} name="Spenning V" dot={false} isAnimationActive={false} yAxisId="right" />
              </>
            )}
          </MiniChart>
        </TabsContent>

        <TabsContent value="gps" className="mt-2">
          <MiniChart data={chartData} currentIndex={currentIndex} onIndexChange={onIndexChange} eventIndices={showWarnings ? eventIndices : []}>
            <Line type="stepAfter" dataKey="gpsNum" stroke="hsl(210 80% 50%)" strokeWidth={2} name="Satellitter" dot={false} isAnimationActive={false} />
            <ReferenceLine y={6} stroke="hsl(var(--destructive))" strokeDasharray="3 3" label={{ value: "Min 6", fill: "hsl(var(--destructive))", fontSize: 10 }} />
          </MiniChart>
        </TabsContent>

        <TabsContent value="rc" className="mt-2 space-y-3">
          {/* Visual DJI stick widgets */}
          {current && (
            <div className="flex items-center justify-center gap-6">
              <StickWidget
                x={current.rcRudder ?? 0}
                y={current.rcThrottle ?? 0}
                label="Venstre stikke"
                xLabel="Rudder"
                yLabel="Throttle"
              />
              <StickWidget
                x={current.rcAileron ?? 0}
                y={current.rcElevator ?? 0}
                label="Høyre stikke"
                xLabel="Aileron"
                yLabel="Elevator"
              />
            </div>
          )}
          <MiniChart data={chartData} currentIndex={currentIndex} onIndexChange={onIndexChange} eventIndices={showWarnings ? eventIndices : []}>
            <Line type="monotone" dataKey="rcElevator" stroke="hsl(210 80% 50%)" strokeWidth={1.5} name="Elevator" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="rcAileron" stroke="hsl(142 76% 36%)" strokeWidth={1.5} name="Aileron" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="rcThrottle" stroke="hsl(38 92% 50%)" strokeWidth={1.5} name="Throttle" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="rcRudder" stroke="hsl(280 65% 60%)" strokeWidth={1.5} name="Rudder" dot={false} isAnimationActive={false} />
          </MiniChart>
        </TabsContent>

        <TabsContent value="gimbal" className="mt-2">
          <MiniChart data={chartData} currentIndex={currentIndex} onIndexChange={onIndexChange} eventIndices={showWarnings ? eventIndices : []}>
            <Line type="monotone" dataKey="gimbalPitch" stroke="hsl(210 80% 50%)" strokeWidth={2} name="Tilt" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="gimbalYaw" stroke="hsl(38 92% 50%)" strokeWidth={1.5} name="Pan" dot={false} isAnimationActive={false} />
          </MiniChart>
        </TabsContent>

        <TabsContent value="distance" className="mt-2">
          <MiniChart data={chartData} currentIndex={currentIndex} onIndexChange={onIndexChange} eventIndices={showWarnings ? eventIndices : []}>
            <Line type="monotone" dataKey="dist2D" stroke="hsl(210 80% 50%)" strokeWidth={2} name="2D avstand" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="dist3D" stroke="hsl(280 65% 60%)" strokeWidth={1.5} name="3D avstand" dot={false} isAnimationActive={false} />
          </MiniChart>
        </TabsContent>

        <TabsContent value="wind" className="mt-2">
          <MiniChart data={chartData} currentIndex={currentIndex} onIndexChange={onIndexChange} eventIndices={showWarnings ? eventIndices : []}>
            <Line type="monotone" dataKey="windSpeed" stroke="hsl(210 80% 50%)" strokeWidth={2} name="Vindstyrke m/s" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="windDir" stroke="hsl(38 92% 50%)" strokeWidth={1.5} name="Retning °" dot={false} isAnimationActive={false} yAxisId="right" />
          </MiniChart>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const InfoCell = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-muted/50 rounded px-1.5 py-1 text-center">
    <div className="text-muted-foreground truncate">{label}</div>
    <div className="font-medium truncate">{value}</div>
  </div>
);

const MiniChart = ({ data, currentIndex, onIndexChange, eventIndices, children }: {
  data: any[]; currentIndex: number; onIndexChange: (i: number) => void;
  eventIndices: Array<{ index: number; type: string; message: string }>;
  children: React.ReactNode;
}) => {
  const hasRightAxis = (Array.isArray(children) ? children : [children]).some(
    (child: any) => child?.props?.yAxisId === 'right'
  );

  return (
    <div className="w-full h-[160px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 5, right: hasRightAxis ? 40 : 10, left: 0, bottom: 5 }}
          onClick={(e: any) => {
            if (e?.activeTooltipIndex != null) onIndexChange(e.activeTooltipIndex);
          }}
        >
          <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
          <XAxis dataKey="idx" hide />
          <YAxis fontSize={10} width={40} />
          {hasRightAxis && <YAxis yAxisId="right" orientation="right" fontSize={10} width={40} />}
          <Tooltip content={<ChartTooltip />} />
          {/* Current position indicator */}
          <ReferenceLine x={currentIndex} stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="4 2" />
          {/* Event markers */}
          {eventIndices.map((e, i) => (
            <ReferenceLine
              key={i}
              x={e.index}
              stroke={e.type === 'RTH' ? 'hsl(var(--destructive))' : 'hsl(38 92% 50%)'}
              strokeWidth={1.5}
              strokeDasharray="2 2"
            />
          ))}
          {children}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
