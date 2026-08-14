import { useTranslation } from "react-i18next";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Shield,
  Users,
  UserCog,
  Building2,
  FileText,
  CheckCircle2,
  CreditCard,
  KeyRound,
  Network,
  Settings2,
  Eye,
  GraduationCap,
  Info,
  ChevronRight,
  Lock,
  Layers,
  ListChecks,
} from "lucide-react";

interface AccessRulesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TabValue = "roles" | "permissions" | "org" | "data" | "approval" | "plan";

interface TabDef {
  value: TabValue;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  sectionLabelKey: string;
  sectionTitleKey: string;
}

const tabs: TabDef[] = [
  {
    value: "roles",
    labelKey: "admin.accessRules.tabs.roles",
    icon: Users,
    sectionLabelKey: "admin.accessRules.roles.sectionLabel",
    sectionTitleKey: "admin.accessRules.roles.sectionTitle",
  },
  {
    value: "permissions",
    labelKey: "admin.accessRules.tabs.permissions",
    icon: KeyRound,
    sectionLabelKey: "admin.accessRules.permissions.sectionLabel",
    sectionTitleKey: "admin.accessRules.permissions.sectionTitle",
  },
  {
    value: "org",
    labelKey: "admin.accessRules.tabs.org",
    icon: Building2,
    sectionLabelKey: "admin.accessRules.org.sectionLabel",
    sectionTitleKey: "admin.accessRules.org.sectionTitle",
  },
  {
    value: "data",
    labelKey: "admin.accessRules.tabs.data",
    icon: FileText,
    sectionLabelKey: "admin.accessRules.data.sectionLabel",
    sectionTitleKey: "admin.accessRules.data.sectionTitle",
  },
  {
    value: "approval",
    labelKey: "admin.accessRules.tabs.approval",
    icon: CheckCircle2,
    sectionLabelKey: "admin.accessRules.approval.sectionLabel",
    sectionTitleKey: "admin.accessRules.approval.sectionTitle",
  },
  {
    value: "plan",
    labelKey: "admin.accessRules.tabs.plan",
    icon: CreditCard,
    sectionLabelKey: "admin.accessRules.plan.sectionLabel",
    sectionTitleKey: "admin.accessRules.plan.sectionTitle",
  },
];

function IntroLine({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-primary/10 bg-primary/5 p-4">
      <div className="rounded-lg bg-primary/10 p-1.5 shrink-0">
        <Info className="h-4 w-4 text-primary" />
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
    </div>
  );
}

function RuleCard({
  icon: Icon,
  title,
  subtitle,
  badge,
  badgeVariant = "default",
  accent = "primary",
  children,
  footer,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "outline";
  accent?: "primary" | "accent" | "muted" | "success" | "warning";
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const accentClasses = {
    primary: "bg-primary/10 text-primary border-primary/20",
    accent: "bg-accent/40 text-accent-foreground border-accent/30",
    muted: "bg-muted/60 text-muted-foreground border-muted/50",
    success: "bg-success/10 text-success border-success/20",
    warning: "bg-warning/10 text-warning border-warning/20",
  };

  const topBorderClasses = {
    primary: "border-t-primary/40",
    accent: "border-t-accent/40",
    muted: "border-t-muted-foreground/30",
    success: "border-t-success/40",
    warning: "border-t-warning/40",
  };

  return (
    <div
      className={cn(
        "group relative rounded-2xl border border-border bg-card/60 p-5 transition-all duration-300",
        "hover:border-border/80 hover:bg-card/80 hover:shadow-lg hover:shadow-primary/5",
        "border-t-2",
        topBorderClasses[accent]
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={cn(
              "rounded-xl border p-2.5 shrink-0 transition-transform duration-300 group-hover:scale-105",
              accentClasses[accent]
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-base font-semibold leading-tight">{title}</h4>
              {badge && (
                <Badge variant={badgeVariant} className="text-[10px] font-medium">
                  {badge}
                </Badge>
              )}
            </div>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{subtitle}</p>
            )}
          </div>
        </div>
      </div>
      {children && <div className="mt-4">{children}</div>}
      {footer && (
        <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-between">
          {footer}
        </div>
      )}
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
          <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary/70" />
          <span className="leading-relaxed">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function RuleRow({ title, desc, index, sub }: { title: string; desc: string; index: number; sub?: string[] }) {
  const accents: Array<"primary" | "accent" | "muted" | "success" | "warning"> = [
    "primary",
    "accent",
    "muted",
    "success",
    "warning",
  ];
  const accent = accents[index % accents.length];
  const dotClasses = {
    primary: "bg-primary",
    accent: "bg-accent-foreground",
    muted: "bg-muted-foreground",
    success: "bg-success",
    warning: "bg-warning",
  };

  return (
    <div className="group flex items-start gap-3 rounded-xl border border-border/60 bg-background/40 p-3.5 hover:bg-muted/30 transition-colors">
      <div className={cn("w-1.5 h-1.5 rounded-full mt-2 shrink-0", dotClasses[accent])} />
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <Badge variant="secondary" className="text-[11px] font-medium">
            {title}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
        {sub && sub.length > 0 && (
          <ul className="mt-2 space-y-1.5 border-l border-border/60 pl-3">
            {sub.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className={cn("w-1 h-1 rounded-full mt-1.5 shrink-0", dotClasses[accent])} />
                <span className="leading-relaxed">{s}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FlowSteps({ steps }: { steps: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {steps.map((step, i, arr) => (
        <span key={i} className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/10 text-xs font-medium text-primary">
            {step}
          </span>
          {i < arr.length - 1 && (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
          )}
        </span>
      ))}
    </div>
  );
}

export function AccessRulesDialog({ open, onOpenChange }: AccessRulesDialogProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabValue>("roles");

  const list = (key: string) =>
    (t(key, { returnObjects: true }) as string[]) || [];
  const objList = (key: string) =>
    (t(key, { returnObjects: true }) as { title: string; desc: string }[]) || [];

  const activeTabDef = tabs.find((t) => t.value === activeTab) || tabs[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden h-[85vh] md:h-[720px] flex flex-col">
        <DialogHeader className="sr-only">
          <DialogTitle>{t("admin.accessRules.title")}</DialogTitle>
          <DialogDescription>{t("admin.accessRules.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col md:flex-row flex-1 min-h-0">
          {/* Sidebar */}
          <aside className="w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-border/50 bg-muted/20 flex flex-col">
            <div className="p-5 pb-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                {t("admin.accessRules.title")}
              </h2>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {t("admin.accessRules.description")}
              </p>
            </div>

            <nav className="flex-1 px-3 pb-4 overflow-x-auto md:overflow-x-visible flex md:flex-col gap-1 min-h-0">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.value;
                return (
                  <button
                    key={tab.value}
                    onClick={() => setActiveTab(tab.value)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all whitespace-nowrap md:whitespace-normal text-left",
                      isActive
                        ? "bg-primary/10 text-primary border border-primary/20 shadow-sm shadow-primary/10"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground/70")} />
                    <span>{t(tab.labelKey)}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Main content */}
          <main className="flex-1 flex flex-col min-w-0 min-h-0">
            <header className="px-6 py-5 border-b border-border/50 bg-card/30">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t(activeTabDef.sectionLabelKey)}
              </p>
              <h1 className="text-xl md:text-2xl font-bold mt-0.5">
                {t(activeTabDef.sectionTitleKey)}
              </h1>
            </header>

            <ScrollArea className="flex-1 min-h-0">
              <div className="p-5 md:p-6 space-y-5 pb-8">
                {/* Roles */}
                {activeTab === "roles" && (
                  <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <IntroLine text={t("admin.accessRules.roles.intro")} />
                    <div className="grid gap-4 md:grid-cols-2">
                      <RuleCard
                        icon={Users}
                        title={t("admin.accessRules.roles.userName")}
                        subtitle={t("admin.accessRules.roles.userDesc")}
                        badge={t("admin.accessRules.roles.userBadge")}
                        badgeVariant="outline"
                        accent="muted"
                      >
                        <BulletList items={list("admin.accessRules.roles.userItems")} />
                      </RuleCard>
                      <RuleCard
                        icon={UserCog}
                        title={t("admin.accessRules.roles.adminName")}
                        subtitle={t("admin.accessRules.roles.adminDesc")}
                        badge={t("admin.accessRules.roles.adminBadge")}
                        badgeVariant="default"
                        accent="primary"
                      >
                        <BulletList items={list("admin.accessRules.roles.adminItems")} />
                      </RuleCard>
                    </div>
                    <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/30 p-4">
                      <Layers className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {t("admin.accessRules.roles.note")}
                      </p>
                    </div>
                  </div>
                )}

                {/* Permissions */}
                {activeTab === "permissions" && (
                  <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <IntroLine text={t("admin.accessRules.permissions.intro")} />
                    <div className="space-y-2.5">
                      {objList("admin.accessRules.permissions.items").map((item, i) => (
                        <RuleRow key={i} title={item.title} desc={item.desc} index={i} />
                      ))}
                    </div>
                    <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/30 p-4">
                      <Lock className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {t("admin.accessRules.permissions.selfApproval")}
                      </p>
                    </div>
                  </div>
                )}

                {/* Org */}
                {activeTab === "org" && (
                  <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <IntroLine text={t("admin.accessRules.org.intro")} />
                    <div className="grid gap-4 md:grid-cols-2">
                      <RuleCard
                        icon={Network}
                        title={t("admin.accessRules.org.hierarchyTitle")}
                        subtitle={t("admin.accessRules.org.hierarchyDesc")}
                        accent="primary"
                      />
                      <RuleCard
                        icon={UserCog}
                        title={t("admin.accessRules.org.adminScopeTitle")}
                        subtitle={t("admin.accessRules.org.adminScopeDesc")}
                        accent="accent"
                      />
                      <RuleCard
                        icon={Building2}
                        title={t("admin.accessRules.org.switchTitle")}
                        subtitle={t("admin.accessRules.org.switchDesc")}
                        accent="muted"
                      />
                      <RuleCard
                        icon={Eye}
                        title={t("admin.accessRules.org.visibilityTitle")}
                        subtitle={t("admin.accessRules.org.visibilityDesc")}
                        accent="success"
                      />
                    </div>
                    <RuleCard
                      icon={Settings2}
                      title={t("admin.accessRules.org.propagationTitle")}
                      subtitle={t("admin.accessRules.org.propagationDesc")}
                      accent="warning"
                    >
                      <div className="flex flex-wrap gap-1.5">
                        {list("admin.accessRules.org.propagationList").map((item, i) => (
                          <Badge
                            key={i}
                            variant="outline"
                            className="text-[11px] font-normal bg-background/40"
                          >
                            {item}
                          </Badge>
                        ))}
                      </div>
                    </RuleCard>
                  </div>
                )}

                {/* Data */}
                {activeTab === "data" && (
                  <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <IntroLine text={t("admin.accessRules.data.intro")} />
                    <div className="space-y-2.5">
                      {objList("admin.accessRules.data.items").map((item, i) => (
                        <RuleRow key={i} title={item.title} desc={item.desc} index={i} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Approval */}
                {activeTab === "approval" && (
                  <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <IntroLine text={t("admin.accessRules.approval.intro")} />
                    <RuleCard
                      icon={CheckCircle2}
                      title={t("admin.accessRules.approval.flowTitle")}
                      accent="primary"
                    >
                      <FlowSteps steps={list("admin.accessRules.approval.flowSteps")} />
                    </RuleCard>
                    <div className="grid gap-4 md:grid-cols-2">
                      <RuleCard
                        icon={KeyRound}
                        title={t("admin.accessRules.approval.whoTitle")}
                        subtitle={t("admin.accessRules.approval.whoDesc")}
                        accent="accent"
                      />
                      <RuleCard
                        icon={Shield}
                        title={t("admin.accessRules.approval.soraTitle")}
                        subtitle={t("admin.accessRules.approval.soraDesc")}
                        accent="warning"
                      />
                    </div>
                    <RuleCard
                      icon={FileText}
                      title={t("admin.accessRules.approval.incidentTitle")}
                      subtitle={t("admin.accessRules.approval.incidentDesc")}
                      accent="muted"
                    />
                  </div>
                )}

                {/* Plan */}
                {activeTab === "plan" && (
                  <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <IntroLine text={t("admin.accessRules.plan.intro")} />
                    <div className="grid gap-4 md:grid-cols-2">
                      <RuleCard
                        icon={CreditCard}
                        title={t("admin.accessRules.plan.subscriptionTitle")}
                        subtitle={t("admin.accessRules.plan.subscriptionDesc")}
                        accent="primary"
                      />
                      <RuleCard
                        icon={GraduationCap}
                        title={t("admin.accessRules.plan.trainingTitle")}
                        subtitle={t("admin.accessRules.plan.trainingDesc")}
                        accent="success"
                      />
                    </div>
                    <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/30 p-4">
                      <ListChecks className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {t("admin.accessRules.plan.readOnlyNote")}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            <footer className="p-4 border-t border-border/50 bg-card/30 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                {t("actions.close")}
              </Button>
            </footer>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}
