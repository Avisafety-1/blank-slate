import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Shield, LogOut, Trash2, Check, X, Menu, Settings, UserCog, Users, Building2, Mail, Key, Copy, ShieldCheck, ChevronRight, RefreshCw, MapPin, Calculator, Radio, Send, AlertTriangle } from "lucide-react";
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
import { ChildCompaniesSection } from "@/components/admin/ChildCompaniesSection";
import { CompanySoraConfigSection } from "@/components/admin/CompanySoraConfigSection";
import { EmailTemplateEditor } from "@/components/admin/EmailTemplateEditor";
import { EmailSettingsDialog } from "@/components/admin/EmailSettingsDialog";
import { BulkEmailSenderWithHistory } from "@/components/admin/BulkEmailSender";
import { RevenueCalculator } from "@/components/admin/RevenueCalculator";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTranslation } from "react-i18next";
import { usePlanGating } from "@/hooks/usePlanGating";
import { PLANS, ADDONS } from "@/config/subscriptionPlans";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  can_access_eccairs?: boolean;
  can_be_incident_responsible?: boolean;
  company_id?: string | null;
  companies?: { navn: string } | null;
}

interface ChildCompanyOption {
  id: string;
  navn: string;
  registration_code: string;
}

interface UserRole {
  id: string;
  user_id: string;
  role: string;
}

const availableRoles = [
  { value: "superadmin", labelKey: "roles.superadmin", superadminOnly: true },
  { value: "administrator", labelKey: "roles.administrator" },
  { value: "bruker", labelKey: "roles.bruker" },
];

const Admin = () => {
  const { user, loading, companyId, companyName, isSuperAdmin, signOut } = useAuth();
  const { canAccess, hasAddon, currentPlan, seatCount, bypass } = usePlanGating();
  const { subscriptionAddons } = useAuth();
  const canManageRoles = canAccess('access_control');
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
  const [eccairsEnabled, setEccairsEnabled] = useState(false);
  const [isChildCompany, setIsChildCompany] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);
  const [showEmailList, setShowEmailList] = useState(false);
  const [pendingApproveUserId, setPendingApproveUserId] = useState<string | null>(null);
  const [childCompanies, setChildCompanies] = useState<ChildCompanyOption[]>([]);
  const [inviteDepartment, setInviteDepartment] = useState<string>("parent");

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
      // Check both 'administrator' and legacy 'admin' roles
      const [adminResult, legacyResult] = await Promise.all([
        supabase.rpc('has_role', { _user_id: user?.id, _role: 'administrator' }),
        supabase.rpc('has_role', { _user_id: user?.id, _role: 'admin' }),
      ]);

      if (adminResult.error && legacyResult.error) throw adminResult.error;

      if (adminResult.data || legacyResult.data) {
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
      // Fetch company registration code and eccairs_enabled
      if (companyId) {
        const { data: companyData } = await supabase
          .from("companies")
          .select("registration_code, eccairs_enabled, parent_company_id")
          .eq("id", companyId)
          .single();
        
        if (companyData) {
          setRegistrationCode(companyData.registration_code);
          setEccairsEnabled(companyData.eccairs_enabled === true);
          setIsChildCompany(!!companyData.parent_company_id);
        }
      }

      // Fetch child companies for parent company admins
      let childIds: string[] = [];
      if (companyId && !isChildCompany) {
        const { data: childData } = await supabase
          .from("companies")
          .select("id, navn, registration_code")
          .eq("parent_company_id", companyId)
          .order("navn");
        
        if (childData && childData.length > 0) {
          setChildCompanies(childData);
          childIds = childData.map(c => c.id);
        } else {
          setChildCompanies([]);
        }
      }

      // Fetch profiles - include child companies for parent admin
      let profilesQuery = supabase
        .from("profiles")
        .select("*, companies(navn)")
        .order("created_at", { ascending: false });
      
      if (companyId) {
        if (childIds.length > 0) {
          profilesQuery = profilesQuery.in('company_id', [companyId, ...childIds]);
        } else {
          profilesQuery = profilesQuery.eq('company_id', companyId);
        }
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

      // Sync seat count to Stripe
      supabase.functions.invoke('update-seats', {
        body: { company_id: companyId }
      }).catch(err => console.error('Seat sync error:', err));

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

      if (error) {
        console.error("Edge function invoke error:", error);
        throw error;
      }
      if (!data?.success) {
        const detail = data?.error || data?.detail || "Delete failed";
        console.error("admin-delete-user returned failure:", data);
        throw new Error(detail);
      }

      toast.success(t('admin.userDeleted'));
      if (data?.warnings?.length) {
        console.warn("Delete warnings:", data.warnings);
      }
      // Sync seat count to Stripe
      supabase.functions.invoke('update-seats', {
        body: { company_id: companyId }
      }).catch(err => console.error('Seat sync error:', err));
      fetchData();
    } catch (error: any) {
      console.error("Error deleting user:", error);
      const msg = error?.message || t('admin.errorDeletingUser');
      toast.error(`${t('admin.errorDeletingUser')}: ${msg}`);
    }
  };

  const getUserRoles = (userId: string) => {
    return userRoles.filter((r) => r.user_id === userId);
  };

  const getRoleLabel = (role: string) => {
    // Map legacy 'admin' to 'administrator' for display
    const normalizedRole = role === 'admin' ? 'administrator' : role;
    const found = availableRoles.find((r) => r.value === normalizedRole);
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

  const toggleEccairs = async (userId: string, currentValue: boolean) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ can_access_eccairs: !currentValue } as any)
        .eq("id", userId);

      if (error) throw error;

      setProfiles(prev => prev.map(p => 
        p.id === userId ? { ...p, can_access_eccairs: !currentValue } : p
      ));
      toast.success(!currentValue ? 'ECCAIRS-tilgang aktivert' : 'ECCAIRS-tilgang fjernet');
    } catch (error) {
      console.error("Error toggling ECCAIRS:", error);
      toast.error("Kunne ikke oppdatere innstilling");
    }
  };

  const toggleIncidentResponsible = async (userId: string, currentValue: boolean) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ can_be_incident_responsible: !currentValue } as any)
        .eq("id", userId);

      if (error) throw error;

      setProfiles(prev => prev.map(p => 
        p.id === userId ? { ...p, can_be_incident_responsible: !currentValue } : p
      ));
      toast.success(!currentValue ? 'Bruker kan nå være oppfølgingsansvarlig' : 'Oppfølgingsansvarlig-rettighet fjernet');
    } catch (error) {
      console.error("Error toggling incident responsible:", error);
      toast.error("Kunne ikke oppdatere innstilling");
    }
  };

  const changeDepartment = async (userId: string, newCompanyId: string) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ company_id: newCompanyId } as any)
        .eq("id", userId);

      if (error) throw error;

      const targetName = newCompanyId === companyId 
        ? (companyName || 'Hovedselskap') 
        : childCompanies.find(c => c.id === newCompanyId)?.navn || 'Avdeling';
      
      setProfiles(prev => prev.map(p => 
        p.id === userId ? { ...p, company_id: newCompanyId } : p
      ));
      toast.success(`Bruker flyttet til ${targetName}`);
    } catch (error) {
      console.error("Error changing department:", error);
      toast.error("Kunne ikke endre avdeling");
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

  // Helper to get department name for a profile
  const getDepartmentName = (profile: Profile) => {
    if (profile.company_id === companyId) return companyName || 'Hovedselskap';
    const child = childCompanies.find(c => c.id === profile.company_id);
    return child?.navn || (profile.companies as any)?.navn || '—';
  };

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
          <TabsList className="grid grid-cols-2 sm:inline-flex h-auto sm:h-10 w-full sm:w-auto max-w-md sm:max-w-none mx-auto relative z-10 gap-1 p-1.5 bg-secondary rounded-xl flex-wrap">
            <TabsTrigger value="users" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-lg transition-colors">
              <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
              <span>{t('admin.users')}</span>
            </TabsTrigger>
            <TabsTrigger value="customers" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-lg transition-colors">
              <UserCog className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
              <span>{t('admin.customers')}</span>
            </TabsTrigger>
            <TabsTrigger value="email-templates" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-lg transition-colors">
              <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
              <span>{isMobile ? 'E-post' : t('admin.emailTemplates')}</span>
            </TabsTrigger>
            {hasAddon('sora_admin') && (
              <TabsTrigger value="company-config" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-lg transition-colors">
                <Settings className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                <span className="max-w-[80px] sm:max-w-none truncate">SORA</span>
              </TabsTrigger>
            )}
            {isSuperAdmin && (
              <TabsTrigger value="companies" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-lg transition-colors">
                <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                <span>{t('admin.companies')}</span>
              </TabsTrigger>
            )}
            {!isSuperAdmin && !isChildCompany && (
              <TabsTrigger value="child-companies" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-lg transition-colors">
                <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                <span>Avdelinger</span>
              </TabsTrigger>
            )}
            {isSuperAdmin && companyName?.toLowerCase() === 'avisafe' && (
              <TabsTrigger value="calculator" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-lg transition-colors">
                <Calculator className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                <span>Kalkulator</span>
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


              {isSuperAdmin && (
                <Card>
                  <CardHeader className="pb-3 sm:pb-6">
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <Radio className="h-4 w-4" />
                      Tving oppdatering for alle brukere
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      Sender et signal til alle tilkoblede brukere om å oppdatere appen. Offline-brukere får oppdateringen når de kobler til igjen.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 sm:px-6">
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                      <Button
                        variant="default"
                        onClick={async () => {
                          if (!confirm('Dette vil vise en oppdateringsbanner for alle tilkoblede brukere. Fortsett?')) return;
                          try {
                            const channel = supabase.channel('global-force-reload');
                            await channel.send({
                              type: 'broadcast',
                              event: 'reload',
                              payload: { forceImmediate: false, timestamp: Date.now() },
                            });
                            // Bump the version in app_config for offline users
                            const { data: current } = await supabase
                              .from('app_config')
                              .select('value')
                              .eq('key', 'app_version')
                              .single();
                            const nextVersion = String(Number(current?.value || '0') + 1);
                            await supabase
                              .from('app_config')
                              .update({ value: nextVersion, updated_at: new Date().toISOString() })
                              .eq('key', 'app_version');
                            // Re-send broadcast with the version so clients can persist it
                            const ch2 = supabase.channel('global-force-reload');
                            await ch2.send({
                              type: 'broadcast',
                              event: 'reload',
                              payload: { forceImmediate: false, version: nextVersion, timestamp: Date.now() },
                            });
                            supabase.removeChannel(ch2);
                            toast.success(`Oppdateringssignal sendt til alle brukere (v${nextVersion})`);
                            supabase.removeChannel(channel);
                          } catch (err) {
                            console.error('Force reload error:', err);
                            toast.error('Kunne ikke sende oppdateringssignal');
                          }
                        }}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Send oppdateringssignal
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={async () => {
                          if (!confirm('ADVARSEL: Dette tvinger en umiddelbar reload for ALLE tilkoblede brukere. Ulagret arbeid kan gå tapt. Fortsett?')) return;
                          try {
                            const channel = supabase.channel('global-force-reload');
                            await channel.send({
                              type: 'broadcast',
                              event: 'reload',
                              payload: { forceImmediate: true, timestamp: Date.now() },
                            });
                            const { data: current } = await supabase
                              .from('app_config')
                              .select('value')
                              .eq('key', 'app_version')
                              .single();
                            const nextVersion = String(Number(current?.value || '0') + 1);
                            await supabase
                              .from('app_config')
                              .update({ value: nextVersion, updated_at: new Date().toISOString() })
                              .eq('key', 'app_version');
                            // Re-send with version included
                            const ch2 = supabase.channel('global-force-reload');
                            await ch2.send({
                              type: 'broadcast',
                              event: 'reload',
                              payload: { forceImmediate: true, version: nextVersion, timestamp: Date.now() },
                            });
                            supabase.removeChannel(ch2);
                            toast.success('Tvungen oppdatering sendt!');
                            supabase.removeChannel(channel);
                          } catch (err) {
                            console.error('Force immediate reload error:', err);
                            toast.error('Kunne ikke sende tvunget oppdatering');
                          }
                        }}
                      >
                        ⚠️ Tving umiddelbart
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-3 sm:pb-6">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Send className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                    Inviter ny bruker via e-post
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Send en invitasjons-e-post med registreringskode og instruksjoner for å opprette konto.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-4 sm:px-6">
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center flex-1">
                      <Input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="ny.bruker@eksempel.no"
                        inputMode="email"
                        className="sm:max-w-sm"
                      />
                      {!isChildCompany && childCompanies.length > 0 && (
                        <Select value={inviteDepartment} onValueChange={setInviteDepartment}>
                          <SelectTrigger className="w-full sm:w-[200px]">
                            <SelectValue placeholder="Velg avdeling" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="parent">{companyName || 'Hovedselskap'}</SelectItem>
                            {childCompanies.map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.navn}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    <Button
                      disabled={sendingInvite || !inviteEmail.trim()}
                      onClick={async () => {
                        const email = inviteEmail.trim();
                        if (!email) return;

                        // Determine which registration code and company name to use
                        const selectedChild = childCompanies.find(c => c.id === inviteDepartment);
                        const inviteRegCode = selectedChild ? selectedChild.registration_code : registrationCode;
                        const inviteCompanyName = selectedChild ? selectedChild.navn : (companyName || 'AviSafe');

                        try {
                          setSendingInvite(true);
                          const { data, error } = await supabase.functions.invoke("invite-user", {
                            body: { email, companyName: inviteCompanyName, registrationCode: inviteRegCode },
                          });
                          if (error) throw error;

                          toast.success(`Invitasjon sendt til ${email}${selectedChild ? ` (${selectedChild.navn})` : ''}`);
                          setInviteEmail("");
                        } catch (err) {
                          console.error("Error sending invite:", err);
                          toast.error("Kunne ikke sende invitasjon");
                        } finally {
                          setSendingInvite(false);
                        }
                      }}
                    >
                      <Send className="w-4 h-4 mr-2" />
                      {sendingInvite ? "Sender..." : "Send invitasjon"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

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
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm sm:text-base truncate">
                                {profile.full_name || t('common.notSpecified')}
                              </p>
                              {!isChildCompany && profile.company_id !== companyId && profile.companies && (
                                <Badge variant="outline" className="text-xs flex-shrink-0">
                                  {(profile.companies as any).navn}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="truncate">{profile.email || t('admin.noEmail')}</span>
                              <span>•</span>
                              <span>{new Date(profile.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              onClick={() => bypass ? approveUser(profile.id) : setPendingApproveUserId(profile.id)}
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
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle className="text-base sm:text-lg">{t('admin.approvedUsers')} ({approvedUsers.length})</CardTitle>
                      <CardDescription className="text-xs sm:text-sm">
                        {t('admin.manageRoles')}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowEmailList(prev => !prev)}
                      >
                        <Mail className="w-4 h-4 mr-1.5" />
                        {showEmailList ? 'Skjul mailliste' : 'Vis mailliste'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const emails = approvedUsers
                            .map(p => p.email)
                            .filter(Boolean) as string[];
                          if (emails.length === 0) {
                            toast.error('Ingen e-postadresser funnet');
                            return;
                          }
                          navigator.clipboard.writeText(emails.join(', '));
                          toast.success(`${emails.length} e-postadresser kopiert`);
                        }}
                      >
                        <Copy className="w-4 h-4 mr-1.5" />
                        Kopier mailliste
                      </Button>
                    </div>
                  </div>
                  {showEmailList && (
                    <div className="mt-3">
                      <textarea
                        readOnly
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono min-h-[80px] max-h-[200px] resize-y"
                        value={approvedUsers
                          .map(p => p.email)
                          .filter(Boolean)
                          .join('\n')}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        {approvedUsers.filter(p => p.email).length} e-postadresser
                      </p>
                    </div>
                  )}
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
                                        disabled={!canManageRoles}
                                      />
                                    </div>
                                    {eccairsEnabled && (
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs text-muted-foreground">ECCAIRS-tilgang</span>
                                        <Switch
                                          checked={profile.can_access_eccairs === true}
                                          onCheckedChange={() => toggleEccairs(profile.id, profile.can_access_eccairs === true)}
                                          className="scale-75"
                                          disabled={!canManageRoles}
                                        />
                                      </div>
                                    )}
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs text-muted-foreground">Oppfølgingsansvarlig (hendelser)</span>
                                      <Switch
                                        checked={profile.can_be_incident_responsible === true}
                                        onCheckedChange={() => toggleIncidentResponsible(profile.id, profile.can_be_incident_responsible === true)}
                                        className="scale-75"
                                        disabled={!canManageRoles}
                                      />
                                    </div>
                                    <div>
                                      <span className="text-xs text-muted-foreground block mb-1">{t('admin.selectRole')}</span>
                                      {canManageRoles ? (
                                        <Select 
                                          value={userRole?.role || ""} 
                                          onValueChange={(value) => assignRole(profile.id, value)}
                                        >
                                          <SelectTrigger className="w-full h-9">
                                            <SelectValue placeholder={t('admin.selectRole')} />
                                          </SelectTrigger>
                                          <SelectContent className="z-[1300]">
                                            {availableRoles.filter(role => !role.superadminOnly || isSuperAdmin).map((role) => (
                                              <SelectItem key={role.value} value={role.value}>
                                                {t(role.labelKey)}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      ) : (
                                        <Badge variant="outline" className="text-xs">{userRole?.role ? t(`admin.role_${userRole.role}`, userRole.role) : t('admin.selectRole')}</Badge>
                                      )}
                                    </div>
                                    {!canManageRoles && (
                                      <p className="text-xs text-muted-foreground italic">Rolle- og tilgangsstyring krever Professional-planen</p>
                                    )}
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
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-sm sm:text-base truncate">
                                    {profile.full_name || t('common.notSpecified')}
                                  </p>
                                  {!isChildCompany && childCompanies.length > 0 && (
                                    <Badge variant="outline" className="text-xs flex-shrink-0">
                                      {getDepartmentName(profile)}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground truncate">
                                  {profile.email || t('admin.noEmail')}
                                </p>
                              </>
                            )}
                          </div>
                          
                          {!isMobile && (
                            <div className="flex items-center gap-2 flex-wrap justify-end">
                              <div className="flex items-center gap-1.5 border border-border rounded-md px-2 py-1">
                                <Switch
                                  checked={profile.can_approve_missions === true}
                                  onCheckedChange={() => toggleApprover(profile.id, profile.can_approve_missions === true)}
                                  className="scale-75"
                                  disabled={!canManageRoles}
                                />
                                <span className="text-xs text-muted-foreground whitespace-nowrap">Godkjenner for oppdrag</span>
                              </div>
                              {eccairsEnabled && (
                                <div className="flex items-center gap-1.5 border border-border rounded-md px-2 py-1">
                                  <Switch
                                    checked={profile.can_access_eccairs === true}
                                    onCheckedChange={() => toggleEccairs(profile.id, profile.can_access_eccairs === true)}
                                    className="scale-75"
                                    disabled={!canManageRoles}
                                  />
                                  <span className="text-xs text-muted-foreground whitespace-nowrap">ECCAIRS-tilgang</span>
                                </div>
                              )}
                              <div className="flex items-center gap-1.5 border border-border rounded-md px-2 py-1">
                                <Switch
                                  checked={profile.can_be_incident_responsible === true}
                                  onCheckedChange={() => toggleIncidentResponsible(profile.id, profile.can_be_incident_responsible === true)}
                                  className="scale-75"
                                  disabled={!canManageRoles}
                                />
                                <span className="text-xs text-muted-foreground whitespace-nowrap">Oppfølgingsansvarlig</span>
                              </div>
                              {!isChildCompany && childCompanies.length > 0 && (
                                <Select 
                                  value={profile.company_id || companyId || ""} 
                                  onValueChange={(value) => changeDepartment(profile.id, value)}
                                >
                                  <SelectTrigger className="w-[160px] h-10">
                                    <SelectValue placeholder="Avdeling" />
                                  </SelectTrigger>
                                  <SelectContent className="z-50">
                                    <SelectItem value={companyId || ""}>{companyName || 'Hovedselskap'}</SelectItem>
                                    {childCompanies.map((c) => (
                                      <SelectItem key={c.id} value={c.id}>{c.navn}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                              {canManageRoles ? (
                                <Select 
                                  value={userRole?.role || ""} 
                                  onValueChange={(value) => assignRole(profile.id, value)}
                                >
                                  <SelectTrigger className="w-[140px] h-10">
                                    <SelectValue placeholder={t('admin.selectRole')} />
                                  </SelectTrigger>
                                  <SelectContent className="z-50">
                                    {availableRoles.filter(role => !role.superadminOnly || isSuperAdmin).map((role) => (
                                      <SelectItem key={role.value} value={role.value}>
                                        {t(role.labelKey)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="outline" className="text-xs cursor-help">{userRole?.role ? t(`admin.role_${userRole.role}`, userRole.role) : '—'}</Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>Rolle- og tilgangsstyring krever Professional</TooltipContent>
                                </Tooltip>
                              )}
                              
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
            <BulkEmailSenderWithHistory />
          </TabsContent>

          {hasAddon('sora_admin') && (
            <TabsContent value="company-config" className="mt-4 sm:mt-8">
              <div className="mb-4">
                <h2 className="text-lg font-semibold">{companyName || "Selskapet"} — SORA-innstillinger</h2>
                <p className="text-sm text-muted-foreground">Konfigurer selskapsspesifikke grenser og krav for AI-risikovurdering</p>
              </div>
              <CompanySoraConfigSection />
            </TabsContent>
          )}

          {isSuperAdmin && (
            <TabsContent value="companies" className="mt-4 sm:mt-8">
              <CompanyManagementSection />
            </TabsContent>
          )}

          {!isSuperAdmin && !isChildCompany && (
            <TabsContent value="child-companies" className="mt-4 sm:mt-8">
              <ChildCompaniesSection />
            </TabsContent>
          )}

          {isSuperAdmin && companyName?.toLowerCase() === 'avisafe' && (
            <TabsContent value="calculator" className="mt-4 sm:mt-8">
              <RevenueCalculator />
            </TabsContent>
          )}
        </Tabs>
      </main>

      <EmailSettingsDialog 
        open={emailSettingsOpen}
        onOpenChange={setEmailSettingsOpen}
      />

      {/* Seat cost confirmation dialog */}
      {(() => {
        const pendingProfile = pendingApproveUserId ? profiles.find(p => p.id === pendingApproveUserId) : null;
        const newSeatCount = seatCount + 1;
        const seatCost = currentPlan.price;
        const addonCost = subscriptionAddons.reduce((sum, addonId) => {
          const addon = ADDONS.find(a => a.id === addonId);
          return sum + (addon?.price ?? 0);
        }, 0);
        const newMonthlyCost = seatCost * newSeatCount + addonCost;

        return (
          <AlertDialog open={!!pendingApproveUserId} onOpenChange={(open) => { if (!open) setPendingApproveUserId(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  Godkjenn bruker – ekstra kostnad
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <p>
                      Du godkjenner <span className="font-medium text-foreground">{pendingProfile?.full_name || pendingProfile?.email || 'bruker'}</span>.
                    </p>
                    <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-1.5">
                      <div className="flex justify-between">
                        <span>Plan</span>
                        <span className="font-medium text-foreground">{currentPlan.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Pris per bruker</span>
                        <span className="font-medium text-foreground">{seatCost} kr/mnd</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Brukere nå → etter</span>
                        <span className="font-medium text-foreground">{seatCount} → {newSeatCount}</span>
                      </div>
                      {addonCost > 0 && (
                        <div className="flex justify-between">
                          <span>Tilleggsmoduler</span>
                          <span className="font-medium text-foreground">+{addonCost} kr/mnd</span>
                        </div>
                      )}
                      <div className="border-t border-border pt-1.5 flex justify-between font-medium text-foreground">
                        <span>Ny månedskostnad</span>
                        <span>{newMonthlyCost} kr/mnd</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Stripe proraterer automatisk – du betaler kun for gjenstående dager denne måneden.
                    </p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Avbryt</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    if (pendingApproveUserId) {
                      approveUser(pendingApproveUserId);
                    }
                    setPendingApproveUserId(null);
                  }}
                >
                  Godkjenn og betal
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      })()}
    </div>
  );
};

export default Admin;

