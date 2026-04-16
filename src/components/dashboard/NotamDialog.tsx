import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Copy, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

type Mission = any;

interface NotamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mission: Mission | null;
  onSaved?: () => void;
}

const ALL_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

const toNotamCoord = (lat: number, lng: number): string => {
  const formatDMS = (value: number, isLat: boolean) => {
    const abs = Math.abs(value);
    const d = Math.floor(abs);
    const mFull = (abs - d) * 60;
    const m = Math.floor(mFull);
    const s = Math.round((mFull - m) * 60);
    const dStr = isLat ? String(d).padStart(2, "0") : String(d).padStart(3, "0");
    const mStr = String(m).padStart(2, "0");
    const sStr = String(s).padStart(2, "0");
    const dir = isLat ? (value >= 0 ? "N" : "S") : (value >= 0 ? "E" : "W");
    return `${dStr}${mStr}${sStr}${dir}`;
  };
  return `${formatDMS(lat, true)} ${formatDMS(lng, false)}`;
};

export const NotamDialog = ({ open, onOpenChange, mission, onSaved }: NotamDialogProps) => {
  const { companyId } = useAuth();

  const [operationType, setOperationType] = useState("BVLOS");
  const [areaName, setAreaName] = useState("");
  const [centerLat, setCenterLat] = useState<number | null>(null);
  const [centerLng, setCenterLng] = useState<number | null>(null);
  const [radiusNm, setRadiusNm] = useState(0.5);
  const [maxAglFt, setMaxAglFt] = useState(400);
  const [scheduleType, setScheduleType] = useState<"continuous" | "daily">("daily");
  const [scheduleDays, setScheduleDays] = useState<string[]>(["MON", "TUE", "WED", "THU", "FRI"]);
  const [timeFrom, setTimeFrom] = useState("0800");
  const [timeTo, setTimeTo] = useState("1600");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [saving, setSaving] = useState(false);

  // Pre-fill from mission data
  useEffect(() => {
    if (!open || !mission) return;

    // If mission already has notam data, load it
    if (mission.notam_text) {
      setOperationType(mission.notam_operation_type || "BVLOS");
      setAreaName(mission.notam_area_name || mission.lokasjon || "");
      setCenterLat(mission.notam_center_lat_wgs84 ?? mission.latitude ?? null);
      setCenterLng(mission.notam_center_lon_wgs84 ?? mission.longitude ?? null);
      setRadiusNm(mission.notam_radius_nm ?? 0.5);
      setMaxAglFt(mission.notam_max_agl_ft ?? 400);
      setScheduleType(mission.notam_schedule_type || "daily");
      setScheduleDays(mission.notam_schedule_days || ["MON", "TUE", "WED", "THU", "FRI"]);
      const windows = mission.notam_schedule_windows;
      if (Array.isArray(windows) && windows.length > 0) {
        setTimeFrom(windows[0].from || "0800");
        setTimeTo(windows[0].to || "1600");
      }
      setContactName(mission.notam_realtime_contact_name || "");
      setContactPhone(mission.notam_realtime_contact_phone || "");
      setCompanyName(mission.notam_submitter_company || "");
    } else {
      // Default from mission
      setAreaName(mission.lokasjon || "");
      setCenterLat(mission.latitude ?? null);
      setCenterLng(mission.longitude ?? null);
      setRadiusNm(0.5);
      setMaxAglFt(400);
      setOperationType("BVLOS");
      setScheduleType("daily");
      setScheduleDays(["MON", "TUE", "WED", "THU", "FRI"]);
      setTimeFrom("0800");
      setTimeTo("1600");
      setContactName("");
      setContactPhone("");
      setCompanyName("");
    }

    // Fetch company name
    if (companyId && !mission.notam_submitter_company) {
      supabase
        .from("companies")
        .select("navn")
        .eq("id", companyId)
        .single()
        .then(({ data }) => {
          if (data?.navn) setCompanyName(data.navn);
        });
    }
  }, [open, mission?.id]);

  const toggleDay = (day: string) => {
    setScheduleDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const generatedText = useMemo(() => {
    const lines: string[] = [];

    // Schedule line
    if (scheduleType === "daily" && scheduleDays.length > 0) {
      const sorted = ALL_DAYS.filter((d) => scheduleDays.includes(d));
      // Compress consecutive days
      let dayStr: string;
      if (sorted.length === 7) {
        dayStr = "DAILY";
      } else if (sorted.length >= 2) {
        // Check if consecutive
        const indices = sorted.map((d) => ALL_DAYS.indexOf(d));
        const isConsecutive = indices.every((v, i) => i === 0 || v === indices[i - 1] + 1);
        dayStr = isConsecutive ? `${sorted[0]}-${sorted[sorted.length - 1]}` : sorted.join(" ");
      } else {
        dayStr = sorted.join(" ");
      }
      lines.push(`${dayStr} ${timeFrom}-${timeTo}`);
    } else {
      lines.push(`${timeFrom}-${timeTo}`);
    }

    // Activity line
    lines.push(`Unmanned ACFT (${operationType}) will take place in ${areaName}`);

    // Position
    if (centerLat != null && centerLng != null) {
      lines.push(`PSN ${toNotamCoord(centerLat, centerLng)}, radius ${radiusNm} NM.`);
    }

    // Height
    lines.push(`MAX HGT ${maxAglFt} FT AGL.`);

    // Contact
    if (contactName || companyName) {
      const who = companyName || contactName;
      const tel = contactPhone ? `, tel ${contactPhone}` : "";
      lines.push(`For realtime status ctc ${who}${tel}`);
    }

    return lines.join("\n");
  }, [operationType, areaName, centerLat, centerLng, radiusNm, maxAglFt, scheduleType, scheduleDays, timeFrom, timeTo, contactName, contactPhone, companyName]);

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedText);
    toast.success("NOTAM-tekst kopiert");
  };

  const handleSave = async () => {
    if (!mission?.id) return;
    setSaving(true);
    const { error } = await (supabase as any)
      .from("missions")
      .update({
        notam_text: generatedText,
        notam_operation_type: operationType,
        notam_schedule_type: scheduleType,
        notam_schedule_days: scheduleDays,
        notam_schedule_windows: [{ from: timeFrom, to: timeTo }],
        notam_area_name: areaName,
        notam_center_lat_wgs84: centerLat,
        notam_center_lon_wgs84: centerLng,
        notam_radius_nm: radiusNm,
        notam_max_agl_ft: maxAglFt,
        notam_submitter_company: companyName,
        notam_realtime_contact_name: contactName,
        notam_realtime_contact_phone: contactPhone,
      })
      .eq("id", mission.id);

    setSaving(false);
    if (error) {
      toast.error("Kunne ikke lagre NOTAM");
      console.error(error);
    } else {
      toast.success("NOTAM lagret");
      onSaved?.();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>NOTAM-tekst</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Operation type */}
          <div className="space-y-1.5">
            <Label>Operasjonstype</Label>
            <Select value={operationType} onValueChange={setOperationType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="BVLOS">BVLOS</SelectItem>
                <SelectItem value="VLOS">VLOS</SelectItem>
                <SelectItem value="EVLOS">EVLOS</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Area name */}
          <div className="space-y-1.5">
            <Label>Områdenavn</Label>
            <Input value={areaName} onChange={(e) => setAreaName(e.target.value)} placeholder="Rennebu" />
          </div>

          {/* Coordinates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Breddegrad (lat)</Label>
              <Input
                type="number"
                step="any"
                value={centerLat ?? ""}
                onChange={(e) => setCenterLat(e.target.value ? parseFloat(e.target.value) : null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Lengdegrad (lon)</Label>
              <Input
                type="number"
                step="any"
                value={centerLng ?? ""}
                onChange={(e) => setCenterLng(e.target.value ? parseFloat(e.target.value) : null)}
              />
            </div>
          </div>

          {/* Radius & height */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Radius (NM)</Label>
              <Input
                type="number"
                step="0.1"
                value={radiusNm}
                onChange={(e) => setRadiusNm(parseFloat(e.target.value) || 0.5)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Maks høyde (FT AGL)</Label>
              <Input
                type="number"
                value={maxAglFt}
                onChange={(e) => setMaxAglFt(parseInt(e.target.value) || 400)}
              />
            </div>
          </div>

          {/* Schedule */}
          <div className="space-y-1.5">
            <Label>Tidsplan</Label>
            <Select value={scheduleType} onValueChange={(v) => setScheduleType(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daglig (velg dager)</SelectItem>
                <SelectItem value="continuous">Kontinuerlig</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scheduleType === "daily" && (
            <div className="flex flex-wrap gap-2">
              {ALL_DAYS.map((day) => (
                <label key={day} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <Checkbox
                    checked={scheduleDays.includes(day)}
                    onCheckedChange={() => toggleDay(day)}
                  />
                  {day}
                </label>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Fra (UTC)</Label>
              <Input value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} placeholder="0800" />
            </div>
            <div className="space-y-1.5">
              <Label>Til (UTC)</Label>
              <Input value={timeTo} onChange={(e) => setTimeTo(e.target.value)} placeholder="1600" />
            </div>
          </div>

          {/* Contact */}
          <div className="space-y-1.5">
            <Label>Selskap</Label>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Kontaktperson</Label>
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Telefon</Label>
              <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+47 123 45 678" />
            </div>
          </div>

          {/* Generated NOTAM */}
          <div className="space-y-1.5">
            <Label>Generert NOTAM-tekst</Label>
            <Textarea value={generatedText} readOnly className="font-mono text-sm min-h-[120px]" />
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={handleCopy}>
              <Copy className="w-4 h-4 mr-2" />
              Kopier
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Lagrer…" : "Lagre"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
