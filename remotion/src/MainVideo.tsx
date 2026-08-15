import React from "react";
import { AbsoluteFill } from "remotion";
import {
  TransitionSeries,
  linearTiming,
  springTiming,
} from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { wipe } from "@remotion/transitions/wipe";
import { slide } from "@remotion/transitions/slide";
import { S1Open } from "./scenes/S1Open";
import { S2Control } from "./scenes/S2Control";
import { S3Safety } from "./scenes/S3Safety";
import { S4Connect } from "./scenes/S4Connect";
import { S5Risk } from "./scenes/S5Risk";
import { S6End } from "./scenes/S6End";
import { C } from "./theme";

export const MainVideo: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: C.ink }}>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={105}>
        <S1Open />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={wipe({ direction: "from-right" })}
        timing={springTiming({ config: { damping: 200 }, durationInFrames: 24 })}
      />
      <TransitionSeries.Sequence durationInFrames={140}>
        <S2Control />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-bottom" })}
        timing={springTiming({ config: { damping: 200 }, durationInFrames: 22 })}
      />
      <TransitionSeries.Sequence durationInFrames={150}>
        <S3Safety />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 14 })}
      />
      <TransitionSeries.Sequence durationInFrames={160}>
        <S4Connect />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={wipe({ direction: "from-bottom" })}
        timing={springTiming({ config: { damping: 200 }, durationInFrames: 24 })}
      />
      <TransitionSeries.Sequence durationInFrames={150}>
        <S5Risk />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 18 })}
      />
      <TransitionSeries.Sequence durationInFrames={130}>
        <S6End />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);
