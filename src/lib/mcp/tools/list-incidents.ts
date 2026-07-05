import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed } from "./_shared";

export default defineTool({
  name: "list_incidents",
  title: "List incidents",
  description:
    "List the signed-in user's visible incidents (hendelser), most recent first. Respects company/department visibility via RLS.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).default(20).describe("Maximum number of incidents to return (1-100)."),
    severity: z.string().optional().describe("Optional alvorlighetsgrad filter (e.g. 'lav', 'medium', 'hoy')."),
    category: z.string().optional().describe("Optional kategori filter."),
    mission_id: z.string().uuid().optional().describe("Only incidents linked to this mission id."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ limit, severity, category, mission_id }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    let q = supabaseForUser(ctx)
      .from("incidents")
      .select(
        "id, incident_number, tittel, beskrivelse, alvorlighetsgrad, status, kategori, hendelsestidspunkt, lokasjon, mission_id, drone_id, pilot_id, company_id, reported_anonymously",
      )
      .order("hendelsestidspunkt", { ascending: false })
      .limit(limit ?? 20);
    if (severity) q = q.eq("alvorlighetsgrad", severity);
    if (category) q = q.eq("kategori", category);
    if (mission_id) q = q.eq("mission_id", mission_id);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { incidents: data ?? [] },
    };
  },
});
