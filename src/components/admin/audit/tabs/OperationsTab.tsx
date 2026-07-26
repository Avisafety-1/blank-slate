import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, ClipboardList, CheckSquare, AlertTriangle, MessageSquare } from "lucide-react";
import { KpiCard } from "../components/KpiCard";
import { mockOpsStats, mockOpsImprovements } from "../data/mockAuditData";

export const OperationsTab = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      <KpiCard label="Flygninger" value={mockOpsStats.flights} icon={Activity} />
      <KpiCard label="Risikovurderinger" value={mockOpsStats.riskAssessments} icon={ClipboardList} />
      <KpiCard label="Sjekklister" value={mockOpsStats.checklists} icon={CheckSquare} />
      <KpiCard label="Hendelser" value={mockOpsStats.incidents} icon={AlertTriangle} tone="warning" />
      <KpiCard label="Debriefer" value={mockOpsStats.debriefs} icon={MessageSquare} />
    </div>
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Mulige forbedringer</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {mockOpsImprovements.map((i) => (
            <li key={i.id} className="flex items-center justify-between py-2.5 text-sm">
              <span className="font-medium">{i.mission}</span>
              <span className="text-muted-foreground">{i.issue}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  </div>
);
