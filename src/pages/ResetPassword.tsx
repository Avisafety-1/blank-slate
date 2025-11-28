import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Shield } from "lucide-react";
import droneBackground from "@/assets/drone-background.png";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    // Check if we have a valid recovery token
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        toast.error("Ugyldig eller utløpt tilbakestillingslenke");
        navigate("/auth");
      }
    });
  }, [navigate]);

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
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

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

  return (
    <div className="min-h-screen relative flex items-center justify-center">
      {/* Background */}
      <div
        className="fixed inset-0 z-0"
        style={{
          backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.7)), url(${droneBackground})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />

      {/* Content */}
      <div className="relative z-10 w-full max-w-md px-4">
        <Card className="bg-card/95 backdrop-blur-sm border-border/50">
          <CardHeader className="space-y-4">
            <div className="flex items-center justify-center gap-3">
              <Shield className="w-10 h-10 text-primary" />
              <div>
                <CardTitle className="text-2xl">Sikkerhetsstyringssystem</CardTitle>
                <CardDescription className="text-primary">Drone Operations</CardDescription>
              </div>
            </div>
            <div className="text-center">
              <CardTitle className="text-xl">Sett nytt passord</CardTitle>
              <CardDescription>
                Skriv inn ditt nye passord nedenfor
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Nytt passord</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Bekreft nytt passord</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Oppdaterer..." : "Oppdater passord"}
              </Button>
            </form>

            <div className="text-center text-sm mt-4">
              <button
                type="button"
                onClick={() => navigate("/auth")}
                className="text-primary hover:underline"
              >
                Tilbake til innlogging
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;
