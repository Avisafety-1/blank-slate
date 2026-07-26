import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ShieldAlert, ListChecks, CheckCircle2, Clock, Gauge } from "lucide-react";
import { KpiCard } from "../components/KpiCard";
import { mockSafetyKpi, mockSafetyTrend } from "../data/mockAuditData";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

export const SafetyTab = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <KpiCard label="Rapporterte hendelser" value={mockSafetyKpi.reported} icon={AlertTriangle} tone="warning" />
      <KpiCard label="Nestenulykker" value={mockSafetyKpi.nearMiss} icon={ShieldAlert} tone="warning" />
      <KpiCard label="Åpne tiltak" value={mockSafetyKpi.openActions} icon={ListChecks} />
      <KpiCard label="Lukkede tiltak" value={mockSafetyKpi.closedActions} icon={CheckCircle2} tone="success" />
      <KpiCard label="Gj.snitt lukketid" value={`${mockSafetyKpi.avgCloseDays} d`} icon={Clock} />
      <KpiCard label="Safety score" value={`${mockSafetyKpi.safetyScore}%`} icon={Gauge} tone="success" />
    </div>
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Trend siste 12 måneder</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={mockSafetyTrend}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis allowDecimals={false} className="text-xs" />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="incidents" name="Hendelser" stroke="hsl(var(--status-red))" strokeWidth={2} />
              <Line type="monotone" dataKey="nearMiss" name="Nestenulykker" stroke="hsl(var(--status-yellow))" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  </div>
);
