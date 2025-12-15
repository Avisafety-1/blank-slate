import { useState, useEffect, useRef } from "react";
import { User, Upload, Lock, Heart, Bell, AlertCircle, Camera, Save, Book, Award } from "lucide-react";
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
import { useTranslation } from "react-i18next";

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
  påvirker_status?: boolean;
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
  hovedaarsak: string | null;
  medvirkende_aarsak: string | null;
}

interface NotificationPreferences {
  id: string;
  user_id: string;
  email_new_incident: boolean;
  email_new_mission: boolean;
  email_document_expiry: boolean;
  email_new_user_pending: boolean;
  email_followup_assigned: boolean;
  email_inspection_reminder: boolean;
  inspection_reminder_days: number;
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
  const { t } = useTranslation();
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
            email_inspection_reminder: false,
            inspection_reminder_days: 14,
          })
          .select()
          .single();
        
        setNotificationPrefs(newPrefs);
      } else {
        setNotificationPrefs({
          ...prefsData,
          email_inspection_reminder: prefsData.email_inspection_reminder ?? false,
          inspection_reminder_days: prefsData.inspection_reminder_days ?? 14,
        });
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
      toast.error(t('profile.couldNotUploadPhoto'));
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

      toast.success(t('profile.profileUpdated'));
      setIsEditing(false);
      setAvatarFile(null);
      setAvatarPreview(null);
      fetchUserData();
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error(t('profile.couldNotUpdateProfile'));
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

      toast.success(t('profile.resetEmailSent'));
    } catch (error: any) {
      console.error("Error sending password reset:", error);
      toast.error(error.message || t('profile.couldNotSendEmail'));
    } finally {
      setPasswordResetLoading(false);
    }
  };

  const updateNotificationPref = async (field: keyof NotificationPreferences, value: boolean | number) => {
    if (!user || !notificationPrefs) return;
    
    setNotificationPrefs({ ...notificationPrefs, [field]: value });
    
    try {
      const { error } = await supabase
        .from("notification_preferences")
        .update({ [field]: value })
        .eq("user_id", user.id);
      
      if (error) throw error;
      
      toast.success(t('profile.notificationSettings'));
    } catch (error: any) {
      console.error("Error updating notification preferences:", error);
      toast.error(t('profile.couldNotUpdateSettings'));
      // Revert to previous value
      if (typeof value === 'boolean') {
        setNotificationPrefs({ ...notificationPrefs, [field]: !value });
      }
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
      superadmin: t('roles.superadmin'),
      admin: t('roles.admin'),
      saksbehandler: t('roles.saksbehandler'),
      operatør: t('roles.operator'),
      lesetilgang: t('roles.readonly'),
    };
    return roleMap[role] || role;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return t('common.notSet');
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
        <Button variant="ghost" size="sm" title={t('profile.title')} className="relative">
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
        <DialogTitle>{t('profile.title')}</DialogTitle>
      </DialogHeader>
        <ScrollArea className="max-h-[calc(90vh-100px)] pr-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">{t('common.loading')}</p>
            </div>
          ) : (
            <Tabs defaultValue="profile" className="w-full">
              <TabsList className="grid w-full grid-cols-2 lg:grid-cols-6 gap-2 p-2 lg:p-1 bg-transparent lg:bg-muted relative z-10">
                <TabsTrigger value="profile" className="flex items-center justify-center gap-1 text-xs sm:text-sm bg-muted lg:bg-transparent rounded-lg lg:rounded-sm border border-border lg:border-0">
                  <User className="h-3 w-3" />
                  <span>{t('profile.info')}</span>
                </TabsTrigger>
                <TabsTrigger value="security" className="flex items-center justify-center gap-1 text-xs sm:text-sm bg-muted lg:bg-transparent rounded-lg lg:rounded-sm border border-border lg:border-0">
                  <Lock className="h-3 w-3" />
                  <span>{t('profile.security')}</span>
                </TabsTrigger>
                <TabsTrigger value="competencies" className="flex items-center justify-center gap-1 text-xs sm:text-sm bg-muted lg:bg-transparent rounded-lg lg:rounded-sm border border-border lg:border-0">
                  <Award className="h-3 w-3" />
                  <span>{t('profile.competencies')}</span>
                </TabsTrigger>
                <TabsTrigger value="emergency" className="flex items-center justify-center gap-1 text-xs sm:text-sm bg-muted lg:bg-transparent rounded-lg lg:rounded-sm border border-border lg:border-0">
                  <Heart className="h-3 w-3" />
                  <span>{t('profile.emergency')}</span>
                </TabsTrigger>
                <TabsTrigger value="notifications" className="flex items-center justify-center gap-1 text-xs sm:text-sm bg-muted lg:bg-transparent rounded-lg lg:rounded-sm border border-border lg:border-0">
                  <Bell className="h-3 w-3" />
                  <span>{t('profile.notifications')}</span>
                </TabsTrigger>
                <TabsTrigger value="incidents" className="flex items-center justify-center gap-1 text-xs sm:text-sm relative bg-muted lg:bg-transparent rounded-lg lg:rounded-sm border border-border lg:border-0">
                  <AlertCircle className="h-3 w-3" />
                  <span>{t('profile.incidents')}</span>
                  {followUpIncidents.length > 0 && (
                    <Badge variant="destructive" className="ml-1 h-4 w-4 p-0 text-[10px]">
                      {followUpIncidents.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* Profile Tab */}
              <TabsContent value="profile" className="space-y-4 mt-20 sm:mt-12 min-h-[400px] sm:min-h-0">
                <Card>
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                      <CardTitle>{t('profile.info')}</CardTitle>
                      {!isEditing ? (
                        <Button onClick={() => setIsEditing(true)} size="sm" className="w-full sm:w-auto">
                          {t('actions.edit')}
                        </Button>
                      ) : (
                        <div className="flex gap-2 w-full sm:w-auto">
                          <Button onClick={handleSaveProfile} size="sm" className="flex-1 sm:flex-none">
                            <Save className="h-4 w-4 mr-1" />
                            {t('actions.save')}
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
                            {t('actions.cancel')}
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
                          <Label>{t('profile.name')}</Label>
                          {isEditing ? (
                            <Input
                              value={editedProfile.full_name || ""}
                              onChange={(e) => setEditedProfile({ ...editedProfile, full_name: e.target.value })}
                              placeholder={t('forms.placeholder.fullName')}
                            />
                          ) : (
                            <p className="text-lg font-semibold">{profile?.full_name || t('common.notSet')}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Basic Info */}
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t('auth.email')}</Label>
                        <Input value={profile?.email || user?.email || ""} disabled className="bg-muted" />
                      </div>

                      <div className="space-y-2">
                        <Label>{t('profile.phone')}</Label>
                        {isEditing ? (
                          <Input
                            value={editedProfile.telefon || ""}
                            onChange={(e) => setEditedProfile({ ...editedProfile, telefon: e.target.value })}
                            placeholder={t('forms.placeholder.phone')}
                          />
                        ) : (
                          <p className="text-sm py-2">{profile?.telefon || t('common.notSpecified')}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label>{t('profile.jobTitle')}</Label>
                        {isEditing ? (
                          <Input
                            value={editedProfile.tittel || ""}
                            onChange={(e) => setEditedProfile({ ...editedProfile, tittel: e.target.value })}
                            placeholder={t('forms.placeholder.jobTitle')}
                          />
                        ) : (
                          <p className="text-sm py-2">{profile?.tittel || t('common.notSpecified')}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label>{t('profile.company')}</Label>
                        <p className="text-sm py-2 font-medium">{company?.navn || t('common.notAssociated')}</p>
                      </div>

                      <div className="space-y-2">
                        <Label>{t('profile.role')}</Label>
                        <div className="py-1">
                          {userRole ? (
                            <Badge variant={getRoleBadgeVariant(userRole)}>
                              {getRoleDisplayName(userRole)}
                            </Badge>
                          ) : (
                            <p className="text-sm text-muted-foreground">{t('common.noRole')}</p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>{t('profile.memberSince')}</Label>
                        <p className="text-sm py-2">{formatDate(profile?.created_at)}</p>
                      </div>
                    </div>

                    <Separator />

                    {/* Address */}
                    <div className="space-y-2">
                      <Label>{t('profile.address')}</Label>
                      {isEditing ? (
                        <Textarea
                          value={editedProfile.adresse || ""}
                          onChange={(e) => setEditedProfile({ ...editedProfile, adresse: e.target.value })}
                          placeholder={t('forms.placeholder.address')}
                          rows={3}
                        />
                      ) : (
                        <p className="text-sm py-2 whitespace-pre-wrap">{profile?.adresse || t('common.notSpecified')}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Security Tab */}
              <TabsContent value="security" className="space-y-4 mt-20 sm:mt-12 min-h-[400px] sm:min-h-0">
                <Card>
                  <CardHeader>
                    <CardTitle>{t('profile.security')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>{t('profile.passwordReset')}</Label>
                      <p className="text-sm text-muted-foreground mb-3">
                        {t('profile.passwordResetDesc')}
                      </p>
                      <Button
                        onClick={handlePasswordReset}
                        disabled={passwordResetLoading}
                        variant="outline"
                      >
                        <Lock className="h-4 w-4 mr-2" />
                        {passwordResetLoading ? t('profile.sendingEmail') : t('profile.resetPassword')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Competencies Tab */}
              <TabsContent value="competencies" className="space-y-4 mt-20 sm:mt-12 min-h-[400px] sm:min-h-0">
                <Card>
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                      <CardTitle>{t('profile.myCompetencies')} ({competencies.length})</CardTitle>
                      <div className="flex gap-2 w-full sm:w-auto">
                        <Button 
                          onClick={() => setLogbookDialogOpen(true)} 
                          size="sm"
                          variant="outline"
                          className="flex-1 sm:flex-none"
                        >
                          <Book className="h-4 w-4 mr-1" />
                          {t('profile.logbook')}
                        </Button>
                        <Button 
                          onClick={() => setCompetencyDialogOpen(true)} 
                          size="sm"
                          className="flex-1 sm:flex-none"
                        >
                          {t('actions.add')}
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
                                    <p>{t('profile.issued')}: {formatDate(comp.utstedt_dato)}</p>
                                  )}
                                  {comp.utloper_dato && (
                                    <p className={
                                      isCompetencyExpired(comp.utloper_dato)
                                        ? "text-red-600 dark:text-red-400 font-semibold"
                                        : isCompetencyExpiring(comp.utloper_dato)
                                        ? "text-yellow-600 dark:text-yellow-400 font-semibold"
                                        : ""
                                    }>
                                      {t('profile.expires')}: {formatDate(comp.utloper_dato)}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">{t('profile.noCompetencies')}</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Emergency Contact Tab */}
              <TabsContent value="emergency" className="space-y-4 mt-20 sm:mt-12 min-h-[400px] sm:min-h-0">
                <Card>
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                      <CardTitle>{t('profile.emergency')}</CardTitle>
                      {!isEditing && (
                        <Button onClick={() => setIsEditing(true)} size="sm" className="w-full sm:w-auto">
                          {t('actions.edit')}
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      {t('profile.emergencyInfo')}
                    </p>
                    <Separator />
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>{t('profile.emergencyContactName')}</Label>
                        {isEditing ? (
                          <Input
                            value={editedProfile.nødkontakt_navn || ""}
                            onChange={(e) => setEditedProfile({ ...editedProfile, nødkontakt_navn: e.target.value })}
                            placeholder={t('forms.placeholder.fullName')}
                          />
                        ) : (
                          <p className="text-sm py-2">{profile?.nødkontakt_navn || t('common.notSpecified')}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label>{t('profile.emergencyContactPhone')}</Label>
                        {isEditing ? (
                          <Input
                            value={editedProfile.nødkontakt_telefon || ""}
                            onChange={(e) => setEditedProfile({ ...editedProfile, nødkontakt_telefon: e.target.value })}
                            placeholder={t('forms.placeholder.phone')}
                          />
                        ) : (
                          <p className="text-sm py-2">{profile?.nødkontakt_telefon || t('common.notSpecified')}</p>
                        )}
                      </div>
                    </div>

                    {isEditing && (
                      <div className="flex gap-2 pt-4">
                        <Button onClick={handleSaveProfile} size="sm" className="flex-1 sm:flex-none">
                          <Save className="h-4 w-4 mr-1" />
                          {t('actions.save')}
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
                          {t('actions.cancel')}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Notifications Tab */}
              <TabsContent value="notifications" className="space-y-4 mt-20 sm:mt-12 min-h-[400px] sm:min-h-0">
                <Card>
                  <CardHeader>
                    <CardTitle>{t('profile.notifications')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5 flex-1">
                          <label className="text-sm font-medium">
                            {t('profile.notificationOptions.newIncidents')}
                          </label>
                          <p className="text-xs text-muted-foreground">
                            {t('profile.notificationOptions.newIncidentsDesc')}
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
                            {t('profile.notificationOptions.newMissions')}
                          </label>
                          <p className="text-xs text-muted-foreground">
                            {t('profile.notificationOptions.newMissionsDesc')}
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
                            {t('profile.notificationOptions.documentExpiry')}
                          </label>
                          <p className="text-xs text-muted-foreground">
                            {t('profile.notificationOptions.documentExpiryDesc')}
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
                            {t('profile.notificationOptions.newUserPending')}
                          </label>
                          <p className="text-xs text-muted-foreground">
                            {t('profile.notificationOptions.newUserPendingDesc')}
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
                            {t('profile.notificationOptions.followupAssigned')}
                          </label>
                          <p className="text-xs text-muted-foreground">
                            {t('profile.notificationOptions.followupAssignedDesc')}
                          </p>
                        </div>
                        <Switch
                          checked={notificationPrefs?.email_followup_assigned ?? true}
                          onCheckedChange={(checked) => 
                            updateNotificationPref('email_followup_assigned', checked)
                          }
                        />
                      </div>
                      
                      <Separator />
                      
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5 flex-1">
                            <label className="text-sm font-medium">
                              {t('profile.notificationOptions.inspectionReminder')}
                            </label>
                            <p className="text-xs text-muted-foreground">
                              {t('profile.notificationOptions.inspectionReminderDesc')}
                            </p>
                          </div>
                          <Switch
                            checked={notificationPrefs?.email_inspection_reminder ?? false}
                            onCheckedChange={(checked) => 
                              updateNotificationPref('email_inspection_reminder', checked)
                            }
                          />
                        </div>
                        {notificationPrefs?.email_inspection_reminder && (
                          <div className="flex items-center gap-2 pl-4">
                            <Label className="text-sm text-muted-foreground whitespace-nowrap">
                              {t('profile.notificationOptions.daysBeforeInspection')}:
                            </Label>
                            <Input
                              type="number"
                              min={1}
                              max={90}
                              value={notificationPrefs?.inspection_reminder_days ?? 14}
                              onChange={(e) => 
                                updateNotificationPref('inspection_reminder_days', parseInt(e.target.value) || 14)
                              }
                              className="w-20 h-8"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Incidents Tab */}
              <TabsContent value="incidents" className="space-y-4 mt-20 sm:mt-12 min-h-[400px] sm:min-h-0">
                <Card>
                  <CardHeader>
                    <CardTitle>{t('profile.myIncidents')} ({followUpIncidents.length})</CardTitle>
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
                      <p className="text-sm text-muted-foreground">{t('profile.noIncidentsFollowUp')}</p>
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
