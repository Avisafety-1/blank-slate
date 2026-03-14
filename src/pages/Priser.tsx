import { Check, CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

const features = [
  "Droneflåtestyring",
  "Oppdragsplanlegging",
  "Dokumenthåndtering",
  "Hendelsesrapportering",
  "Kartmodul med luftrom",
  "Kalender & varsler",
  "ECCAIRS-integrasjon",
  "Ubegrenset antall brukere",
];

const Priser = () => {
  const { user, subscribed, subscriptionLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleCheckout = async () => {
    if (!user) {
      navigate("/auth");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout");
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (e: any) {
      toast.error("Kunne ikke starte betaling: " + (e.message || "Ukjent feil"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-foreground">AviSafe Platform</h1>
          <p className="text-muted-foreground">
            Alt du trenger for sikker og profesjonell droneoperasjon.
          </p>
        </div>

        <Card className="border-primary shadow-lg">
          <CardHeader className="text-center pb-2">
            <Badge variant="secondary" className="w-fit mx-auto mb-2">
              Abonnement
            </Badge>
            <CardTitle className="text-4xl font-bold text-foreground">
              599 <span className="text-lg font-normal text-muted-foreground">NOK/mnd</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2">
              {features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-foreground">
                  <Check className="h-4 w-4 text-primary flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>

            {subscribed ? (
              <div className="text-center p-3 rounded-md bg-primary/10 border border-primary/20">
                <p className="text-sm font-medium text-primary">✓ Du har et aktivt abonnement</p>
              </div>
            ) : (
              <Button
                onClick={handleCheckout}
                disabled={loading || subscriptionLoading}
                className="w-full"
                size="lg"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CreditCard className="h-4 w-4 mr-2" />
                )}
                {user ? "Abonner nå" : "Logg inn for å abonnere"}
              </Button>
            )}
          </CardContent>
        </Card>

        {!user && (
          <p className="text-center text-xs text-muted-foreground">
            Du må ha en konto for å abonnere.{" "}
            <button onClick={() => navigate("/auth")} className="underline text-primary">
              Logg inn / Registrer deg
            </button>
          </p>
        )}
      </div>
    </div>
  );
};

export default Priser;
