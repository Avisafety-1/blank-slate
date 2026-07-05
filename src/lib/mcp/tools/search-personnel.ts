import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed } from "./_shared";

export default defineTool({
  name: "search_personnel",
  title: "Search personnel",
  description:
    "Search users (personnel) visible to the signed-in user by full_name or email. Returns id + display fields intended for picking personnel_ids when creating a mission.",
  inputSchema: {
    query: z.string().trim().min(1).describe("Substring to match against full_name or email (case-insensitive)."),
    limit: z.number().int().min(1).max(50).default(20).describe("Maximum number of results (1-50)."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const { data, error } = await supabaseForUser(ctx)
      .from("profiles")
      .select("id, full_name, email, tittel, company_id, approved, under_training")
      .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
      .limit(limit ?? 20);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { personnel: data ?? [] },
    };
  },
});
