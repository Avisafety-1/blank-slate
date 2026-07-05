import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed } from "./_shared";

export default defineTool({
  name: "get_risk_assessment",
  title: "Get risk assessment",
  description:
    "Fetch the most recent stored AI-generated risk assessment for a mission. Respects RLS visibility. The assessment is an AI draft — it is not an approval.",
  inputSchema: {
    mission_id: z.string().uuid().describe("Mission UUID."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ mission_id }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const { data, error } = await supabaseForUser(ctx)
      .from("mission_risk_assessments")
      .select("*")
      .eq("mission_id", mission_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) {
      return {
        content: [{ type: "text", text: "No risk assessment found for this mission." }],
        structuredContent: { assessment: null },
      };
    }
    return {
      content: [
        {
          type: "text",
          text:
            "AI-generated risk assessment (draft — not an approval):\n" +
            JSON.stringify(data, null, 2),
        },
      ],
      structuredContent: { assessment: data, disclaimer: "AI-generated draft — not an approval." },
    };
  },
});
