import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, FileText } from "lucide-react";
import { toast } from "sonner";
import { inspectionPackageContents } from "../data/mockAuditData";

export const InspectionPackageTab = () => (
  <div className="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="w-4 h-4 text-primary" />
          Forberedelse til tilsyn
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p className="text-sm text-muted-foreground max-w-xl">
          Generer en samlet pakke med alle dokumenter og logger som Luftfartstilsynet typisk etterspør.
        </p>
        <Button size="lg" onClick={() => toast.info("Tilsynspakke kommer i neste versjon.")}>
          Generer tilsynspakke
        </Button>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="text-base">Innhold i pakken</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {inspectionPackageContents.map((c) => (
            <li key={c} className="flex items-center gap-2 text-sm">
              <FileText className="w-4 h-4 text-muted-foreground" />
              {c}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  </div>
);
