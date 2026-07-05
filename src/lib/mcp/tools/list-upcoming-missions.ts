import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed } from "./_shared";

export default defineTool({
  name: "list_upcoming_missions",
  title: "List upcoming missions",
  description:
    "List missions with tidspunkt in the future (or within the last hour), sorted by soonest first. Respects RLS visibility.",
  inputSchema: {
    days_ahead: z.number().int().min(1).max(90).default(14).describe("Only include missions scheduled within this many days ahead (1-90)."),
    limit: z.number().int().min(1).max(100).default(25).describe("Maximum number of missions to return (1-100)."),
    approval_status: z.string().optional().describe("Optional approval_status filter (e.g. 'not_approved', 'pending_approval', 'approved')."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ days_ahead, limit, approval_status }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const from = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const to = new Date(Date.now() + (days_ahead ?? 14) * 24 * 60 * 60 * 1000).toISOString();
    let q = supabaseForUser(ctx)
      .from("missions")
      .select(
        "id, tittel, lokasjon, oppdragstype, tidspunkt, slutt_tidspunkt, status, approval_status, risk_nivå, latitude, longitude, company_id",
      )
      .gte("tidspunkt", from)
      .lte("tidspunkt", to)
      .order("tidspunkt", { ascending: true })
      .limit(limit ?? 25);
    if (approval_status) q = q.eq("approval_status", approval_status);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { missions: data ?? [] },
    };
  },
});
