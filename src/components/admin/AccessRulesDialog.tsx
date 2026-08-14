import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Shield,
  UserCog,
  Building2,
  FileText,
  CheckCircle2,
  CreditCard,
  Users,
  KeyRound,
  Network,
  Settings2,
  Eye,
  GraduationCap,
  Info,
  ChevronRight,
} from "lucide-react";

interface AccessRulesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function IntroLine({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 p-3">
      <Info className="h-4 w-4 mt-0.5 text-primary shrink-0" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function RuleCard({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-semibold leading-tight">{title}</h4>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
          <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground/70" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function RuleRow({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/40 p-3">
      <div className="flex items-center gap-2 mb-1">
        <Badge variant="secondary" className="text-[11px]">
          {title}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

export function AccessRulesDialog({ open, onOpenChange }: AccessRulesDialogProps) {
  const { t } = useTranslation();
  const list = (key: string) =>
    (t(key, { returnObjects: true }) as string[]) || [];
  const objList = (key: string) =>
    (t(key, { returnObjects: true }) as { title: string; desc: string }[]) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            {t("admin.accessRules.title")}
          </DialogTitle>
          <DialogDescription>
            {t("admin.accessRules.description")}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="roles" className="flex-1 min-h-0 flex flex-col">
          <TabsList className="w-full flex-wrap h-auto justify-start gap-1">
            <TabsTrigger value="roles">{t("admin.accessRules.tabs.roles")}</TabsTrigger>
            <TabsTrigger value="permissions">{t("admin.accessRules.tabs.permissions")}</TabsTrigger>
            <TabsTrigger value="org">{t("admin.accessRules.tabs.org")}</TabsTrigger>
            <TabsTrigger value="data">{t("admin.accessRules.tabs.data")}</TabsTrigger>
            <TabsTrigger value="approval">{t("admin.accessRules.tabs.approval")}</TabsTrigger>
            <TabsTrigger value="plan">{t("admin.accessRules.tabs.plan")}</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 min-h-0 mt-4 pr-3">
            {/* Roles */}
            <TabsContent value="roles" className="mt-0 space-y-4">
              <IntroLine text={t("admin.accessRules.roles.intro")} />
              <div className="grid gap-4 md:grid-cols-2">
                <RuleCard
                  icon={Users}
                  title={t("admin.accessRules.roles.userName")}
                  subtitle={t("admin.accessRules.roles.userDesc")}
                >
                  <BulletList items={list("admin.accessRules.roles.userItems")} />
                </RuleCard>
                <RuleCard
                  icon={UserCog}
                  title={t("admin.accessRules.roles.adminName")}
                  subtitle={t("admin.accessRules.roles.adminDesc")}
                >
                  <BulletList items={list("admin.accessRules.roles.adminItems")} />
                </RuleCard>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("admin.accessRules.roles.note")}
              </p>
            </TabsContent>

            {/* Permissions */}
            <TabsContent value="permissions" className="mt-0 space-y-4">
              <IntroLine text={t("admin.accessRules.permissions.intro")} />
              <div className="space-y-2">
                {objList("admin.accessRules.permissions.items").map((item, i) => (
                  <RuleRow key={i} title={item.title} desc={item.desc} />
                ))}
              </div>
              <div className="flex items-start gap-2 rounded-lg border border-border/60 p-3">
                <KeyRound className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <p className="text-sm text-muted-foreground">
                  {t("admin.accessRules.permissions.selfApproval")}
                </p>
              </div>
            </TabsContent>

            {/* Org */}
            <TabsContent value="org" className="mt-0 space-y-4">
              <IntroLine text={t("admin.accessRules.org.intro")} />
              <div className="grid gap-4 md:grid-cols-2">
                <RuleCard
                  icon={Network}
                  title={t("admin.accessRules.org.hierarchyTitle")}
                  subtitle={t("admin.accessRules.org.hierarchyDesc")}
                />
                <RuleCard
                  icon={Building2}
                  title={t("admin.accessRules.org.adminScopeTitle")}
                  subtitle={t("admin.accessRules.org.adminScopeDesc")}
                />
                <RuleCard
                  icon={UserCog}
                  title={t("admin.accessRules.org.switchTitle")}
                  subtitle={t("admin.accessRules.org.switchDesc")}
                />
                <RuleCard
                  icon={Eye}
                  title={t("admin.accessRules.org.visibilityTitle")}
                  subtitle={t("admin.accessRules.org.visibilityDesc")}
                />
              </div>
              <RuleCard
                icon={Settings2}
                title={t("admin.accessRules.org.propagationTitle")}
                subtitle={t("admin.accessRules.org.propagationDesc")}
              >
                <div className="flex flex-wrap gap-1.5">
                  {list("admin.accessRules.org.propagationList").map((item, i) => (
                    <Badge key={i} variant="outline" className="text-[11px] font-normal">
                      {item}
                    </Badge>
                  ))}
                </div>
              </RuleCard>
            </TabsContent>

            {/* Data */}
            <TabsContent value="data" className="mt-0 space-y-4">
              <IntroLine text={t("admin.accessRules.data.intro")} />
              <div className="space-y-2">
                {objList("admin.accessRules.data.items").map((item, i) => (
                  <RuleRow key={i} title={item.title} desc={item.desc} />
                ))}
              </div>
            </TabsContent>

            {/* Approval */}
            <TabsContent value="approval" className="mt-0 space-y-4">
              <IntroLine text={t("admin.accessRules.approval.intro")} />
              <RuleCard
                icon={CheckCircle2}
                title={t("admin.accessRules.approval.flowTitle")}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  {list("admin.accessRules.approval.flowSteps").map((step, i, arr) => (
                    <span key={i} className="flex items-center gap-1.5">
                      <Badge variant="secondary" className="text-[11px] font-normal">
                        {step}
                      </Badge>
                      {i < arr.length - 1 && (
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      )}
                    </span>
                  ))}
                </div>
              </RuleCard>
              <div className="grid gap-4 md:grid-cols-2">
                <RuleCard
                  icon={KeyRound}
                  title={t("admin.accessRules.approval.whoTitle")}
                  subtitle={t("admin.accessRules.approval.whoDesc")}
                />
                <RuleCard
                  icon={Shield}
                  title={t("admin.accessRules.approval.soraTitle")}
                  subtitle={t("admin.accessRules.approval.soraDesc")}
                />
              </div>
              <RuleCard
                icon={FileText}
                title={t("admin.accessRules.approval.incidentTitle")}
                subtitle={t("admin.accessRules.approval.incidentDesc")}
              />
            </TabsContent>

            {/* Plan */}
            <TabsContent value="plan" className="mt-0 space-y-4">
              <IntroLine text={t("admin.accessRules.plan.intro")} />
              <div className="grid gap-4 md:grid-cols-2">
                <RuleCard
                  icon={CreditCard}
                  title={t("admin.accessRules.plan.subscriptionTitle")}
                  subtitle={t("admin.accessRules.plan.subscriptionDesc")}
                />
                <RuleCard
                  icon={GraduationCap}
                  title={t("admin.accessRules.plan.trainingTitle")}
                  subtitle={t("admin.accessRules.plan.trainingDesc")}
                />
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
