import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText } from "lucide-react";
import { StatusPill } from "../components/StatusPill";
import { mockDocuments } from "../data/mockAuditData";

export const DocumentationTab = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {mockDocuments.map((d) => (
      <Card key={d.id}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2 min-w-0">
              <FileText className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="truncate">{d.title}</span>
            </span>
            <StatusPill
              status={d.status}
              labelOverride={d.status === "ok" ? "Gyldig" : d.status === "warning" ? "Utløper snart" : "Utløpt"}
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <div className="text-muted-foreground">Neste revisjon</div>
          <div>{new Date(d.nextReview).toLocaleDateString("nb-NO")}</div>
          <div className="text-muted-foreground mt-2">Ansvarlig</div>
          <div>{d.responsible}</div>
        </CardContent>
      </Card>
    ))}
  </div>
);
