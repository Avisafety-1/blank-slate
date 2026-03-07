import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DRONELOG_BASE = "https://dronelogapi.com/api/v1";

// ── Date normalisation helper ──

function normalizeDateToISO(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();

  const iso = new Date(s);
  if (!isNaN(iso.getTime()) && /^\d{4}-\d{2}/.test(s)) return iso.toISOString();

  const m = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})[\sT]+(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?\s*(AM|PM)?/i
  );
  if (m) {
    const [, month, day, year, hours, mins, secs, , ampm] = m;
    let h = parseInt(hours);
    if (ampm?.toUpperCase() === "PM" && h < 12) h += 12;
    if (ampm?.toUpperCase() === "AM" && h === 12) h = 0;
    const d = new Date(Date.UTC(
      parseInt(year), parseInt(month) - 1, parseInt(day),
      h, parseInt(mins), parseInt(secs)
    ));
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  const fallback = new Date(s);
  if (!isNaN(fallback.getTime())) return fallback.toISOString();

  return null;
}

// ── Decrypt DJI password ──

async function decryptPassword(encryptedB64: string): Promise<string> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const raw = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0));
  const iv = raw.slice(0, 12);
  const ciphertext = raw.slice(12);
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(serviceKey.slice(0, 32)), "AES-GCM", false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, keyMaterial, ciphertext);
  return new TextDecoder().decode(decrypted);
}

// ── Main handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startMs = Date.now();
  const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    // Find companies with auto-sync enabled
    const { data: companies, error: compErr } = await serviceClient
      .from("companies")
      .select("id, navn, dronelog_api_key, dji_sync_from_date")
      .eq("dji_auto_sync_enabled", true)
      .eq("aktiv", true)
      .eq("dji_flightlog_enabled", true);

    if (compErr) throw compErr;
    if (!companies || companies.length === 0) {
      return new Response(JSON.stringify({ message: "No companies with auto-sync enabled", synced: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[dji-auto-sync] Found ${companies.length} companies with auto-sync enabled`);

    let totalSynced = 0;
    let totalErrors = 0;
    const results: Array<{ company: string; synced: number; errors: number; details?: string }> = [];
    let rateLimited = false;

    for (const company of companies) {
      const dronelogKey = company.dronelog_api_key || Deno.env.get("DRONELOG_AVISAFE_KEY");
      if (!dronelogKey) {
        console.log(`[dji-auto-sync] Skipping ${company.navn}: no DroneLog API key`);
        results.push({ company: company.navn, synced: 0, errors: 0, details: "No API key" });
        continue;
      }

      // Find users with DJI credentials in this company
      const { data: profiles } = await serviceClient
        .from("profiles")
        .select("id")
        .eq("company_id", company.id);

      if (!profiles || profiles.length === 0) {
        results.push({ company: company.navn, synced: 0, errors: 0, details: "No users" });
        continue;
      }

      const profileIds = profiles.map(p => p.id);

      const { data: credentials } = await serviceClient
        .from("dji_credentials")
        .select("user_id, dji_email, dji_password_encrypted, dji_account_id, last_sync_at")
        .in("user_id", profileIds);

      if (!credentials || credentials.length === 0) {
        results.push({ company: company.navn, synced: 0, errors: 0, details: "No DJI credentials" });
        continue;
      }

      console.log(`[dji-auto-sync] ${company.navn}: ${credentials.length} users with DJI credentials`);

      let companySynced = 0;
      let companyErrors = 0;
      let newestLogDate: string | null = null;

      for (const cred of credentials) {
        try {
          // Decrypt and login
          const password = await decryptPassword(cred.dji_password_encrypted);

          const loginRes = await fetch(`${DRONELOG_BASE}/accounts/dji`, {
            method: "POST",
            headers: { Authorization: `Bearer ${dronelogKey}`, "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ email: cred.dji_email, password }),
          });

          if (!loginRes.ok) {
            await loginRes.text();
            console.error(`[dji-auto-sync] Login failed for ${cred.dji_email}: ${loginRes.status}`);
            if (loginRes.status === 429) {
              rateLimited = true;
              companyErrors++;
              break;
            }
            companyErrors++;
            continue;
          }

          const loginData = await loginRes.json();
          const accountId = loginData.result?.djiAccountId || loginData.result?.id || loginData.result?.accountId || cred.dji_account_id;

          if (!accountId) {
            console.error(`[dji-auto-sync] No accountId for ${cred.dji_email}`);
            companyErrors++;
            continue;
          }

          // List logs — this is the ONLY API call besides login (lazy sync)
          const listRes = await fetch(`${DRONELOG_BASE}/logs/${accountId}?limit=50`, {
            headers: { Authorization: `Bearer ${dronelogKey}`, Accept: "application/json" },
          });

          if (!listRes.ok) {
            console.error(`[dji-auto-sync] List logs failed: ${listRes.status}`);
            await listRes.text();
            if (listRes.status === 429) break;
            companyErrors++;
            continue;
          }

          const listData = await listRes.json();
          const logs = listData.result?.logs || listData.result || [];

          if (!Array.isArray(logs) || logs.length === 0) {
            console.log(`[dji-auto-sync] No logs found for ${cred.dji_email}`);
            continue;
          }

          console.log(`[dji-auto-sync] Found ${logs.length} logs for ${cred.dji_email}`);

          // Filter by sync_from_date if set
          const syncFromDate = company.dji_sync_from_date ? new Date(company.dji_sync_from_date) : null;

          for (const log of logs) {
            const logId = log.id || log.logId;
            if (!logId) continue;

            // Track newest log date for auto-advancing
            const logDateStr = normalizeDateToISO(log.date);
            if (logDateStr && (!newestLogDate || logDateStr > newestLogDate)) {
              newestLogDate = logDateStr;
            }

            // Check date filter
            if (syncFromDate && log.date) {
              const logDate = new Date(log.date);
              if (logDate < syncFromDate) {
                continue;
              }
            }

            // Check if already in pending_dji_logs (any status)
            const { data: existing } = await serviceClient
              .from("pending_dji_logs")
              .select("id")
              .eq("company_id", company.id)
              .eq("dji_log_id", String(logId))
              .maybeSingle();

            if (existing) continue;

            // LAZY: Store only metadata from the list response — NO download, NO parse
            const { error: insertErr } = await serviceClient
              .from("pending_dji_logs")
              .insert({
                company_id: company.id,
                user_id: cred.user_id,
                dji_log_id: String(logId),
                aircraft_name: log.aircraft || null,
                aircraft_sn: null,
                flight_date: logDateStr,
                duration_seconds: log.duration ? Math.round(log.duration) : null,
                parsed_result: null, // Will be filled on-demand when user clicks
                matched_drone_id: null,
                matched_battery_id: null,
                status: "pending",
              });

            if (insertErr) {
              if (insertErr.code === "23505") continue; // unique constraint
              console.error(`[dji-auto-sync] Insert error for log ${logId}:`, insertErr);
              companyErrors++;
              continue;
            }

            companySynced++;
            console.log(`[dji-auto-sync] Synced metadata for log ${logId}`);
          }

          // Update last_sync_at
          await serviceClient
            .from("dji_credentials")
            .update({ last_sync_at: new Date().toISOString() })
            .eq("user_id", cred.user_id);

        } catch (credErr) {
          console.error(`[dji-auto-sync] Error for user ${cred.dji_email}:`, credErr);
          companyErrors++;
        }
      }

      // Auto-advance sync date to the newest log we saw
      if (newestLogDate) {
        await serviceClient
          .from("companies")
          .update({ dji_sync_from_date: newestLogDate })
          .eq("id", company.id);
        console.log(`[dji-auto-sync] Advanced sync date for ${company.navn} to ${newestLogDate}`);
      }

      totalSynced += companySynced;
      totalErrors += companyErrors;
      results.push({ company: company.navn, synced: companySynced, errors: companyErrors, details: rateLimited ? 'Rate limited by DJI API' : undefined });
    }

    const elapsed = Date.now() - startMs;
    console.log(`[dji-auto-sync] Done in ${elapsed}ms: ${totalSynced} synced, ${totalErrors} errors`);

    return new Response(JSON.stringify({
      success: true,
      synced: totalSynced,
      errors: totalErrors,
      rate_limited: rateLimited,
      elapsed_ms: elapsed,
      companies: results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("[dji-auto-sync] Fatal error:", error);
    return new Response(JSON.stringify({ error: "Internal server error", details: String(error) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
