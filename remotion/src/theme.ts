import { loadFont as loadSora } from "@remotion/google-fonts/Sora";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

export const display = loadSora("normal", {
  weights: ["600", "800"],
  subsets: ["latin"],
}).fontFamily;

export const body = loadInter("normal", {
  weights: ["400", "500", "600"],
  subsets: ["latin"],
}).fontFamily;

export const C = {
  ink: "#060C14",
  navy: "#0C1826",
  navy2: "#122438",
  steel: "#1A5091",
  ice: "#CFE3F7",
  white: "#F4F8FC",
  amber: "#E9A13B",
  danger: "#D9564C",
  green: "#4FB286",
};
