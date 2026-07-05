import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/GlassCard";
import LoadingSpinner from "@/components/LoadingSpinner";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  FileText,
  Plane,
  Shield,
  ShieldAlert,
  X,
} from "lucide-react";

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

const permissions = [
  {
    icon: Plane,
    label: "Lese oppdrag du har tilgang til",
    description: "Inkluderer detaljer om planlagte og gjennomførte oppdrag.",
  },
  {
    icon: ShieldAlert,
    label: "Lese hendelser i ditt selskap",
    description: "Inkluderer rapporterte hendelser og avvik.",
  },
  {
    icon: FileText,
    label: "Lese droner i din flåte",
    description: "Inkluderer dronedata, serienummer og status.",
  },
];

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

  const clientName = details?.client?.name ?? "En tredjepart";

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-background relative overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-1/3 -right-1/3 w-[80vw] h-[80vw] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute -bottom-1/3 -left-1/3 w-[60vw] h-[60vw] rounded-full bg-accent/10 blur-[100px]" />
      </div>

      <GlassCard className="relative z-10 w-full max-w-lg p-6 sm:p-8 space-y-6">
        {/* Logo */}
        <div className="flex justify-center">
          <img
            src="/avisafe-logo-text-white.png"
            alt="AviSafe"
            className="h-8 sm:h-10 object-contain"
          />
        </div>

        {error ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/15 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-semibold tracking-tight">Kunne ikke laste autorisasjon</h1>
              <p className="text-sm text-muted-foreground leading-relaxed">{error}</p>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => (window.location.href = "/")}
            >
              <ChevronLeft className="w-4 h-4" />
              Tilbake til AviSafe
            </Button>
          </div>
        ) : !authorizationId ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Shield className="w-6 h-6 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-semibold tracking-tight">Ugyldig eller utløpt lenke</h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Denne godkjenningslenken mangler nødvendig informasjon eller har utløpt.
                Gå tilbake til AviSafe og prøv å koble til agenten på nytt.
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => (window.location.href = "/")}
            >
              <ChevronLeft className="w-4 h-4" />
              Tilbake til AviSafe
            </Button>
          </div>
        ) : !details ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <LoadingSpinner />
            <p className="text-sm text-muted-foreground">Laster autorisasjonsdetaljer…</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-2 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <h1 className="text-xl font-semibold tracking-tight">
                Koble {clientName} til AviSafe
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {clientName} ber om tilgang til å bruke AviSafe som deg. Klienten kan
                lese data du allerede har tilgang til, men kan verken endre data eller
                se informasjon utenfor dine normale rettigheter.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-sm font-medium text-foreground">Tilgang som deles</h2>
              <ul className="space-y-3">
                {permissions.map((perm, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-3 p-3 rounded-lg border border-border/60 bg-muted/30"
                  >
                    <div className="mt-0.5 w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium text-foreground">{perm.label}</p>
                      <p className="text-xs text-muted-foreground">{perm.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                disabled={busy}
                onClick={() => decide(true)}
                className="flex-1"
              >
                <Check className="w-4 h-4" />
                Godkjenn tilgang
              </Button>
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => decide(false)}
                className="flex-1"
              >
                <X className="w-4 h-4" />
                Avvis
              </Button>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Du kan når som helst trekke tilbake denne tilgangen fra app-innstillingene.
            </p>
          </div>
        )}
      </GlassCard>
    </main>
  );
}
