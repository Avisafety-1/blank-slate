import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calculator, TrendingUp, TrendingDown, DollarSign, Users, Package, Pencil, Check, Save } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const STORAGE_KEY_PREFIX = "avisafe_revenue_scenarios_";
const EUR_TO_NOK = 11.5; // Approximate exchange rate

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
  dronetagEnabled: boolean;
  dronetagPurchaseCostEur: number;
  dronetagDiscountPercent: number;
  dronetagCustomerPrice: number;
  dronetagPaymentType: "installment" | "oneoff";
  dronetagInstallmentMonths: number;
  dronetagCount: number;
  nriPurchaseCost: number;
  nriCustomerPrice: number;
  nriHours: number;
  dronetagIntegrationCostPerUnit: number;
}

interface Scenario {
  name: string;
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
  dronetagEnabled: true,
  dronetagPurchaseCostEur: 299,
  dronetagDiscountPercent: 20,
  dronetagCustomerPrice: 0,
  dronetagPaymentType: "installment",
  dronetagInstallmentMonths: 12,
  dronetagCount: 0,
  nriPurchaseCost: 0,
  nriCustomerPrice: 0,
  nriHours: 0,
  dronetagIntegrationCostPerUnit: 0,
};

const defaultScenarios: Scenario[] = [
  { name: "Scenario 1", state: { ...defaultCalcState } },
  { name: "Scenario 2", state: { ...defaultCalcState } },
  { name: "Scenario 3", state: { ...defaultCalcState } },
];

const loadScenarios = (companyKey: string): Scenario[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + companyKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length === 3) {
        return parsed.map((s: any, i: number) => ({
          name: s.name || `Scenario ${i + 1}`,
          state: { ...defaultCalcState, ...s.state },
        }));
      }
    }
  } catch {}
  return defaultScenarios.map(s => ({ ...s, state: { ...s.state } }));
};

export const RevenueCalculator = () => {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const storageKey = selectedCompanyId ?? "custom";
  const [scenarios, setScenarios] = useState<Scenario[]>(() => loadScenarios(storageKey));
  const [activeIndex, setActiveIndex] = useState(0);
  const [editingName, setEditingName] = useState<number | null>(null);
  const [tempName, setTempName] = useState("");
  const [companies, setCompanies] = useState<CompanyWithUsers[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const scenario = scenarios[activeIndex];
  const state = scenario.state;

  // Fetch companies with user counts via edge function (bypasses RLS)
  useEffect(() => {
    const fetchCompanies = async () => {
      setLoadingCompanies(true);
      try {
        const { data, error } = await supabase.functions.invoke("count-all-users", {
          body: { breakdown: true },
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

  const saveScenarios = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PREFIX + storageKey, JSON.stringify(scenarios));
      setHasUnsavedChanges(false);
      toast.success("Scenarioer lagret");
    } catch {
      toast.error("Kunne ikke lagre scenarioer");
    }
  }, [scenarios, storageKey]);

  const updateScenario = useCallback(
    (partial: Partial<Scenario>) => {
      setScenarios((prev) => {
        const next = [...prev];
        next[activeIndex] = { ...next[activeIndex], ...partial };
        return next;
      });
      setHasUnsavedChanges(true);
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
      setHasUnsavedChanges(true);
    },
    [activeIndex]
  );

  const updateTier = (
    tier: "small" | "medium" | "large",
    field: keyof TierConfig,
    value: number
  ) => {
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
    setHasUnsavedChanges(true);
  };

  const num = (v: string) => {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  };

  // Dronetag purchase cost in NOK after discount
  const dronetagPurchaseNok = useMemo(() => {
    const baseNok = state.dronetagPurchaseCostEur * EUR_TO_NOK;
    const discount = state.dronetagDiscountPercent / 100;
    return baseNok * (1 - discount);
  }, [state.dronetagPurchaseCostEur, state.dronetagDiscountPercent]);

  const handleCompanyChange = (value: string) => {
    // Save current scenarios before switching if there are unsaved changes
    if (hasUnsavedChanges) {
      try {
        localStorage.setItem(STORAGE_KEY_PREFIX + storageKey, JSON.stringify(scenarios));
      } catch {}
    }

    const newCompanyId = value === "custom" ? null : value;
    setSelectedCompanyId(newCompanyId);
    const newKey = newCompanyId ?? "custom";
    const loaded = loadScenarios(newKey);
    setScenarios(loaded);
    setActiveIndex(0);
    setHasUnsavedChanges(false);

    // Update totalUsers for the first scenario based on selection
    if (value === "custom") {
      // Keep whatever is saved
    } else if (value === "all") {
      setScenarios(prev => {
        const next = [...prev];
        next[0] = { ...next[0], state: { ...next[0].state, totalUsers: totalUsersAllCompanies } };
        return next;
      });
    } else {
      const company = companies.find((c) => c.id === value);
      if (company) {
        setScenarios(prev => {
          const next = [...prev];
          next[0] = { ...next[0], state: { ...next[0].state, totalUsers: company.userCount } };
          return next;
        });
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
      setHasUnsavedChanges(true);
    }
    setEditingName(null);
  };

  // Calculations
  const calc = useMemo(() => {
    const { tiers, totalUsers, dronetagCustomerPrice, dronetagPaymentType, dronetagInstallmentMonths, dronetagCount, nriPurchaseCost, nriCustomerPrice } = state;

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

    let monthlyDronetagCost = 0;
    let monthlyDronetagRevenue = 0;
    if (state.dronetagEnabled) {
      // Total customer revenue: count × customer price (one-time total)
      monthlyDronetagRevenue = dronetagCustomerPrice * dronetagCount;
      // Cost: spread over installment months if applicable
      if (dronetagPaymentType === "installment" && dronetagInstallmentMonths > 0) {
        monthlyDronetagCost = (dronetagPurchaseNok * dronetagCount) / dronetagInstallmentMonths;
      } else {
        monthlyDronetagCost = dronetagPurchaseNok * dronetagCount;
      }
    }

    let monthlyIntegrationRevenue = 0;
    if (state.dronetagEnabled) {
      monthlyIntegrationRevenue = state.dronetagIntegrationCostPerUnit * dronetagCount;
    }

    let monthlyNriCost = 0;
    let monthlyNriRevenue = 0;
    if (state.dronetagEnabled) {
      monthlyNriCost = nriPurchaseCost * state.nriHours;
      monthlyNriRevenue = nriCustomerPrice * state.nriHours;
    }

    // Recurring revenue (continues after installment period)
    const recurringRevenue = monthlyUserRevenue + monthlyNriRevenue + monthlyIntegrationRevenue;
    // Recurring costs (continues after installment period)
    const recurringCost = monthlyNriCost;

    // Dronetag hardware: separate one-time/installment calculation
    const totalRevenue = recurringRevenue + monthlyDronetagRevenue;
    const totalCost = recurringCost + monthlyDronetagCost;
    const netResult = totalRevenue - totalCost;

    // After installment period: no more Dronetag hardware cost/revenue
    const netAfterInstallment = recurringRevenue - recurringCost;

    return {
      tierLabel,
      pricePerUser,
      monthlyUserRevenue,
      monthlyDronetagCost,
      monthlyDronetagRevenue,
      monthlyIntegrationRevenue,
      monthlyNriCost,
      monthlyNriRevenue,
      recurringRevenue,
      recurringCost,
      totalRevenue,
      totalCost,
      netResult,
      netAfterInstallment,
    };
  }, [state, dronetagPurchaseNok]);

  const fmt = (n: number) =>
    n.toLocaleString("nb-NO", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const tierRows: { key: "small" | "medium" | "large"; label: string }[] = [
    { key: "small", label: "Liten" },
    { key: "medium", label: "Medium" },
    { key: "large", label: "Stor" },
  ];

  const selectValue = selectedCompanyId === null
    ? "custom"
    : selectedCompanyId;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Scenario selector */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base sm:text-lg">Scenarioer</CardTitle>
            <Button
              size="sm"
              onClick={saveScenarios}
              className="gap-1.5"
              variant={hasUnsavedChanges ? "default" : "outline"}
            >
              <Save className="h-4 w-4" />
              Lagre
              {hasUnsavedChanges && <span className="ml-1 h-2 w-2 rounded-full bg-background" />}
            </Button>
          </div>
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
              disabled={selectedCompanyId !== null}
            />
            {selectedCompanyId !== null && (
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
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Package className="h-5 w-5 text-primary" />
              Dronetag &amp; NRI Hours
            </CardTitle>
            <div className="flex items-center gap-2">
              <Label htmlFor="dronetag-toggle" className="text-sm text-muted-foreground">Inkluder</Label>
              <Switch
                id="dronetag-toggle"
                checked={state.dronetagEnabled}
                onCheckedChange={(v) => updateState({ dronetagEnabled: v })}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>Innkjøpspris (EUR)</Label>
              <Input
                type="number"
                value={state.dronetagPurchaseCostEur || ""}
                onChange={(e) => updateState({ dronetagPurchaseCostEur: num(e.target.value) })}
              />
            </div>
            <div>
              <Label>Avslag (%)</Label>
              <Input
                type="number"
                value={state.dronetagDiscountPercent || ""}
                onChange={(e) => updateState({ dronetagDiscountPercent: num(e.target.value) })}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Innkjøpspris etter avslag (NOK)</Label>
              <div className="flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm font-medium">
                {fmt(Math.round(dronetagPurchaseNok))} NOK
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Kostpris til kunde (NOK)</Label>
              <Input
                type="number"
                value={state.dronetagCustomerPrice || ""}
                onChange={(e) => updateState({ dronetagCustomerPrice: num(e.target.value) })}
              />
            </div>
            <div>
              <Label>Antall Dronetags i bruk</Label>
              <Input
                type="number"
                value={state.dronetagCount || ""}
                onChange={(e) => {
                  const count = num(e.target.value);
                  updateState({ dronetagCount: count, nriHours: count * 30 });
                }}
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

          <Separator />

          {/* Dronetag Avisafe integrasjon sub-section */}
          <div>
            <Label className="text-sm font-semibold">Dronetag Avisafe-integrasjon</Label>
          </div>
          <div className="max-w-xs">
            <Label>Inntekt per Dronetag/mnd (NOK)</Label>
            <Input
              type="number"
              value={state.dronetagIntegrationCostPerUnit || ""}
              onChange={(e) => updateState({ dronetagIntegrationCostPerUnit: num(e.target.value) })}
            />
            {state.dronetagCount > 0 && state.dronetagIntegrationCostPerUnit > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {state.dronetagCount} stk × {fmt(state.dronetagIntegrationCostPerUnit)} NOK = {fmt(state.dronetagIntegrationCostPerUnit * state.dronetagCount)} NOK/mnd
              </p>
            )}
          </div>

          <Separator />

          {/* NRI Hours sub-section */}
          <div>
            <Label className="text-sm font-semibold">NRI Hours</Label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>Stipulert forbruk (timer)</Label>
              <Input
                type="number"
                value={state.nriHours || ""}
                onChange={(e) => updateState({ nriHours: num(e.target.value) })}
              />
            </div>
            <div>
              <Label>Innkjøpspris per time (NOK)</Label>
              <Input
                type="number"
                value={state.nriPurchaseCost || ""}
                onChange={(e) => updateState({ nriPurchaseCost: num(e.target.value) })}
              />
            </div>
            <div>
              <Label>Kostpris til kunde per time (NOK)</Label>
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
            {/* === Løpende inntekter === */}
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Løpende inntekter</p>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Brukerlisensinntekt ({state.totalUsers} brukere × {fmt(calc.pricePerUser)} NOK)</span>
              <span className="font-medium">{fmt(calc.monthlyUserRevenue)} NOK</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Inntekt NRI Hours</span>
              <span className="font-medium">{fmt(calc.monthlyNriRevenue)} NOK</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Inntekt Avisafe-integrasjon</span>
              <span className="font-medium">{fmt(Math.round(calc.monthlyIntegrationRevenue))} NOK</span>
            </div>
            <Separator />
            <div className="flex justify-between text-sm font-semibold">
              <span>Sum løpende inntekter</span>
              <span className="text-primary">{fmt(Math.round(calc.recurringRevenue))} NOK</span>
            </div>

            {/* === Løpende kostnader === */}
            <div className="pt-2" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Løpende kostnader</p>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Kostnad NRI Hours</span>
              <span className="font-medium text-destructive">−{fmt(calc.monthlyNriCost)} NOK</span>
            </div>
            <Separator />
            <div className="flex justify-between text-sm font-semibold">
              <span>Sum løpende kostnader</span>
              <span className="text-destructive">−{fmt(Math.round(calc.recurringCost))} NOK</span>
            </div>

            {/* === Dronetag engangskostnad / nedbetaling === */}
            {state.dronetagEnabled && (
              <>
                <div className="pt-2" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Dronetag engangskostnad / nedbetaling
                  {state.dronetagPaymentType === "installment" && state.dronetagInstallmentMonths > 0
                    ? ` (${state.dronetagInstallmentMonths} mnd)`
                    : " (engangsbetaling)"}
                </p>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Dronetag kundepris ({state.dronetagCount} stk)</span>
                  <span className="font-medium">{fmt(Math.round(calc.monthlyDronetagRevenue))} NOK/mnd</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Dronetag innkjøpskostnad ({state.dronetagCount} stk × {fmt(Math.round(dronetagPurchaseNok))} NOK)</span>
                  <span className="font-medium text-destructive">−{fmt(Math.round(dronetagPurchaseNok * state.dronetagCount))} NOK</span>
                </div>
                <Separator />
                <div className="flex justify-between text-sm font-semibold">
                  <span>Netto Dronetag nedbetaling</span>
                  <span className={calc.monthlyDronetagRevenue - calc.monthlyDronetagCost >= 0 ? "text-primary" : "text-destructive"}>
                    {fmt(Math.round(calc.monthlyDronetagRevenue - calc.monthlyDronetagCost))} NOK/mnd
                  </span>
                </div>
              </>
            )}

            {/* === Totalt === */}
            <div className="pt-2" />
            <Separator className="bg-primary/30" />
            <div className="flex justify-between text-lg font-bold">
              <span className="flex items-center gap-2">
                {calc.netResult >= 0 ? (
                  <TrendingUp className="h-5 w-5 text-green-500" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-destructive" />
                )}
                Netto månedlig (i nedbetalingsperioden)
              </span>
              <span className={calc.netResult >= 0 ? "text-green-500" : "text-destructive"}>
                {calc.netResult >= 0 ? "" : "−"}{fmt(Math.abs(Math.round(calc.netResult)))} NOK
              </span>
            </div>

            {/* === Etter nedbetaling === */}
            {state.dronetagEnabled && state.dronetagPaymentType === "installment" && state.dronetagInstallmentMonths > 0 && (
              <div className="flex justify-between text-lg font-bold">
                <span className="flex items-center gap-2">
                  {calc.netAfterInstallment >= 0 ? (
                    <TrendingUp className="h-5 w-5 text-green-500" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-destructive" />
                  )}
                  Netto månedlig (etter nedbetaling)
                </span>
                <span className={calc.netAfterInstallment >= 0 ? "text-green-500" : "text-destructive"}>
                  {calc.netAfterInstallment >= 0 ? "" : "−"}{fmt(Math.abs(Math.round(calc.netAfterInstallment)))} NOK
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
