import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Line, Eyebrow } from "../components/Kinetic";
import { Shot } from "../components/Shot";
import { C, body, display } from "../theme";

const Stat: React.FC<{ label: string; value: string; delay: number }> = ({
  label,
  value,
  delay,
}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame - delay, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        opacity: p,
        transform: `translateY(${(1 - p) * 24}px)`,
        borderLeft: `2px solid ${C.amber}`,
        paddingLeft: 18,
      }}
    >
      <div style={{ fontFamily: display, fontWeight: 800, fontSize: 54, color: C.white }}>
        {value}
      </div>
      <div style={{ fontFamily: body, fontSize: 20, letterSpacing: 2, color: C.ice }}>
        {label}
      </div>
    </div>
  );
};

export const S3Safety: React.FC = () => {
  const frame = useCurrentFrame();
  const y = interpolate(frame, [0, 140], [30, -30]);
  return (
    <AbsoluteFill>
      <Backdrop tilt={-14} />
      <AbsoluteFill style={{ transform: `translateY(${y}px)` }}>
        <Shot
          src="images/audit.png"
          delay={8}
          width={1000}
          clipFrom="bottom"
          style={{ position: "absolute", left: -120, top: 260, opacity: 0.85 }}
        />
        <Shot
          src="images/stats.png"
          delay={20}
          width={860}
          clipFrom="left"
          style={{ position: "absolute", right: 90, top: 520 }}
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, ${C.ink}f2 18%, ${C.ink}80 55%, ${C.ink}f5 100%)`,
        }}
      />
      <AbsoluteFill style={{ padding: "110px 120px", justifyContent: "flex-start" }}>
        <Eyebrow text="Compliance by design" delay={2} />
        <div style={{ height: 22 }} />
        <Line text="SAFETY" delay={8} size={150} />
        <Line text="MANAGEMENT" delay={14} size={150} color={C.ice} />
        <div style={{ height: 56 }} />
        <div style={{ display: "flex", gap: 70 }}>
          <Stat value="SORA" label="RISK ASSESSMENT" delay={44} />
          <Stat value="ECCAIRS" label="INCIDENT REPORTING" delay={52} />
          <Stat value="AUDIT" label="INSPECTION READY" delay={60} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
