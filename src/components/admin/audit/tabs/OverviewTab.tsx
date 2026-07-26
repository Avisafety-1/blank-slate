import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Users, Plane, Activity, AlertTriangle, ListChecks, ClipboardCheck } from "lucide-react";
import { KpiCard } from "../components/KpiCard";
import { ComplianceScoreRing } from "../components/ComplianceScoreRing";
import { AuditReadinessList } from "../components/AuditReadinessList";
import { AiAuditCard } from "../components/AiAuditCard";
import {
  mockDocuments,
  mockCompetencies,
  mockFleet,
  mockOverviewKpi,
  mockAuditReadiness,
} from "../data/mockAuditData";
import { calculateComplianceScore } from "../lib/complianceScore";

export const OverviewTab = () => {
  const score = calculateComplianceScore({
    documents: mockDocuments,
    competencies: mockCompetencies,
    fleet: mockFleet,
    openFindings: mockOverviewKpi.openFindings,
    openActions: mockOverviewKpi.openActions,
  });
  const readinessOk = mockAuditReadiness.filter((r) => r.status === "ok").length;
  const readinessPct = Math.round((readinessOk / mockAuditReadiness.length) * 100);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card className="lg:col-span-1">
          <CardContent className="p-6 flex items-center justify-center">
            <ComplianceScoreRing score={score} label="Compliance" />
          </CardContent>
        </Card>
        <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-3 gap-4">
          <KpiCard label="Aktive piloter" value={mockOverviewKpi.activePilots} icon={Users} />
          <KpiCard label="Aktive droner" value={mockOverviewKpi.activeDrones} icon={Plane} />
          <KpiCard label="Flygninger siste 12 mnd" value={mockOverviewKpi.flights12mo} icon={Activity} />
          <KpiCard label="Åpne avvik" value={mockOverviewKpi.openFindings} icon={AlertTriangle} tone="warning" />
          <KpiCard label="Åpne tiltak" value={mockOverviewKpi.openActions} icon={ListChecks} tone="warning" />
          <KpiCard label="Internrevisjoner gjennomført" value={mockOverviewKpi.internalAuditsDone} icon={ClipboardCheck} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit readiness</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={readinessPct} />
          <AuditReadinessList items={mockAuditReadiness} />
        </CardContent>
      </Card>

      <AiAuditCard />
    </div>
  );
};
