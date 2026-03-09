import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ShieldCheck, Send, ArrowLeft } from "lucide-react";
import droneBackground from "@/assets/drone-background.png";

const avisafeLogoText = "/avisafe-logo-text.png";

type Stage = "idle" | "verifying" | "verified" | "resend";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("idle");
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resendEmail, setResendEmail] = useState("");
  const [resendSent, setResendSent] = useState(false);

  const startVerification = () => {
    setStage("verifying");

    // Check URL hash for errors first
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      const error = params.get("error");
      const errorDescription = params.get("error_description");
      if (error) {
        console.error("Password reset error:", error, errorDescription);
        toast.error(errorDescription || "Lenken er ugyldig eller utløpt. Prøv å sende en ny link.");
        setStage("resend");
        return;
      }
    }

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log("Auth event:", event);
        if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
          setStage("verified");
          subscription.unsubscribe();
          clearTimeout(timeout);
        }
      }
    );

    // Also check hash for recovery type as fallback
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      if (params.get("type") === "recovery") {
        setStage("verified");
        subscription.unsubscribe();
        return;
      }
    }

    const timeout = setTimeout(() => {
      subscription.unsubscribe();
      toast.error("Kunne ikke verifisere lenken. Den kan være utløpt.");
      setStage("resend");
    }, 15000);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passordene er ikke like");
      return;
    }
    if (password.length < 6) {
      toast.error("Passordet må være minst 6 tegn");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Passord oppdatert! Du kan nå logge inn med ditt nye passord.");
      navigate("/auth");
    } catch (error: any) {
      console.error("Reset password error:", error);
      toast.error(error.message || "En feil oppstod ved tilbakestilling av passord");
    } finally {
      setLoading(false);
    }
  };

  const handleResendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail) {
      toast.error("Skriv inn e-postadressen din");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("send-password-reset", {
        body: { email: resendEmail },
      });
      if (error) throw error;
      setResendSent(true);
      toast.success("Hvis e-posten finnes i systemet, vil du motta en ny tilbakestillingslenke.");
    } catch (error: any) {
      console.error("Resend error:", error);
      toast.error("Kunne ikke sende ny link. Prøv igjen senere.");
    } finally {
      setLoading(false);
    }
  };

  const Background = () => (
    <div
      className="fixed inset-0 z-0"
      style={{
        backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.7)), url(${droneBackground})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    />
  );

  const renderContent = () => {
    if (stage === "verifying") {
      return (
        <Card className="bg-card/95 backdrop-blur-sm border-border/50">
          <CardContent className="pt-6">
            <div className="text-center space-y-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
              <p className="text-muted-foreground">Verifiserer lenke...</p>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (stage === "verified") {
      return (
        <Card className="bg-card/95 backdrop-blur-sm border-border/50">
          <CardHeader className="space-y-4">
            <div className="flex items-center justify-center">
              <img src={avisafeLogoText} alt="AviSafe" className="h-24 w-auto" />
            </div>
            <div className="text-center">
              <CardTitle className="text-xl">Sett nytt passord</CardTitle>
              <CardDescription>Skriv inn ditt nye passord nedenfor</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Nytt passord</Label>
                <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Bekreft nytt passord</Label>
                <Input id="confirmPassword" type="password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Oppdaterer..." : "Oppdater passord"}
              </Button>
            </form>
            <div className="text-center text-sm mt-4">
              <button type="button" onClick={() => navigate("/auth")} className="text-primary hover:underline">
                Tilbake til innlogging
              </button>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (stage === "resend") {
      return (
        <Card className="bg-card/95 backdrop-blur-sm border-border/50">
          <CardHeader className="space-y-4">
            <div className="flex items-center justify-center">
              <img src={avisafeLogoText} alt="AviSafe" className="h-24 w-auto" />
            </div>
            <div className="text-center">
              <CardTitle className="text-xl">Send ny tilbakestillingslenke</CardTitle>
              <CardDescription>
                Skriv inn e-postadressen din så sender vi en ny lenke.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {resendSent ? (
              <div className="text-center space-y-4">
                <div className="flex items-center justify-center">
                  <Send className="h-10 w-10 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Hvis e-posten finnes i systemet, vil du motta en ny tilbakestillingslenke. Sjekk innboksen din (og søppelpost).
                </p>
                <Button variant="outline" className="w-full" onClick={() => navigate("/auth")}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Tilbake til innlogging
                </Button>
              </div>
            ) : (
              <form onSubmit={handleResendLink} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="resendEmail">E-postadresse</Label>
                  <Input id="resendEmail" type="email" placeholder="din@epost.no" value={resendEmail} onChange={(e) => setResendEmail(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Sender..." : "Send ny link"}
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={() => setStage("idle")}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Tilbake
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      );
    }

    // idle — landing page
    return (
      <Card className="bg-card/95 backdrop-blur-sm border-border/50">
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-center">
            <img src={avisafeLogoText} alt="AviSafe" className="h-24 w-auto" />
          </div>
          <div className="text-center">
            <CardTitle className="text-xl">Tilbakestill passord</CardTitle>
            <CardDescription>
              Klikk knappen under for å verifisere lenken og sette nytt passord.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={startVerification} className="w-full" size="lg">
            <ShieldCheck className="mr-2 h-5 w-5" />
            Verifiser og sett nytt passord
          </Button>
          <div className="text-center">
            <button type="button" onClick={() => setStage("resend")} className="text-sm text-muted-foreground hover:text-primary hover:underline">
              Fungerte ikke lenken? Send ny link
            </button>
          </div>
          <div className="text-center">
            <button type="button" onClick={() => navigate("/auth")} className="text-sm text-primary hover:underline">
              Tilbake til innlogging
            </button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center">
      <Background />
      <div className="relative z-10 w-full max-w-md px-4">
        {renderContent()}
      </div>
    </div>
  );
};

export default ResetPassword;
