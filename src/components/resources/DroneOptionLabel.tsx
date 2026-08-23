import React from "react";
import { cn } from "@/lib/utils";

interface DroneOptionContentProps {
  modell?: string | null;
  dji_aircraft_name?: string | null;
  serienummer?: string | null;
  className?: string;
}

export const DroneOptionContent: React.FC<DroneOptionContentProps> = ({
  modell,
  dji_aircraft_name,
  serienummer,
  className,
}) => {
  const name = (dji_aircraft_name || "").trim();
  const sn = (serienummer || "").trim();
  const secondary = [name, sn ? `(${sn})` : ""].filter(Boolean).join(" ");

  return (
    <div className={cn("whitespace-normal break-words leading-snug", className)}>
      <div className="font-medium">{modell || "—"}</div>
      {secondary && (
        <div className="text-xs text-muted-foreground mt-0.5">{secondary}</div>
      )}
    </div>
  );
};
