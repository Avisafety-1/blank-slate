import React from "react";
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Shot } from "../components/Shot";
import { C, display } from "../theme";

const WORDS = ["PILOTS", "RESOURCES", "DATA", "PROCEDURES"];
const SHOTS = [
  "images/resources.png",
  "images/dashboard.png",
  "images/analysis.png",
  "images/sora.webp",
];

const Panel: React.FC<{ i: number }> = ({ i }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 30 });
  const out = interpolate(frame, [46, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        transform: `translateY(${out * -70}px)`,
        opacity: 1 - out,
      }}
    >
      <Shot
        src={SHOTS[i]}
        delay={0}
        width={1360}
        clipFrom={i % 2 === 0 ? "left" : "right"}
        style={{ opacity: 0.95 }}
      />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          background: `radial-gradient(ellipse at center, ${C.ink}55 18%, ${C.ink}cc 78%)`,
        }}
      >
        <span
          style={{
            fontFamily: display,
            fontWeight: 800,
            fontSize: 190,
            letterSpacing: -6,
            color: i === 3 ? C.amber : C.white,
            opacity: p,
            transform: `scale(${0.9 + p * 0.1})`,
            filter: `blur(${(1 - p) * 20}px)`,
          }}
        >
          {WORDS[i]}
        </span>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const S4Connect: React.FC = () => {
  const frame = useCurrentFrame();
  const headP = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <Backdrop tilt={4} />
      {[0, 1, 2, 3].map((i) => (
        <Sequence key={i} from={i * 50} durationInFrames={64}>
          <Panel i={i} />
        </Sequence>
      ))}
      <AbsoluteFill style={{ padding: 90, justifyContent: "flex-start" }}>
        <div
          style={{
            fontFamily: display,
            fontWeight: 600,
            fontSize: 30,
            letterSpacing: 10,
            color: C.ice,
            opacity: headP,
          }}
        >
          CONNECTING
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
