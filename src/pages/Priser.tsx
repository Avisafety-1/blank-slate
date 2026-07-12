import { Check, CreditCard, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PLANS, ADDONS, type PlanId, type AddonId } from "@/config/subscriptionPlans";

const Priser = () => {
  const { t } = useTranslation();
  const { user, subscribed, subscriptionLoading, subscriptionPlan, isTrial, stripeExempt } = useAuth();
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('grower');
  const [selectedAddons, setSelectedAddons] = useState<AddonId[]>([]);
  const navigate = useNavigate();

  const canGoBack = subscribed || isTrial || stripeExempt || !user;

  const toggleAddon = (id: AddonId) => {
    setSelectedAddons(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
  };

  const handleCheckout = async () => {
    if (!user) {
      navigate("/auth");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { plan: selectedPlan, addons: selectedAddons },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (e: any) {
      toast.error(t('pricing.couldNotStartPayment') + (e.message || t('pricing.unknownError')));
    } finally {
      setLoading(false);
    }
  };

  const addonTotal = selectedAddons.length * 99;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="max-w-4xl w-full space-y-8">
        <div className="text-center space-y-2">
          {canGoBack && (
            <Button
              variant="ghost"
              size="sm"
              className="mb-2"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              {t('pricing.back')}
            </Button>
          )}
          <h1 className="text-3xl font-bold text-foreground">AviSafe Platform</h1>
          <p className="text-muted-foreground">
            {t('pricing.subtitle')}
          </p>
          <div className="inline-flex items-center gap-2 bg-accent/20 text-accent-foreground px-4 py-2 rounded-full text-sm font-medium mt-2">
            🛰️ {t('pricing.safeSkyBadge')}
          </div>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((plan) => {
            const isSelected = selectedPlan === plan.id;
            const isCurrentPlan = subscriptionPlan === plan.id;
            return (
              <Card
                key={plan.id}
                className={`cursor-pointer transition-all ${
                  isSelected
                    ? 'border-primary shadow-lg ring-2 ring-primary/20'
                    : 'border-border hover:border-primary/50'
                } ${plan.highlighted && !isSelected ? 'border-primary/30' : ''}`}
                onClick={() => !subscribed && setSelectedPlan(plan.id)}
              >
                <CardHeader className="text-center pb-2">
                  {plan.highlighted && (
                    <Badge variant="secondary" className="w-fit mx-auto mb-1 text-xs">
                      {t('pricing.mostPopular')}
                    </Badge>
                  )}
                  {isCurrentPlan && (
                    <Badge className="w-fit mx-auto mb-1 bg-primary/10 text-primary border-primary/20 text-xs">
                      {t('pricing.yourPlan')}
                    </Badge>
                  )}
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  <div className="text-3xl font-bold text-foreground">
                    {plan.price} <span className="text-sm font-normal text-muted-foreground">{t('pricing.perUserMonth')}</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1.5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm text-foreground">
                        <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />
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
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('pricing.addonsTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {ADDONS.map((addon) => (
                <label
                  key={addon.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedAddons.includes(addon.id)
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <Checkbox
                    checked={selectedAddons.includes(addon.id)}
                    onCheckedChange={() => toggleAddon(addon.id)}
                    disabled={subscribed}
                  />
                  <div>
                    <p className="font-medium text-sm">{addon.name}</p>
                    <p className="text-xs text-muted-foreground">{addon.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Summary & CTA */}
        <Card className="border-primary">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-center sm:text-left">
                <p className="text-sm text-muted-foreground">
                  {PLANS.find(p => p.id === selectedPlan)?.name} – {PLANS.find(p => p.id === selectedPlan)?.price} {t('pricing.perUserMonth')}
                  {addonTotal > 0 && ` ${t('pricing.addonExtra', { amount: addonTotal })}`}
                </p>
                <p className="text-xs text-primary font-medium">{t('pricing.trialIncluded')}</p>
              </div>

              {subscribed ? (
                <div className="p-3 rounded-md bg-primary/10 border border-primary/20">
                  <p className="text-sm font-medium text-primary">{t('pricing.activeSubscription')}</p>
                </div>
              ) : (
                <Button
                  onClick={handleCheckout}
                  disabled={loading || subscriptionLoading}
                  size="lg"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <CreditCard className="h-4 w-4 mr-2" />
                  )}
                  {user ? t('pricing.startSubscription') : t('pricing.loginToSubscribe')}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {!user && (
          <p className="text-center text-xs text-muted-foreground">
            {t('pricing.needAccount')}{" "}
            <button onClick={() => navigate("/auth")} className="underline text-primary">
              {t('pricing.loginRegister')}
            </button>
          </p>
        )}
      </div>
    </div>
  );
};

export default Priser;
