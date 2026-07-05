import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed } from "./_shared";

const FIELDS = [
  "id",
  "tittel",
  "lokasjon",
  "beskrivelse",
  "oppdragstype",
  "tidspunkt",
  "slutt_tidspunkt",
  "status",
  "approval_status",
  "approval_comment",
  "approved_at",
  "approved_by",
  "submitted_for_approval_at",
  "risk_nivå",
  "risk_score",
  "company_id",
  "user_id",
  "latitude",
  "longitude",
  "publish_to_map",
  "anonymous_publish",
  "opprettet_dato",
  "oppdatert_dato",
  "estimert_varighet",
].join(", ");

export default defineTool({
  name: "get_mission",
  title: "Get mission",
  description: "Fetch a single mission (oppdrag) by id with its planning and approval metadata. Respects RLS visibility for the signed-in user.",
  inputSchema: {
    id: z.string().uuid().describe("Mission UUID."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ id }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("missions")
      .select(FIELDS)
      .eq("id", id)
      .maybeSingle<Record<string, unknown>>();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: "Mission not found" }], isError: true };

    const [{ data: drones }, { data: personnel }] = await Promise.all([
      supabase.from("mission_drones").select("drone_id, drones(navn, modell, serienummer)").eq("mission_id", id),
      supabase.from("mission_personnel").select("user_id, role, profiles(full_name, email)").eq("mission_id", id),
    ]);

    const enriched = { ...data, drones: drones ?? [], personnel: personnel ?? [] };
    return {
      content: [{ type: "text", text: JSON.stringify(enriched, null, 2) }],
      structuredContent: { mission: enriched },
    };
  },
});
