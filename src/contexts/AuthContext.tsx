import { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { PlanId, AddonId } from "@/config/subscriptionPlans";

export type CompanyType = 'droneoperator' | 'flyselskap' | null;

const PROFILE_CACHE_KEY = (userId: string) => `avisafe_user_profile_${userId}`;
const SESSION_CACHE_KEY = 'avisafe_session_cache';

interface CachedSession {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}

interface CachedProfile {
  companyId: string | null;
  companyName: string | null;
  companyType: CompanyType;
  companyLat: number | null;
  companyLon: number | null;
  isApproved: boolean;
  userRole: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  djiFlightlogEnabled: boolean;
  stripeExempt: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  companyId: string | null;
  companyName: string | null;
  companyType: CompanyType;
  companyLat: number | null;
  companyLon: number | null;
  isSuperAdmin: boolean;
  djiFlightlogEnabled: boolean;
  isAdmin: boolean;
  isApproved: boolean;
  userRole: string | null;
  subscribed: boolean;
  subscriptionEnd: string | null;
  subscriptionLoading: boolean;
  cancelAtPeriodEnd: boolean;
  isTrial: boolean;
  trialEnd: string | null;
  stripeExempt: boolean;
  hadPreviousSubscription: boolean;
  subscriptionPlan: PlanId | null;
  subscriptionAddons: AddonId[];
  isBillingOwner: boolean;
  seatCount: number;
  signOut: () => Promise<void>;
  refetchUserInfo: () => Promise<void>;
  checkSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  companyId: null,
  companyName: null,
  companyType: null,
  companyLat: null,
  companyLon: null,
  isSuperAdmin: false,
  djiFlightlogEnabled: false,
  isAdmin: false,
  isApproved: false,
  userRole: null,
  subscribed: false,
  subscriptionEnd: null,
  subscriptionLoading: true,
  cancelAtPeriodEnd: false,
  isTrial: false,
  trialEnd: null,
  stripeExempt: false,
  hadPreviousSubscription: false,
  subscriptionPlan: null,
  subscriptionAddons: [],
  isBillingOwner: false,
  seatCount: 1,
  signOut: async () => {},
  refetchUserInfo: async () => {},
  checkSubscription: async () => {},
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [companyType, setCompanyType] = useState<CompanyType>(null);
  const [companyLat, setCompanyLat] = useState<number | null>(null);
  const [companyLon, setCompanyLon] = useState<number | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [djiFlightlogEnabled, setDjiFlightlogEnabled] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [isTrial, setIsTrial] = useState(false);
  const [trialEnd, setTrialEnd] = useState<string | null>(null);
  const [stripeExempt, setStripeExempt] = useState(false);
  const [hadPreviousSubscription, setHadPreviousSubscription] = useState(false);
  const [subscriptionPlan, setSubscriptionPlan] = useState<PlanId | null>(null);
  const [subscriptionAddons, setSubscriptionAddons] = useState<AddonId[]>([]);
  const [isBillingOwner, setIsBillingOwner] = useState(false);
  const [seatCount, setSeatCount] = useState(1);

  const resetAuthState = () => {
    setSession(null);
    setUser(null);
    setCompanyId(null);
    setCompanyName(null);
    setCompanyType(null);
    setCompanyLat(null);
    setCompanyLon(null);
    setIsSuperAdmin(false);
    setIsAdmin(false);
    setIsApproved(false);
    setDjiFlightlogEnabled(false);
    setUserRole(null);
    setStripeExempt(false);
    setSubscribed(false);
    setSubscriptionEnd(null);
    setCancelAtPeriodEnd(false);
    setIsTrial(false);
    setTrialEnd(null);
    setHadPreviousSubscription(false);
    setSubscriptionPlan(null);
    setSubscriptionAddons([]);
    setIsBillingOwner(false);
    setSeatCount(1);
  };

  const getErrorMessage = (error: unknown): string => {
    if (!error) return '';
    if (typeof error === 'string') return error;

    const err = error as {
      message?: string;
      code?: string;
      context?: { error?: string; json?: { error?: string } };
      error_description?: string;
    };

    return [
      err.message,
      err.error_description,
      err.context?.error,
      err.context?.json?.error,
      err.code,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  };

  const isMissingAuthUserError = (error: unknown): boolean => {
    const message = getErrorMessage(error);
    return message.includes('user from sub claim in jwt does not exist') || message.includes('user_not_found');
  };

  const clearLocalAuthData = async (userId?: string) => {
    try {
      let cachedUserId = userId;
      if (!cachedUserId) {
        const raw = localStorage.getItem(SESSION_CACHE_KEY);
        if (raw) {
          const cached: CachedSession = JSON.parse(raw);
          cachedUserId = cached.id;
        }
      }

      localStorage.removeItem(SESSION_CACHE_KEY);
      if (cachedUserId) {
        localStorage.removeItem(PROFILE_CACHE_KEY(cachedUserId));
      }

      for (let i = localStorage.length - 1; i >= 0; i -= 1) {
        const key = localStorage.key(i);
        if (key?.startsWith('sb-') && key.endsWith('-auth-token')) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      // ignore localStorage errors
    }

    resetAuthState();

    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // ignore - local clean-up above is enough
    }
  };

  const applyCachedProfile = (userId: string): boolean => {
    try {
      const raw = localStorage.getItem(PROFILE_CACHE_KEY(userId));
      if (!raw) return false;

      const cached: CachedProfile = JSON.parse(raw);
      setCompanyId(cached.companyId);
      setCompanyName(cached.companyName);
      setCompanyType(cached.companyType);
      setCompanyLat(cached.companyLat);
      setCompanyLon(cached.companyLon);
      setIsApproved(cached.isApproved);
      setUserRole(cached.userRole);
      setIsAdmin(cached.isAdmin);
      setIsSuperAdmin(cached.isSuperAdmin);
      setDjiFlightlogEnabled(cached.djiFlightlogEnabled ?? false);
      setStripeExempt(cached.stripeExempt ?? false);
      console.log('AuthContext: Applied cached profile for offline use');
      return true;
    } catch {
      return false;
    }
  };

  const saveCachedProfile = (userId: string, profile: CachedProfile) => {
    try {
      localStorage.setItem(PROFILE_CACHE_KEY(userId), JSON.stringify(profile));
    } catch {
      // localStorage full - ignore
    }
  };

  const cacheSession = (user: User) => {
    try {
      const cached: CachedSession = {
        id: user.id,
        email: user.email,
        user_metadata: user.user_metadata,
        app_metadata: user.app_metadata,
      };
      localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(cached));
    } catch {
      // localStorage full - ignore
    }
  };

  const restoreFromCache = (): boolean => {
    try {
      const raw = localStorage.getItem(SESSION_CACHE_KEY);
      if (!raw) return false;
      const cached: CachedSession = JSON.parse(raw);
      if (!cached.id) return false;
      setUser(cached as unknown as User);
      applyCachedProfile(cached.id);
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
          setSession(session);
          setUser(session.user);
          setLoading(false);
          cacheSession(session.user);
          try {
            localStorage.setItem('avisafe_last_activity', Date.now().toString());
          } catch {}
          if (!navigator.onLine) {
            applyCachedProfile(session.user.id);
          } else {
            setTimeout(() => {
              fetchUserInfo(session.user.id);
            }, 0);
          }
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          setSession(session);
          setUser(session.user);
          cacheSession(session.user);
        } else if (event === 'SIGNED_OUT') {
          if (!navigator.onLine) {
            console.log('AuthContext: Ignoring SIGNED_OUT while offline');
            return;
          }
          resetAuthState();
          setLoading(false);
        } else {
          if (!session && !navigator.onLine) {
            console.log('AuthContext: Ignoring null session event while offline');
            if (!user) {
              restoreFromCache();
            }
            setLoading(false);
            return;
          }
          setSession(session);
          setUser(session?.user ?? null);
          if (session?.user && !navigator.onLine) {
            applyCachedProfile(session.user.id);
          }
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        if (session?.user) {
          if (navigator.onLine) {
            const { error: userError } = await supabase.auth.getUser();
            if (userError && isMissingAuthUserError(userError)) {
              console.warn('AuthContext: Found stale session for deleted user, clearing local auth');
              await clearLocalAuthData(session.user.id);
              setLoading(false);
              return;
            }
          }

          setSession(session);
          setUser(session.user);
          setLoading(false);
          cacheSession(session.user);
          if (!navigator.onLine) {
            applyCachedProfile(session.user.id);
          } else {
            fetchUserInfo(session.user.id);
          }
        } else if (!navigator.onLine) {
          console.log('AuthContext: Offline with no session, trying cache');
          const restored = restoreFromCache();
          setLoading(false);
          if (restored) {
            console.log('AuthContext: Restored user from offline cache');
          }
        } else {
          resetAuthState();
          setLoading(false);
        }
      })
      .catch(() => {
        resetAuthState();
        setLoading(false);
      });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserInfo = async (userId: string) => {
    if (!navigator.onLine) {
      applyCachedProfile(userId);
      return;
    }

    try {
      const [profileResult, roleResult] = await Promise.all([
        supabase
          .from('profiles')
          .select(`
            company_id,
            approved,
            companies (
              id,
              navn,
              selskapstype,
              adresse_lat,
              adresse_lon,
              dji_flightlog_enabled,
              dronelog_api_key,
              stripe_exempt
            )
          `)
          .eq('id', userId)
          .single(),
        supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', userId)
          .maybeSingle()
      ]);
      
      let profileData: CachedProfile = {
        companyId: null,
        companyName: null,
        companyType: 'droneoperator',
        companyLat: null,
        companyLon: null,
        isApproved: false,
        userRole: null,
        isAdmin: false,
        isSuperAdmin: false,
        djiFlightlogEnabled: false,
        stripeExempt: false,
      };

      if (profileResult.error && roleResult.error) {
        console.log('AuthContext: Both queries failed, using cached profile');
        applyCachedProfile(userId);
        return;
      }

      if (profileResult.data) {
        const profile = profileResult.data;
        profileData.companyId = profile.company_id;
        profileData.isApproved = profile.approved ?? false;
        
        const company = profile.companies as any;
        profileData.companyName = company?.navn || null;
        profileData.companyType = company?.selskapstype || 'droneoperator';
        profileData.companyLat = company?.adresse_lat || null;
        profileData.companyLon = company?.adresse_lon || null;
        profileData.djiFlightlogEnabled = company?.dji_flightlog_enabled ?? false;
        profileData.stripeExempt = company?.stripe_exempt ?? false;
      }

      if (roleResult.data) {
        profileData.userRole = roleResult.data.role;
        profileData.isSuperAdmin = roleResult.data.role === 'superadmin';
        profileData.isAdmin = ['administrator', 'admin'].includes(roleResult.data.role) || roleResult.data.role === 'superadmin';
      }

      setCompanyId(profileData.companyId);
      setCompanyName(profileData.companyName);
      setCompanyType(profileData.companyType);
      setCompanyLat(profileData.companyLat);
      setCompanyLon(profileData.companyLon);
      setIsApproved(profileData.isApproved);
      setUserRole(profileData.userRole);
      setIsAdmin(profileData.isAdmin);
      setIsSuperAdmin(profileData.isSuperAdmin);
      setDjiFlightlogEnabled(profileData.djiFlightlogEnabled);
      setStripeExempt(profileData.stripeExempt);

      saveCachedProfile(userId, profileData);

      const company = profileResult.data?.companies as any;
      if (
        profileData.djiFlightlogEnabled &&
        !company?.dronelog_api_key &&
        profileData.companyId &&
        profileData.isAdmin
      ) {
        console.log('AuthContext: Auto-provisioning DroneLog API key for company', profileData.companyId);
        try {
          await supabase.functions.invoke('manage-dronelog-key', {
            body: { companyId: profileData.companyId, enable: true, selfProvision: true },
          });
          console.log('AuthContext: DroneLog API key provisioned successfully');
        } catch (provisionError) {
          console.error('AuthContext: Failed to auto-provision DroneLog key:', provisionError);
        }
      }
    } catch (error) {
      console.error('Error fetching user info:', error);
      if (!navigator.onLine) {
        applyCachedProfile(userId);
      }
    }
  };

  const signOut = async () => {
    await clearLocalAuthData(user?.id);
  };

  const refetchUserInfo = async () => {
    if (user) {
      await fetchUserInfo(user.id);
    }
  };

  const checkSubscription = async () => {
    if (!session) {
      setSubscriptionLoading(false);
      return;
    }

    try {
      if (navigator.onLine) {
        const { error: userError } = await supabase.auth.getUser();
        if (userError && isMissingAuthUserError(userError)) {
          console.warn('AuthContext: Invalid auth user during subscription check, clearing stale session');
          await clearLocalAuthData(session.user.id);
          setSubscriptionLoading(false);
          return;
        }
      }

      const { data, error } = await supabase.functions.invoke('check-subscription');
      if (error) {
        console.error('check-subscription error:', error);
        if (isMissingAuthUserError(error)) {
          await clearLocalAuthData(session.user.id);
        }
        setSubscriptionLoading(false);
        return;
      }
      setSubscribed(data?.subscribed ?? false);
      setSubscriptionEnd(data?.subscription_end ?? null);
      setCancelAtPeriodEnd(data?.cancel_at_period_end ?? false);
      setIsTrial(data?.is_trial ?? false);
      setTrialEnd(data?.trial_end ?? null);
      setHadPreviousSubscription(data?.had_previous_subscription ?? false);
      setSubscriptionPlan(data?.plan ?? null);
      setSubscriptionAddons(data?.addons ?? []);
      setIsBillingOwner(data?.is_billing_owner ?? false);
      setSeatCount(data?.seat_count ?? 1);
    } catch (e) {
      console.error('check-subscription failed:', e);
      if (isMissingAuthUserError(e)) {
        await clearLocalAuthData(session.user.id);
      }
    } finally {
      setSubscriptionLoading(false);
    }
  };

  useEffect(() => {
    if (!session) {
      setSubscribed(false);
      setSubscriptionEnd(null);
      setSubscriptionLoading(false);
      return;
    }
    checkSubscription();
    const interval = setInterval(checkSubscription, 60_000);
    return () => clearInterval(interval);
  }, [session]);

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      loading, 
      companyId, 
      companyName, 
      companyType, 
      companyLat,
      companyLon,
      isSuperAdmin, 
      djiFlightlogEnabled,
      isAdmin,
      isApproved,
      userRole, 
      subscribed,
      subscriptionEnd,
      subscriptionLoading,
      cancelAtPeriodEnd,
      isTrial,
      trialEnd,
      stripeExempt,
      hadPreviousSubscription,
      subscriptionPlan,
      subscriptionAddons,
      isBillingOwner,
      seatCount,
      signOut, 
      refetchUserInfo,
      checkSubscription,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
