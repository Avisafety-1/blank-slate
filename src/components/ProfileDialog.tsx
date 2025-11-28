import { useState, useEffect } from "react";
import { User } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { IncidentDetailDialog } from "./dashboard/IncidentDetailDialog";
import { toast } from "sonner";

interface Profile {
  full_name: string | null;
  avatar_url: string | null;
}

interface UserRole {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  event_date: string;
  type: string;
}

interface Incident {
  id: string;
  tittel: string;
  hendelsestidspunkt: string;
  status: string;
  alvorlighetsgrad: string;
  beskrivelse: string | null;
  kategori: string | null;
  lokasjon: string | null;
  mission_id: string | null;
  oppdatert_dato: string | null;
  oppfolgingsansvarlig_id: string | null;
  opprettet_dato: string | null;
  rapportert_av: string | null;
  user_id: string | null;
  company_id: string;
}

interface NotificationPreferences {
  id: string;
  user_id: string;
  email_new_incident: boolean;
  email_new_mission: boolean;
  email_document_expiry: boolean;
  email_new_user_pending: boolean;
  email_followup_assigned: boolean;
  created_at: string;
  updated_at: string;
}

const severityColors = {
  Lav: "bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30",
  Middels: "bg-status-yellow/20 text-yellow-700 dark:text-yellow-300 border-status-yellow/30",
  Høy: "bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30",
  Kritisk: "bg-status-red/20 text-red-700 dark:text-red-300 border-status-red/30",
};

export const ProfileDialog = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [followUpIncidents, setFollowUpIncidents] = useState<Incident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [incidentDialogOpen, setIncidentDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences | null>(null);

  useEffect(() => {
    if (user) {
      fetchUserData();
    }
  }, [user]);

  const fetchUserData = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Fetch profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", user.id)
        .single();

      if (profileData) {
        setProfile(profileData);
      }

      // Fetch user's single role
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (roleData) {
        setUserRole(roleData.role);
        setIsAdmin(roleData.role === 'admin' || roleData.role === 'superadmin');
      }

      // Fetch calendar events
      const { data: eventsData } = await supabase
        .from("calendar_events")
        .select("id, title, event_date, type")
        .eq("user_id", user.id)
        .order("event_date", { ascending: true });

      if (eventsData) {
        setCalendarEvents(eventsData);
      }

      // Fetch incidents
      const { data: incidentsData } = await supabase
        .from("incidents")
        .select("*")
        .eq("user_id", user.id)
        .order("hendelsestidspunkt", { ascending: false });

      if (incidentsData) {
        setIncidents(incidentsData);
      }

      // Fetch follow-up incidents
      const { data: followUpIncidentsData } = await supabase
        .from("incidents")
        .select("*")
        .eq("oppfolgingsansvarlig_id", user.id)
        .neq("status", "Ferdigbehandlet")
        .order("hendelsestidspunkt", { ascending: false });

      if (followUpIncidentsData) {
        setFollowUpIncidents(followUpIncidentsData);
      }

      // Fetch notification preferences
      const { data: prefsData } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!prefsData) {
        // Auto-create with defaults
        const { data: newPrefs } = await supabase
          .from("notification_preferences")
          .insert({
            user_id: user.id,
            email_new_incident: false,
            email_new_mission: false,
            email_document_expiry: false,
            email_new_user_pending: false,
            email_followup_assigned: true,
          })
          .select()
          .single();
        
        setNotificationPrefs(newPrefs);
      } else {
        setNotificationPrefs(prefsData);
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateNotificationPref = async (field: keyof NotificationPreferences, value: boolean) => {
    if (!user || !notificationPrefs) return;
    
    // Optimistic update
    setNotificationPrefs({ ...notificationPrefs, [field]: value });
    
    try {
      const { error } = await supabase
        .from("notification_preferences")
        .update({ [field]: value })
        .eq("user_id", user.id);
      
      if (error) throw error;
      
      toast.success("Varslingsinnstillinger oppdatert");
    } catch (error: any) {
      console.error("Error updating notification preferences:", error);
      toast.error("Kunne ikke oppdatere innstillinger");
      // Revert optimistic update
      setNotificationPrefs({ ...notificationPrefs, [field]: !value });
    }
  };

  const getRoleBadgeVariant = (role: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (role) {
      case "superadmin":
        return "destructive";
      case "admin":
        return "destructive";
      case "saksbehandler":
        return "default";
      case "operatør":
        return "secondary";
      case "lesetilgang":
        return "outline";
      default:
        return "outline";
    }
  };

  const getRoleDisplayName = (role: string): string => {
    const roleMap: { [key: string]: string } = {
      superadmin: "Super Administrator",
      admin: "Administrator",
      saksbehandler: "Saksbehandler",
      operatør: "Operatør",
      lesetilgang: "Lesetilgang",
    };
    return roleMap[role] || role;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("no-NO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const handleIncidentClick = (incident: Incident) => {
    setSelectedIncident(incident);
    setIncidentDialogOpen(true);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" title="Min profil" className="relative">
          <User className="w-4 h-4" />
          {followUpIncidents.length > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs rounded-full"
            >
              {followUpIncidents.length}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Min profil</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(80vh-100px)] pr-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">Laster...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Profile Info */}
              <Card>
                <CardHeader>
                  <CardTitle>Profilinformasjon</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16">
                      <AvatarImage src={profile?.avatar_url || ""} />
                      <AvatarFallback>
                        {profile?.full_name?.charAt(0) || user?.email?.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-lg font-semibold">{profile?.full_name || "Ikke satt"}</p>
                      <p className="text-sm text-muted-foreground">{user?.email}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Role */}
              <Card>
                <CardHeader>
                  <CardTitle>Rolle</CardTitle>
                </CardHeader>
                <CardContent>
                  {userRole ? (
                    <Badge variant={getRoleBadgeVariant(userRole)}>
                      {getRoleDisplayName(userRole)}
                    </Badge>
                  ) : (
                    <p className="text-sm text-muted-foreground">Ingen rolle tildelt</p>
                  )}
                </CardContent>
              </Card>

              {/* Follow-up Incidents */}
              <Card>
                <CardHeader>
                  <CardTitle>Hendelser til oppfølging ({followUpIncidents.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  {followUpIncidents.length > 0 ? (
                    <div className="space-y-2">
                      {followUpIncidents.slice(0, 5).map((incident) => (
                        <div
                          key={incident.id}
                          className="flex justify-between items-center py-2 cursor-pointer hover:bg-accent/50 rounded-md px-2 transition-colors"
                          onClick={() => handleIncidentClick(incident)}
                        >
                          <div>
                            <p className="font-medium">{incident.tittel}</p>
                            <p className="text-xs text-muted-foreground">
                              {incident.status} • {formatDate(incident.hendelsestidspunkt)}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className={severityColors[incident.alvorlighetsgrad as keyof typeof severityColors]}
                          >
                            {incident.alvorlighetsgrad}
                          </Badge>
                        </div>
                      ))}
                      {followUpIncidents.length > 5 && (
                        <p className="text-xs text-muted-foreground pt-2">
                          + {followUpIncidents.length - 5} flere hendelser
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Ingen hendelser til oppfølging</p>
                  )}
                </CardContent>
              </Card>

              {/* Calendar Events */}
              <Card>
                <CardHeader>
                  <CardTitle>Mine kalenderoppføringer ({calendarEvents.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  {calendarEvents.length > 0 ? (
                    <div className="space-y-2">
                      {calendarEvents.slice(0, 5).map((event) => (
                        <div key={event.id} className="flex justify-between items-center py-2">
                          <div>
                            <p className="font-medium">{event.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {event.type} • {formatDate(event.event_date)}
                            </p>
                          </div>
                        </div>
                      ))}
                      {calendarEvents.length > 5 && (
                        <p className="text-xs text-muted-foreground pt-2">
                          + {calendarEvents.length - 5} flere hendelser
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Ingen kalenderhendelser</p>
                  )}
                </CardContent>
              </Card>

              {/* Notification Preferences */}
              <Card>
                <CardHeader>
                  <CardTitle>Varslinger</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <label className="text-sm font-medium">
                          E-post ved nye hendelser
                        </label>
                        <p className="text-xs text-muted-foreground">
                          Få beskjed når nye hendelser rapporteres
                        </p>
                      </div>
                      <Switch
                        checked={notificationPrefs?.email_new_incident ?? false}
                        onCheckedChange={(checked) => 
                          updateNotificationPref('email_new_incident', checked)
                        }
                      />
                    </div>
                    
                    <Separator />
                    
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <label className="text-sm font-medium">
                          E-post ved nye oppdrag
                        </label>
                        <p className="text-xs text-muted-foreground">
                          Få beskjed når nye missions opprettes
                        </p>
                      </div>
                      <Switch
                        checked={notificationPrefs?.email_new_mission ?? false}
                        onCheckedChange={(checked) => 
                          updateNotificationPref('email_new_mission', checked)
                        }
                      />
                    </div>
                    
                    <Separator />
                    
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <label className="text-sm font-medium">
                          E-post når dokumenter nærmer seg utløpsdato
                        </label>
                        <p className="text-xs text-muted-foreground">
                          Varsling 30 dager før dokumenter utløper
                        </p>
                      </div>
                      <Switch
                        checked={notificationPrefs?.email_document_expiry ?? false}
                        onCheckedChange={(checked) => 
                          updateNotificationPref('email_document_expiry', checked)
                        }
                      />
                    </div>
                    
                    <Separator />
                    
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <label className="text-sm font-medium">
                          E-post når nye brukere venter på godkjenning
                        </label>
                        <p className="text-xs text-muted-foreground">
                          Kun for administratorer
                        </p>
                      </div>
                      <Switch
                        checked={notificationPrefs?.email_new_user_pending ?? false}
                        onCheckedChange={(checked) => 
                          updateNotificationPref('email_new_user_pending', checked)
                        }
                        disabled={!isAdmin}
                      />
                    </div>
                    
                    <Separator />
                    
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <label className="text-sm font-medium">
                          E-post når jeg settes som oppfølgingsansvarlig
                        </label>
                        <p className="text-xs text-muted-foreground">
                          Standard aktivert - anbefales sterkt
                        </p>
                      </div>
                      <Switch
                        checked={notificationPrefs?.email_followup_assigned ?? true}
                        onCheckedChange={(checked) => 
                          updateNotificationPref('email_followup_assigned', checked)
                        }
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
      <IncidentDetailDialog
        open={incidentDialogOpen}
        onOpenChange={setIncidentDialogOpen}
        incident={selectedIncident}
      />
    </Dialog>
  );
};
