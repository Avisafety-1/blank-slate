import { auth, defineMcp } from "@lovable.dev/mcp-js";
import echoTool from "./tools/echo";
import listMissionsTool from "./tools/list-missions";
import getMissionTool from "./tools/get-mission";
import listIncidentsTool from "./tools/list-incidents";
import listDronesTool from "./tools/list-drones";

// The OAuth issuer MUST be the direct Supabase host — never the .lovable.cloud
// proxy or the app domain. Build it from the project ref, which Vite inlines
// as a literal at build time (import-safe, no runtime env read). The fallback
// keeps the issuer well-formed during the manifest-extract eval.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "avisafe-mcp",
  title: "AviSafe",
  version: "0.1.0",
  instructions:
    "Tools for AviSafe — the safety management system for drone operations. Use `list_missions` and `get_mission` to inspect oppdrag, `list_incidents` for hendelser, and `list_drones` for the drone fleet. All tools return data scoped to the signed-in user's company/department visibility via RLS. Use `echo` to verify connectivity.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [echoTool, listMissionsTool, getMissionTool, listIncidentsTool, listDronesTool],
});
