import React from "react";
import { Img, staticFile, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { C } from "../theme";

export const Shot: React.FC<{
  src: string;
  delay?: number;
  width?: number;
  rotate?: number;
  zoom?: number;
  style?: React.CSSProperties;
  clipFrom?: "left" | "bottom" | "right";
}> = ({ src, delay = 0, width = 900, rotate = 0, zoom = 0.06, style, clipFrom = "bottom" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200 },
    durationInFrames: 34,
  });
  const inset =
    clipFrom === "bottom"
      ? `${(1 - p) * 100}% 0% 0% 0%`
      : clipFrom === "left"
      ? `0% 0% 0% ${(1 - p) * 100}%`
      : `0% ${(1 - p) * 100}% 0% 0%`;
  const scale = 1 + interpolate(frame - delay, [0, 200], [0, zoom], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        width,
        borderRadius: 14,
        overflow: "hidden",
        border: `1px solid ${C.ice}33`,
        boxShadow: "0 40px 120px rgba(0,0,0,0.6)",
        transform: `rotate(${rotate}deg) translateY(${(1 - p) * 40}px)`,
        clipPath: `inset(${inset})`,
        background: C.navy,
        ...style,
      }}
    >
      <Img
        src={staticFile(src)}
        style={{ width: "100%", display: "block", transform: `scale(${scale})` }}
      />
    </div>
  );
};
