import { auth, defineMcp } from "@lovable.dev/mcp-js";
import echoTool from "./tools/echo";
import listMissionsTool from "./tools/list-missions";
import getMissionTool from "./tools/get-mission";
import listIncidentsTool from "./tools/list-incidents";
import listDronesTool from "./tools/list-drones";
import searchDronesTool from "./tools/search-drones";
import searchPersonnelTool from "./tools/search-personnel";
import listUpcomingMissionsTool from "./tools/list-upcoming-missions";
import getRiskAssessmentTool from "./tools/get-risk-assessment";
import createMissionTool from "./tools/create-mission";
import requestRiskAssessmentTool from "./tools/request-risk-assessment";

// The OAuth issuer MUST be the direct Supabase host — never the .lovable.cloud
// proxy or the app domain. Build it from the project ref, which Vite inlines
// as a literal at build time (import-safe, no runtime env read). The fallback
// keeps the issuer well-formed during the manifest-extract eval.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "avisafe-mcp",
  title: "AviSafe",
  version: "0.2.0",
  instructions: [
    "Tools for AviSafe — the safety management system for drone operations.",
    "",
    "READ tools (safe): `list_missions`, `get_mission`, `list_upcoming_missions`, `list_incidents`, `list_drones`, `search_drones`, `search_personnel`, `get_risk_assessment`. All are scoped to the signed-in user's company/department visibility via RLS.",
    "",
    "WRITE tools: `create_mission` and `request_risk_assessment`.",
    "",
    "Mission creation flow: (1) Use `search_drones` and `search_personnel` to resolve names to UUIDs. (2) ALWAYS ask the user to confirm latitude/longitude before calling `create_mission` — never guess coordinates from a place name. (3) `create_mission` always creates the mission as an unapproved DRAFT (approval_status='not_approved'), never published to the shared map. It cannot approve missions. (4) After creation you can call `request_risk_assessment` to produce an AI-generated risk assessment draft, then `get_risk_assessment` to fetch the stored result.",
    "",
    "IMPORTANT: `request_risk_assessment` returns an AI-generated DRAFT. It is guidance only and is NOT an approval — always communicate this to the user.",
    "",
    "This server does NOT support updating, deleting, approving or publishing missions, nor submitting incidents to ECCAIRS. Those actions must be done in the AviSafe app by an authorized user.",
    "",
    "All write actions are audit-logged (user, tool, mission, timestamp, input summary).",
  ].join("\n"),
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    echoTool,
    listMissionsTool,
    getMissionTool,
    listUpcomingMissionsTool,
    listIncidentsTool,
    listDronesTool,
    searchDronesTool,
    searchPersonnelTool,
    getRiskAssessmentTool,
    createMissionTool,
    requestRiskAssessmentTool,
  ],
});
