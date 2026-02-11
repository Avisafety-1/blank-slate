import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Shield, LogOut, Trash2, Check, X, Menu, Settings, UserCog, Users, Building2, Mail, Key, Copy, ShieldCheck, ChevronRight, RefreshCw, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProfileDialog } from "@/components/ProfileDialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompanyManagementSection } from "@/components/admin/CompanyManagementSection";
import { CustomerManagementSection } from "@/components/admin/CustomerManagementSection";
import { EmailTemplateEditor } from "@/components/admin/EmailTemplateEditor";
import { EmailSettingsDialog } from "@/components/admin/EmailSettingsDialog";
import { BulkEmailSender } from "@/components/admin/BulkEmailSender";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTranslation } from "react-i18next";

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  approved: boolean;
  approved_at: string | null;
  approved_by: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  can_approve_missions?: boolean;
}

interface UserRole {
  id: string;
  user_id: string;
  role: string;
}

const availableRoles = [
  { value: "superadmin", labelKey: "roles.superadmin" },
  { value: "admin", labelKey: "roles.admin" },
  { value: "saksbehandler", labelKey: "roles.saksbehandler" },
  { value: "operatør", labelKey: "roles.operator" },
  { value: "lesetilgang", labelKey: "roles.readonly" },
];

const Admin = () => {
  const { user, loading, companyId, isSuperAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [emailSettingsOpen, setEmailSettingsOpen] = useState(false);
  const [approvingUsers, setApprovingUsers] = useState<Set<string>>(new Set());
  const [registrationCode, setRegistrationCode] = useState<string | null>(null);
  const [syncingAirspaces, setSyncingAirspaces] = useState(false);

  const [deleteEmail, setDeleteEmail] = useState("");
  const [deletingByEmail, setDeletingByEmail] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      checkAdminStatus();
    }
  }, [user]);

  // Refetch data when companyId changes (e.g., superadmin switches company)
  useEffect(() => {
    if (isAdmin && companyId !== undefined) {
      fetchData();
    }
  }, [companyId]);

  const checkAdminStatus = async () => {
    try {
      const { data, error } = await supabase.rpc('has_role', {
        _user_id: user?.id,
        _role: 'admin'
      });

      if (error) throw error;

      if (data) {
        setIsAdmin(true);
        fetchData();
      } else {
        toast.error(t('admin.noAccessPage'));
        navigate("/");
      }
    } catch (error) {
      console.error("Error checking admin status:", error);
      toast.error(t('admin.errorCheckingAccess'));
      navigate("/");
    }
  };

  const fetchData = async () => {
    setLoadingData(true);
    try {
      // Fetch company registration code
      if (companyId) {
        const { data: companyData } = await supabase
          .from("companies")
          .select("registration_code")
          .eq("id", companyId)
          .single();
        
        if (companyData) {
          setRegistrationCode(companyData.registration_code);
        }
      }

      // Fetch profiles - filter by company
      let profilesQuery = supabase
        .from("profiles")
        .select("*, companies(navn)")
        .order("created_at", { ascending: false });
      
      // Filter by company if companyId is set
      if (companyId) {
        profilesQuery = profilesQuery.eq('company_id', companyId);
      }

      const { data: profilesData, error: profilesError } = await profilesQuery;

      if (profilesError) throw profilesError;

      setProfiles((profilesData || []) as Profile[]);

      // Fetch all user roles
      const { data: rolesData, error: rolesError } = await supabase
        .from("user_roles")
        .select("*");

      if (rolesError) throw rolesError;

      setUserRoles(rolesData || []);

      // Set up real-time subscriptions
      const profilesChannel = supabase
        .channel('admin-profiles-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
          fetchData();
        })
        .subscribe();

      const rolesChannel = supabase
        .channel('admin-roles-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_roles' }, () => {
          fetchData();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(profilesChannel);
        supabase.removeChannel(rolesChannel);
      };
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error(t('admin.errorFetchingData'));
    } finally {
      setLoadingData(false);
    }
  };

  const copyRegistrationCode = () => {
    if (registrationCode) {
      navigator.clipboard.writeText(registrationCode);
      toast.success(t('admin.codeCopied'));
    }
  };

  const approveUser = async (userId: string) => {
    // Prevent double clicks
    if (approvingUsers.has(userId)) {
      return;
    }

    setApprovingUsers(prev => new Set(prev).add(userId));

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          approved: true,
          approved_at: new Date().toISOString(),
          approved_by: user?.id,
        } as any)
        .eq("id", userId);

      if (error) throw error;

      // Get user details and send approval email
      const profile = profiles.find(p => p.id === userId);
      if (profile?.email) {
        // Get company name
        const { data: company } = await supabase
          .from("companies")
          .select("navn")
          .eq("id", companyId)
          .single();

        if (company) {
          // Send approval email via edge function
          await supabase.functions.invoke('send-user-approved-email', {
            body: {
              user_id: userId,
              user_name: profile.full_name || "Bruker",
              user_email: profile.email,
              company_name: company.navn,
              company_id: companyId
            }
          });
        }
      }

      toast.success(t('admin.userApproved'));
      fetchData();
    } catch (error) {
      console.error("Error approving user:", error);
      toast.error(t('admin.errorApprovingUser'));
    } finally {
      setApprovingUsers(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  };

  const assignRole = async (userId: string, role: string) => {
    // Prevent non-superadmins from assigning superadmin role to themselves
    if (role === 'superadmin' && userId === user?.id && !isSuperAdmin) {
      toast.error(t('admin.cannotAssignSuperadminToSelf'));
      return;
    }

    try {
      // Get existing role for the user
      const existingRole = userRoles.find((r) => r.user_id === userId);

      if (existingRole) {
        // Update existing role
        const { error } = await supabase
          .from("user_roles")
          .update({ role: role as any })
          .eq("user_id", userId);

        if (error) throw error;
        toast.success(t('admin.roleUpdated'));
      } else {
        // Insert new role
        const { error } = await supabase
          .from("user_roles")
          .insert([{ user_id: userId, role: role as any }]);

        if (error) throw error;
        toast.success(t('admin.roleAssigned'));
      }

      fetchData();
    } catch (error) {
      console.error("Error assigning role:", error);
      toast.error(t('admin.errorAssigningRole'));
    }
  };

  const removeRole = async (roleId: string) => {
    try {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("id", roleId);

      if (error) throw error;

      toast.success(t('admin.roleRemoved'));
      fetchData();
    } catch (error) {
      console.error("Error removing role:", error);
      toast.error(t('admin.errorRemovingRole'));
    }
  };

  const deleteUser = async (userId: string, userName: string | null) => {
    if (!confirm(t('admin.confirmDeleteUser', { name: userName || t('common.notSpecified') }))) {
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("admin-delete-user", {
        body: { user_id: userId },
      });

      if (error) throw error;
      if (!data?.success) throw new Error("Delete failed");

      toast.success(t('admin.userDeleted'));
      fetchData();
    } catch (error) {
      console.error("Error deleting user:", error);
      toast.error(t('admin.errorDeletingUser'));
    }
  };

  const getUserRoles = (userId: string) => {
    return userRoles.filter((r) => r.user_id === userId);
  };

  const getRoleLabel = (role: string) => {
    const found = availableRoles.find((r) => r.value === role);
    return found ? t(found.labelKey) : role;
  };

  const toggleApprover = async (userId: string, currentValue: boolean) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ can_approve_missions: !currentValue } as any)
        .eq("id", userId);

      if (error) throw error;

      setProfiles(prev => prev.map(p => 
        p.id === userId ? { ...p, can_approve_missions: !currentValue } : p
      ));
      toast.success(!currentValue ? 'Bruker kan nå godkjenne oppdrag' : 'Godkjenningsrettighet fjernet');
    } catch (error) {
      console.error("Error toggling approver:", error);
      toast.error("Kunne ikke oppdatere innstilling");
    }
  };

  if (loading || loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <img 
            src="/avisafe-logo-text.png" 
            alt="AviSafe" 
            className="h-20 w-auto mx-auto mb-4 animate-pulse" 
          />
          <p className="text-lg">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const pendingUsers = profiles.filter((p) => !p.approved);
  const approvedUsers = profiles.filter((p) => p.approved);

  return (
    <div className="min-h-screen bg-background w-full overflow-x-hidden">
      <header className="bg-card/20 backdrop-blur-md border-b border-glass sticky top-0 pt-[env(safe-area-inset-top)] z-50 w-full">
        <div className="w-full px-3 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center justify-between gap-1 sm:gap-2 min-w-0">
            <Button 
              variant="ghost" 
              className="flex items-center gap-1 sm:gap-2 lg:gap-3 hover:bg-transparent p-0 flex-shrink-0"
              onClick={() => navigate("/")}
            >
              <Shield className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 text-primary" />
              <div className="text-left">
                <h1 className="text-sm sm:text-base lg:text-xl xl:text-2xl font-bold whitespace-nowrap">{t('admin.title')}</h1>
                <p className="text-xs lg:text-sm text-primary hidden lg:block">{t('admin.userApproval')}</p>
              </div>
            </Button>
            <nav className="flex items-center justify-end gap-0.5 sm:gap-2 lg:gap-4 flex-1 min-w-0 flex-wrap overflow-visible">
              {/* Mobile Navigation - Hamburger Menu (placed next to Back) */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild className="md:hidden">
                  <Button variant="ghost" size="sm" className="h-7 w-7 min-w-7 p-0">
                    <Menu className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-card/95 backdrop-blur-md border-glass z-50">
                  <DropdownMenuItem onClick={() => navigate("/kart")}>{t('nav.map')}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/dokumenter")}>{t('nav.documents')}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/kalender")}>{t('nav.calendar')}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/hendelser")}>{t('nav.incidents')}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/status")}>{t('nav.status')}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/ressurser")}>{t('nav.resources')}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/")}
                className="h-7 px-2 text-xs sm:h-8 sm:px-3 sm:text-sm"
              >
                {t('actions.back')}
              </Button>
              <ProfileDialog />
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await signOut();
                  toast.success(t('header.loggedOut'));
                  navigate("/auth");
                }}
                title={t('actions.signOut')}
                className="h-7 w-7 min-w-7 p-0 sm:h-8 sm:w-8"
              >
                <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </Button>
            </nav>
          </div>
        </div>
      </header>

      <main className="w-full px-2 sm:px-4 py-4 sm:py-8">
        <Tabs defaultValue="users" className="w-full">
          <TabsList className="grid grid-cols-2 sm:inline-flex h-auto sm:h-10 w-full sm:w-auto max-w-md sm:max-w-none mx-auto relative z-10 gap-1 p-1.5 bg-secondary rounded-xl">
            <TabsTrigger value="users" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-lg transition-colors">
              <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
              <span>{t('admin.users')}</span>
            </TabsTrigger>
            <TabsTrigger value="customers" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-lg transition-colors">
              <UserCog className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
              <span>{t('admin.customers')}</span>
            </TabsTrigger>
            <TabsTrigger value="email-templates" className={`flex items-center justify-center gap-1.5 text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-lg transition-colors ${!isSuperAdmin ? 'col-span-2' : ''}`}>
              <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
              <span>{isMobile ? 'E-post' : t('admin.emailTemplates')}</span>
            </TabsTrigger>
            {isSuperAdmin && (
              <TabsTrigger value="companies" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-lg transition-colors">
                <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                <span>{t('admin.companies')}</span>
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="users" className="mt-4 sm:mt-8">
            <div className="space-y-4 sm:space-y-6">
              {/* Registration Code Card */}
              {registrationCode && (
                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader className="pb-3 sm:pb-4">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <Key className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                      {t('admin.registrationCode')}
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      {t('admin.registrationCodeDesc')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 sm:px-6">
                    <div className="flex items-center gap-3 sm:gap-4">
                      <code className="text-xl sm:text-2xl font-mono font-bold bg-background px-4 py-2 rounded-md border tracking-widest">
                        {registrationCode}
                      </code>
                      <Button variant="outline" size="sm" onClick={copyRegistrationCode}>
                        <Copy className="w-4 h-4 mr-2" />
                        {t('admin.copy')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* OpenAIP Airspace Sync */}
              {isSuperAdmin && (
                <Card>
                  <CardHeader className="pb-3 sm:pb-4">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                      Synkroniser luftromsdata (OpenAIP)
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      Hent offisielle restriksjonsområder (P, R, D) fra OpenAIP og oppdater kartdataene.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 sm:px-6">
                    <Button
                      onClick={async () => {
                        setSyncingAirspaces(true);
                        try {
                          const { data, error } = await supabase.functions.invoke('sync-openaip-airspaces');
                          if (error) throw error;
                          toast.success(`Synkronisert ${data.synced} soner (${data.errors} feil av ${data.total_fetched} hentet)`);
                        } catch (err) {
                          console.error('Sync error:', err);
                          toast.error('Kunne ikke synkronisere luftromsdata');
                        } finally {
                          setSyncingAirspaces(false);
                        }
                      }}
                      disabled={syncingAirspaces}
                      variant="outline"
                    >
                      <RefreshCw className={`w-4 h-4 mr-2 ${syncingAirspaces ? 'animate-spin' : ''}`} />
                      {syncingAirspaces ? 'Synkroniserer...' : 'Synkroniser nå'}
                    </Button>
                  </CardContent>
                </Card>
              )}

              {isSuperAdmin && (
                <Card>
                  <CardHeader className="pb-3 sm:pb-6">
                    <CardTitle className="text-base sm:text-lg">Slett bruker via e-post</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      Dette sletter brukeren fra autentisering og rydder opp tilhørende data.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 sm:px-6">
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                      <Input
                        value={deleteEmail}
                        onChange={(e) => setDeleteEmail(e.target.value)}
                        placeholder="contact@hh-vr.com"
                        inputMode="email"
                        className="sm:max-w-sm"
                      />
                      <Button
                        variant="destructive"
                        disabled={deletingByEmail || !deleteEmail.trim()}
                        onClick={async () => {
                          const email = deleteEmail.trim();
                          if (!email) return;
                          if (!confirm(`Er du sikker på at du vil slette brukeren ${email}?`)) return;

                          try {
                            setDeletingByEmail(true);
                            const { data, error } = await supabase.functions.invoke("admin-delete-user", {
                              body: { email },
                            });
                            if (error) throw error;
                            if (!data?.success) throw new Error("Delete failed");

                            toast.success("Bruker slettet");
                            setDeleteEmail("");
                            fetchData();
                          } catch (err) {
                            console.error("Error deleting user by email:", err);
                            toast.error("Kunne ikke slette bruker");
                          } finally {
                            setDeletingByEmail(false);
                          }
                        }}
                      >
                        {deletingByEmail ? "Sletter..." : "Slett"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Pending Users */}
              {pendingUsers.length > 0 && (
                <Card>
                  <CardHeader className="pb-3 sm:pb-6">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <UserCog className="w-4 h-4 sm:w-5 sm:h-5" />
                      {t('admin.pendingApprovals')} ({pendingUsers.length})
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      {t('admin.usersWaitingApproval')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-2 sm:px-6">
                    <div className="space-y-2">
                      {pendingUsers.map((profile) => (
                        <div 
                          key={profile.id}
                          className="flex items-center justify-between gap-2 sm:gap-4 p-3 sm:p-4 rounded-lg border border-border bg-card hover:bg-accent/5 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm sm:text-base truncate">
                              {profile.full_name || t('common.notSpecified')}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="truncate">{profile.email || t('admin.noEmail')}</span>
                              <span>•</span>
                              <span>{new Date(profile.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              onClick={() => approveUser(profile.id)}
                              disabled={approvingUsers.has(profile.id)}
                              className="h-9 sm:h-10"
                            >
                              <Check className="w-4 h-4 mr-1 sm:mr-2" />
                              <span className="hidden sm:inline">{approvingUsers.has(profile.id) ? t('admin.approving') : t('admin.approve')}</span>
                              <span className="sm:hidden">{t('common.ok')}</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteUser(profile.id, profile.full_name)}
                              className="h-9 sm:h-10 px-2 sm:px-3 text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Approved Users */}
              <Card>
                <CardHeader className="pb-3 sm:pb-6">
                  <CardTitle className="text-base sm:text-lg">{t('admin.approvedUsers')} ({approvedUsers.length})</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    {t('admin.manageRoles')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-2 sm:px-6">
                  <div className="space-y-2">
                    {approvedUsers.map((profile) => {
                      const userRole = userRoles.find((r) => r.user_id === profile.id);
                      return (
                        <div 
                          key={profile.id}
                          className="flex items-center justify-between gap-2 sm:gap-4 p-3 sm:p-4 rounded-lg border border-border bg-card hover:bg-accent/5 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            {isMobile ? (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="text-left w-full group">
                                    <p className="font-medium text-sm truncate group-hover:text-primary transition-colors flex items-center gap-1">
                                      {profile.full_name || t('common.notSpecified')}
                                      <ChevronRight className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {profile.email || t('admin.noEmail')}
                                    </p>
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-64 p-3 space-y-3" align="start">
                                  <div>
                                    <p className="font-medium text-sm">{profile.full_name || t('common.notSpecified')}</p>
                                    <p className="text-xs text-muted-foreground">{profile.email || t('admin.noEmail')}</p>
                                  </div>
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs text-muted-foreground">Kan godkjenne oppdrag</span>
                                      <Switch
                                        checked={profile.can_approve_missions === true}
                                        onCheckedChange={() => toggleApprover(profile.id, profile.can_approve_missions === true)}
                                        className="scale-75"
                                      />
                                    </div>
                                    <div>
                                      <span className="text-xs text-muted-foreground block mb-1">{t('admin.selectRole')}</span>
                                      <Select 
                                        value={userRole?.role || ""} 
                                        onValueChange={(value) => assignRole(profile.id, value)}
                                      >
                                        <SelectTrigger className="w-full h-9">
                                          <SelectValue placeholder={t('admin.selectRole')} />
                                        </SelectTrigger>
                                        <SelectContent className="z-[1300]">
                                          {availableRoles.map((role) => (
                                            <SelectItem key={role.value} value={role.value}>
                                              {t(role.labelKey)}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => deleteUser(profile.id, profile.full_name)}
                                      className="w-full h-9 text-destructive hover:text-destructive hover:bg-destructive/10 justify-start"
                                    >
                                      <Trash2 className="w-4 h-4 mr-2" />
                                      {t('admin.deleteUser')}
                                    </Button>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            ) : (
                              <>
                                <p className="font-medium text-sm sm:text-base truncate">
                                  {profile.full_name || t('common.notSpecified')}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {profile.email || t('admin.noEmail')}
                                </p>
                              </>
                            )}
                          </div>
                          
                          {!isMobile && (
                            <div className="flex items-center gap-2">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center">
                                      <Switch
                                        checked={profile.can_approve_missions === true}
                                        onCheckedChange={() => toggleApprover(profile.id, profile.can_approve_missions === true)}
                                        className="scale-75"
                                      />
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Kan godkjenne oppdrag</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <Select 
                                value={userRole?.role || ""} 
                                onValueChange={(value) => assignRole(profile.id, value)}
                              >
                                <SelectTrigger className="w-[140px] h-10">
                                  <SelectValue placeholder={t('admin.selectRole')} />
                                </SelectTrigger>
                                <SelectContent className="z-50">
                                  {availableRoles.map((role) => (
                                    <SelectItem key={role.value} value={role.value}>
                                      {t(role.labelKey)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => deleteUser(profile.id, profile.full_name)}
                                className="h-10 px-3 text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="customers" className="mt-4 sm:mt-8">
            <CustomerManagementSection />
          </TabsContent>

          <TabsContent value="email-templates" className="mt-4 sm:mt-8">
            <EmailTemplateEditor onOpenEmailSettings={() => setEmailSettingsOpen(true)} />
            <BulkEmailSender />
          </TabsContent>

          {isSuperAdmin && (
            <TabsContent value="companies" className="mt-4 sm:mt-8">
              <CompanyManagementSection />
            </TabsContent>
          )}
        </Tabs>
      </main>

      <EmailSettingsDialog 
        open={emailSettingsOpen}
        onOpenChange={setEmailSettingsOpen}
      />
    </div>
  );
};

export default Admin;

