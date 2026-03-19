interface DroneAttitudeIndicatorProps {
  pitch: number;  // degrees, positive = nose up
  roll: number;   // degrees, positive = right roll
  yaw?: number;   // heading degrees
}

export const DroneAttitudeIndicator = ({ pitch, roll, yaw }: DroneAttitudeIndicatorProps) => {
  // Clamp pitch to ±45° for visual range
  const clampedPitch = Math.max(-45, Math.min(45, pitch));
  const pitchOffset = (clampedPitch / 45) * 20; // max 20px shift

  return (
    <div className="w-[72px] h-[72px] rounded-lg bg-background/80 backdrop-blur-sm border border-border shadow-lg flex flex-col items-center justify-center overflow-hidden">
      {/* Attitude ball */}
      <div className="w-[56px] h-[56px] rounded-full border border-border overflow-hidden relative bg-sky-400 dark:bg-sky-600">
        {/* Ground half - shifts with pitch */}
        <div
          className="absolute left-0 right-0 bg-amber-700/70 dark:bg-amber-800/70"
          style={{
            top: `${50 + pitchOffset}%`,
            bottom: 0,
            transform: `rotate(${roll}deg)`,
            transformOrigin: `50% ${50 - pitchOffset}%`,
          }}
        />
        {/* Horizon line */}
        <div
          className="absolute left-0 right-0 h-[2px] bg-foreground/60"
          style={{
            top: `calc(${50 + pitchOffset}% - 1px)`,
            transform: `rotate(${roll}deg)`,
            transformOrigin: '50% 50%',
          }}
        />
        {/* Center drone reference */}
        <svg viewBox="0 0 56 56" className="absolute inset-0 w-full h-full">
          {/* Wings */}
          <line x1="12" y1="28" x2="22" y2="28" stroke="hsl(var(--foreground))" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="34" y1="28" x2="44" y2="28" stroke="hsl(var(--foreground))" strokeWidth="2.5" strokeLinecap="round" />
          {/* Center dot */}
          <circle cx="28" cy="28" r="3" fill="hsl(var(--foreground))" />
          {/* Nose */}
          <line x1="28" y1="28" x2="28" y2="22" stroke="hsl(var(--foreground))" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      {/* Heading */}
      {yaw !== undefined && (
        <span className="text-[9px] font-mono text-muted-foreground leading-none mt-0.5">
          {Math.round(((yaw % 360) + 360) % 360)}°
        </span>
      )}
    </div>
  );
};
