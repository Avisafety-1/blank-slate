import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { createUniqueChannel } from "@/lib/realtimeChannel";
import { Shield, LogOut, Trash2, Check, X, Menu, Settings, UserCog, Users, Building2, Mail, Key, Copy, ShieldCheck, ChevronRight, RefreshCw, MapPin, Calculator, Radio, Send, AlertTriangle, GraduationCap, Rss } from "lucide-react";
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
import { NotamRssFeedsSection } from "@/components/admin/NotamRssFeedsSection";
import { EmailTemplateEditor } from "@/components/admin/EmailTemplateEditor";
import { EmailSettingsDialog } from "@/components/admin/EmailSettingsDialog";
import { BulkEmailSenderWithHistory } from "@/components/admin/BulkEmailSender";
import { RevenueCalculator } from "@/components/admin/RevenueCalculator";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DepartmentChecklist } from "@/components/admin/DepartmentChecklist";
import { TrainingSection } from "@/components/admin/TrainingSection";
import { SearchablePersonSelect } from "@/components/SearchablePersonSelect";
import { TrainingModulePicker } from "@/components/training/TrainingModulePicker";
import { normalizeTrainingModules, type TrainingModuleKey } from "@/config/trainingModules";
import { useTranslation } from "react-i18next";
import { usePlanGating } from "@/hooks/usePlanGating";
import { PLANS, ADDONS } from "@/config/subscriptionPlans";
import { invokeEmailFunction } from "@/lib/emailInvoke";
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
  approval_company_ids?: string[] | null;
  incident_responsible_company_ids?: string[] | null;
  company_id?: string | null;
  companies?: { navn: string } | null;
  is_technical_responsible?: boolean;
  under_training?: boolean;
  training_module_access?: TrainingModuleKey[] | null;
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

type UnlockedModuleAccess = Record<string, TrainingModuleKey[]>;

// Superadmin er bevisst utelatt — kan ikke tildeles via UI
const availableRoles = [
  { value: "administrator", labelKey: "roles.administrator" },
  { value: "bruker", labelKey: "roles.bruker" },
];

const Admin = () => {
  const { user, loading, companyId, companyName, isSuperAdmin, isAdmin, signOut, departmentsEnabled, ensureValidToken, refetchUserInfo } = useAuth();
  const { canAccess, hasAddon, currentPlan, seatCount, bypass } = usePlanGating();
  const { subscriptionAddons } = useAuth();
  const canManageRoles = canAccess('access_control');
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [isCompactAdmin, setIsCompactAdmin] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1439px)');
    const update = () => setIsCompactAdmin(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [courseUnlockedModules, setCourseUnlockedModules] = useState<UnlockedModuleAccess>({});
  const [userSearchQuery, setUserSearchQuery] = useState("");
  
  const [loadingData, setLoadingData] = useState(true);
  const [emailSettingsOpen, setEmailSettingsOpen] = useState(false);
  const [approvingUsers, setApprovingUsers] = useState<Set<string>>(new Set());
  const [registrationCode, setRegistrationCode] = useState<string | null>(null);
  const [eccairsEnabled, setEccairsEnabled] = useState(false);
  const [isChildCompany, setIsChildCompany] = useState(false);

  const [activeTab, setActiveTab] = useState<string>("users");

  // Allow guided tour (and other modules) to switch admin tab via custom event
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { value?: string } | undefined;
      if (detail?.value) setActiveTab(detail.value);
    };
    window.addEventListener("avisafe:set-admin-tab", handler as EventListener);
    return () => window.removeEventListener("avisafe:set-admin-tab", handler as EventListener);
  }, []);

  const [inviteEmail, setInviteEmail] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);
  const [showEmailList, setShowEmailList] = useState(false);
  const [pendingApproveUserId, setPendingApproveUserId] = useState<string | null>(null);
  const [childCompanies, setChildCompanies] = useState<ChildCompanyOption[]>([]);
  const [inviteDepartment, setInviteDepartment] = useState<string>("parent");
  const [crossCompanyPending, setCrossCompanyPending] = useState<Profile[]>([]);

  const isAvisafeSuperadmin = isSuperAdmin && (companyName || '').toLowerCase() === 'avisafe';

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!loading && user && !isAdmin && !isSuperAdmin) {
      toast.error(t('admin.noAccessPage'));
      navigate("/");
    }
  }, [user, loading, isAdmin, isSuperAdmin]);

  // Fetch data when admin access is confirmed or companyId changes
  useEffect(() => {
    if ((isAdmin || isSuperAdmin) && companyId !== undefined) {
      fetchData();
    }
  }, [isAdmin, isSuperAdmin, companyId]);

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

      const loadedProfiles = (profilesData || []) as Profile[];
      setProfiles(loadedProfiles);

      const approvedProfileIds = loadedProfiles.filter((p) => p.approved).map((p) => p.id);
      if (approvedProfileIds.length > 0) {
        const { data: passedAssignments } = await supabase
          .from("training_assignments")
          .select("profile_id, training_courses(unlocks_modules)")
          .in("profile_id", approvedProfileIds)
          .eq("passed", true);

        const unlockedByProfile = (passedAssignments || []).reduce<UnlockedModuleAccess>((acc, assignment: any) => {
          acc[assignment.profile_id] = normalizeTrainingModules([
            ...(acc[assignment.profile_id] || []),
            ...normalizeTrainingModules(assignment.training_courses?.unlocks_modules),
          ]);
          return acc;
        }, {});
        setCourseUnlockedModules(unlockedByProfile);
      } else {
        setCourseUnlockedModules({});
      }

      // Fetch all user roles
      const { data: rolesData, error: rolesError } = await supabase
        .from("user_roles")
        .select("*");

      if (rolesError) throw rolesError;

      setUserRoles(rolesData || []);

      // Avisafe superadmin: fetch cross-company pending users invited by Avisafe
      if (isAvisafeSuperadmin) {
        try {
          const { data: invites } = await supabase
            .from('user_invitations' as any)
            .select('accepted_user_id')
            .not('accepted_user_id', 'is', null);
          const inviteIds = (invites || []).map((i: any) => i.accepted_user_id).filter(Boolean);
          if (inviteIds.length > 0) {
            const { data: pendingCross } = await supabase
              .from('profiles')
              .select('*, companies(navn)')
              .in('id', inviteIds)
              .eq('approved', false);
            const localIds = new Set((profilesData || []).map((p: any) => p.id));
            setCrossCompanyPending(((pendingCross || []) as Profile[]).filter(p => !localIds.has(p.id)));
          } else {
            setCrossCompanyPending([]);
          }
        } catch (e) {
          console.error('cross-company pending fetch failed', e);
        }
      }

      // Set up real-time subscriptions (debounced to reduce disk IO)
      let adminDebounce: number | null = null;
      const debouncedFetchData = () => {
        if (adminDebounce) clearTimeout(adminDebounce);
        adminDebounce = window.setTimeout(() => fetchData(), 2000);
      };

      const profilesChannel = createUniqueChannel('admin-profiles-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, debouncedFetchData)
        .subscribe();

      const rolesChannel = createUniqueChannel('admin-roles-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_roles' }, debouncedFetchData)
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
          await invokeEmailFunction('send-user-approved-email', {
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

  const approveInvitedUser = async (userId: string) => {
    if (approvingUsers.has(userId)) return;
    setApprovingUsers(prev => new Set(prev).add(userId));
    try {
      const { error } = await supabase.functions.invoke('approve-invited-user', { body: { user_id: userId } });
      if (error) throw error;
      toast.success(t('admin.userApproved'));
      fetchData();
    } catch (e) {
      console.error('approve-invited-user error', e);
      toast.error(t('admin.errorApprovingUser'));
    } finally {
      setApprovingUsers(prev => { const n = new Set(prev); n.delete(userId); return n; });
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
      const newValue = !currentValue;
      const updatePayload: any = { can_approve_missions: newValue };
      // If turning off and has departments, also clear department scope
      if (!newValue) {
        updatePayload.approval_company_ids = null;
      }
      // If turning on and no departments exist, set to ['all'] for consistency
      if (newValue && childCompanies.length === 0) {
        updatePayload.approval_company_ids = ['all'];
      }
      // If turning on and departments exist, default to ['all']
      if (newValue && childCompanies.length > 0) {
        updatePayload.approval_company_ids = ['all'];
      }
      const { error } = await supabase
        .from("profiles")
        .update(updatePayload)
        .eq("id", userId);

      if (error) throw error;

      setProfiles(prev => prev.map(p => 
        p.id === userId ? { ...p, can_approve_missions: newValue, approval_company_ids: updatePayload.approval_company_ids } : p
      ));
      toast.success(newValue ? t('admin.page.approverEnabled') : t('admin.page.approverDisabled'));
    } catch (error) {
      console.error("Error toggling approver:", error);
      toast.error("Kunne ikke oppdatere innstilling");
    }
  };

  const updateApprovalScope = async (userId: string, selectedIds: string[]) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ approval_company_ids: selectedIds } as any)
        .eq("id", userId);
      if (error) throw error;
      setProfiles(prev => prev.map(p =>
        p.id === userId ? { ...p, approval_company_ids: selectedIds } : p
      ));
      toast.success('Godkjenningsomfang oppdatert');
    } catch (error) {
      console.error("Error updating approval scope:", error);
      toast.error("Kunne ikke oppdatere innstilling");
    }
  };

  const updateIncidentScope = async (userId: string, selectedIds: string[]) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ incident_responsible_company_ids: selectedIds } as any)
        .eq("id", userId);
      if (error) throw error;
      setProfiles(prev => prev.map(p =>
        p.id === userId ? { ...p, incident_responsible_company_ids: selectedIds } : p
      ));
      toast.success('Hendelsesomfang oppdatert');
    } catch (error) {
      console.error("Error updating incident scope:", error);
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
      toast.success(!currentValue ? t('admin.page.eccairsEnabled') : t('admin.page.eccairsDisabled'));
    } catch (error) {
      console.error("Error toggling ECCAIRS:", error);
      toast.error("Kunne ikke oppdatere innstilling");
    }
  };

  const toggleIncidentResponsible = async (userId: string, currentValue: boolean) => {
    try {
      const newValue = !currentValue;
      const updatePayload: any = { can_be_incident_responsible: newValue };
      if (!newValue) {
        updatePayload.incident_responsible_company_ids = null;
      }
      if (newValue && childCompanies.length === 0) {
        updatePayload.incident_responsible_company_ids = ['all'];
      }
      if (newValue && childCompanies.length > 0) {
        updatePayload.incident_responsible_company_ids = ['all'];
      }
      const { error } = await supabase
        .from("profiles")
        .update(updatePayload)
        .eq("id", userId);

      if (error) throw error;

      setProfiles(prev => prev.map(p => 
        p.id === userId ? { ...p, can_be_incident_responsible: newValue, incident_responsible_company_ids: updatePayload.incident_responsible_company_ids } : p
      ));
      toast.success(newValue ? t('admin.page.incidentResponsibleEnabled') : t('admin.page.incidentResponsibleDisabled'));
    } catch (error) {
      console.error("Error toggling incident responsible:", error);
      toast.error("Kunne ikke oppdatere innstilling");
    }
  };

  const toggleTechResponsible = async (userId: string, currentValue: boolean) => {
    try {
      const newValue = !currentValue;
      const { error } = await supabase
        .from("profiles")
        .update({ is_technical_responsible: newValue } as any)
        .eq("id", userId);
      if (error) throw error;
      setProfiles(prev => prev.map(p =>
        p.id === userId ? { ...p, is_technical_responsible: newValue } : p
      ));
      toast.success(newValue ? t('admin.page.techResponsibleEnabled') : t('admin.page.techResponsibleDisabled'));
    } catch (error) {
      console.error("Error toggling tech responsible:", error);
      toast.error("Kunne ikke oppdatere innstilling");
    }
  };

  const toggleUnderTraining = async (userId: string, currentValue: boolean) => {
    try {
      const newValue = !currentValue;
      const updatePayload = newValue
        ? { under_training: true }
        : { under_training: false, training_module_access: [] };
      const { error } = await supabase
        .from("profiles")
        .update(updatePayload as any)
        .eq("id", userId);
      if (error) throw error;
      setProfiles(prev => prev.map(p =>
        p.id === userId ? { ...p, under_training: newValue, training_module_access: newValue ? p.training_module_access : [] } : p
      ));
      if (userId === user?.id) {
        await refetchUserInfo();
      }
      toast.success(newValue ? t('admin.page.userSetUnderTraining') : t('admin.page.trainingModeOff'));
    } catch (error) {
      console.error("Error toggling under training:", error);
      toast.error(t('admin.page.errorUpdatingTrainingStatus'));
    }
  };

  const updateTrainingModuleAccess = async (userId: string, modules: TrainingModuleKey[]) => {
    const normalized = normalizeTrainingModules(modules);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ training_module_access: normalized } as any)
        .eq("id", userId);
      if (error) throw error;
      setProfiles(prev => prev.map(p =>
        p.id === userId ? { ...p, training_module_access: normalized } : p
      ));
      if (userId === user?.id) {
        await refetchUserInfo();
      }
      toast.success(t('admin.page.moduleAccessUpdated'));
    } catch (error) {
      console.error("Error updating training module access:", error);
      toast.error(t('admin.page.errorUpdatingModuleAccess'));
    }
  };

  const openAllModulesForUser = async (userId: string) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ under_training: false, training_module_access: [] } as any)
        .eq("id", userId);
      if (error) throw error;

      setProfiles(prev => prev.map(p =>
        p.id === userId ? { ...p, under_training: false, training_module_access: [] } : p
      ));
      if (userId === user?.id) {
        await refetchUserInfo();
      }
      toast.success(t('admin.page.allModulesOpened'));
    } catch (error) {
      console.error("Error opening all modules:", error);
      toast.error(t('admin.page.errorOpeningModules'));
    }
  };

  const getManualTrainingModules = (profile: Profile) => normalizeTrainingModules(profile.training_module_access);

  const getCourseUnlockedModules = (profile: Profile) => normalizeTrainingModules(courseUnlockedModules[profile.id] || []);

  const getEffectiveTrainingModules = (profile: Profile) => normalizeTrainingModules([
    ...getManualTrainingModules(profile),
    ...getCourseUnlockedModules(profile),
  ]);


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
  const filteredApprovedUsers = approvedUsers.filter((p) => {
    if (!userSearchQuery.trim()) return true;
    const q = userSearchQuery.toLowerCase();
    return (p.full_name || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q);
  });

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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList data-tour="admin-tabs" className="grid grid-cols-2 sm:inline-flex h-auto sm:h-10 w-full sm:w-auto max-w-md sm:max-w-none mx-auto relative z-10 gap-1 p-1.5 bg-secondary rounded-xl flex-wrap">
            <TabsTrigger value="users" data-tour="admin-tab-users" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-lg transition-colors">
              <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
              <span>{t('admin.users')}</span>
            </TabsTrigger>
            <TabsTrigger value="customers" data-tour="admin-tab-customers" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-lg transition-colors">
              <UserCog className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
              <span>{t('admin.customers')}</span>
            </TabsTrigger>
            <TabsTrigger value="email-templates" data-tour="admin-tab-email" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-lg transition-colors">
              <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
              <span>{isMobile ? 'E-post' : t('admin.emailTemplates')}</span>
            </TabsTrigger>
            {hasAddon('sora_admin') && (
              <TabsTrigger value="company-config" data-tour="admin-tab-sora" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-lg transition-colors">
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
            <TabsTrigger value="child-companies" data-tour="admin-tab-child" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-lg transition-colors">
              <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
              <span>{t('admin.myCompany')}</span>
            </TabsTrigger>
            <TabsTrigger value="training" data-tour="admin-tab-training" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-lg transition-colors">
              <GraduationCap className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
              <span>{t('admin.training')}</span>
            </TabsTrigger>
            {isSuperAdmin && companyName?.toLowerCase() === 'avisafe' && (
              <TabsTrigger value="calculator" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-lg transition-colors">
                <Calculator className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                <span>Kalkulator</span>
              </TabsTrigger>
            )}
            {isSuperAdmin && (
              <TabsTrigger value="notam-feeds" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-lg transition-colors">
                <Rss className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                <span>NOTAM</span>
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="users" className="mt-4 sm:mt-8">
            <div className="space-y-4 sm:space-y-6">
              {/* Registration Code Card */}
              {registrationCode && (
                <Card data-tour="admin-registration-code" className="border-primary/20 bg-primary/5">
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

              <Card data-tour="admin-invite">
                <CardHeader className="pb-3 sm:pb-6">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Send className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                    {t('admin.page.inviteNewUserEmail')}
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    {t('admin.page.inviteEmailDescription')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-4 sm:px-6">
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center flex-1">
                      <Input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder={t('admin.page.emailPlaceholder')}
                        inputMode="email"
                        className="sm:max-w-sm"
                      />
                      {!isChildCompany && childCompanies.length > 0 && (
                        <Select value={inviteDepartment} onValueChange={setInviteDepartment}>
                          <SelectTrigger className="w-full sm:w-[200px]">
                            <SelectValue placeholder={t('admin.page.selectDepartment')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="parent">{companyName || t('admin.page.mainCompany')}</SelectItem>
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
                          const { data, error } = await invokeEmailFunction('invite-user', {
                            body: { email, companyName: inviteCompanyName, registrationCode: inviteRegCode },
                          });
                          if (error) throw error;

                          toast.success(selectedChild ? t('admin.page.inviteSentToDept', { email, dept: selectedChild.navn }) : t('admin.page.inviteSentTo', { email }));
                          setInviteEmail("");
                        } catch (err) {
                          console.error("Error sending invite:", err);
                          toast.error(t('admin.page.couldNotSendInvite'));
                        } finally {
                          setSendingInvite(false);
                        }
                      }}
                    >
                      <Send className="w-4 h-4 mr-2" />
                      {sendingInvite ? t('admin.page.sending') : t('admin.page.sendInvite')}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Pending Users */}
              {isAvisafeSuperadmin && crossCompanyPending.length > 0 && (
                <Card className="border-primary/40">
                  <CardHeader className="pb-3 sm:pb-6">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <UserCog className="w-4 h-4 sm:w-5 sm:h-5" />
                      Inviterte ventende godkjenning ({crossCompanyPending.length})
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      Brukere du har invitert til andre selskap som venter på godkjenning.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-2 sm:px-6">
                    <div className="space-y-2">
                      {crossCompanyPending.map((profile) => (
                        <div key={profile.id} className="flex items-center justify-between gap-2 sm:gap-4 p-3 sm:p-4 rounded-lg border border-border bg-card hover:bg-accent/5 transition-colors">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm sm:text-base truncate">{profile.full_name || t('common.notSpecified')}</p>
                              {profile.companies && (
                                <Badge variant="outline" className="text-xs flex-shrink-0">{(profile.companies as any).navn}</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="truncate">{profile.email || t('admin.noEmail')}</span>
                              <span>•</span>
                              <span>{new Date(profile.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button size="sm" onClick={() => approveInvitedUser(profile.id)} disabled={approvingUsers.has(profile.id)} className="h-9 sm:h-10">
                              <Check className="w-4 h-4 mr-1 sm:mr-2" />
                              <span className="hidden sm:inline">{approvingUsers.has(profile.id) ? t('admin.approving') : t('admin.approve')}</span>
                              <span className="sm:hidden">{t('common.ok')}</span>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {pendingUsers.length > 0 && (
                <Card data-tour="admin-pending">
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
              <Card data-tour="admin-approved">
                <CardHeader className="pb-3 sm:pb-6">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle className="text-base sm:text-lg">{t('admin.approvedUsers')} ({filteredApprovedUsers.length}{approvedUsers.length !== filteredApprovedUsers.length ? ` / ${approvedUsers.length}` : ''})</CardTitle>
                      <CardDescription className="text-xs sm:text-sm">
                        {t('admin.manageRoles')}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2" data-tour="admin-approved-actions">
                      <Input
                        type="text"
                        value={userSearchQuery}
                        onChange={(e) => setUserSearchQuery(e.target.value)}
                        placeholder={t('admin.page.searchByName')}
                        className="w-[180px] h-9 text-sm"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowEmailList(prev => !prev)}
                        className="px-2 sm:px-3"
                      >
                        <Mail className="w-4 h-4 sm:mr-1.5" />
                        <span className="hidden sm:inline">{showEmailList ? t('admin.page.hideEmailList') : t('admin.page.showEmailList')}</span>
                        <span className="sm:hidden">{showEmailList ? t('admin.page.hide') : t('admin.page.show')}</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const emails = approvedUsers
                            .map(p => p.email)
                            .filter(Boolean) as string[];
                          if (emails.length === 0) {
                            toast.error(t('admin.page.noEmailsFound'));
                            return;
                          }
                          navigator.clipboard.writeText(emails.join(', '));
                          toast.success(t('admin.page.emailsCopied', { count: emails.length }));
                        }}
                        className="px-2 sm:px-3"
                      >
                        <Copy className="w-4 h-4" />
                        <span className="hidden sm:inline ml-1.5">{t('admin.page.copyEmailList')}</span>
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
                        {approvedUsers.filter(p => p.email).length} {t('admin.page.emailAddresses')}
                      </p>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="px-2 sm:px-6">
                  <div className="space-y-2">
                    {filteredApprovedUsers.map((profile) => {
                      const userRole = userRoles.find((r) => r.user_id === profile.id);
                      return (
                        <div 
                          key={profile.id}
                          className="flex items-center justify-between gap-2 sm:gap-4 p-3 sm:p-4 rounded-lg border border-border bg-card hover:bg-accent/5 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            {isCompactAdmin ? (
                              <div className="space-y-2">
                                <div>
                                  <p className="font-medium text-sm truncate">
                                    {profile.full_name || t('common.notSpecified')}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {profile.email || t('admin.noEmail')}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  {!isChildCompany && childCompanies.length > 0 && (
                                    <Select
                                      value={profile.company_id || companyId || ""}
                                      onValueChange={(value) => changeDepartment(profile.id, value)}
                                    >
                                      <SelectTrigger className="h-8 text-xs flex-1 min-w-[140px]">
                                        <SelectValue placeholder={t('admin.page.department')} />
                                      </SelectTrigger>
                                      <SelectContent className="z-[1300]">
                                        <SelectItem value={companyId || ""}>{companyName || t('admin.page.mainCompany')}</SelectItem>
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
                                      <SelectTrigger className="h-8 text-xs flex-1 min-w-[120px]">
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
                                  ) : (
                                    <Badge variant="outline" className="text-xs">{userRole?.role ? t(`admin.role_${userRole.role}`, userRole.role) : t('admin.selectRole')}</Badge>
                                  )}
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <Button size="sm" variant="outline" className="h-8 text-xs gap-1">
                                        {t('admin.page.moreOptions')}
                                        <ChevronRight className="h-3 w-3" />
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-64 p-3 space-y-3" align="end">
                                      <div className="space-y-3">
                                    <div className="space-y-2 pb-2 border-b border-border">
                                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t('admin.page.permissions')}</p>

                                      <div className="space-y-2 rounded-md border border-border p-2">
                                        <div className="flex items-center justify-between">
                                          <span className="text-xs text-muted-foreground">{t('admin.page.underTraining')}</span>
                                          <Switch
                                            checked={profile.under_training === true}
                                            onCheckedChange={() => toggleUnderTraining(profile.id, profile.under_training === true)}
                                            className="scale-75"
                                            disabled={!canManageRoles}
                                          />
                                        </div>
                                        {profile.under_training && (
                                          <TrainingModulePicker
                                            selected={getManualTrainingModules(profile)}
                                            lockedModules={getCourseUnlockedModules(profile)}
                                            onChange={(modules) => updateTrainingModuleAccess(profile.id, modules)}
                                            onOpenAllModules={() => openAllModulesForUser(profile.id)}
                                            disabled={!canManageRoles}
                                          />
                                        )}
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs text-muted-foreground">{t('admin.page.technicalResponsibleDrones')}</span>
                                        <Switch
                                          checked={profile.is_technical_responsible === true}
                                          onCheckedChange={() => toggleTechResponsible(profile.id, profile.is_technical_responsible === true)}
                                          className="scale-75"
                                          disabled={!canManageRoles}
                                        />
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs text-muted-foreground">{t('admin.page.canApproveMissions')}</span>
                                        <Switch
                                          checked={profile.can_approve_missions === true}
                                          onCheckedChange={() => toggleApprover(profile.id, profile.can_approve_missions === true)}
                                          className="scale-75"
                                          disabled={!canManageRoles}
                                        />
                                      </div>
                                      {profile.can_approve_missions && !isChildCompany && childCompanies.length > 0 && (
                                        <div>
                                          <span className="text-xs text-muted-foreground block mb-1">{t('admin.page.approverForDepartments')}</span>
                                          <DepartmentChecklist
                                            departments={[{ id: companyId || '', navn: companyName || t('admin.page.mainCompany') }, ...childCompanies]}
                                            selectedIds={profile.approval_company_ids?.filter(id => id !== 'all') || []}
                                            allSelected={profile.approval_company_ids?.includes('all') || false}
                                            onToggleAll={(checked) => {
                                              if (checked) updateApprovalScope(profile.id, ['all']);
                                              else updateApprovalScope(profile.id, [companyId || '']);
                                            }}
                                            onToggle={(id, checked) => {
                                              const current = profile.approval_company_ids?.filter(i => i !== 'all') || [];
                                              const newIds = checked ? [...current, id] : current.filter(i => i !== id);
                                              updateApprovalScope(profile.id, newIds.length > 0 ? newIds : ['all']);
                                            }}
                                          />
                                        </div>
                                      )}
                                      {eccairsEnabled && (
                                        <div className="flex items-center justify-between">
                                          <span className="text-xs text-muted-foreground">{t('admin.page.eccairsAccess')}</span>
                                          <Switch
                                            checked={profile.can_access_eccairs === true}
                                            onCheckedChange={() => toggleEccairs(profile.id, profile.can_access_eccairs === true)}
                                            className="scale-75"
                                            disabled={!canManageRoles}
                                          />
                                        </div>
                                      )}
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs text-muted-foreground">{t('admin.page.incidentResponsibleFull')}</span>
                                        <Switch
                                          checked={profile.can_be_incident_responsible === true}
                                          onCheckedChange={() => toggleIncidentResponsible(profile.id, profile.can_be_incident_responsible === true)}
                                          className="scale-75"
                                          disabled={!canManageRoles}
                                        />
                                      </div>
                                      {profile.can_be_incident_responsible && !isChildCompany && childCompanies.length > 0 && (
                                        <div>
                                          <span className="text-xs text-muted-foreground block mb-1">{t('admin.page.responsibleForDepartments')}</span>
                                          <DepartmentChecklist
                                            departments={[{ id: companyId || '', navn: companyName || t('admin.page.mainCompany') }, ...childCompanies]}
                                            selectedIds={profile.incident_responsible_company_ids?.filter(id => id !== 'all') || []}
                                            allSelected={profile.incident_responsible_company_ids?.includes('all') || false}
                                            onToggleAll={(checked) => {
                                              if (checked) updateIncidentScope(profile.id, ['all']);
                                              else updateIncidentScope(profile.id, [companyId || '']);
                                            }}
                                            onToggle={(id, checked) => {
                                              const current = profile.incident_responsible_company_ids?.filter(i => i !== 'all') || [];
                                              const newIds = checked ? [...current, id] : current.filter(i => i !== id);
                                              updateIncidentScope(profile.id, newIds.length > 0 ? newIds : ['all']);
                                            }}
                                            allLabel={t('admin.page.allDepartments')}
                                          />
                                        </div>
                                      )}
                                    </div>

                                    <div className="space-y-1.5">
                                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t('admin.page.removeUser')}</p>
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
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                </div>
                              </div>

                            ) : (
                              <>
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-sm sm:text-base truncate">
                                    {profile.full_name || t('common.notSpecified')}
                                  </p>
                                </div>
                                <p className="text-xs text-muted-foreground truncate">
                                  {profile.email || t('admin.noEmail')}
                                </p>
                              </>
                            )}
                          </div>
                          
                          {!isCompactAdmin && (
                            <div className="flex items-center gap-2 flex-wrap justify-end">
                              <div className="flex items-center gap-1.5 border border-border rounded-md px-2 py-1">
                                <Switch
                                  checked={profile.is_technical_responsible === true}
                                  onCheckedChange={() => toggleTechResponsible(profile.id, profile.is_technical_responsible === true)}
                                  className="scale-75"
                                  disabled={!canManageRoles}
                                />
                                <span className="text-xs text-muted-foreground whitespace-nowrap">{t('admin.page.technicalResponsible')}</span>
                              </div>
                              <div className="flex items-center gap-1.5 border border-border rounded-md px-2 py-1">
                                <Switch
                                  checked={profile.under_training === true}
                                  onCheckedChange={() => toggleUnderTraining(profile.id, profile.under_training === true)}
                                  className="scale-75"
                                  disabled={!canManageRoles}
                                />
                                <span className="text-xs text-muted-foreground whitespace-nowrap">{t('admin.page.underTraining')}</span>
                                {profile.under_training && (
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <Button variant="outline" size="sm" className="h-7 text-xs px-2">
                                        {getEffectiveTrainingModules(profile).length} {t('admin.page.moduleShort')}
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-72 p-3 z-[1300]" align="start">
                                      <p className="text-xs font-medium mb-2">{t('admin.page.accessBeforeCourse')}</p>
                                      <TrainingModulePicker
                                        selected={getManualTrainingModules(profile)}
                                        lockedModules={getCourseUnlockedModules(profile)}
                                        onChange={(modules) => updateTrainingModuleAccess(profile.id, modules)}
                                        onOpenAllModules={() => openAllModulesForUser(profile.id)}
                                        disabled={!canManageRoles}
                                      />
                                    </PopoverContent>
                                  </Popover>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 border border-border rounded-md px-2 py-1">
                                <Switch
                                  checked={profile.can_approve_missions === true}
                                  onCheckedChange={() => toggleApprover(profile.id, profile.can_approve_missions === true)}
                                  className="scale-75"
                                  disabled={!canManageRoles}
                                />
                                <span className="text-xs text-muted-foreground whitespace-nowrap">{t('admin.page.missionApprover')}</span>
                                {profile.can_approve_missions && !isChildCompany && childCompanies.length > 0 && (
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <Button variant="outline" size="sm" className="h-7 text-xs px-2">
                                        {profile.approval_company_ids?.includes('all') ? t('admin.page.all') : `${(profile.approval_company_ids || []).length} ${t('admin.page.deptShort')}`}
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-72 p-3 z-[1300]" align="start">
                                      <p className="text-xs font-medium mb-2">Godkjenner for avdelinger</p>
                                      <DepartmentChecklist
                                        departments={[{ id: companyId || '', navn: companyName || 'Hovedselskap' }, ...childCompanies]}
                                        selectedIds={profile.approval_company_ids?.filter(id => id !== 'all') || []}
                                        allSelected={profile.approval_company_ids?.includes('all') || false}
                                        onToggleAll={(checked) => {
                                          if (checked) updateApprovalScope(profile.id, ['all']);
                                          else updateApprovalScope(profile.id, [companyId || '']);
                                        }}
                                        onToggle={(id, checked) => {
                                          const current = profile.approval_company_ids?.filter(i => i !== 'all') || [];
                                          const newIds = checked ? [...current, id] : current.filter(i => i !== id);
                                          updateApprovalScope(profile.id, newIds.length > 0 ? newIds : ['all']);
                                        }}
                                      />
                                    </PopoverContent>
                                  </Popover>
                                )}
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
                                {profile.can_be_incident_responsible && !isChildCompany && childCompanies.length > 0 && (
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <Button variant="outline" size="sm" className="h-7 text-xs px-2">
                                        {profile.incident_responsible_company_ids?.includes('all') ? 'Alle' : `${(profile.incident_responsible_company_ids || []).length} avd.`}
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-72 p-3 z-[1300]" align="start">
                                      <p className="text-xs font-medium mb-2">Ansvarlig for avdelinger</p>
                                      <DepartmentChecklist
                                        departments={[{ id: companyId || '', navn: companyName || 'Hovedselskap' }, ...childCompanies]}
                                        selectedIds={profile.incident_responsible_company_ids?.filter(id => id !== 'all') || []}
                                        allSelected={profile.incident_responsible_company_ids?.includes('all') || false}
                                        onToggleAll={(checked) => {
                                          if (checked) updateIncidentScope(profile.id, ['all']);
                                          else updateIncidentScope(profile.id, [companyId || '']);
                                        }}
                                        onToggle={(id, checked) => {
                                          const current = profile.incident_responsible_company_ids?.filter(i => i !== 'all') || [];
                                          const newIds = checked ? [...current, id] : current.filter(i => i !== id);
                                          updateIncidentScope(profile.id, newIds.length > 0 ? newIds : ['all']);
                                        }}
                                        allLabel="Alle avdelinger"
                                      />
                                    </PopoverContent>
                                  </Popover>
                                )}
                              </div>
                              {!isChildCompany && childCompanies.length > 0 && (
                                <div className="w-[180px]">
                                  <SearchablePersonSelect
                                    persons={[{ id: companyId || '', full_name: companyName || t('admin.page.mainCompany') }, ...childCompanies.map(c => ({ id: c.id, full_name: c.navn }))]}
                                    value={profile.company_id || companyId || ""}
                                    onValueChange={(val) => { if (val) changeDepartment(profile.id, val); }}
                                    placeholder={t('admin.page.department')}
                                    searchPlaceholder={t('admin.page.searchDepartment')}
                                    emptyText={t('admin.page.noDepartmentsFound')}
                                  />
                                </div>
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
                                    {availableRoles.map((role) => (
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

          <TabsContent value="customers" data-tour="admin-content-customers" className="mt-4 sm:mt-8">
            <CustomerManagementSection />
          </TabsContent>

          <TabsContent value="email-templates" data-tour="admin-content-email" className="mt-4 sm:mt-8">
            <EmailTemplateEditor onOpenEmailSettings={() => setEmailSettingsOpen(true)} />
            <BulkEmailSenderWithHistory />
          </TabsContent>

          {hasAddon('sora_admin') && (
            <TabsContent value="company-config" data-tour="admin-content-sora" className="mt-4 sm:mt-8">
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

          <TabsContent value="child-companies" data-tour="admin-content-child" className="mt-4 sm:mt-8">
            <ChildCompaniesSection departmentsEnabled={departmentsEnabled} />
          </TabsContent>

          {isSuperAdmin && companyName?.toLowerCase() === 'avisafe' && (
            <TabsContent value="calculator" className="mt-4 sm:mt-8">
              <RevenueCalculator />
            </TabsContent>
          )}

          {isSuperAdmin && (
            <TabsContent value="notam-feeds" className="mt-4 sm:mt-8">
              <NotamRssFeedsSection />
            </TabsContent>
          )}


          <TabsContent value="training" data-tour="admin-content-training" className="mt-4 sm:mt-8">
            <TrainingSection />
          </TabsContent>
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

