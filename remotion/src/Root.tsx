import React from "react";
import { Composition } from "remotion";
import { MainVideo } from "./MainVideo";

// 105+140+150+160+150+130 = 835 minus transitions (24+22+14+24+18=102) = 733
export const RemotionRoot: React.FC = () => (
  <Composition
    id="main"
    component={MainVideo}
    durationInFrames={733}
    fps={30}
    width={1920}
    height={1080}
  />
);
