import React from "react";
import {
  AbsoluteFill,
  Img,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { Backdrop, ScanLine } from "../components/Backdrop";
import { C, display } from "../theme";

const Radar: React.FC = () => {
  const frame = useCurrentFrame();
  const rot = frame * 3.2;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      {[420, 680, 940].map((d, i) => {
        const p = interpolate(frame, [i * 6, i * 6 + 30], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <div
            key={d}
            style={{
              position: "absolute",
              width: d * p,
              height: d * p,
              borderRadius: "50%",
              border: `1px solid ${C.ice}${i === 0 ? "66" : "33"}`,
            }}
          />
        );
      })}
      <div
        style={{
          position: "absolute",
          width: 940,
          height: 940,
          borderRadius: "50%",
          transform: `rotate(${rot}deg)`,
          background: `conic-gradient(from 0deg, ${C.steel}00 0deg, ${C.steel}00 300deg, ${C.steel}88 360deg)`,
          opacity: interpolate(frame, [10, 40], [0, 0.85], { extrapolateRight: "clamp" }),
        }}
      />
    </AbsoluteFill>
  );
};

export const S1Open: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logoP = spring({ frame: frame - 26, fps, config: { damping: 200 }, durationInFrames: 32 });
  const lineW = interpolate(frame, [58, 84], [0, 620], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tagP = interpolate(frame, [70, 92], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      <Backdrop />
      <Radar />
      <ScanLine />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 26 }}>
        <Img
          src={staticFile("images/logo-white.png")}
          style={{
            width: 760,
            opacity: logoP,
            transform: `scale(${0.86 + logoP * 0.14})`,
            filter: `blur(${(1 - logoP) * 18}px)`,
          }}
        />
        <div style={{ width: lineW, height: 1, background: `${C.amber}` }} />
        <div
          style={{
            fontFamily: display,
            fontWeight: 600,
            fontSize: 26,
            letterSpacing: 13,
            color: C.white,
            opacity: tagP,
            textTransform: "uppercase",
            padding: "14px 28px",
            borderRadius: 10,
            background: "rgba(4, 9, 16, 0.66)",
            border: "1px solid rgba(233, 161, 59, 0.22)",
            boxShadow: "0 10px 40px rgba(0,0,0,0.45)",
          }}
        >
          Drone Operations · Safety Management
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
