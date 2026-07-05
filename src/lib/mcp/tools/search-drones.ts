import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed } from "./_shared";

export default defineTool({
  name: "search_drones",
  title: "Search drones",
  description:
    "Search the signed-in user's visible drones by model, serial or registration. Returns a compact list intended for picking drone_ids when creating a mission.",
  inputSchema: {
    query: z.string().trim().min(1).describe("Substring to match against modell, serienummer, internal_serial or registration_number (case-insensitive)."),
    limit: z.number().int().min(1).max(50).default(20).describe("Maximum number of results (1-50)."),
    only_active: z.boolean().default(true).describe("If true, only include drones where aktiv=true."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ query, limit, only_active }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    let q = supabaseForUser(ctx)
      .from("drones")
      .select("id, modell, serienummer, internal_serial, registration_number, klasse, status, tilgjengelig, aktiv, company_id")
      .or(
        `modell.ilike.%${query}%,serienummer.ilike.%${query}%,internal_serial.ilike.%${query}%,registration_number.ilike.%${query}%`,
      )
      .limit(limit ?? 20);
    if (only_active) q = q.eq("aktiv", true);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { drones: data ?? [] },
    };
  },
});
