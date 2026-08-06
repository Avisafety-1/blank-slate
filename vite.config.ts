import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";

// Compute a release identifier for Sentry: <package.version>+<short-git-sha>
// Falls back gracefully when git isn't available (e.g. some build environments).
const computeRelease = (): string => {
  let version = "0.0.0";
  try {
    const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf-8"));
    if (pkg?.version) version = String(pkg.version);
  } catch {
    /* ignore */
  }
  let commit = "dev";
  try {
    commit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim() || "dev";
  } catch {
    /* ignore */
  }
  return `${version}+${commit}`;
};

const APP_RELEASE = computeRelease();

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(APP_RELEASE),
  },
  plugins: [
    react(),
    mcpPlugin(),
    mode === "development" && componentTagger(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: mode === "production" ? "inline" : false,
      includeAssets: ["favicon.png", "robots.txt"],
      manifest: {
        name: "AviSafe - Sikkerhetsstyringssystem",
        short_name: "AviSafe",
        description: "Profesjonelt sikkerhetsstyringssystem for droneoperasjoner",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/favicon.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/favicon.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/favicon.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB limit
      },
    }),
  ].filter(Boolean),
  build: {
    target: ['es2015', 'chrome70'],
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
