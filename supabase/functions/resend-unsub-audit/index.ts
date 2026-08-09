// TEMPORARY diagnostic: list Resend contacts and their unsubscribed status.
// Protected by a one-off token; this function is deleted after use.
const TOKEN = "a7f3c1e9-audit-4b2d-9f10-unsub-check";

const RESEND_BASE = "https://api.resend.com";

async function resendFetch(path: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");
  const res = await fetch(`${RESEND_BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

Deno.serve(async (req) => {
  if (req.headers.get("x-audit-token") !== TOKEN) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  try {
    const audiences = await resendFetch("/audiences");
    const out: Record<string, unknown> = {};
    for (const a of (audiences?.data ?? [])) {
      const contacts = await resendFetch(`/audiences/${a.id}/contacts`);
      const list = (contacts?.data ?? []) as Array<{ email: string; unsubscribed: boolean; created_at: string }>;
      out[a.name] = {
        total: list.length,
        unsubscribed: list.filter((c) => c.unsubscribed).map((c) => c.email),
        recent: list
          .slice()
          .sort((x, y) => (y.created_at || "").localeCompare(x.created_at || ""))
          .slice(0, 5)
          .map((c) => ({ email: c.email, created_at: c.created_at, unsubscribed: c.unsubscribed })),
      };
    }
    return new Response(JSON.stringify(out, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
  }
});
