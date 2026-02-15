import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const statuses = ["Planlagt", "Pågående", "Fullført", "Avbrutt"] as const;

interface MissionStatusDropdownProps {
  missionId: string;
  currentStatus: string;
  onStatusChanged?: () => void;
  /** Badge color map – caller provides to match its own palette */
  statusColors: Record<string, string>;
  className?: string;
}

export const MissionStatusDropdown = ({
  missionId,
  currentStatus,
  onStatusChanged,
  statusColors,
  className = "",
}: MissionStatusDropdownProps) => {
  const [open, setOpen] = useState(false);
  const [updating, setUpdating] = useState(false);

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === currentStatus) {
      setOpen(false);
      return;
    }
    setUpdating(true);
    const { error } = await supabase
      .from("missions")
      .update({ status: newStatus, oppdatert_dato: new Date().toISOString() })
      .eq("id", missionId);

    if (error) {
      toast.error("Kunne ikke oppdatere status");
      console.error(error);
    } else {
      toast.success(`Status endret til ${newStatus}`);
      onStatusChanged?.();
    }
    setUpdating(false);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
        <button type="button" className="focus:outline-none">
          <Badge
            className={`${statusColors[currentStatus] || ""} cursor-pointer hover:opacity-80 transition-opacity ${className}`}
          >
            {currentStatus}
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
            {s}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
};
