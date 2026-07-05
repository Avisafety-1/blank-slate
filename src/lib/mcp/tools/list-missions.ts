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
  name: "list_missions",
  title: "List missions",
  description:
    "List the signed-in user's visible drone missions (oppdrag), most recent first. Respects company/department visibility via RLS.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).default(20).describe("Maximum number of missions to return (1-100)."),
    status: z.string().optional().describe("Optional approval_status filter (e.g. 'pending', 'approved')."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ limit, status }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("missions")
      .select("id, lokasjon, beskrivelse, approval_status, company_id, latitude, longitude")
      .order("id", { ascending: false })
      .limit(limit ?? 20);
    if (status) q = q.eq("approval_status", status);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { missions: data ?? [] },
    };
  },
});
