import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed } from "./_shared";

export default defineTool({
  name: "list_drones",
  title: "List drones",
  description: "List the signed-in user's visible drones. Respects company/department visibility via RLS.",
  inputSchema: {
    limit: z.number().int().min(1).max(200).default(50).describe("Maximum number of drones to return (1-200)."),
    status: z.string().optional().describe("Optional status filter (e.g. 'aktiv', 'inaktiv')."),
    search: z.string().optional().describe("Optional case-insensitive substring match on navn, modell or serienummer."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ limit, status, search }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    let q = supabaseForUser(ctx)
      .from("drones")
      .select("id, navn, modell, serienummer, internal_serial, registration_number, klasse, status, tilgjengelig, company_id, flyvetimer, vekt, aktiv")
      .limit(limit ?? 50);
    if (status) q = q.eq("status", status);
    if (search) q = q.or(`navn.ilike.%${search}%,modell.ilike.%${search}%,serienummer.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { drones: data ?? [] },
    };
  },
});
