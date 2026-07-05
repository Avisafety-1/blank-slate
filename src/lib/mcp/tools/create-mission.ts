import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed } from "./_shared";
import { writeAudit } from "./_audit";

export default defineTool({
  name: "create_mission",
  title: "Create mission (draft)",
  description:
    "Create a new mission (oppdrag) as an unapproved draft (approval_status='not_approved'). Never publishes to the shared map and never marks the mission as approved. The signed-in user must belong to a company; the mission is created inside that company via RLS. Latitude/longitude must be provided by the user — do NOT guess coordinates.",
  inputSchema: {
    tittel: z.string().trim().min(1).max(200).describe("Mission title."),
    lokasjon: z.string().trim().min(1).max(200).describe("Human-readable location name (e.g. 'Brekstad')."),
    tidspunkt: z
      .string()
      .describe("Planned start time as ISO 8601 timestamp with timezone (e.g. '2026-07-06T12:00:00+02:00')."),
    slutt_tidspunkt: z
      .string()
      .optional()
      .describe("Optional planned end time as ISO 8601 timestamp."),
    latitude: z.number().min(-90).max(90).describe("Latitude in decimal degrees. Must be confirmed by the user."),
    longitude: z.number().min(-180).max(180).describe("Longitude in decimal degrees. Must be confirmed by the user."),
    beskrivelse: z.string().optional().describe("Free-text description / mission brief."),
    oppdragstype: z.string().optional().describe("Mission type label (e.g. 'Inspeksjon', 'Foto')."),
    drone_ids: z.array(z.string().uuid()).default([]).describe("Drone UUIDs to assign. Look up via search_drones first."),
    personnel_ids: z
      .array(z.string().uuid())
      .default([])
      .describe("Personnel (profile) UUIDs to assign. Look up via search_personnel first."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const userId = ctx.getUserId();
    if (!userId) return notAuthed();

    const supabase = supabaseForUser(ctx);

    // Resolve the caller's company. RLS on profiles allows the user to read their own row.
    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();
    if (profErr) {
      await writeAudit(ctx, {
        toolName: "create_mission",
        inputSummary: summarize(input),
        resultStatus: "error",
        errorMessage: profErr.message,
      });
      return { content: [{ type: "text", text: `Could not load profile: ${profErr.message}` }], isError: true };
    }
    const companyId = profile?.company_id;
    if (!companyId) {
      await writeAudit(ctx, {
        toolName: "create_mission",
        inputSummary: summarize(input),
        resultStatus: "error",
        errorMessage: "No company_id on profile",
      });
      return {
        content: [{ type: "text", text: "The signed-in user is not linked to a company; cannot create mission." }],
        isError: true,
      };
    }

    // Validate tidspunkt is parseable.
    const startIso = safeIso(input.tidspunkt);
    if (!startIso) {
      return { content: [{ type: "text", text: "tidspunkt is not a valid ISO 8601 timestamp." }], isError: true };
    }
    const endIso = input.slutt_tidspunkt ? safeIso(input.slutt_tidspunkt) : null;
    if (input.slutt_tidspunkt && !endIso) {
      return { content: [{ type: "text", text: "slutt_tidspunkt is not a valid ISO 8601 timestamp." }], isError: true };
    }

    const insertRow = {
      tittel: input.tittel,
      lokasjon: input.lokasjon,
      tidspunkt: startIso,
      slutt_tidspunkt: endIso,
      latitude: input.latitude,
      longitude: input.longitude,
      beskrivelse: input.beskrivelse ?? null,
      oppdragstype: input.oppdragstype ?? null,
      company_id: companyId,
      user_id: userId,
      // Explicit safety: always draft, never published, never anonymous.
      approval_status: "not_approved",
      status: "Planlagt",
      publish_to_map: false,
      anonymous_publish: false,
    };

    const { data: mission, error: insErr } = await supabase
      .from("missions")
      .insert(insertRow)
      .select("id, tittel, lokasjon, tidspunkt, approval_status, status, company_id")
      .single();

    if (insErr || !mission) {
      await writeAudit(ctx, {
        toolName: "create_mission",
        companyId,
        inputSummary: summarize(input),
        resultStatus: "error",
        errorMessage: insErr?.message ?? "insert returned no row",
      });
      return {
        content: [{ type: "text", text: `Failed to create mission: ${insErr?.message ?? "unknown error"}` }],
        isError: true,
      };
    }

    const warnings: string[] = [];

    if (input.drone_ids.length > 0) {
      const rows = input.drone_ids.map((drone_id) => ({ mission_id: mission.id, drone_id }));
      const { error } = await supabase.from("mission_drones").insert(rows);
      if (error) warnings.push(`Kunne ikke koble alle droner: ${error.message}`);
    }
    if (input.personnel_ids.length > 0) {
      const rows = input.personnel_ids.map((profile_id) => ({ mission_id: mission.id, profile_id }));
      const { error } = await supabase.from("mission_personnel").insert(rows);
      if (error) warnings.push(`Kunne ikke koble alt personell: ${error.message}`);
    }

    await writeAudit(ctx, {
      toolName: "create_mission",
      missionId: mission.id,
      companyId,
      inputSummary: summarize(input),
      resultStatus: "ok",
    });

    const note =
      "Mission created as DRAFT (approval_status='not_approved'). It is NOT approved and NOT published to the shared map.";
    const payload = { mission, warnings, note };
    return {
      content: [{ type: "text", text: `${note}\n\n${JSON.stringify(payload, null, 2)}` }],
      structuredContent: payload,
    };
  },
});

function safeIso(v: string): string | null {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function summarize(input: Record<string, unknown>): Record<string, unknown> {
  return {
    tittel: input.tittel,
    lokasjon: input.lokasjon,
    tidspunkt: input.tidspunkt,
    slutt_tidspunkt: input.slutt_tidspunkt,
    latitude: input.latitude,
    longitude: input.longitude,
    oppdragstype: input.oppdragstype,
    drone_ids: Array.isArray(input.drone_ids) ? (input.drone_ids as unknown[]).length : 0,
    personnel_ids: Array.isArray(input.personnel_ids) ? (input.personnel_ids as unknown[]).length : 0,
  };
}
