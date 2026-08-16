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
        borderLeft: `3px solid ${C.amber}`,
        paddingLeft: 18,
        paddingTop: 10,
        paddingBottom: 10,
        paddingRight: 22,
        background: "rgba(4, 9, 16, 0.66)",
        borderRadius: 8,
        boxShadow: "0 10px 40px rgba(0,0,0,0.45)",
      }}
    >
      <div style={{ fontFamily: display, fontWeight: 800, fontSize: 54, color: C.white }}>
        {value}
      </div>
      <div style={{ fontFamily: body, fontSize: 21, fontWeight: 600, letterSpacing: 2, color: C.white }}>
        {label}
      </div>
    </div>
  );
};

export const S3Safety: React.FC = () => {
  const frame = useCurrentFrame();
  const y = interpolate(frame, [0, 200], [36, -36]);
  return (
    <AbsoluteFill>
      <Backdrop tilt={-14} />
      <AbsoluteFill style={{ transform: `translateY(${y}px)` }}>
        <Shot
          src="images/stable/audit.jpg"
          delay={8}
          width={1060}
          clipFrom="bottom"
          style={{ position: "absolute", left: -100, top: 250, opacity: 1 }}
        />
        <Shot
          src="images/stable/stats.jpg"
          delay={20}
          width={860}
          clipFrom="left"
          style={{ position: "absolute", right: 90, top: 520 }}
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, ${C.ink}ee 14%, ${C.ink}44 50%, ${C.ink}dd 100%)`,
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
