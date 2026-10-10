// Event notifications for internal audits (assignment, ready for verification, verified).
// Recipients are derived server-side from the current state; the client only names the event.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { requireUser, authErrorResponse } from "../_shared/auth.ts";
import { eventMatchesState, recipientsFor } from "../_shared/auditNotify.ts";
import { deliverAuditNotification, loadAuditState } from "../_shared/auditDeliver.ts";

const Body = z.object({
  event: z.enum(["assigned", "ready_for_verification", "verified"]),
  findingId: z.string().uuid(),
  actionId: z.string().uuid().nullable().optional(),
});

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let user;
  try {
    user = await requireUser(req);
  } catch (e) {
    return authErrorResponse(e, corsHeaders);
  }
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { event, findingId } = parsed.data;
    const actionId = parsed.data.actionId ?? null;

    // Caller must be able to read the finding under RLS.
    const { data: visible } = await user.client.from("audit_findings").select("id").eq("id", findingId).maybeSingle();
    if (!visible) return json({ error: "forbidden" }, 403);

    const state = await loadAuditState(user.service, findingId);
    if (!state) return json({ error: "not_found" }, 404);
    if (!eventMatchesState(event, state, { actionId })) return json({ sent: 0, skipped: "state_mismatch" });

    const recipients = recipientsFor(event, state, user.id, { actionId });
    const sent = await deliverAuditNotification(user.service, { kind: event, state, actionId, recipients, actorId: user.id });
    return json({ sent });
  } catch (e) {
    console.error("[audit-notify] error", e);
    return json({ error: "internal_error" }, 500);
  }
});
