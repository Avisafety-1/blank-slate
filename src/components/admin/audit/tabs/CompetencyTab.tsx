import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusPill } from "../components/StatusPill";
import { mockCompetencies } from "../data/mockAuditData";

export const CompetencyTab = () => (
  <Card>
    <CardContent className="p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Pilot</TableHead>
            <TableHead>Kompetanse</TableHead>
            <TableHead>Gyldig til</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mockCompetencies.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.pilot}</TableCell>
              <TableCell>{c.competency}</TableCell>
              <TableCell>{new Date(c.validUntil).toLocaleDateString("nb-NO")}</TableCell>
              <TableCell>
                <StatusPill
                  status={c.status}
                  labelOverride={c.status === "ok" ? "Grønn" : c.status === "warning" ? "Gul" : "Rød"}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent>
  </Card>
);
