import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { CreditCard, Clock, LogOut, Rocket, Settings, Check } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PLANS, ADDONS, type PlanId, type AddonId } from "@/config/subscriptionPlans";

export const SubscriptionGate = ({ children }: { children: React.ReactNode }) => {
  const { user, isApproved, profileLoaded, subscribed, subscriptionLoading, isSuperAdmin, stripeExempt, hadPreviousSubscription, authRefreshing, signOut } = useAuth();
  const { t } = useTranslation();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('grower');
  const [selectedAddons, setSelectedAddons] = useState<AddonId[]>([]);

  // Don't gate (= render children) if: no user, profile not loaded, subscription not yet known,
  // auth is refreshing, not approved, superadmin, already subscribed, or stripe exempt.
  // Including authRefreshing avoids a transient paywall flash that unmounts the page.
  if (!user || !profileLoaded || subscriptionLoading || authRefreshing || !isApproved || isSuperAdmin || subscribed || stripeExempt) {
    return <>{children}</>;
  }

  const handleCheckout = async () => {
    setCheckoutLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { plan: selectedPlan, addons: selectedAddons },
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, '_blank');
    } catch (e: any) {
      toast.error(t('subscriptionGate.checkoutFailed') + (e.message || t('subscriptionGate.unknownError')));
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error) throw error;
      if (data?.url) window.open(data.url, '_blank');
    } catch (e: any) {
      toast.error(t('subscriptionGate.portalFailed') + (e.message || t('subscriptionGate.unknownError')));
    } finally {
      setPortalLoading(false);
    }
  };

  const toggleAddon = (id: AddonId) => {
    setSelectedAddons(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
  };

  const isReturning = hadPreviousSubscription;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-3xl w-full space-y-6">
        <div className="text-center space-y-2">
          <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center ${
            isReturning ? 'bg-orange-500/10' : 'bg-primary/10'
          }`}>
            {isReturning ? (
              <Clock className="h-6 w-6 text-orange-500" />
            ) : (
              <Rocket className="h-6 w-6 text-primary" />
            )}
          </div>
          <h2 className="text-xl font-bold">
            {isReturning ? t('subscriptionGate.expiredTitle') : t('subscriptionGate.trialTitle')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isReturning
              ? t('subscriptionGate.expiredDescription')
              : t('subscriptionGate.trialDescription')}
          </p>
        </div>

        {/* Plan selection */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {PLANS.map((plan) => {
            const isSelected = selectedPlan === plan.id;
            return (
              <Card
                key={plan.id}
                className={`cursor-pointer transition-all ${
                  isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/50'
                }`}
                onClick={() => setSelectedPlan(plan.id)}
              >
                <CardHeader className="text-center pb-2 pt-4">
                  <CardTitle className="text-base">{plan.name}</CardTitle>
                  <div className="text-2xl font-bold">
                    {plan.price} <span className="text-xs font-normal text-muted-foreground">{t('subscriptionGate.priceSuffix')}</span>
                  </div>
                </CardHeader>
                <CardContent className="pb-4">
                  <ul className="space-y-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-1.5 text-xs text-foreground">
                        <Check className="h-3 w-3 text-primary flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Addons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {ADDONS.map((addon) => (
            <label
              key={addon.id}
              className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-colors text-sm ${
                selectedAddons.includes(addon.id)
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <Checkbox
                checked={selectedAddons.includes(addon.id)}
                onCheckedChange={() => toggleAddon(addon.id)}
              />
              <div>
                <p className="font-medium text-xs">{addon.name} – {addon.price} {t('subscriptionGate.addonPriceSuffix')}</p>
                <p className="text-xs text-muted-foreground">{addon.description}</p>
              </div>
            </label>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center space-y-3">
          <Button onClick={handleCheckout} disabled={checkoutLoading} className="w-full max-w-sm" size="lg">
            <CreditCard className="h-4 w-4 mr-2" />
            {checkoutLoading
              ? t('subscriptionGate.openingCheckout')
              : isReturning
                ? t('subscriptionGate.renew')
                : t('subscriptionGate.startTrial')}
          </Button>
          {isReturning && (
            <Button variant="outline" onClick={handlePortal} disabled={portalLoading} className="w-full max-w-sm" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              {portalLoading ? t('subscriptionGate.opening') : t('subscriptionGate.managePortal')}
            </Button>
          )}
          <div>
            <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground">
              <LogOut className="h-4 w-4 mr-2" />
              {t('subscriptionGate.signOut')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
