/**
 * dji-parse-proxy
 *
 * Laster ned en DJI-loggfil (via DroneLog signed downloadUrl, eller direkte URL),
 * sender den til vår egen Fly.io-parser, og returnerer en CSV-streng i samme
 * format som DroneLog API returnerer fra POST /logs/upload.
 *
 * Dette gjør at de eksisterende edge functions (process-dronelog, dji-process-single,
 * dji-auto-sync) kan bruke samme parseCsvToResult / parseCsvMinimal som før —
 * de bytter bare ut hvor CSV-en kommer fra.
 *
 * Hvis Fly-parseren returnerer 422 (ukjent versjon / scrambled), eller er nede,
 * svarer vi med { fallback: true, reason }, så kallende funksjon kan falle
 * tilbake til DroneLog `/logs/upload`.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PARSER_URL = (Deno.env.get("DJI_PARSER_URL") ?? "").replace(/\/+$/, "");
const PARSER_TOKEN = Deno.env.get("DJI_PARSER_TOKEN");

interface ProxyRequest {
  downloadUrl?: string; // DJI/DroneLog signed URL
  dronelogKey?: string; // Bearer for å hente fra DroneLog
  fileBase64?: string; // alternativ: fil sendes inline (manuell upload)
  fileName?: string;
  fields: string[]; // DroneLog-feltnavn vi vil ha med
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!PARSER_URL || !PARSER_TOKEN) {
      return jsonResp(
        { fallback: true, reason: "parser-not-configured" },
        200,
      );
    }

    // Auth — vi krever vanlig Supabase JWT for å unngå misbruk
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResp({ error: "unauthorized" }, 401);
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (!claims?.claims) return jsonResp({ error: "unauthorized" }, 401);

    const body = (await req.json()) as ProxyRequest;
    if (!body.fields || body.fields.length === 0) {
      return jsonResp({ error: "fields required" }, 400);
    }

    // 1) Skaff filbytes
    let fileBytes: Uint8Array;
    let fileName = body.fileName ?? "dji.txt";

    if (body.fileBase64) {
      fileBytes = Uint8Array.from(atob(body.fileBase64), (c) =>
        c.charCodeAt(0),
      );
    } else if (body.downloadUrl) {
      const headers: Record<string, string> = {};
      if (body.dronelogKey) {
        headers.Authorization = `Bearer ${body.dronelogKey}`;
      }
      const dl = await fetch(body.downloadUrl, { headers });
      if (!dl.ok) {
        const txt = await dl.text().catch(() => "");
        console.error(
          "[dji-parse-proxy] download failed:",
          dl.status,
          txt.slice(0, 200),
        );
        return jsonResp(
          { fallback: true, reason: `download-failed-${dl.status}` },
          200,
        );
      }
      fileBytes = new Uint8Array(await dl.arrayBuffer());
      const cd = dl.headers.get("content-disposition") ?? "";
      const m = cd.match(/filename="?([^";]+)"?/i);
      if (m) fileName = m[1];
    } else {
      return jsonResp(
        { error: "downloadUrl or fileBase64 required" },
        400,
      );
    }

    console.log(
      `[dji-parse-proxy] sending ${fileBytes.length} bytes to fly parser`,
    );

    // 2) Send til Fly-parser
    const form = new FormData();
    form.append(
      "file",
      new Blob([fileBytes], { type: "application/octet-stream" }),
      fileName,
    );
    form.append("fields", body.fields.join(","));

    const parseRes = await fetch(`${PARSER_URL}/parse`, {
      method: "POST",
      headers: { Authorization: `Bearer ${PARSER_TOKEN}` },
      body: form,
    });

    if (parseRes.status === 422) {
      const err = await parseRes.json().catch(() => ({}));
      console.warn("[dji-parse-proxy] parser unsupported:", err);
      return jsonResp(
        { fallback: true, reason: err.reason ?? "unsupported" },
        200,
      );
    }
    if (!parseRes.ok) {
      const txt = await parseRes.text().catch(() => "");
      console.error("[dji-parse-proxy] parser error:", parseRes.status, txt);
      return jsonResp(
        { fallback: true, reason: `parser-${parseRes.status}` },
        200,
      );
    }

    const parsed = await parseRes.json();

    // 3) Konverter til CSV (samme form som DroneLog returnerer)
    const csv = toDroneLogCsv(parsed, body.fields);
    return new Response(
      JSON.stringify({ ok: true, csv, summary: parsed.summary }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("[dji-parse-proxy] error:", err);
    return jsonResp(
      { fallback: true, reason: `exception-${(err as Error).message}` },
      200,
    );
  }
});

function jsonResp(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toDroneLogCsv(parsed: any, fields: string[]): string {
  const samples: Array<Record<string, unknown>> = parsed.samples ?? [];
  const details: Record<string, unknown> = parsed.details ?? {};
  // Vi skriver én header med alle feltene + "DETAILS.*" først som konstante kolonner
  const headerCols = [...fields];
  // Sørg for at vi har OSD.flyTime [ms] som tidskolonne
  if (!headerCols.includes("OSD.flyTime [ms]")) {
    headerCols.unshift("OSD.flyTime [ms]");
  }

  const lines: string[] = [];
  lines.push(headerCols.map(csvEscape).join(","));
  for (const s of samples) {
    const row = headerCols.map((c) => {
      let v = s[c];
      if (v === undefined && c.startsWith("DETAILS.")) v = details[c];
      return csvEscape(v);
    });
    lines.push(row.join(","));
  }
  return lines.join("\n");
}

function csvEscape(v: unknown): string {
  if (v === undefined || v === null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
