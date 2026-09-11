// Shared DJI sync job processing.
// Used by both dji-sync-worker (nightly cron drain) and dji-sync-now
// (user-triggered "Sync nå") so both paths behave identically.

import {
  DRONELOG_BASE,
  downloadLogBytes,
  uploadAndParse,
  matchDroneAndBattery,
} from "./dji-parser.ts";
import { resolveDronelogKey } from "./dronelog-auth.ts";

export const MAX_ATTEMPTS = 5;

export interface SyncJob {
  id: string;
  company_id: string;
  user_id: string;
  dji_log_id: string;
  download_url: string | null;
  payload: any;
  attempts: number;
}

export async function processJob(
  serviceClient: any,
  job: SyncJob,
): Promise<{ status: string; total_ms: number; error?: string }> {
  const t0 = Date.now();
  const step_durations: Record<string, number> = {};

  try {
    // Resolve dronelog key for this user (personal -> company -> global)
    const { data: company } = await serviceClient
      .from("companies").select("id, dronelog_api_key").eq("id", job.company_id).maybeSingle();
    if (!company) throw new Error("company not found");
    const resolvedKey = await resolveDronelogKey(serviceClient, {
      userId: job.user_id,
      companyId: job.company_id,
      provision: true,
    });
    const dronelogKey = resolvedKey?.key;
    if (!dronelogKey) throw new Error("no dronelog key");

    const accountId = job.payload?.dronelog_account_id;
    const fileUrl = job.download_url
      || (accountId ? `${DRONELOG_BASE}/logs/${accountId}/${job.dji_log_id}/download` : null);
    if (!fileUrl) throw new Error("no download url and no accountId in payload");

    // 1. Download
    const dlStart = Date.now();
    let bytes: Uint8Array;
    try {
      bytes = await downloadLogBytes(dronelogKey, fileUrl);
    } catch (dlErr: any) {
      step_durations.download_ms = Date.now() - dlStart;
      // 429 → re-queue without burning an attempt
      if (dlErr?.status === 429 || /429|rate/i.test(dlErr?.message ?? "")) {
        await serviceClient.from("dji_sync_jobs").update({
          status: "queued",
          attempts: Math.max(0, job.attempts - 1),
          scheduled_at: new Date(Date.now() + 5 * 60_000).toISOString(),
          locked_until: null,
          last_error: "rate limited (429) on download",
          last_error_at: new Date().toISOString(),
          step_durations: { ...step_durations, total_ms: Date.now() - t0 },
        }).eq("id", job.id);
        return { status: "rate_limited", total_ms: Date.now() - t0, error: dlErr.message };
      }
      throw dlErr;
    }
    step_durations.download_ms = Date.now() - dlStart;

    // 2. Upload + parse via DroneLog
    const upStart = Date.now();
    const parsed = await uploadAndParse(dronelogKey, bytes, ".txt", job.dji_log_id);
    step_durations.parse_ms = Date.now() - upStart;

    // 3. Match drone + battery
    const matchStart = Date.now();
    const { matchedDroneId, matchedBatteryId, snMismatchSuggestion } =
      await matchDroneAndBattery(serviceClient, job.company_id, parsed);
    step_durations.match_ms = Date.now() - matchStart;

    // 4. Check duplicate import
    let alreadyImported = false;
    let existingFlightLogId: string | null = null;
    if (parsed.sha256Hash) {
      const { data: existingFlight } = await serviceClient
        .from("flight_logs").select("id")
        .eq("company_id", job.company_id).eq("dronelog_sha256", parsed.sha256Hash)
        .maybeSingle();
      if (existingFlight) { alreadyImported = true; existingFlightLogId = existingFlight.id; }

      // 4b. Same file already waiting in pending_dji_logs (e.g. uploaded manually,
      // where dji_log_id is the sha256). Don't create a second pending row.
      const { data: existingPending } = await serviceClient
        .from("pending_dji_logs")
        .select("id, dji_log_id")
        .eq("company_id", job.company_id)
        .eq("parsed_result->>sha256Hash", parsed.sha256Hash)
        .limit(1)
        .maybeSingle();
      if (existingPending && existingPending.dji_log_id !== job.dji_log_id) {
        if (!/^\d+$/.test(String(existingPending.dji_log_id ?? ""))) {
          await serviceClient.from("pending_dji_logs")
            .update({ dji_log_id: job.dji_log_id })
            .eq("id", existingPending.id);
        }
        const total_ms = Date.now() - t0;
        await serviceClient.from("dji_sync_jobs").update({
          status: "done",
          last_error: null,
          last_error_at: null,
          locked_until: null,
          step_durations: { ...step_durations, total_ms, duplicate: 1 },
        }).eq("id", job.id);
        return { status: "duplicate", total_ms };
      }
    }

    // 4c. Signature fallback: the same flight may already be a processed flight
    // log without a stored sha256 (manual import linked to an existing mission).
    if (!alreadyImported && parsed.startTime) {
      const startMs = new Date(parsed.startTime).getTime();
      if (!Number.isNaN(startMs)) {
        const TOL_MS = 3 * 60_000;
        const { data: sigLogs } = await serviceClient
          .from("flight_logs")
          .select("id, flight_date, start_time_utc, flight_duration_minutes")
          .eq("company_id", job.company_id)
          .gte("flight_date", new Date(startMs - TOL_MS).toISOString())
          .lte("flight_date", new Date(startMs + TOL_MS).toISOString());
        const durS = Math.round(parsed.durationSeconds || 0);
        const hit = ((sigLogs || []) as any[]).find((f) => {
          const stamp = f.start_time_utc || f.flight_date;
          if (!stamp) return false;
          if (Math.abs(new Date(stamp).getTime() - startMs) > TOL_MS) return false;
          if (!durS || typeof f.flight_duration_minutes !== "number") return true;
          return Math.abs(f.flight_duration_minutes * 60 - durS) <= 120;
        });
        if (hit) {
          alreadyImported = true;
          existingFlightLogId = hit.id;
          if (parsed.sha256Hash) {
            await serviceClient.from("flight_logs")
              .update({ dronelog_sha256: parsed.sha256Hash })
              .eq("id", hit.id)
              .is("dronelog_sha256", null);
          }
        }
      }
    }

    // 5. Insert pending row
    const insStart = Date.now();
    const { error: insErr } = await serviceClient.from("pending_dji_logs").insert({
      company_id: job.company_id,
      user_id: job.user_id,
      dji_log_id: job.dji_log_id,
      aircraft_name: parsed.aircraftName || job.payload?.aircraft_name_hint || null,
      aircraft_sn: parsed.aircraftSN || null,
      flight_date: parsed.startTime || job.payload?.log_date || null,
      duration_seconds: Math.round(parsed.durationSeconds),
      max_height_m: parsed.maxAltitude || null,
      total_distance_m: parsed.totalDistance ?? null,
      parsed_result: parsed as any,
      matched_drone_id: matchedDroneId,
      matched_battery_id: matchedBatteryId,
      sn_mismatch_suggestion: snMismatchSuggestion,
      status: alreadyImported ? "approved" : "pending",
      processed_flight_log_id: existingFlightLogId,
    });
    step_durations.insert_ms = Date.now() - insStart;

    if (insErr && (insErr as any).code !== "23505") throw insErr;

    const total_ms = Date.now() - t0;
    await serviceClient.from("dji_sync_jobs").update({
      status: "done",
      last_error: null,
      last_error_at: null,
      locked_until: null,
      step_durations: { ...step_durations, total_ms },
    }).eq("id", job.id);

    return { status: "done", total_ms };
  } catch (err: any) {
    const total_ms = Date.now() - t0;
    const msg = err?.message ?? String(err);

    // Detect unsupported format (no aircraft from list AND parse failed)
    const aircraftHint = (job.payload?.aircraft_name_hint || "").toString().trim();
    const isUnsupported = !aircraftHint && /upload failed|empty csv|invalid|unsupported/i.test(msg);

    if (isUnsupported) {
      await serviceClient.from("dji_sync_jobs").update({
        status: "unsupported",
        last_error: msg,
        last_error_at: new Date().toISOString(),
        locked_until: null,
        step_durations: { ...step_durations, total_ms },
      }).eq("id", job.id);

      await serviceClient.from("pending_dji_logs").insert({
        company_id: job.company_id,
        user_id: job.user_id,
        dji_log_id: job.dji_log_id,
        aircraft_name: aircraftHint || null,
        flight_date: job.payload?.log_date || null,
        duration_seconds: job.payload?.list_duration ?? null,
        status: "unsupported",
        error_code: "unsupported_format",
        error_message: "Loggen kan ikke parses automatisk fra DJI Cloud. Last opp .txt manuelt fra dronen.",
        last_error_at: new Date().toISOString(),
      }).then(({ error }: { error: any }) => {
        if (error && (error as any).code !== "23505") {
          console.error(`[dji-sync-job] pending_dji_logs insert (unsupported) failed:`, error.message);
        }
      });

      return { status: "unsupported", total_ms, error: msg };
    }

    const failed = job.attempts >= MAX_ATTEMPTS;
    await serviceClient.from("dji_sync_jobs").update({
      status: failed ? "failed" : "queued",
      last_error: msg.slice(0, 800),
      last_error_at: new Date().toISOString(),
      scheduled_at: failed ? new Date().toISOString() : new Date(Date.now() + 2 * 60_000).toISOString(),
      locked_until: null,
      step_durations: { ...step_durations, total_ms },
    }).eq("id", job.id);

    return { status: failed ? "failed" : "retry", total_ms, error: msg };
  }
}
