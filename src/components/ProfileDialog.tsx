import { useState, useEffect, useRef } from "react";
import { User, Upload, Lock, Heart, Bell, AlertCircle, Camera, Save, Book } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { IncidentDetailDialog } from "./dashboard/IncidentDetailDialog";
import { PersonCompetencyDialog } from "./resources/PersonCompetencyDialog";
import { FlightLogbookDialog } from "./FlightLogbookDialog";
import { toast } from "sonner";

interface Profile {
  full_name: string | null;
  avatar_url: string | null;
  email: string | null;
  telefon: string | null;
  adresse: string | null;
  tittel: string | null;
  nødkontakt_navn: string | null;
  nødkontakt_telefon: string | null;
  created_at: string | null;
  company_id: string;
}

interface Company {
  navn: string;
}

interface Competency {
  id: string;
  navn: string;
  type: string;
  beskrivelse: string | null;
  utstedt_dato: string | null;
  utloper_dato: string | null;
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
  const [company, setCompany] = useState<Company | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [followUpIncidents, setFollowUpIncidents] = useState<Incident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [incidentDialogOpen, setIncidentDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState<Partial<Profile>>({});
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [passwordResetLoading, setPasswordResetLoading] = useState(false);
  const [competencyDialogOpen, setCompetencyDialogOpen] = useState(false);
  const [logbookDialogOpen, setLogbookDialogOpen] = useState(false);

  useEffect(() => {
    if (user) {
      fetchUserData();
    }
  }, [user]);

  const fetchUserData = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Fetch profile with all fields
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileData) {
        setProfile(profileData as Profile);
        setEditedProfile(profileData as Profile);
      }

      // Fetch company name
      if (profileData?.company_id) {
        const { data: companyData } = await supabase
          .from("companies")
          .select("navn")
          .eq("id", profileData.company_id)
          .single();

        if (companyData) {
          setCompany(companyData);
        }
      }

      // Fetch user's role
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (roleData) {
        setUserRole(roleData.role);
        setIsAdmin(roleData.role === 'admin' || roleData.role === 'superadmin');
      }

      // Fetch competencies
      const { data: competenciesData } = await supabase
        .from("personnel_competencies")
        .select("*")
        .eq("profile_id", user.id)
        .order("utloper_dato", { ascending: true });

      if (competenciesData) {
        setCompetencies(competenciesData);
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

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadAvatar = async (): Promise<string | null> => {
    if (!avatarFile || !user) return null;

    try {
      const fileExt = avatarFile.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, avatarFile, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      return urlData.publicUrl;
    } catch (error) {
      console.error("Error uploading avatar:", error);
      toast.error("Kunne ikke laste opp profilbilde");
      return null;
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;

    try {
      let avatarUrl = editedProfile.avatar_url;

      // Upload avatar if changed
      if (avatarFile) {
        const newAvatarUrl = await uploadAvatar();
        if (newAvatarUrl) {
          avatarUrl = newAvatarUrl;
        }
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: editedProfile.full_name,
          telefon: editedProfile.telefon,
          adresse: editedProfile.adresse,
          tittel: editedProfile.tittel,
          nødkontakt_navn: editedProfile.nødkontakt_navn,
          nødkontakt_telefon: editedProfile.nødkontakt_telefon,
          avatar_url: avatarUrl,
        })
        .eq("id", user.id);

      if (error) throw error;

      toast.success("Profil oppdatert");
      setIsEditing(false);
      setAvatarFile(null);
      setAvatarPreview(null);
      fetchUserData();
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("Kunne ikke oppdatere profil");
    }
  };

  const handlePasswordReset = async () => {
    if (!user?.email) return;

    setPasswordResetLoading(true);
    try {
      const { error } = await supabase.functions.invoke('send-password-reset', {
        body: { email: user.email }
      });

      if (error) throw error;

      toast.success("Tilbakestillings-e-post sendt! Sjekk innboksen din.");
    } catch (error: any) {
      console.error("Error sending password reset:", error);
      toast.error(error.message || "Kunne ikke sende e-post");
    } finally {
      setPasswordResetLoading(false);
    }
  };

  const updateNotificationPref = async (field: keyof NotificationPreferences, value: boolean) => {
    if (!user || !notificationPrefs) return;
    
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
      setNotificationPrefs({ ...notificationPrefs, [field]: !value });
    }
  };

  const getRoleBadgeVariant = (role: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (role) {
      case "superadmin":
      case "admin":
        return "destructive";
      case "saksbehandler":
        return "default";
      case "operatør":
        return "secondary";
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

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Ikke satt";
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

  const isCompetencyExpiring = (date: string | null) => {
    if (!date) return false;
    const expiryDate = new Date(date);
    const today = new Date();
    const daysUntilExpiry = Math.floor((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry <= 30 && daysUntilExpiry >= 0;
  };

  const isCompetencyExpired = (date: string | null) => {
    if (!date) return false;
    const expiryDate = new Date(date);
    const today = new Date();
    return expiryDate < today;
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
      <DialogContent className="max-w-3xl max-h-[90vh] sm:top-[50%] sm:translate-y-[-50%] top-[5%] translate-y-0 data-[state=open]:slide-in-from-top-[5%]">
        <DialogHeader>
          <DialogTitle>Min profil</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(90vh-100px)] pr-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">Laster...</p>
            </div>
          ) : (
            <Tabs defaultValue="profile" className="w-full">
              <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 gap-1">
                <TabsTrigger value="profile" className="text-xs sm:text-sm">
                  <User className="h-3 w-3 mr-1" />
                  <span className="hidden sm:inline">Profil</span>
                </TabsTrigger>
                <TabsTrigger value="security" className="text-xs sm:text-sm">
                  <Lock className="h-3 w-3 mr-1" />
                  <span className="hidden sm:inline">Sikkerhet</span>
                </TabsTrigger>
                <TabsTrigger value="competencies" className="text-xs sm:text-sm">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  <span className="hidden sm:inline">Kompetanse</span>
                </TabsTrigger>
                <TabsTrigger value="emergency" className="text-xs sm:text-sm">
                  <Heart className="h-3 w-3 mr-1" />
                  <span className="hidden sm:inline">Nødkontakt</span>
                </TabsTrigger>
                <TabsTrigger value="notifications" className="text-xs sm:text-sm">
                  <Bell className="h-3 w-3 mr-1" />
                  <span className="hidden sm:inline">Varslinger</span>
                </TabsTrigger>
                <TabsTrigger value="incidents" className="text-xs sm:text-sm relative">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  <span className="hidden sm:inline">Hendelser</span>
                  {followUpIncidents.length > 0 && (
                    <Badge variant="destructive" className="ml-1 h-4 w-4 p-0 text-[10px]">
                      {followUpIncidents.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* Profile Tab */}
              <TabsContent value="profile" className="space-y-4 mt-4 min-h-[400px] sm:min-h-0">
                <Card>
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                      <CardTitle>Profilinformasjon</CardTitle>
                      {!isEditing ? (
                        <Button onClick={() => setIsEditing(true)} size="sm" className="w-full sm:w-auto">
                          Rediger
                        </Button>
                      ) : (
                        <div className="flex gap-2 w-full sm:w-auto">
                          <Button onClick={handleSaveProfile} size="sm" className="flex-1 sm:flex-none">
                            <Save className="h-4 w-4 mr-1" />
                            Lagre
                          </Button>
                          <Button
                            onClick={() => {
                              setIsEditing(false);
                              setEditedProfile(profile || {});
                              setAvatarFile(null);
                              setAvatarPreview(null);
                            }}
                            variant="outline"
                            size="sm"
                            className="flex-1 sm:flex-none"
                          >
                            Avbryt
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Avatar */}
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      <div className="relative group">
                        <Avatar className="h-24 w-24">
                          <AvatarImage src={avatarPreview || profile?.avatar_url || ""} />
                          <AvatarFallback className="text-2xl">
                            {profile?.full_name?.charAt(0) || user?.email?.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        {isEditing && (
                          <button
                            onClick={handleAvatarClick}
                            className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          >
                            <Camera className="h-6 w-6 text-white" />
                          </button>
                        )}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleAvatarChange}
                          className="hidden"
                        />
                      </div>
                      <div className="flex-1 w-full space-y-2">
                        <div className="grid gap-2">
                          <Label>Navn</Label>
                          {isEditing ? (
                            <Input
                              value={editedProfile.full_name || ""}
                              onChange={(e) => setEditedProfile({ ...editedProfile, full_name: e.target.value })}
                              placeholder="Fullt navn"
                            />
                          ) : (
                            <p className="text-lg font-semibold">{profile?.full_name || "Ikke satt"}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Basic Info */}
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>E-post</Label>
                        <Input value={profile?.email || user?.email || ""} disabled className="bg-muted" />
                      </div>

                      <div className="space-y-2">
                        <Label>Telefon</Label>
                        {isEditing ? (
                          <Input
                            value={editedProfile.telefon || ""}
                            onChange={(e) => setEditedProfile({ ...editedProfile, telefon: e.target.value })}
                            placeholder="+47 xxx xx xxx"
                          />
                        ) : (
                          <p className="text-sm py-2">{profile?.telefon || "Ikke oppgitt"}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label>Tittel/Stilling</Label>
                        {isEditing ? (
                          <Input
                            value={editedProfile.tittel || ""}
                            onChange={(e) => setEditedProfile({ ...editedProfile, tittel: e.target.value })}
                            placeholder="F.eks. Dronepilot"
                          />
                        ) : (
                          <p className="text-sm py-2">{profile?.tittel || "Ikke oppgitt"}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label>Firma</Label>
                        <p className="text-sm py-2 font-medium">{company?.navn || "Ikke tilknyttet"}</p>
                      </div>

                      <div className="space-y-2">
                        <Label>Rolle</Label>
                        <div className="py-1">
                          {userRole ? (
                            <Badge variant={getRoleBadgeVariant(userRole)}>
                              {getRoleDisplayName(userRole)}
                            </Badge>
                          ) : (
                            <p className="text-sm text-muted-foreground">Ingen rolle</p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Medlem siden</Label>
                        <p className="text-sm py-2">{formatDate(profile?.created_at)}</p>
                      </div>
                    </div>

                    <Separator />

                    {/* Address */}
                    <div className="space-y-2">
                      <Label>Adresse</Label>
                      {isEditing ? (
                        <Textarea
                          value={editedProfile.adresse || ""}
                          onChange={(e) => setEditedProfile({ ...editedProfile, adresse: e.target.value })}
                          placeholder="Gate, postnummer og sted"
                          rows={3}
                        />
                      ) : (
                        <p className="text-sm py-2 whitespace-pre-wrap">{profile?.adresse || "Ikke oppgitt"}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Security Tab */}
              <TabsContent value="security" className="space-y-4 mt-4 min-h-[400px] sm:min-h-0">
                <Card>
                  <CardHeader>
                    <CardTitle>Sikkerhet</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Passord</Label>
                      <p className="text-sm text-muted-foreground mb-3">
                        Klikk på knappen under for å få tilsendt en e-post med lenke for å tilbakestille passordet ditt.
                      </p>
                      <Button
                        onClick={handlePasswordReset}
                        disabled={passwordResetLoading}
                        variant="outline"
                      >
                        <Lock className="h-4 w-4 mr-2" />
                        {passwordResetLoading ? "Sender e-post..." : "Tilbakestill passord"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Competencies Tab */}
              <TabsContent value="competencies" className="space-y-4 mt-4 min-h-[400px] sm:min-h-0">
                <Card>
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                      <CardTitle>Mine kompetanser ({competencies.length})</CardTitle>
                      <div className="flex gap-2 w-full sm:w-auto">
                        <Button 
                          onClick={() => setLogbookDialogOpen(true)} 
                          size="sm"
                          variant="outline"
                          className="flex-1 sm:flex-none"
                        >
                          <Book className="h-4 w-4 mr-1" />
                          Loggbok
                        </Button>
                        <Button 
                          onClick={() => setCompetencyDialogOpen(true)} 
                          size="sm"
                          className="flex-1 sm:flex-none"
                        >
                          Legg til
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {competencies.length > 0 ? (
                      <div className="space-y-3">
                        {competencies.map((comp) => (
                          <div
                            key={comp.id}
                            className={`p-3 rounded-lg border ${
                              isCompetencyExpired(comp.utloper_dato)
                                ? "border-red-500/30 bg-red-500/10"
                                : isCompetencyExpiring(comp.utloper_dato)
                                ? "border-yellow-500/30 bg-yellow-500/10"
                                : "border-border"
                            }`}
                          >
                            <div className="flex justify-between items-start gap-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="font-semibold">{comp.navn}</p>
                                  <Badge variant="outline" className="text-xs">
                                    {comp.type}
                                  </Badge>
                                </div>
                                {comp.beskrivelse && (
                                  <p className="text-sm text-muted-foreground mb-2">{comp.beskrivelse}</p>
                                )}
                                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                  {comp.utstedt_dato && (
                                    <p>Utstedt: {formatDate(comp.utstedt_dato)}</p>
                                  )}
                                  {comp.utloper_dato && (
                                    <p className={
                                      isCompetencyExpired(comp.utloper_dato)
                                        ? "text-red-600 dark:text-red-400 font-semibold"
                                        : isCompetencyExpiring(comp.utloper_dato)
                                        ? "text-yellow-600 dark:text-yellow-400 font-semibold"
                                        : ""
                                    }>
                                      Utløper: {formatDate(comp.utloper_dato)}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Ingen kompetanser registrert</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Emergency Contact Tab */}
              <TabsContent value="emergency" className="space-y-4 mt-4 min-h-[400px] sm:min-h-0">
                <Card>
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                      <CardTitle>Nødkontakt</CardTitle>
                      {!isEditing && (
                        <Button onClick={() => setIsEditing(true)} size="sm" className="w-full sm:w-auto">
                          Rediger
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Viktig informasjon ved ulykker eller nødsituasjoner under feltarbeid.
                    </p>
                    <Separator />
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Navn på nødkontakt</Label>
                        {isEditing ? (
                          <Input
                            value={editedProfile.nødkontakt_navn || ""}
                            onChange={(e) => setEditedProfile({ ...editedProfile, nødkontakt_navn: e.target.value })}
                            placeholder="Fullt navn"
                          />
                        ) : (
                          <p className="text-sm py-2">{profile?.nødkontakt_navn || "Ikke oppgitt"}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label>Telefon til nødkontakt</Label>
                        {isEditing ? (
                          <Input
                            value={editedProfile.nødkontakt_telefon || ""}
                            onChange={(e) => setEditedProfile({ ...editedProfile, nødkontakt_telefon: e.target.value })}
                            placeholder="+47 xxx xx xxx"
                          />
                        ) : (
                          <p className="text-sm py-2">{profile?.nødkontakt_telefon || "Ikke oppgitt"}</p>
                        )}
                      </div>
                    </div>

                    {isEditing && (
                      <div className="flex gap-2 pt-4">
                        <Button onClick={handleSaveProfile} size="sm" className="flex-1 sm:flex-none">
                          <Save className="h-4 w-4 mr-1" />
                          Lagre
                        </Button>
                        <Button
                          onClick={() => {
                            setIsEditing(false);
                            setEditedProfile(profile || {});
                          }}
                          variant="outline"
                          size="sm"
                          className="flex-1 sm:flex-none"
                        >
                          Avbryt
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Notifications Tab */}
              <TabsContent value="notifications" className="space-y-4 mt-4 min-h-[400px] sm:min-h-0">
                <Card>
                  <CardHeader>
                    <CardTitle>Varslinger</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5 flex-1">
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
                        <div className="space-y-0.5 flex-1">
                          <label className="text-sm font-medium">
                            E-post ved nye oppdrag
                          </label>
                          <p className="text-xs text-muted-foreground">
                            Få beskjed når nye oppdrag opprettes
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
                        <div className="space-y-0.5 flex-1">
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
                        <div className="space-y-0.5 flex-1">
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
                        <div className="space-y-0.5 flex-1">
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
              </TabsContent>

              {/* Incidents Tab */}
              <TabsContent value="incidents" className="space-y-4 mt-4 min-h-[400px] sm:min-h-0">
                <Card>
                  <CardHeader>
                    <CardTitle>Hendelser til oppfølging ({followUpIncidents.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {followUpIncidents.length > 0 ? (
                      <div className="space-y-2">
                        {followUpIncidents.map((incident) => (
                          <div
                            key={incident.id}
                            className="flex justify-between items-center py-2 cursor-pointer hover:bg-accent/50 rounded-md px-2 transition-colors"
                            onClick={() => handleIncidentClick(incident)}
                          >
                            <div className="flex-1">
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
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Ingen hendelser til oppfølging</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </ScrollArea>
      </DialogContent>

      {/* Incident Detail Dialog */}
      {selectedIncident && (
        <IncidentDetailDialog
          incident={selectedIncident}
          open={incidentDialogOpen}
          onOpenChange={setIncidentDialogOpen}
        />
      )}

      {/* Competency Dialog */}
      {user && (
        <PersonCompetencyDialog
          open={competencyDialogOpen}
          onOpenChange={setCompetencyDialogOpen}
          person={{ id: user.id, full_name: profile?.full_name || user.email || 'Bruker', personnel_competencies: competencies }}
          onCompetencyUpdated={() => {
            fetchUserData();
            setCompetencyDialogOpen(false);
          }}
        />
      )}

      {/* Logbook Dialog */}
      {user && (
        <FlightLogbookDialog
          open={logbookDialogOpen}
          onOpenChange={setLogbookDialogOpen}
          personId={user.id}
          personName={profile?.full_name || user.email || 'Bruker'}
        />
      )}
    </Dialog>
  );
};
