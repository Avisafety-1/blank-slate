import React from "react";
import { cn } from "@/lib/utils";

interface DroneOptionContentProps {
  modell?: string | null;
  dji_aircraft_name?: string | null;
  serienummer?: string | null;
  /** Department the drone belongs to — shown so identically named drones can be told apart. */
  department?: string | null;
  className?: string;
}

export const DroneOptionContent: React.FC<DroneOptionContentProps> = ({
  modell,
  dji_aircraft_name,
  serienummer,
  department,
  className,
}) => {
  const name = (dji_aircraft_name || "").trim();
  const sn = (serienummer || "").trim();
  const dept = (department || "").trim();
  const secondary = [name, sn ? `(${sn})` : ""].filter(Boolean).join(" ");

  return (
    <div className={cn("whitespace-normal break-words leading-snug", className)}>
      <div className="font-medium">{modell || "—"}</div>
      {secondary && (
        <div className="text-xs text-muted-foreground mt-0.5">{secondary}</div>
      )}
      {dept && (
        <div className="text-xs text-muted-foreground/80 mt-0.5">{dept}</div>
      )}
    </div>
  );
};
