import { useState } from "react";
import { useTranslation } from "react-i18next";
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
import { Loader2, Radio, Wifi, WifiOff, Battery, Thermometer, Wind, HardDrive, AlertTriangle, UserPlus, RefreshCw, Video } from "lucide-react";
import { toast } from "sonner";
import { LiveStreamDialog } from "./LiveStreamDialog";

interface FH2Device {
  device_sn: string;
  device_name: string;
  device_model?: { model?: string; key?: string; name?: string; class?: string };
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
  const { t } = useTranslation();
  const [devices, setDevices] = useState<FH2Device[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [debugData, setDebugData] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);

  // Test device API debug
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [showTestResult, setShowTestResult] = useState(false);

  // Debug-endpoint sandbox
  const [debugDialogOpen, setDebugDialogOpen] = useState(false);
  const [debugEndpoint, setDebugEndpoint] = useState("system_status");
  const [debugMethod, setDebugMethod] = useState("GET");
  const [debugProjectUuid, setDebugProjectUuid] = useState("");
  const [debugDeviceSn, setDebugDeviceSn] = useState("");
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugResult, setDebugResult] = useState<any>(null);

  // Device detail
  const [detailDevice, setDetailDevice] = useState<FH2Device | null>(null);
  const [detailState, setDetailState] = useState<any>(null);
  const [detailHms, setDetailHms] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Live stream dialog
  const [liveDevice, setLiveDevice] = useState<FH2Device | null>(null);

  // Add member dialog
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [memberUserId, setMemberUserId] = useState("");
  const [memberNickname, setMemberNickname] = useState("");
  const [memberRole, setMemberRole] = useState("project-member");
  const [memberProject, setMemberProject] = useState("");
  const [addingMember, setAddingMember] = useState(false);

  const runDebugEndpoint = async (overrides?: { endpoint?: string; method?: string; projectUuid?: string }) => {
    const ep = overrides?.endpoint ?? debugEndpoint;
    const method = overrides?.method ?? debugMethod;
    const projUuid = overrides?.projectUuid ?? debugProjectUuid;
    setDebugLoading(true);
    setDebugResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("flighthub2-proxy", {
        body: {
          action: "debug-endpoint",
          endpoint: ep,
          method,
          projectUuid: projUuid || undefined,
        },
      });
      if (error) throw error;
      setDebugResult(data);
    } catch (err: any) {
      setDebugResult({ error: err?.message || t("admin.fh2Devices.toastGenericError") });
    } finally {
      setDebugLoading(false);
    }
  };

  const fetchDevices = async () => {
    setLoading(true);
    setDebugData(null);
    try {
      const { data, error } = await supabase.functions.invoke("flighthub2-proxy", {
        body: { action: "list-devices" },
      });
      if (error) throw error;

      // Always save full response for debug
      setDebugData(data);

      if (data?.ok === false) {
        setDevices([]);
        setLoaded(true);
        console.error("FH2 list-devices diagnostics:", data?.diagnostics);
        toast.error(data?.error || t("admin.fh2Devices.toastFetchError"));
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
      if (uniqueDevices.length === 0) toast(t("admin.fh2Devices.toastNoDevicesFound"));
    } catch (err: any) {
      toast.error(err?.message || t("admin.fh2Devices.toastFetchError"));
    } finally {
      setLoading(false);
    }
  };

  const testDeviceApi = async () => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("flighthub2-proxy", {
        body: { action: "test-device-api", deviceSn: "1581F8DBW255D00A2M0U" },
      });
      if (error) throw error;
      setTestResult(data);
      setShowTestResult(true);
    } catch (err: any) {
      setTestResult({ error: err?.message || t("admin.fh2Devices.toastTestError") });
      setShowTestResult(true);
    } finally {
      setTestLoading(false);
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
        toast.success(t("admin.fh2Devices.toastMemberAdded"));
        setMemberDialogOpen(false);
        setMemberUserId("");
        setMemberNickname("");
      } else {
        toast.error(data?.message || data?.error || t("admin.fh2Devices.toastMemberAddError"));
      }
    } catch (err: any) {
      toast.error(err?.message || t("admin.fh2Devices.toastMemberAddException"));
    } finally {
      setAddingMember(false);
    }
  };

  const getDeviceTypeName = (device: FH2Device) => {
    const type = device.type ?? device.device_type;
    if (type === 0 || type === 60) return "Drone";
    if (type === 1 || type === 2 || type === 3) return "Dock";
    if (type === 56) return "RC";
    return `${t("admin.fh2Devices.typeLabel")} ${type ?? "?"}`;
  };

  const getModelName = (device: FH2Device) =>
    device.device_model?.model || device.device_model?.name || device.model_name || device.device_name || t("admin.fh2Devices.unknownModel");

  // Extract camera options from a device (DJI camera_list format)
  const getDeviceCameras = (device: FH2Device): { index: string; name: string }[] => {
    const list = (device as any).camera_list ?? (device as any).cameras ?? [];
    if (!Array.isArray(list)) return [];
    return list
      .map((c: any) => {
        const index = c.camera_index ?? c.index ?? c.id ?? c.payload_index ?? "";
        const name = c.camera_name ?? c.name ?? c.payload_name ?? c.type_name ?? `${t("admin.fh2Devices.camera")} ${index}`;
        return index ? { index: String(index), name: String(name) } : null;
      })
      .filter(Boolean) as { index: string; name: string }[];
  };

  const isOnline = (device: FH2Device) => device.online_status === 1;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">{t("admin.fh2Devices.title")}</span>
        </div>
        <div className="flex gap-2">
          {fh2Projects.length > 0 && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setMemberDialogOpen(true)}>
              <UserPlus className="h-3.5 w-3.5 mr-1" /> {t("admin.fh2Devices.addPersonnel")}
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={testDeviceApi} disabled={testLoading}>
            {testLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Radio className="h-3.5 w-3.5 mr-1" />}
            {t("admin.fh2Devices.testDeviceApi")}
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setDebugResult(null); setDebugDialogOpen(true); }}>
            <Radio className="h-3.5 w-3.5 mr-1" /> {t("admin.fh2Devices.debugApi")}
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={fetchDevices} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            {loaded ? t("admin.fh2Devices.update") : t("admin.fh2Devices.fetchDevices")}
          </Button>
        </div>
      </div>

      {/* Test Device API Result */}
      {testResult && (
        <div className="space-y-1">
          <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={() => setShowTestResult(!showTestResult)}>
            {showTestResult ? t("admin.fh2Devices.hide") : t("admin.fh2Devices.show")} {t("admin.fh2Devices.testResult")}
          </Button>
          {showTestResult && (
            <pre className="text-[10px] bg-muted p-2 rounded overflow-x-auto max-h-80 whitespace-pre-wrap break-all">
              {JSON.stringify(testResult, null, 2)}
            </pre>
          )}
        </div>
      )}

      {loaded && devices.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>{t("admin.fh2Devices.colName")}</TableHead>
              <TableHead>{t("admin.fh2Devices.colModel")}</TableHead>
              <TableHead>{t("admin.fh2Devices.colSn")}</TableHead>
              <TableHead>{t("admin.fh2Devices.colType")}</TableHead>
              <TableHead className="w-20 text-right">{t("admin.fh2Devices.colLive")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {devices.map((d) => {
              const cameras = getDeviceCameras(d);
              const canLive = isOnline(d) && cameras.length > 0;
              return (
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
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={!canLive}
                      onClick={() => setLiveDevice(d)}
                      title={canLive ? t("admin.fh2Devices.startLiveStream") : t("admin.fh2Devices.liveRequiresOnline")}
                    >
                      <Video className="h-3.5 w-3.5 mr-1" /> {t("admin.fh2Devices.live")}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {loaded && devices.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">{t("admin.fh2Devices.noDevices")}</p>
      )}

      {/* Debug raw data panel */}
      {debugData && (
        <div className="space-y-1">
          <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={() => setShowDebug(!showDebug)}>
            {showDebug ? t("admin.fh2Devices.hide") : t("admin.fh2Devices.show")} {t("admin.fh2Devices.rawData")}
          </Button>
          {showDebug && (
            <pre className="text-[10px] bg-muted p-2 rounded overflow-x-auto max-h-60 whitespace-pre-wrap break-all">
              {JSON.stringify(debugData, null, 2)}
            </pre>
          )}
        </div>
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
                <div><span className="text-muted-foreground">{t("admin.fh2Devices.model")}</span> {detailDevice && getModelName(detailDevice)}</div>
                <div><span className="text-muted-foreground">SN:</span> <span className="font-mono text-xs">{detailDevice?.device_sn}</span></div>
                <div><span className="text-muted-foreground">{t("admin.fh2Devices.type")}</span> {detailDevice && getDeviceTypeName(detailDevice)}</div>
                <div><span className="text-muted-foreground">{t("admin.fh2Devices.status")}</span> {detailDevice && isOnline(detailDevice) ? t("admin.fh2Devices.online") : t("admin.fh2Devices.offline")}</div>
              </div>

              {/* State data */}
              {detailState && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">{t("admin.fh2Devices.deviceStatusTitle")}</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {detailState.battery?.capacity_percent != null && (
                      <div className="flex items-center gap-1.5">
                        <Battery className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{t("admin.fh2Devices.battery", { value: detailState.battery.capacity_percent })}</span>
                      </div>
                    )}
                    {detailState.temperature != null && (
                      <div className="flex items-center gap-1.5">
                        <Thermometer className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{t("admin.fh2Devices.temperature", { value: detailState.temperature })}</span>
                      </div>
                    )}
                    {detailState.wind_speed != null && (
                      <div className="flex items-center gap-1.5">
                        <Wind className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{t("admin.fh2Devices.wind", { value: detailState.wind_speed })}</span>
                      </div>
                    )}
                    {detailState.storage?.total != null && (
                      <div className="flex items-center gap-1.5">
                        <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{t("admin.fh2Devices.storage")}: {detailState.storage.used_capacity || 0}/{detailState.storage.total} GB</span>
                      </div>
                    )}
                    {detailState.firmware_version && (
                      <div><span className="text-muted-foreground">{t("admin.fh2Devices.firmware")}:</span> {detailState.firmware_version}</div>
                    )}
                    {detailState.latitude != null && (
                      <div><span className="text-muted-foreground">GPS:</span> {detailState.latitude?.toFixed(5)}, {detailState.longitude?.toFixed(5)}</div>
                    )}
                    {detailState.height != null && (
                      <div><span className="text-muted-foreground">{t("admin.fh2Devices.height")}:</span> {detailState.height} m</div>
                    )}
                    {detailState.mode_code != null && (
                      <div><span className="text-muted-foreground">{t("admin.fh2Devices.mode")}:</span> {detailState.mode_code}</div>
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
                    <AlertTriangle className="h-4 w-4 text-amber-500" /> {t("admin.fh2Devices.hmsWarnings")}
                  </h4>
                  <div className="space-y-1">
                    {detailHms.map((hms: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-xs p-2 rounded bg-amber-500/10 border border-amber-500/20">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                        <div>
                          <span className="font-medium">{hms.hms_id || hms.code || `${t("admin.fh2Devices.hms")} #${i + 1}`}</span>
                          {hms.title && <span className="ml-1">{hms.title}</span>}
                          {hms.description && <p className="text-muted-foreground mt-0.5">{hms.description}</p>}
                          {hms.level != null && (
                            <Badge variant={hms.level >= 2 ? "destructive" : "secondary"} className="text-[10px] mt-1">
                              {t("admin.fh2Devices.level")} {hms.level}
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
                  {t("admin.fh2Devices.noStateData")}
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
            <DialogTitle>{t("admin.fh2Devices.addPersonnelTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">{t("admin.fh2Devices.project")}</Label>
              <Select value={memberProject} onValueChange={setMemberProject}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder={t("admin.fh2Devices.selectProjectPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {fh2Projects.map((name, i) => (
                    <SelectItem key={i} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                {t("admin.fh2Devices.projectUuidNote")}
              </p>
            </div>
            <div>
              <Label className="text-xs">{t("admin.fh2Devices.userId")}</Label>
              <Input
                value={memberUserId}
                onChange={(e) => setMemberUserId(e.target.value)}
                placeholder={t("admin.fh2Devices.userIdPlaceholder")}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">{t("admin.fh2Devices.nickname")}</Label>
              <Input
                value={memberNickname}
                onChange={(e) => setMemberNickname(e.target.value)}
                placeholder={t("admin.fh2Devices.nicknamePlaceholder")}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">{t("admin.fh2Devices.role")}</Label>
              <Select value={memberRole} onValueChange={setMemberRole}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="project-member">{t("admin.fh2Devices.member")}</SelectItem>
                  <SelectItem value="project-admin">{t("admin.fh2Devices.administrator")}</SelectItem>
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

      {/* Debug Endpoint Dialog */}
      <Dialog open={debugDialogOpen} onOpenChange={setDebugDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("admin.fh2Devices.debugSandboxTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs"
                onClick={() => runDebugEndpoint({ endpoint: "system_status", method: "GET" })}>
                {t("admin.fh2Devices.systemStatus")}
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs"
                onClick={() => runDebugEndpoint({ endpoint: "device", method: "GET" })}>
                {t("admin.fh2Devices.orgDevices")}
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs"
                onClick={() => runDebugEndpoint({ endpoint: "project", method: "GET" })}>
                {t("admin.fh2Devices.listProjects")}
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs"
                disabled={!debugProjectUuid}
                onClick={() => runDebugEndpoint({ endpoint: "project/device?page=1&page_size=200", method: "GET" })}>
                {t("admin.fh2Devices.projectDevices")}
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs"
                disabled={!debugDeviceSn}
                onClick={() => runDebugEndpoint({ endpoint: `device/${encodeURIComponent(debugDeviceSn)}/state`, method: "GET" })}>
                {t("admin.fh2Devices.deviceState")}
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs"
                disabled={!debugDeviceSn}
                onClick={() => runDebugEndpoint({ endpoint: `device/hms?device_sn_list=${encodeURIComponent(debugDeviceSn)}`, method: "GET" })}>
                {t("admin.fh2Devices.hms")}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{t("admin.fh2Devices.deviceSnLabel")}</Label>
                <Input value={debugDeviceSn} onChange={(e) => setDebugDeviceSn(e.target.value)} placeholder={t("admin.fh2Devices.snPlaceholder")} className="h-8 text-sm font-mono" />
              </div>
              <div>
                <Label className="text-xs">{t("admin.fh2Devices.projectUuid")}</Label>
                <Input value={debugProjectUuid} onChange={(e) => setDebugProjectUuid(e.target.value)} placeholder={t("admin.fh2Devices.uuidPlaceholder")} className="h-8 text-sm font-mono" />
              </div>
            </div>

            <div className="grid grid-cols-[1fr_auto_auto] gap-2">
              <div>
                <Label className="text-xs">{t("admin.fh2Devices.customEndpointLabel")}</Label>
                <Input value={debugEndpoint} onChange={(e) => setDebugEndpoint(e.target.value)} placeholder="device" className="h-8 text-sm font-mono" />
              </div>
              <div>
                <Label className="text-xs">{t("admin.fh2Devices.method")}</Label>
                <Select value={debugMethod} onValueChange={setDebugMethod}>
                  <SelectTrigger className="h-8 text-sm w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                    <SelectItem value="DELETE">DELETE</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button size="sm" className="h-8" onClick={() => runDebugEndpoint()} disabled={debugLoading || !debugEndpoint.trim()}>
                  {debugLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("admin.fh2Devices.run")}
                </Button>
              </div>
            </div>

            {debugResult && (
              <pre className="text-[10px] bg-muted p-2 rounded overflow-x-auto max-h-[50vh] whitespace-pre-wrap break-all">
                {JSON.stringify(debugResult, null, 2)}
              </pre>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Live Stream Dialog */}
      {liveDevice && (
        <LiveStreamDialog
          open={!!liveDevice}
          onOpenChange={(open) => { if (!open) setLiveDevice(null); }}
          deviceSn={liveDevice.device_sn}
          deviceName={liveDevice.device_name}
          cameras={getDeviceCameras(liveDevice)}
          projectUuid={(liveDevice as any).project_uuid}
        />
      )}
    </div>
  );
};
