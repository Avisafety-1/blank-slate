import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Line, Eyebrow, Reveal } from "../components/Kinetic";
import { Shot } from "../components/Shot";
import { C, body } from "../theme";

export const S2Control: React.FC = () => {
  const frame = useCurrentFrame();
  const px = interpolate(frame, [0, 190], [50, -50]);
  return (
    <AbsoluteFill>
      <Backdrop tilt={10} />
      <AbsoluteFill style={{ transform: `translateX(${px}px)` }}>
        <Shot
          src="images/map.webp"
          delay={6}
          width={1260}
          clipFrom="right"
          style={{ position: "absolute", right: -140, top: 70, opacity: 1 }}
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background: `linear-gradient(90deg, ${C.ink} 14%, ${C.ink}cc 34%, transparent 58%)`,
        }}
      />
      <AbsoluteFill style={{ padding: "0 0 0 120px", justifyContent: "center" }}>
        <Eyebrow text="One operational picture" delay={4} />
        <div style={{ height: 26 }} />
        <Line text="OPERATIONAL" delay={10} size={132} />
        <Line text="CONTROL" delay={16} size={132} color={C.amber} />
        <div style={{ height: 30 }} />
        <Reveal delay={34}>
          <p
            style={{
              fontFamily: body,
              fontSize: 30,
              lineHeight: 1.45,
              color: C.ice,
              maxWidth: 620,
              margin: 0,
            }}
          >
            Airspace, missions and live flights in a single command surface —
            from planning to touchdown.
          </p>
        </Reveal>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
