import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { display, C } from "../theme";

export const Line: React.FC<{
  text: string;
  delay?: number;
  size?: number;
  color?: string;
  weight?: number;
  tracking?: number;
  stagger?: number;
}> = ({
  text,
  delay = 0,
  size = 140,
  color = C.white,
  weight = 800,
  tracking = -4,
  stagger = 2,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(" ");
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: `0 ${size * 0.22}px` }}>
      {words.map((w, i) => {
        const p = spring({
          frame: frame - delay - i * stagger,
          fps,
          config: { damping: 200 },
          durationInFrames: 26,
        });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              fontFamily: display,
              fontWeight: weight,
              fontSize: size,
              lineHeight: 1.02,
              letterSpacing: tracking,
              color,
              opacity: p,
              filter: `blur(${(1 - p) * 14}px)`,
              transform: `translateY(${(1 - p) * size * 0.45}px)`,
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};

export const Eyebrow: React.FC<{ text: string; delay?: number }> = ({
  text,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const w = interpolate(frame - delay, [0, 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, overflow: "hidden" }}>
      <div style={{ width: 64 * w, height: 2, background: C.amber }} />
      <span
        style={{
          fontFamily: display,
          fontWeight: 600,
          fontSize: 22,
          letterSpacing: 8,
          color: C.ice,
          opacity: w,
          textTransform: "uppercase",
        }}
      >
        {text}
      </span>
    </div>
  );
};

export const Reveal: React.FC<{
  children: React.ReactNode;
  delay?: number;
  from?: "left" | "bottom";
}> = ({ children, delay = 0, from = "bottom" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200 },
    durationInFrames: 30,
  });
  const t =
    from === "bottom"
      ? `translateY(${(1 - p) * 60}px)`
      : `translateX(${(1 - p) * -80}px)`;
  return <div style={{ opacity: p, transform: t }}>{children}</div>;
};
