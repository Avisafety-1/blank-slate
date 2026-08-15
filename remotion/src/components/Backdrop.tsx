import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { C } from "../theme";

export const Grid: React.FC<{ opacity?: number; speed?: number }> = ({
  opacity = 0.14,
  speed = 0.35,
}) => {
  const frame = useCurrentFrame();
  const off = (frame * speed) % 80;
  return (
    <AbsoluteFill
      style={{
        opacity,
        backgroundImage: `linear-gradient(${C.ice}55 1px, transparent 1px), linear-gradient(90deg, ${C.ice}55 1px, transparent 1px)`,
        backgroundSize: "80px 80px",
        backgroundPosition: `${off}px ${off}px`,
      }}
    />
  );
};

export const Vignette: React.FC = () => (
  <AbsoluteFill
    style={{
      background:
        "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 35%, rgba(3,7,12,0.85) 100%)",
    }}
  />
);

export const Backdrop: React.FC<{ tilt?: number }> = ({ tilt = 0 }) => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 90) * 30;
  return (
    <AbsoluteFill style={{ backgroundColor: C.ink, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `linear-gradient(${140 + tilt}deg, ${C.navy} 0%, ${C.ink} 45%, #071522 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          transform: `translateX(${drift}px)`,
          background: `radial-gradient(circle at 20% 20%, ${C.steel}55 0%, transparent 45%), radial-gradient(circle at 85% 80%, ${C.steel}33 0%, transparent 50%)`,
        }}
      />
      <Grid />
      <Vignette />
    </AbsoluteFill>
  );
};

export const ScanLine: React.FC = () => {
  const frame = useCurrentFrame();
  const y = interpolate(frame % 150, [0, 150], [-200, 1300]);
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: y,
          height: 180,
          background: `linear-gradient(180deg, transparent, ${C.ice}18, transparent)`,
        }}
      />
    </AbsoluteFill>
  );
};
