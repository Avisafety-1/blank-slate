import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusPill } from "../components/StatusPill";
import { mockFleet } from "../data/mockAuditData";

export const FleetTab = () => (
  <Card>
    <CardContent className="p-0 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Drone</TableHead>
            <TableHead>Firmware</TableHead>
            <TableHead>Service</TableHead>
            <TableHead>Remote ID</TableHead>
            <TableHead>Batterihelse</TableHead>
            <TableHead>Kalibrering</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mockFleet.map((f) => (
            <TableRow key={f.id}>
              <TableCell className="font-medium">{f.drone}</TableCell>
              <TableCell><StatusPill status={f.firmware} /></TableCell>
              <TableCell><StatusPill status={f.service} /></TableCell>
              <TableCell><StatusPill status={f.remoteId} /></TableCell>
              <TableCell><StatusPill status={f.batteryHealth} /></TableCell>
              <TableCell><StatusPill status={f.calibration} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent>
  </Card>
);
