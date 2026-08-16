import React from "react";
import { AbsoluteFill } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

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
      <TransitionSeries.Sequence durationInFrames={230}>
        <S1Open />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 22 })}
      />
      <TransitionSeries.Sequence durationInFrames={190}>
        <S2Control />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 22 })}
      />
      <TransitionSeries.Sequence durationInFrames={200}>
        <S3Safety />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 22 })}
      />
      <TransitionSeries.Sequence durationInFrames={230}>
        <S4Connect />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 22 })}
      />
      <TransitionSeries.Sequence durationInFrames={190}>
        <S5Risk />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 24 })}
      />
      <TransitionSeries.Sequence durationInFrames={240}>
        <S6End />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);

