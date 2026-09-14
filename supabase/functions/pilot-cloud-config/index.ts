import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireUser, authErrorResponse } from "../_shared/auth.ts";

// NOTE: MQTT_USERNAME / MQTT_PASSWORD must be kept in sync with the credentials
// hashed into the mosquitto broker password file on the separate Fly.io app
// "mqtt-broker-avisafe" — they live in two different repos and are NOT synced
// automatically.

// Wildcard CORS: requests come from DJI RC Plus's embedded webview, which may
// send an unusual or empty Origin header.
const headers = {
  ...corsHeaders,
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const SECRET_MAP: Array<[string, string]> = [
  ["DJI_APP_ID", "appId"],
  ["DJI_APP_KEY", "appKey"],
  ["DJI_LICENSE", "license"],
  ["MQTT_HOST", "mqttHost"],
  ["MQTT_USERNAME", "mqttUsername"],
  ["MQTT_PASSWORD", "mqttPassword"],
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers,
    });
  }

  // Any authenticated Avisafe user may fetch the DJI cloud config.
  try {
    await requireUser(req);
  } catch (err) {
    return authErrorResponse(err, headers);
  }

  const body: Record<string, string> = {};
  for (const [envName, field] of SECRET_MAP) {
    const value = Deno.env.get(envName);
    if (!value) {
      return new Response(
        JSON.stringify({ error: `Missing secret: ${envName}` }),
        { status: 500, headers },
      );
    }
    body[field] = value;
  }

  return new Response(JSON.stringify(body), { status: 200, headers });
});
