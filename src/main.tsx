// Polyfill crypto.randomUUID for older WebViews (DJI RC Plus/Pro, Chrome <92)
if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function') {
  (crypto as any).randomUUID = function () {
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, function (c: any) {
      var r = crypto.getRandomValues(new Uint8Array(1))[0];
      return (Number(c) ^ (r & (15 >> (Number(c) / 4)))).toString(16);
    }) as `${string}-${string}-${string}-${string}-${string}`;
  };
}

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
