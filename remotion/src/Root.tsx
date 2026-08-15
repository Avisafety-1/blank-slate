import React from "react";
import { Composition } from "remotion";
import { MainVideo } from "./MainVideo";

// 160+190+200+230+190+150 = 1120 minus transitions (102) = 1018
export const RemotionRoot: React.FC = () => (
  <Composition
    id="main"
    component={MainVideo}
    durationInFrames={1018}
    fps={30}
    width={1920}
    height={1080}
  />
);
