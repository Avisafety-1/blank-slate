import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditCard, Clock, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export const SubscriptionGate = ({ children }: { children: React.ReactNode }) => {
  const { user, isApproved, subscribed, subscriptionLoading, isSuperAdmin, stripeExempt, signOut } = useAuth();
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  // Don't gate if: still loading, no user, not approved, superadmin, has subscription, or stripe exempt
  if (subscriptionLoading || !user || !isApproved || isSuperAdmin || subscribed || stripeExempt) {
    return <>{children}</>;
  }

  const handleCheckout = async () => {
    setCheckoutLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout');
      if (error) throw error;
      if (data?.url) window.open(data.url, '_blank');
    } catch (e: any) {
      toast.error('Kunne ikke starte betaling: ' + (e.message || 'Ukjent feil'));
    } finally {
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center">
            <Clock className="h-6 w-6 text-orange-500" />
          </div>
          <CardTitle className="text-xl">Prøveperioden er utløpt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            Din gratis prøveperiode på 5 dager er over. Abonner for å fortsette å bruke AviSafe.
          </p>
          <div className="bg-muted/50 rounded-lg p-4 space-y-1">
            <p className="font-medium">AviSafe Platform</p>
            <p className="text-2xl font-bold">599 <span className="text-sm font-normal text-muted-foreground">NOK/mnd</span></p>
          </div>
          <Button onClick={handleCheckout} disabled={checkoutLoading} className="w-full" size="lg">
            <CreditCard className="h-4 w-4 mr-2" />
            {checkoutLoading ? 'Åpner betaling…' : 'Abonner nå'}
          </Button>
          <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground">
            <LogOut className="h-4 w-4 mr-2" />
            Logg ut
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
