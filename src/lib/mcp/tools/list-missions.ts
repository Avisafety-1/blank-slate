import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed } from "./_shared";

export default defineTool({
  name: "list_missions",
  title: "List missions",
  description:
    "List the signed-in user's visible drone missions (oppdrag), most recent by planned time first. Respects company/department visibility via RLS.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).default(20).describe("Maximum number of missions to return (1-100)."),
    status: z.string().optional().describe("Optional approval_status filter (e.g. 'not_approved', 'pending_approval', 'approved')."),
    search: z.string().optional().describe("Optional case-insensitive substring match on tittel or lokasjon."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ limit, status, search }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    let q = supabaseForUser(ctx)
      .from("missions")
      .select(
        "id, tittel, lokasjon, beskrivelse, oppdragstype, tidspunkt, slutt_tidspunkt, status, approval_status, risk_nivå, company_id, latitude, longitude, opprettet_dato",
      )
      .order("tidspunkt", { ascending: false, nullsFirst: false })
      .limit(limit ?? 20);
    if (status) q = q.eq("approval_status", status);
    if (search) q = q.or(`tittel.ilike.%${search}%,lokasjon.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { missions: data ?? [] },
    };
  },
});
