import React from "react";
import {
  AbsoluteFill,
  Img,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { Backdrop, ScanLine } from "../components/Backdrop";
import { C, display, body } from "../theme";

export const S6End: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 34 });
  const lineW = interpolate(frame, [26, 52], [0, 700], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const url = interpolate(frame, [46, 68], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [216, 239], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <Backdrop />
      <ScanLine />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 28 }}>
        <Img
          src={staticFile("images/logo-white.png")}
          style={{
            width: 700,
            opacity: p,
            transform: `translateY(${(1 - p) * 30}px)`,
          }}
        />
        <div style={{ width: lineW, height: 1, background: C.amber }} />
        <div
          style={{
            fontFamily: display,
            fontWeight: 600,
            fontSize: 30,
            letterSpacing: 8,
            color: C.white,
            opacity: url,
            textAlign: "center",
          }}
        >
          OPERATIONAL CONTROL. TOTAL SAFETY.
        </div>
        <div
          style={{
            fontFamily: body,
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: 4,
            color: C.white,
            opacity: url,
          }}
        >
          avisafe.no
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: C.ink, opacity: fadeOut }} />
    </AbsoluteFill>
  );
};
