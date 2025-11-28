import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  FileText, 
  Calendar,
  MapPin as LocationIcon,
  AlertTriangle,
  Briefcase
} from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

interface Customer {
  id: string;
  navn: string;
  kontaktperson: string | null;
  epost: string | null;
  telefon: string | null;
  adresse: string | null;
  merknader: string | null;
  aktiv: boolean;
  opprettet_dato: string;
}

interface Mission {
  id: string;
  tittel: string;
  lokasjon: string;
  tidspunkt: string;
  status: string;
  risk_nivå: string;
  beskrivelse: string | null;
}

interface Incident {
  id: string;
  tittel: string;
  alvorlighetsgrad: string;
  status: string;
  hendelsestidspunkt: string;
  lokasjon: string | null;
  beskrivelse: string | null;
  mission_id: string | null;
}

interface CustomerDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
}

export const CustomerDetailDialog = ({
  open,
  onOpenChange,
  customer,
}: CustomerDetailDialogProps) => {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && customer) {
      fetchCustomerHistory();
    }
  }, [open, customer]);

  const fetchCustomerHistory = async () => {
    if (!customer) return;

    setLoading(true);
    try {
      // Fetch missions for this customer
      const { data: missionsData, error: missionsError } = await supabase
        .from("missions")
        .select("*")
        .eq("customer_id", customer.id)
        .order("tidspunkt", { ascending: false });

      if (missionsError) throw missionsError;
      setMissions(missionsData || []);

      // Fetch incidents related to these missions
      if (missionsData && missionsData.length > 0) {
        const missionIds = missionsData.map(m => m.id);
        const { data: incidentsData, error: incidentsError } = await supabase
          .from("incidents")
          .select("*")
          .in("mission_id", missionIds)
          .order("hendelsestidspunkt", { ascending: false });

        if (incidentsError) throw incidentsError;
        setIncidents(incidentsData || []);
      } else {
        setIncidents([]);
      }
    } catch (error: any) {
      console.error("Error fetching customer history:", error);
      toast.error("Kunne ikke laste kundehistorikk");
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Planlagt":
        return "bg-blue-500/20 text-blue-500";
      case "Pågår":
        return "bg-yellow-500/20 text-yellow-500";
      case "Fullført":
        return "bg-green-500/20 text-green-500";
      case "Avbrutt":
        return "bg-red-500/20 text-red-500";
      case "Åpen":
        return "bg-orange-500/20 text-orange-500";
      case "Under behandling":
        return "bg-yellow-500/20 text-yellow-500";
      case "Lukket":
        return "bg-gray-500/20 text-gray-500";
      default:
        return "bg-gray-500/20 text-gray-500";
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "Kritisk":
        return "bg-red-500/20 text-red-500";
      case "Høy":
        return "bg-orange-500/20 text-orange-500";
      case "Medium":
        return "bg-yellow-500/20 text-yellow-500";
      case "Lav":
        return "bg-green-500/20 text-green-500";
      default:
        return "bg-gray-500/20 text-gray-500";
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "Høy":
        return "bg-red-500/20 text-red-500";
      case "Medium":
        return "bg-yellow-500/20 text-yellow-500";
      case "Lav":
        return "bg-green-500/20 text-green-500";
      default:
        return "bg-gray-500/20 text-gray-500";
    }
  };

  if (!customer) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {customer.navn}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Customer Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Kundeinformasjon</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {customer.kontaktperson && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Kontaktperson:</span>
                    <span>{customer.kontaktperson}</span>
                  </div>
                )}
                {customer.epost && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">E-post:</span>
                    <span>{customer.epost}</span>
                  </div>
                )}
                {customer.telefon && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Telefon:</span>
                    <span>{customer.telefon}</span>
                  </div>
                )}
                {customer.adresse && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Adresse:</span>
                    <span>{customer.adresse}</span>
                  </div>
                )}
              </div>
              {customer.merknader && (
                <div className="pt-3 border-t">
                  <div className="flex items-start gap-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <span className="font-medium">Merknader:</span>
                      <p className="text-muted-foreground mt-1">{customer.merknader}</p>
                    </div>
                  </div>
                </div>
              )}
              <div className="pt-3 border-t flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>Opprettet: {format(new Date(customer.opprettet_dato), "d. MMMM yyyy", { locale: nb })}</span>
              </div>
            </CardContent>
          </Card>

          {/* History Tabs */}
          <Tabs defaultValue="missions" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="missions" className="flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Oppdrag ({missions.length})
              </TabsTrigger>
              <TabsTrigger value="incidents" className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Hendelser ({incidents.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="missions" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Oppdragshistorikk</CardTitle>
                  <CardDescription>
                    Alle oppdrag for denne kunden
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Laster...
                    </div>
                  ) : missions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Ingen oppdrag registrert for denne kunden
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Tittel</TableHead>
                            <TableHead>Lokasjon</TableHead>
                            <TableHead>Tidspunkt</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Risikonivå</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {missions.map((mission) => (
                            <TableRow key={mission.id}>
                              <TableCell className="font-medium">
                                {mission.tittel}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1 text-sm">
                                  <LocationIcon className="h-3 w-3 text-muted-foreground" />
                                  {mission.lokasjon}
                                </div>
                              </TableCell>
                              <TableCell>
                                {format(new Date(mission.tidspunkt), "d. MMM yyyy HH:mm", { locale: nb })}
                              </TableCell>
                              <TableCell>
                                <Badge className={getStatusColor(mission.status)}>
                                  {mission.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge className={getRiskColor(mission.risk_nivå)}>
                                  {mission.risk_nivå}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="incidents" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Hendelseshistorikk</CardTitle>
                  <CardDescription>
                    Alle hendelser knyttet til kundens oppdrag
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Laster...
                    </div>
                  ) : incidents.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Ingen hendelser registrert for denne kundens oppdrag
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Tittel</TableHead>
                            <TableHead>Tidspunkt</TableHead>
                            <TableHead>Alvorlighetsgrad</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Lokasjon</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {incidents.map((incident) => (
                            <TableRow key={incident.id}>
                              <TableCell className="font-medium">
                                {incident.tittel}
                              </TableCell>
                              <TableCell>
                                {format(new Date(incident.hendelsestidspunkt), "d. MMM yyyy HH:mm", { locale: nb })}
                              </TableCell>
                              <TableCell>
                                <Badge className={getSeverityColor(incident.alvorlighetsgrad)}>
                                  {incident.alvorlighetsgrad}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge className={getStatusColor(incident.status)}>
                                  {incident.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {incident.lokasjon ? (
                                  <div className="flex items-center gap-1 text-sm">
                                    <LocationIcon className="h-3 w-3 text-muted-foreground" />
                                    {incident.lokasjon}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Lukk
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
