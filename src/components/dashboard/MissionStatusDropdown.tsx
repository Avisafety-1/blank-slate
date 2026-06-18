import { Badge } from "@/components/ui/badge";
import { buildMissionWeatherSnapshot } from "@/lib/missionWeatherSnapshot";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from "@/components/ui/alert-dialog";
import { ChecklistExecutionDialog } from "@/components/resources/ChecklistExecutionDialog";
import { useTranslation } from "react-i18next";
import { translateMissionStatus } from "@/lib/i18nHelpers";

const statuses = ["Planlagt", "Pågående", "Fullført", "Avbrutt"] as const;

interface MissionStatusDropdownProps {
  missionId: string;
  currentStatus: string;
  onStatusChanged?: () => void;
  /** Badge color map – caller provides to match its own palette */
  statusColors: Record<string, string>;
  className?: string;
  /** Mission coordinates for weather snapshot on completion */
  latitude?: number | null;
  longitude?: number | null;
  /** Mission scheduled time – used to skip weather for historical missions */
  tidspunkt?: string | null;
}

export const MissionStatusDropdown = ({
  missionId,
  currentStatus,
  onStatusChanged,
  statusColors,
  className = "",
  latitude,
  longitude,
  tidspunkt,
}: MissionStatusDropdownProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [postFlightDialogOpen, setPostFlightDialogOpen] = useState(false);
  const [postFlightChecklistIds, setPostFlightChecklistIds] = useState<string[]>([]);
  const [pendingUpdatePayload, setPendingUpdatePayload] = useState<Record<string, any> | null>(null);
  const [checklistExecOpen, setChecklistExecOpen] = useState(false);
  const [currentChecklistIndex, setCurrentChecklistIndex] = useState(0);

  const completeMission = async (payload: Record<string, any>, extraChecklistIds?: string[]) => {
    // If we need to add post-flight checklists as pending
    if (extraChecklistIds && extraChecklistIds.length > 0) {
      // Fetch current checklist_ids from mission
      const { data: missionData } = await supabase
        .from("missions")
        .select("checklist_ids")
        .eq("id", missionId)
        .single();

      const existingIds: string[] = (missionData as any)?.checklist_ids || [];
      const merged = [...new Set([...existingIds, ...extraChecklistIds])];
      payload.checklist_ids = merged;
    }

    const { error } = await supabase
      .from("missions")
      .update(payload as any)
      .eq("id", missionId);


    if (error) {
      toast.error(t('dashboard.missions.couldNotUpdateStatus'));
      console.error(error);
    } else {
      toast.success(t('dashboard.missions.statusChangedTo', { status: translateMissionStatus(payload.status) }));
      onStatusChanged?.();
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === currentStatus) {
      setOpen(false);
      return;
    }
    setUpdating(true);

    // Build update payload
    const updatePayload: Record<string, any> = {
      status: newStatus,
      oppdatert_dato: new Date().toISOString(),
    };

    // Capture weather snapshot when completing a mission
    if (newStatus === "Fullført" && currentStatus !== "Fullført") {
      const snapshot = await buildMissionWeatherSnapshot({
        flightDate: tidspunkt ? new Date(tidspunkt) : new Date(),
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        source: "status_dropdown",
      });
      updatePayload.weather_data_snapshot = snapshot;
    }

    // Check for post-flight checklists when completing
    if (newStatus === "Fullført" && currentStatus !== "Fullført") {
      try {
        const { data: missionDrones } = await (supabase as any)
          .from("mission_drones")
          .select("drone_id")
          .eq("mission_id", missionId);

        if (missionDrones && missionDrones.length > 0) {
          const droneIds = missionDrones.map((md: any) => md.drone_id);
          const { data: drones } = await supabase
            .from("drones")
            .select("post_flight_checklist_id")
            .in("id", droneIds)
            .not("post_flight_checklist_id", "is", null);

          const checklistIds = [...new Set(
            (drones || [])
              .map((d: any) => d.post_flight_checklist_id)
              .filter(Boolean)
          )] as string[];

          if (checklistIds.length > 0) {
            setPendingUpdatePayload(updatePayload);
            setPostFlightChecklistIds(checklistIds);
            setPostFlightDialogOpen(true);
            setUpdating(false);
            setOpen(false);
            return;
          }
        }
      } catch (e) {
        console.warn("Could not check post-flight checklists:", e);
      }
    }

    await completeMission(updatePayload);
    setUpdating(false);
    setOpen(false);
  };

  const handleExecuteNow = () => {
    setPostFlightDialogOpen(false);
    setCurrentChecklistIndex(0);
    setChecklistExecOpen(true);
  };

  const handleExecuteLater = async () => {
    setPostFlightDialogOpen(false);
    if (pendingUpdatePayload) {
      setUpdating(true);
      await completeMission(pendingUpdatePayload, postFlightChecklistIds);
      setUpdating(false);
      setPendingUpdatePayload(null);
      setPostFlightChecklistIds([]);
    }
  };

  const handleChecklistCompleted = async (_checklistId: string) => {
    const nextIndex = currentChecklistIndex + 1;
    if (nextIndex < postFlightChecklistIds.length) {
      setCurrentChecklistIndex(nextIndex);
      // ChecklistExecutionDialog will re-open with next checklist
    } else {
      setChecklistExecOpen(false);
      // All checklists done – complete the mission, add them as completed
      if (pendingUpdatePayload) {
        setUpdating(true);
        // Fetch current completed ids
        const { data: missionData } = await supabase
          .from("missions")
          .select("checklist_ids, checklist_completed_ids")
          .eq("id", missionId)
          .single();

        const existingIds: string[] = (missionData as any)?.checklist_ids || [];
        const existingCompleted: string[] = (missionData as any)?.checklist_completed_ids || [];
        const mergedIds = [...new Set([...existingIds, ...postFlightChecklistIds])];
        const mergedCompleted = [...new Set([...existingCompleted, ...postFlightChecklistIds])];

        pendingUpdatePayload.checklist_ids = mergedIds;
        pendingUpdatePayload.checklist_completed_ids = mergedCompleted;

        await completeMission(pendingUpdatePayload);
        setUpdating(false);
        setPendingUpdatePayload(null);
        setPostFlightChecklistIds([]);
      }
    }
  };

  const handleChecklistCancelled = async () => {
    setChecklistExecOpen(false);
    // User cancelled mid-execution – treat as "execute later"
    if (pendingUpdatePayload) {
      setUpdating(true);
      await completeMission(pendingUpdatePayload, postFlightChecklistIds);
      setUpdating(false);
      setPendingUpdatePayload(null);
      setPostFlightChecklistIds([]);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
          <button type="button" className="focus:outline-none">
            <Badge
              className={`${statusColors[currentStatus] || ""} cursor-pointer hover:opacity-80 transition-opacity ${className}`}
            >
              {translateMissionStatus(currentStatus)}
            </Badge>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-40 p-1" align="start" onClick={(e) => e.stopPropagation()}>
          {statuses.map((s) => (
            <Button
              key={s}
              variant="ghost"
              size="sm"
              disabled={updating}
              className="w-full justify-start text-sm h-8"
              onClick={() => handleStatusChange(s)}
            >
              {s === currentStatus && <Check className="w-3.5 h-3.5 mr-2" />}
              {s !== currentStatus && <span className="w-3.5 mr-2" />}
              {translateMissionStatus(s)}
            </Button>
          ))}
        </PopoverContent>
      </Popover>

      {/* Post-flight checklist confirmation dialog */}
      <AlertDialog open={postFlightDialogOpen} onOpenChange={setPostFlightDialogOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('dashboard.missions.postFlightChecklistTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('dashboard.missions.postFlightChecklistDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={handleExecuteLater}>
              {t('dashboard.missions.executeLater')}
            </Button>
            <Button onClick={handleExecuteNow}>
              {t('dashboard.missions.executeNow')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Checklist execution dialog */}
      {checklistExecOpen && postFlightChecklistIds.length > 0 && (
        <ChecklistExecutionDialog
          open={checklistExecOpen}
          onOpenChange={(open) => {
            if (!open) handleChecklistCancelled();
          }}
          checklistId={postFlightChecklistIds[currentChecklistIndex]}
          itemName={t('dashboard.missions.postFlightLabel')}
          onComplete={handleChecklistCompleted}
        />
      )}
    </>
  );
};
