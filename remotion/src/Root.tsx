import React from "react";
import { Composition } from "remotion";
import { MainVideo } from "./MainVideo";

// 230+190+200+230+190+240 = 1280 minus transitions (112) = 1168
export const RemotionRoot: React.FC = () => (
  <Composition
    id="main"
    component={MainVideo}
    durationInFrames={1168}

    fps={30}
    width={1920}
    height={1080}
  />
);
