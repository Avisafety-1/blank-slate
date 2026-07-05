import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed } from "./_shared";
import { writeAudit } from "./_audit";

const DEFAULT_PILOT_INPUTS = {
  flightHeight: 120,
  operationType: "Inspeksjon",
  isVlos: true,
  observerCount: 0,
  atcRequired: false,
  proximityToPeople: "sparsely_populated",
  criticalInfrastructure: false,
  backupLandingAvailable: true,
  skipWeatherEvaluation: false,
};

export default defineTool({
  name: "request_risk_assessment",
  title: "Request AI risk assessment",
  description:
    "Trigger the AviSafe AI risk assessment for an existing mission. The result is an AI-GENERATED DRAFT — it is guidance, NOT an approval. The pilot/mission approver is still responsible for the operation.",
  inputSchema: {
    mission_id: z.string().uuid().describe("Mission UUID to assess."),
    drone_id: z.string().uuid().optional().describe("Optional specific drone_id from the mission's assigned drones."),
    flight_height_m: z.number().min(1).max(500).optional().describe("Planned flight height in meters AGL (default 120)."),
    operation_type: z.string().optional().describe("Operation type label (default 'Inspeksjon')."),
    is_vlos: z.boolean().optional().describe("Flight kept in visual line of sight (default true)."),
    observer_count: z.number().int().min(0).max(20).optional().describe("Number of trained observers (default 0)."),
    proximity_to_people: z
      .enum(["controlled", "sparsely_populated", "populated", "gathering"])
      .optional()
      .describe("Density of uninvolved people (default 'sparsely_populated')."),
    critical_infrastructure: z.boolean().optional().describe("Operation is close to critical infrastructure (default false)."),
    atc_required: z.boolean().optional().describe("Coordination with ATC required (default false)."),
    backup_landing_available: z.boolean().optional().describe("A backup landing site is available (default true)."),
    language: z.enum(["no", "en"]).optional().describe("Preferred language for the assessment prose (default 'no')."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();

    // Resolve the caller's company for audit context (best-effort).
    let companyId: string | null = null;
    try {
      const { data } = await supabaseForUser(ctx)
        .from("profiles").select("company_id").eq("id", ctx.getUserId()).maybeSingle();
      companyId = data?.company_id ?? null;
    } catch { /* ignore */ }

    const pilotInputs = {
      ...DEFAULT_PILOT_INPUTS,
      ...(input.flight_height_m !== undefined ? { flightHeight: input.flight_height_m } : {}),
      ...(input.operation_type ? { operationType: input.operation_type } : {}),
      ...(input.is_vlos !== undefined ? { isVlos: input.is_vlos } : {}),
      ...(input.observer_count !== undefined ? { observerCount: input.observer_count } : {}),
      ...(input.proximity_to_people ? { proximityToPeople: input.proximity_to_people } : {}),
      ...(input.critical_infrastructure !== undefined ? { criticalInfrastructure: input.critical_infrastructure } : {}),
      ...(input.atc_required !== undefined ? { atcRequired: input.atc_required } : {}),
      ...(input.backup_landing_available !== undefined ? { backupLandingAvailable: input.backup_landing_available } : {}),
    };

    const url = `${process.env.SUPABASE_URL!.replace(/\/$/, "")}/functions/v1/ai-risk-assessment`;
    const apikey = (process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY)!;

    let responseText = "";
    let httpStatus = 0;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ctx.getToken()}`,
          "apikey": apikey,
        },
        body: JSON.stringify({
          missionId: input.mission_id,
          droneId: input.drone_id,
          pilotInputs,
          language: input.language ?? "no",
        }),
        signal: AbortSignal.timeout(90_000),
      });
      httpStatus = res.status;
      responseText = await res.text();

      if (!res.ok) {
        await writeAudit(ctx, {
          toolName: "request_risk_assessment",
          missionId: input.mission_id,
          companyId,
          inputSummary: { pilotInputs, drone_id: input.drone_id, language: input.language ?? "no" },
          resultStatus: "error",
          errorMessage: `HTTP ${httpStatus}: ${responseText.slice(0, 500)}`,
        });
        return {
          content: [{ type: "text", text: `Risk assessment failed (HTTP ${httpStatus}): ${responseText}` }],
          isError: true,
        };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await writeAudit(ctx, {
        toolName: "request_risk_assessment",
        missionId: input.mission_id,
        companyId,
        inputSummary: { pilotInputs, drone_id: input.drone_id, language: input.language ?? "no" },
        resultStatus: "error",
        errorMessage: msg,
      });
      return { content: [{ type: "text", text: `Risk assessment request failed: ${msg}` }], isError: true };
    }

    let parsed: unknown = responseText;
    try { parsed = JSON.parse(responseText); } catch { /* keep raw */ }

    await writeAudit(ctx, {
      toolName: "request_risk_assessment",
      missionId: input.mission_id,
      companyId,
      inputSummary: { pilotInputs, drone_id: input.drone_id, language: input.language ?? "no" },
      resultStatus: "ok",
    });

    const disclaimer =
      "AI-GENERATED DRAFT — this risk assessment is guidance, not an approval. The pilot/mission approver is still responsible for the operation.";

    return {
      content: [
        {
          type: "text",
          text: `${disclaimer}\n\n${typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2)}`,
        },
      ],
      structuredContent: {
        disclaimer,
        is_ai_generated: true,
        is_draft: true,
        result: parsed,
      },
    };
  },
});
