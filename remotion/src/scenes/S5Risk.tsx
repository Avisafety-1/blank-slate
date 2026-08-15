import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Line, Eyebrow } from "../components/Kinetic";
import { Shot } from "../components/Shot";
import { C } from "../theme";

export const S5Risk: React.FC = () => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, 190], [1.1, 1.0]);
  const sweep = interpolate(frame, [24, 90], [-1400, 2400], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill>
      <Backdrop tilt={-6} />
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        <Shot
          src="images/sora.webp"
          delay={2}
          width={2100}
          clipFrom="bottom"
          zoom={0.1}
          style={{ position: "absolute", left: -90, top: -80, opacity: 1, borderRadius: 0 }}
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, ${C.ink}bb 0%, ${C.ink}22 38%, ${C.ink}e6 100%)`,
        }}
      />
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: sweep,
            width: 420,
            transform: "skewX(-14deg)",
            background: `linear-gradient(90deg, transparent, ${C.amber}22, transparent)`,
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill style={{ padding: "0 120px", justifyContent: "center" }}>
        <Eyebrow text="Predictive safety intelligence" delay={6} />
        <div style={{ height: 26 }} />
        <Line text="STAY AHEAD OF" delay={14} size={126} />
        <Line text="EMERGING RISKS" delay={22} size={126} color={C.amber} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
