import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { mockInternalAudits } from "../data/mockAuditData";
import type { InternalAudit } from "../types";
import { AuditDetailDialog } from "../components/AuditDetailDialog";

const statusLabel: Record<InternalAudit["status"], string> = {
  planned: "Planlagt",
  in_progress: "Pågår",
  closed: "Lukket",
};

export const InternalAuditsTab = () => {
  const [audits, setAudits] = useState<InternalAudit[]>(mockInternalAudits);
  const [openId, setOpenId] = useState<string | null>(null);

  const active = audits.find((a) => a.id === openId) ?? null;

  const createNew = () => {
    const nw: InternalAudit = {
      id: `ia-${Date.now()}`,
      title: `Ny revisjon ${new Date().getFullYear()}`,
      date: new Date().toISOString().slice(0, 10),
      responsible: "",
      status: "planned",
      findings: [],
      sections: {
        organization: { checked: [false, false, false], comment: "", status: "info" },
        documentation: { checked: [false, false, false], comment: "", status: "info" },
        competency: { checked: [false, false], comment: "", status: "info" },
        operations: { checked: [false, false, false], comment: "", status: "info" },
        technical: { checked: [false, false], comment: "", status: "info" },
        safety: { checked: [false, false], comment: "", status: "info" },
      },
    };
    setAudits((prev) => [nw, ...prev]);
    setOpenId(nw.id);
  };

  const save = (updated: InternalAudit) => {
    setAudits((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={createNew}>
          <Plus className="w-4 h-4 mr-2" /> Ny revisjon
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Revisjon</TableHead>
                <TableHead>Dato</TableHead>
                <TableHead>Ansvarlig</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Funn</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {audits.map((a) => (
                <TableRow key={a.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setOpenId(a.id)}>
                  <TableCell className="font-medium">{a.title}</TableCell>
                  <TableCell>{new Date(a.date).toLocaleDateString("nb-NO")}</TableCell>
                  <TableCell>{a.responsible || "—"}</TableCell>
                  <TableCell><Badge variant="outline">{statusLabel[a.status]}</Badge></TableCell>
                  <TableCell>{a.findings.length}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {active && (
        <AuditDetailDialog
          key={active.id}
          audit={active}
          open={!!openId}
          onOpenChange={(o) => !o && setOpenId(null)}
          onSave={save}
        />
      )}
    </div>
  );
};
