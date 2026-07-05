import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import LoadingSpinner from "@/components/LoadingSpinner";

// Minimal typed wrapper around the beta `supabase.auth.oauth` namespace.
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: any }>;
};

function getOAuth(): OAuthApi | null {
  const anyAuth = supabase.auth as any;
  return anyAuth?.oauth ?? null;
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const oauth = getOAuth();
      if (!oauth) {
        setError(
          "OAuth-server er ikke aktivert på Supabase-prosjektet ennå. Aktiver OAuth 2.1 i Supabase-innstillinger for å bruke agent-integrasjoner.",
        );
        return;
      }
      if (!authorizationId) {
        setError("Mangler authorization_id");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        // Preserve the full consent URL so auth returns the user here.
        const next = window.location.pathname + window.location.search;
        window.location.href = "/auth?next=" + encodeURIComponent(next);
        return;
      }
      const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) return setError(error.message ?? String(error));
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    const oauth = getOAuth();
    if (!oauth) return;
    setBusy(true);
    const { data, error } = approve
      ? await oauth.approveAuthorization(authorizationId)
      : await oauth.denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      setError(error.message ?? String(error));
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("Autorisasjonsserveren returnerte ingen redirect.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="w-full max-w-md p-6 space-y-4">
        {error ? (
          <>
            <h1 className="text-xl font-semibold">Kunne ikke laste autorisasjon</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
          </>
        ) : !details ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <LoadingSpinner />
            <p className="text-sm text-muted-foreground">Laster…</p>
          </div>
        ) : (
          <>
            <h1 className="text-xl font-semibold">
              Koble {details.client?.name ?? "app"} til AviSafe
            </h1>
            <p className="text-sm text-muted-foreground">
              {details.client?.name ?? "Klienten"} vil kunne bruke AviSafe som deg —
              lese oppdrag, hendelser og droner du har tilgang til.
            </p>
            <div className="flex gap-3 pt-2">
              <Button disabled={busy} onClick={() => decide(true)}>
                Godkjenn
              </Button>
              <Button disabled={busy} variant="outline" onClick={() => decide(false)}>
                Avvis
              </Button>
            </div>
          </>
        )}
      </Card>
    </main>
  );
}
