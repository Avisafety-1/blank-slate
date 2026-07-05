import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_incidents",
  title: "List incidents",
  description:
    "List the signed-in user's visible incidents (hendelser), most recent first. Respects company/department visibility via RLS.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).default(20).describe("Maximum number of incidents to return (1-100)."),
    severity: z.string().optional().describe("Optional alvorlighetsgrad filter (e.g. 'lav', 'medium', 'hoy')."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ limit, severity }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    let q = supabaseForUser(ctx)
      .from("incidents")
      .select(
        "id, tittel, beskrivelse, alvorlighetsgrad, status, kategori, hendelsestidspunkt, lokasjon, incident_number",
      )
      .order("hendelsestidspunkt", { ascending: false })
      .limit(limit ?? 20);
    if (severity) q = q.eq("alvorlighetsgrad", severity);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { incidents: data ?? [] },
    };
  },
});
