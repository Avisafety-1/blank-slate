import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calculator, TrendingUp, TrendingDown, DollarSign, Users, Package } from "lucide-react";
import { Separator } from "@/components/ui/separator";

const STORAGE_KEY = "avisafe_revenue_calculator";

interface TierConfig {
  maxUsers: number;
  pricePerUser: number;
}

interface CalcState {
  tiers: {
    small: TierConfig;
    medium: TierConfig;
    large: TierConfig;
  };
  totalUsers: number;
  dronetagPurchaseCost: number;
  dronetagCustomerPrice: number;
  dronetagPaymentType: "installment" | "oneoff";
  dronetagInstallmentMonths: number;
  dronetagCount: number;
  nriPurchaseCost: number;
  nriCustomerPrice: number;
}

const defaultState: CalcState = {
  tiers: {
    small: { maxUsers: 5, pricePerUser: 299 },
    medium: { maxUsers: 15, pricePerUser: 249 },
    large: { maxUsers: 999, pricePerUser: 199 },
  },
  totalUsers: 0,
  dronetagPurchaseCost: 0,
  dronetagCustomerPrice: 0,
  dronetagPaymentType: "installment",
  dronetagInstallmentMonths: 12,
  dronetagCount: 0,
  nriPurchaseCost: 0,
  nriCustomerPrice: 0,
};

const loadState = (): CalcState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultState, ...JSON.parse(raw) };
  } catch {}
  return defaultState;
};

export const RevenueCalculator = () => {
  const [state, setState] = useState<CalcState>(loadState);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  const update = (partial: Partial<CalcState>) =>
    setState((prev) => ({ ...prev, ...partial }));

  const updateTier = (
    tier: "small" | "medium" | "large",
    field: keyof TierConfig,
    value: number
  ) =>
    setState((prev) => ({
      ...prev,
      tiers: {
        ...prev.tiers,
        [tier]: { ...prev.tiers[tier], [field]: value },
      },
    }));

  const num = (v: string) => {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  };

  // Calculations
  const calc = useMemo(() => {
    const { tiers, totalUsers, dronetagPurchaseCost, dronetagCustomerPrice, dronetagPaymentType, dronetagInstallmentMonths, dronetagCount, nriPurchaseCost, nriCustomerPrice } = state;

    // Determine tier for user count
    let pricePerUser = tiers.large.pricePerUser;
    let tierLabel = "Stor";
    if (totalUsers <= tiers.small.maxUsers) {
      pricePerUser = tiers.small.pricePerUser;
      tierLabel = "Liten";
    } else if (totalUsers <= tiers.medium.maxUsers) {
      pricePerUser = tiers.medium.pricePerUser;
      tierLabel = "Medium";
    }

    const monthlyUserRevenue = totalUsers * pricePerUser;

    // Dronetag
    const monthlyDronetagCost = dronetagPurchaseCost * dronetagCount;
    let monthlyDronetagRevenue = 0;
    if (dronetagPaymentType === "installment" && dronetagInstallmentMonths > 0) {
      monthlyDronetagRevenue = (dronetagCustomerPrice * dronetagCount) / dronetagInstallmentMonths;
    } else {
      monthlyDronetagRevenue = dronetagCustomerPrice * dronetagCount;
    }

    // NRI
    const monthlyNriCost = nriPurchaseCost;
    const monthlyNriRevenue = nriCustomerPrice;

    const totalRevenue = monthlyUserRevenue + monthlyDronetagRevenue + monthlyNriRevenue;
    const totalCost = monthlyDronetagCost + monthlyNriCost;
    const netResult = totalRevenue - totalCost;

    return {
      tierLabel,
      pricePerUser,
      monthlyUserRevenue,
      monthlyDronetagCost,
      monthlyDronetagRevenue,
      monthlyNriCost,
      monthlyNriRevenue,
      totalRevenue,
      totalCost,
      netResult,
    };
  }, [state]);

  const fmt = (n: number) =>
    n.toLocaleString("nb-NO", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const tierRows: { key: "small" | "medium" | "large"; label: string }[] = [
    { key: "small", label: "Liten" },
    { key: "medium", label: "Medium" },
    { key: "large", label: "Stor" },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Section 1: Tiers */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Users className="h-5 w-5 text-primary" />
            Bedriftsstørrelser og priser
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {tierRows.map(({ key, label }) => (
              <div key={key} className="grid grid-cols-3 gap-3 items-end">
                <div>
                  <Label className="text-xs text-muted-foreground">{label}</Label>
                </div>
                <div>
                  <Label className="text-xs">Maks brukere</Label>
                  <Input
                    type="number"
                    value={state.tiers[key].maxUsers || ""}
                    onChange={(e) => updateTier(key, "maxUsers", num(e.target.value))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Pris/bruker/mnd (NOK)</Label>
                  <Input
                    type="number"
                    value={state.tiers[key].pricePerUser || ""}
                    onChange={(e) => updateTier(key, "pricePerUser", num(e.target.value))}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Section 2: User calculation */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Calculator className="h-5 w-5 text-primary" />
            Brukerberegning
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs">
            <Label>Totalt antall brukere</Label>
            <Input
              type="number"
              value={state.totalUsers || ""}
              onChange={(e) => update({ totalUsers: num(e.target.value) })}
            />
          </div>
          {state.totalUsers > 0 && (
            <div className="rounded-lg bg-muted p-4 space-y-1 text-sm">
              <p>
                Kategori: <span className="font-semibold">{calc.tierLabel}</span>
              </p>
              <p>
                Pris per bruker: <span className="font-semibold">{fmt(calc.pricePerUser)} NOK/mnd</span>
              </p>
              <p className="text-base font-semibold text-primary">
                Månedlig lisensintekt: {fmt(calc.monthlyUserRevenue)} NOK
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Dronetag */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Package className="h-5 w-5 text-primary" />
            Dronetag-kostnader
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Innkjøpskostnad per Dronetag (NOK)</Label>
              <Input
                type="number"
                value={state.dronetagPurchaseCost || ""}
                onChange={(e) => update({ dronetagPurchaseCost: num(e.target.value) })}
              />
            </div>
            <div>
              <Label>Kostpris til kunde (NOK)</Label>
              <Input
                type="number"
                value={state.dronetagCustomerPrice || ""}
                onChange={(e) => update({ dronetagCustomerPrice: num(e.target.value) })}
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Betalingsmodell</Label>
            <RadioGroup
              value={state.dronetagPaymentType}
              onValueChange={(v) => update({ dronetagPaymentType: v as "installment" | "oneoff" })}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="installment" id="installment" />
                <Label htmlFor="installment" className="cursor-pointer font-normal">Nedbetaling</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="oneoff" id="oneoff" />
                <Label htmlFor="oneoff" className="cursor-pointer font-normal">Engangskostnad</Label>
              </div>
            </RadioGroup>
          </div>

          {state.dronetagPaymentType === "installment" && (
            <div className="max-w-xs">
              <Label>Antall måneder nedbetaling</Label>
              <Input
                type="number"
                value={state.dronetagInstallmentMonths || ""}
                onChange={(e) => update({ dronetagInstallmentMonths: num(e.target.value) })}
              />
            </div>
          )}

          <div className="max-w-xs">
            <Label>Antall Dronetags i bruk</Label>
            <Input
              type="number"
              value={state.dronetagCount || ""}
              onChange={(e) => update({ dronetagCount: num(e.target.value) })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Section 4: NRI Hours */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <DollarSign className="h-5 w-5 text-primary" />
            NRI Hours
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Innkjøpspris NRI Hours (NOK)</Label>
              <Input
                type="number"
                value={state.nriPurchaseCost || ""}
                onChange={(e) => update({ nriPurchaseCost: num(e.target.value) })}
              />
            </div>
            <div>
              <Label>Kostpris til kunde (NOK)</Label>
              <Input
                type="number"
                value={state.nriCustomerPrice || ""}
                onChange={(e) => update({ nriCustomerPrice: num(e.target.value) })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 5: Summary */}
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <TrendingUp className="h-5 w-5 text-primary" />
            Månedlig oppsummering
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Inntekt brukerlisenser</span>
              <span className="font-medium">{fmt(calc.monthlyUserRevenue)} NOK</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Inntekt Dronetag</span>
              <span className="font-medium">{fmt(calc.monthlyDronetagRevenue)} NOK</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Inntekt NRI Hours</span>
              <span className="font-medium">{fmt(calc.monthlyNriRevenue)} NOK</span>
            </div>
            <Separator />
            <div className="flex justify-between text-sm font-semibold">
              <span>Total inntekt</span>
              <span className="text-primary">{fmt(calc.totalRevenue)} NOK</span>
            </div>

            <div className="pt-2" />

            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Kostnad Dronetag</span>
              <span className="font-medium text-destructive">−{fmt(calc.monthlyDronetagCost)} NOK</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Kostnad NRI Hours</span>
              <span className="font-medium text-destructive">−{fmt(calc.monthlyNriCost)} NOK</span>
            </div>
            <Separator />
            <div className="flex justify-between text-sm font-semibold">
              <span>Total kostnad</span>
              <span className="text-destructive">−{fmt(calc.totalCost)} NOK</span>
            </div>

            <div className="pt-2" />
            <Separator className="bg-primary/30" />

            <div className="flex justify-between text-lg font-bold">
              <span className="flex items-center gap-2">
                {calc.netResult >= 0 ? (
                  <TrendingUp className="h-5 w-5 text-green-500" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-destructive" />
                )}
                Netto månedlig resultat
              </span>
              <span className={calc.netResult >= 0 ? "text-green-500" : "text-destructive"}>
                {calc.netResult >= 0 ? "" : "−"}{fmt(Math.abs(calc.netResult))} NOK
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
