import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calculator, TrendingUp, TrendingDown, DollarSign, Users, Package, Pencil, Check } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "avisafe_revenue_scenarios";

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

interface Scenario {
  name: string;
  selectedCompanyId: string | null; // null = custom, "all" = all companies
  state: CalcState;
}

interface CompanyWithUsers {
  id: string;
  navn: string;
  userCount: number;
}

const defaultCalcState: CalcState = {
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

const defaultScenarios: Scenario[] = [
  { name: "Scenario 1", selectedCompanyId: null, state: { ...defaultCalcState } },
  { name: "Scenario 2", selectedCompanyId: null, state: { ...defaultCalcState } },
  { name: "Scenario 3", selectedCompanyId: null, state: { ...defaultCalcState } },
];

const loadScenarios = (): Scenario[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length === 3) {
        return parsed.map((s: any, i: number) => ({
          name: s.name || `Scenario ${i + 1}`,
          selectedCompanyId: s.selectedCompanyId ?? null,
          state: { ...defaultCalcState, ...s.state },
        }));
      }
    }
  } catch {}
  return defaultScenarios.map(s => ({ ...s, state: { ...s.state } }));
};

export const RevenueCalculator = () => {
  const [scenarios, setScenarios] = useState<Scenario[]>(loadScenarios);
  const [activeIndex, setActiveIndex] = useState(0);
  const [editingName, setEditingName] = useState<number | null>(null);
  const [tempName, setTempName] = useState("");
  const [companies, setCompanies] = useState<CompanyWithUsers[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);

  const scenario = scenarios[activeIndex];
  const state = scenario.state;

  // Persist scenarios
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
    } catch {}
  }, [scenarios]);

  // Fetch companies with user counts via edge function (bypasses RLS)
  useEffect(() => {
    const fetchCompanies = async () => {
      setLoadingCompanies(true);
      try {
        const { data, error } = await supabase.functions.invoke("count-all-users", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ breakdown: true }),
        });

        if (error || !data) {
          console.error("Failed to fetch company breakdown:", error);
          setLoadingCompanies(false);
          return;
        }

        setCompanies(data.companies || []);
      } catch (err) {
        console.error("Error fetching companies:", err);
      }
      setLoadingCompanies(false);
    };
    fetchCompanies();
  }, []);

  const totalUsersAllCompanies = useMemo(
    () => companies.reduce((sum, c) => sum + c.userCount, 0),
    [companies]
  );

  const updateScenario = useCallback(
    (partial: Partial<Scenario>) => {
      setScenarios((prev) => {
        const next = [...prev];
        next[activeIndex] = { ...next[activeIndex], ...partial };
        return next;
      });
    },
    [activeIndex]
  );

  const updateState = useCallback(
    (partial: Partial<CalcState>) => {
      setScenarios((prev) => {
        const next = [...prev];
        next[activeIndex] = {
          ...next[activeIndex],
          state: { ...next[activeIndex].state, ...partial },
        };
        return next;
      });
    },
    [activeIndex]
  );

  const updateTier = (
    tier: "small" | "medium" | "large",
    field: keyof TierConfig,
    value: number
  ) =>
    setScenarios((prev) => {
      const next = [...prev];
      const s = next[activeIndex];
      next[activeIndex] = {
        ...s,
        state: {
          ...s.state,
          tiers: {
            ...s.state.tiers,
            [tier]: { ...s.state.tiers[tier], [field]: value },
          },
        },
      };
      return next;
    });

  const num = (v: string) => {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  };

  const handleCompanyChange = (value: string) => {
    if (value === "custom") {
      updateScenario({ selectedCompanyId: null });
      updateState({ totalUsers: 0 });
    } else if (value === "all") {
      updateScenario({ selectedCompanyId: "all" });
      updateState({ totalUsers: totalUsersAllCompanies });
    } else {
      const company = companies.find((c) => c.id === value);
      updateScenario({ selectedCompanyId: value });
      if (company) {
        updateState({ totalUsers: company.userCount });
      }
    }
  };

  const startEditName = (index: number) => {
    setEditingName(index);
    setTempName(scenarios[index].name);
  };

  const confirmEditName = () => {
    if (editingName !== null && tempName.trim()) {
      setScenarios((prev) => {
        const next = [...prev];
        next[editingName] = { ...next[editingName], name: tempName.trim() };
        return next;
      });
    }
    setEditingName(null);
  };

  // Calculations
  const calc = useMemo(() => {
    const { tiers, totalUsers, dronetagPurchaseCost, dronetagCustomerPrice, dronetagPaymentType, dronetagInstallmentMonths, dronetagCount, nriPurchaseCost, nriCustomerPrice } = state;

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

    const monthlyDronetagCost = dronetagPurchaseCost * dronetagCount;
    let monthlyDronetagRevenue = 0;
    if (dronetagPaymentType === "installment" && dronetagInstallmentMonths > 0) {
      monthlyDronetagRevenue = (dronetagCustomerPrice * dronetagCount) / dronetagInstallmentMonths;
    } else {
      monthlyDronetagRevenue = dronetagCustomerPrice * dronetagCount;
    }

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

  const selectValue = scenario.selectedCompanyId === null
    ? "custom"
    : scenario.selectedCompanyId;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Scenario selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg">Scenarioer</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {scenarios.map((s, i) => (
              <div key={i} className="flex items-center gap-1">
                {editingName === i ? (
                  <div className="flex items-center gap-1">
                    <Input
                      className="h-8 w-36 text-sm"
                      value={tempName}
                      onChange={(e) => setTempName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && confirmEditName()}
                      autoFocus
                    />
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={confirmEditName}>
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant={activeIndex === i ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setActiveIndex(i)}
                  >
                    {s.name}
                    <Pencil
                      className="h-3 w-3 opacity-60 hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditName(i);
                      }}
                    />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Company selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Users className="h-5 w-5 text-primary" />
            Selskapsvelger
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-sm">
            <Label>Velg selskap</Label>
            <Select
              value={selectValue}
              onValueChange={handleCompanyChange}
              disabled={loadingCompanies}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingCompanies ? "Laster selskaper..." : "Velg selskap"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Egendefinert</SelectItem>
                <SelectItem value="all">Alle selskaper ({totalUsersAllCompanies} brukere)</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.navn} ({c.userCount} brukere)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

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
              onChange={(e) => updateState({ totalUsers: num(e.target.value) })}
              disabled={scenario.selectedCompanyId !== null}
            />
            {scenario.selectedCompanyId !== null && (
              <p className="text-xs text-muted-foreground mt-1">
                Automatisk hentet fra valgt selskap. Velg «Egendefinert» for å endre manuelt.
              </p>
            )}
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
                onChange={(e) => updateState({ dronetagPurchaseCost: num(e.target.value) })}
              />
            </div>
            <div>
              <Label>Kostpris til kunde (NOK)</Label>
              <Input
                type="number"
                value={state.dronetagCustomerPrice || ""}
                onChange={(e) => updateState({ dronetagCustomerPrice: num(e.target.value) })}
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Betalingsmodell</Label>
            <RadioGroup
              value={state.dronetagPaymentType}
              onValueChange={(v) => updateState({ dronetagPaymentType: v as "installment" | "oneoff" })}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="installment" id={`installment-${activeIndex}`} />
                <Label htmlFor={`installment-${activeIndex}`} className="cursor-pointer font-normal">Nedbetaling</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="oneoff" id={`oneoff-${activeIndex}`} />
                <Label htmlFor={`oneoff-${activeIndex}`} className="cursor-pointer font-normal">Engangskostnad</Label>
              </div>
            </RadioGroup>
          </div>

          {state.dronetagPaymentType === "installment" && (
            <div className="max-w-xs">
              <Label>Antall måneder nedbetaling</Label>
              <Input
                type="number"
                value={state.dronetagInstallmentMonths || ""}
                onChange={(e) => updateState({ dronetagInstallmentMonths: num(e.target.value) })}
              />
            </div>
          )}

          <div className="max-w-xs">
            <Label>Antall Dronetags i bruk</Label>
            <Input
              type="number"
              value={state.dronetagCount || ""}
              onChange={(e) => updateState({ dronetagCount: num(e.target.value) })}
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
                onChange={(e) => updateState({ nriPurchaseCost: num(e.target.value) })}
              />
            </div>
            <div>
              <Label>Kostpris til kunde (NOK)</Label>
              <Input
                type="number"
                value={state.nriCustomerPrice || ""}
                onChange={(e) => updateState({ nriCustomerPrice: num(e.target.value) })}
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
            Månedlig oppsummering — {scenario.name}
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
