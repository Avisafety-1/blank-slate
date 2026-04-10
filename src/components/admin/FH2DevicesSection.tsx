import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Radio, Wifi, WifiOff, Battery, Thermometer, Wind, HardDrive, AlertTriangle, UserPlus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface FH2Device {
  device_sn: string;
  device_name: string;
  device_model?: { model?: string; key?: string };
  online_status?: number; // 0=offline, 1=online
  bound_status?: number;
  type?: number; // 0=drone, 1=dock, etc.
  cameras?: any[];
  child_device_sn?: string;
  firmware_version?: string;
  [key: string]: any;
}

interface FH2DevicesSectionProps {
  fh2Projects: string[];
}

const extractDeviceList = (payload: any): FH2Device[] => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.list)) return payload.list;
  if (Array.isArray(payload?.devices)) return payload.devices;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.records)) return payload.records;
  return [];
};

const normalizeDevice = (device: any): FH2Device => ({
  ...device,
  device_sn: device.device_sn ?? device.sn ?? device.deviceSn ?? device.child_device_sn ?? "",
  device_name: device.device_name ?? device.callsign ?? device.name ?? device.nickname ?? device.aircraft_name ?? "",
  device_model: device.device_model ?? {
    model: device.device_model_name ?? device.model_name ?? device.model ?? device.product_name,
    key: device.device_model_key ?? device.model_key,
  },
  online_status:
    typeof device.online_status === "number"
      ? device.online_status
      : device.device_online_status === true ? 1
      : device.device_online_status === false ? 0
      : device.status === "online" || device.is_online === true
        ? 1
        : 0,
  type: device.type ?? device.device_type ?? device.product_type,
  firmware_version: device.firmware_version ?? device.firmware ?? device.firmwareVersion,
});

export const FH2DevicesSection = ({ fh2Projects }: FH2DevicesSectionProps) => {
  const [devices, setDevices] = useState<FH2Device[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Device detail
  const [detailDevice, setDetailDevice] = useState<FH2Device | null>(null);
  const [detailState, setDetailState] = useState<any>(null);
  const [detailHms, setDetailHms] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Add member dialog
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [memberUserId, setMemberUserId] = useState("");
  const [memberNickname, setMemberNickname] = useState("");
  const [memberRole, setMemberRole] = useState("project-member");
  const [memberProject, setMemberProject] = useState("");
  const [addingMember, setAddingMember] = useState(false);

  const fetchDevices = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("flighthub2-proxy", {
        body: { action: "list-devices" },
      });
      if (error) throw error;
      if (data?.ok === false) {
        setDevices([]);
        setLoaded(true);
        console.error("FH2 list-devices diagnostics:", data?.diagnostics);
        toast.error(data?.error || "Kunne ikke hente enheter");
        return;
      }

      const uniqueDevices = Array.from(
        new Map(
          extractDeviceList(data?.data)
            .map(normalizeDevice)
            .filter((device) => device.device_sn || device.device_name)
            .map((device) => [device.device_sn || device.device_name, device])
        ).values()
      );

      if (data?.diagnostics) {
        console.info("FH2 list-devices diagnostics:", data.diagnostics);
      }

      setDevices(uniqueDevices);
      setLoaded(true);
      if (uniqueDevices.length === 0) toast("Ingen enheter funnet i FlightHub 2");
    } catch (err: any) {
      toast.error(err?.message || "Kunne ikke hente enheter");
    } finally {
      setLoading(false);
    }
  };

  const openDeviceDetail = async (device: FH2Device) => {
    setDetailDevice(device);
    setDetailState(null);
    setDetailHms([]);
    setDetailLoading(true);
    try {
      const [stateRes, hmsRes] = await Promise.all([
        supabase.functions.invoke("flighthub2-proxy", {
          body: { action: "device-state", deviceSn: device.device_sn },
        }),
        supabase.functions.invoke("flighthub2-proxy", {
          body: { action: "device-hms", deviceSnList: device.device_sn },
        }),
      ]);
      if (stateRes.data?.data) setDetailState(stateRes.data.data);
      if (hmsRes.data?.data) {
        const hmsList = hmsRes.data.data?.list || hmsRes.data.data || [];
        setDetailHms(Array.isArray(hmsList) ? hmsList : []);
      }
    } catch (err: any) {
      console.error("Device detail error:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleAddMember = async () => {
    if (!memberUserId.trim() || !memberProject) return;
    setAddingMember(true);
    try {
      const { data, error } = await supabase.functions.invoke("flighthub2-proxy", {
        body: {
          action: "add-project-member",
          projectUuid: memberProject,
          userId: memberUserId.trim(),
          role: memberRole,
          nickname: memberNickname.trim(),
        },
      });
      if (error) throw error;
      if (data?.code === 0) {
        toast.success("Personell lagt til i prosjektet");
        setMemberDialogOpen(false);
        setMemberUserId("");
        setMemberNickname("");
      } else {
        toast.error(data?.message || data?.error || "Kunne ikke legge til personell");
      }
    } catch (err: any) {
      toast.error(err?.message || "Feil ved tillegging av personell");
    } finally {
      setAddingMember(false);
    }
  };

  const getDeviceTypeName = (device: FH2Device) => {
    const t = device.type ?? device.device_type;
    if (t === 0 || t === 60) return "Drone";
    if (t === 1 || t === 2 || t === 3) return "Dock";
    if (t === 56) return "RC";
    return `Type ${t ?? "?"}`;
  };

  const getModelName = (device: FH2Device) =>
    device.device_model?.model || device.model_name || device.device_name || "Ukjent";

  const isOnline = (device: FH2Device) => device.online_status === 1;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">FlightHub 2 Enheter</span>
        </div>
        <div className="flex gap-2">
          {fh2Projects.length > 0 && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setMemberDialogOpen(true)}>
              <UserPlus className="h-3.5 w-3.5 mr-1" /> Legg til personell
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={fetchDevices} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            {loaded ? "Oppdater" : "Hent enheter"}
          </Button>
        </div>
      </div>

      {loaded && devices.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Navn</TableHead>
              <TableHead>Modell</TableHead>
              <TableHead>SN</TableHead>
              <TableHead>Type</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {devices.map((d) => (
              <TableRow
                key={d.device_sn}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => openDeviceDetail(d)}
              >
                <TableCell>
                  {isOnline(d)
                    ? <Wifi className="h-4 w-4 text-green-500" />
                    : <WifiOff className="h-4 w-4 text-muted-foreground" />}
                </TableCell>
                <TableCell className="font-medium text-sm">{d.device_name || d.nickname || "–"}</TableCell>
                <TableCell className="text-sm">{getModelName(d)}</TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground">{d.device_sn}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-xs">{getDeviceTypeName(d)}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {loaded && devices.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">Ingen enheter funnet.</p>
      )}

      {/* Device Detail Dialog */}
      <Dialog open={!!detailDevice} onOpenChange={(open) => { if (!open) setDetailDevice(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detailDevice && isOnline(detailDevice)
                ? <Wifi className="h-4 w-4 text-green-500" />
                : <WifiOff className="h-4 w-4 text-muted-foreground" />}
              {detailDevice?.device_name || detailDevice?.device_sn}
            </DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-4">
              {/* Basic info */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Modell:</span> {detailDevice && getModelName(detailDevice)}</div>
                <div><span className="text-muted-foreground">SN:</span> <span className="font-mono text-xs">{detailDevice?.device_sn}</span></div>
                <div><span className="text-muted-foreground">Type:</span> {detailDevice && getDeviceTypeName(detailDevice)}</div>
                <div><span className="text-muted-foreground">Status:</span> {detailDevice && isOnline(detailDevice) ? "Online" : "Offline"}</div>
              </div>

              {/* State data */}
              {detailState && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Enhetsstatus</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {detailState.battery?.capacity_percent != null && (
                      <div className="flex items-center gap-1.5">
                        <Battery className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Batteri: {detailState.battery.capacity_percent}%</span>
                      </div>
                    )}
                    {detailState.temperature != null && (
                      <div className="flex items-center gap-1.5">
                        <Thermometer className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Temp: {detailState.temperature}°C</span>
                      </div>
                    )}
                    {detailState.wind_speed != null && (
                      <div className="flex items-center gap-1.5">
                        <Wind className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Vind: {detailState.wind_speed} m/s</span>
                      </div>
                    )}
                    {detailState.storage?.total != null && (
                      <div className="flex items-center gap-1.5">
                        <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Lagring: {detailState.storage.used_capacity || 0}/{detailState.storage.total} GB</span>
                      </div>
                    )}
                    {detailState.firmware_version && (
                      <div><span className="text-muted-foreground">Firmware:</span> {detailState.firmware_version}</div>
                    )}
                    {detailState.latitude != null && (
                      <div><span className="text-muted-foreground">GPS:</span> {detailState.latitude?.toFixed(5)}, {detailState.longitude?.toFixed(5)}</div>
                    )}
                    {detailState.height != null && (
                      <div><span className="text-muted-foreground">Høyde:</span> {detailState.height} m</div>
                    )}
                    {detailState.mode_code != null && (
                      <div><span className="text-muted-foreground">Modus:</span> {detailState.mode_code}</div>
                    )}
                  </div>
                  {/* Raw state fallback for undocumented fields */}
                  {!detailState.battery && !detailState.firmware_version && (
                    <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-40">
                      {JSON.stringify(detailState, null, 2)}
                    </pre>
                  )}
                </div>
              )}

              {/* HMS warnings */}
              {detailHms.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-amber-500" /> HMS-advarsler
                  </h4>
                  <div className="space-y-1">
                    {detailHms.map((hms: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-xs p-2 rounded bg-amber-500/10 border border-amber-500/20">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                        <div>
                          <span className="font-medium">{hms.hms_id || hms.code || `HMS #${i + 1}`}</span>
                          {hms.title && <span className="ml-1">{hms.title}</span>}
                          {hms.description && <p className="text-muted-foreground mt-0.5">{hms.description}</p>}
                          {hms.level != null && (
                            <Badge variant={hms.level >= 2 ? "destructive" : "secondary"} className="text-[10px] mt-1">
                              Nivå {hms.level}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!detailState && detailHms.length === 0 && !detailLoading && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Ingen tilstandsdata tilgjengelig. Enheten kan være offline.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Member Dialog */}
      <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Legg til personell i FH2-prosjekt</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Prosjekt</Label>
              <Select value={memberProject} onValueChange={setMemberProject}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Velg prosjekt..." />
                </SelectTrigger>
                <SelectContent>
                  {fh2Projects.map((name, i) => (
                    <SelectItem key={i} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                Merk: For å koble til riktig prosjekt-UUID, må prosjekt-UUID spesifiseres i brukerens JWT eller velges via FH2-grensesnittet.
              </p>
            </div>
            <div>
              <Label className="text-xs">Bruker-ID (FH2 user_id)</Label>
              <Input
                value={memberUserId}
                onChange={(e) => setMemberUserId(e.target.value)}
                placeholder="FH2-bruker-ID..."
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Kallenavn</Label>
              <Input
                value={memberNickname}
                onChange={(e) => setMemberNickname(e.target.value)}
                placeholder="Valgfritt kallenavn..."
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Rolle</Label>
              <Select value={memberRole} onValueChange={setMemberRole}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="project-member">Medlem</SelectItem>
                  <SelectItem value="project-admin">Administrator</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" onClick={handleAddMember} disabled={addingMember || !memberUserId.trim() || !memberProject}>
              {addingMember ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <UserPlus className="h-3.5 w-3.5 mr-1" />}
              Legg til
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
