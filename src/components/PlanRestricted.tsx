import { usePlanGating } from '@/hooks/usePlanGating';
import { getPlanById, type GatedFeature } from '@/config/subscriptionPlans';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

interface PlanRestrictedProps {
  feature: GatedFeature;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const PlanRestricted = ({ feature, children, fallback }: PlanRestrictedProps) => {
  const { canAccess, requiredPlanFor } = usePlanGating();
  const { t } = useTranslation();

  if (canAccess(feature)) {
    return <>{children}</>;
  }

  if (fallback) return <>{fallback}</>;

  const requiredPlan = getPlanById(requiredPlanFor(feature));

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 px-4 text-center">
      <div className="rounded-full bg-muted p-4">
        <Lock className="w-8 h-8 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold text-foreground">
        {t('plan.upgradeRequired', 'Oppgradering påkrevd')}
      </h2>
      <p className="text-muted-foreground max-w-md">
        {t('plan.featureRequiresPlan', {
          plan: requiredPlan?.name ?? 'Grower',
          defaultValue: `Denne funksjonen krever ${requiredPlan?.name ?? 'Grower'}-planen eller høyere.`,
        })}
      </p>
      <Button
        variant="default"
        onClick={() => {
          // Dispatch custom event to open profile dialog on subscription tab
          window.dispatchEvent(new CustomEvent('open-profile-subscription'));
        }}
      >
        {t('plan.upgradePlan', 'Oppgrader plan')}
      </Button>
    </div>
  );
};
