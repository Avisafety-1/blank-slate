import { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  isApproved: boolean;
  userRole: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  companyId: string | null;
  companyName: string | null;
  companyType: CompanyType;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isApproved: boolean;
  userRole: string | null;
  signOut: () => Promise<void>;
  refetchUserInfo: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  companyId: null,
  companyName: null,
  companyType: null,
  isSuperAdmin: false,
  isAdmin: false,
  isApproved: false,
  userRole: null,
  signOut: async () => {},
  refetchUserInfo: async () => {},
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
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  const applyCachedProfile = (userId: string): boolean => {
    try {
      const raw = localStorage.getItem(PROFILE_CACHE_KEY(userId));
      if (!raw) return false;

      const cached: CachedProfile = JSON.parse(raw);
      setCompanyId(cached.companyId);
      setCompanyName(cached.companyName);
      setCompanyType(cached.companyType);
      setIsApproved(cached.isApproved);
      setUserRole(cached.userRole);
      setIsAdmin(cached.isAdmin);
      setIsSuperAdmin(cached.isSuperAdmin);
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
      // Create minimal User-like object from cache
      setUser(cached as unknown as User);
      applyCachedProfile(cached.id);
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
          setSession(session);
          setUser(session.user);
          setLoading(false);
          cacheSession(session.user);
          // Offline: use cached profile immediately instead of network call
          if (!navigator.onLine) {
            applyCachedProfile(session.user.id);
          } else {
            // Defer Supabase calls with setTimeout to prevent deadlock
            setTimeout(() => {
              fetchUserInfo(session.user.id);
            }, 0);
          }
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          setSession(session);
          setUser(session.user);
          cacheSession(session.user);
        } else if (event === 'SIGNED_OUT') {
          // Offline guard: Supabase fires SIGNED_OUT when token
          // refresh fails offline — ignore it to keep user logged in
          if (!navigator.onLine) {
            console.log('AuthContext: Ignoring SIGNED_OUT while offline');
            return;
          }
          // Online: genuine sign-out
          setSession(null);
          setUser(null);
          setCompanyId(null);
          setCompanyName(null);
          setCompanyType(null);
          setIsSuperAdmin(false);
          setIsAdmin(false);
          setIsApproved(false);
          setUserRole(null);
          setLoading(false);
        } else {
          // Offline guard: if session is null while offline, don't overwrite user state
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
          // When offline with a valid session, apply cached profile immediately
          if (session?.user && !navigator.onLine) {
            applyCachedProfile(session.user.id);
          }
          setLoading(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setSession(session);
        setUser(session.user);
        setLoading(false);
        cacheSession(session.user);
        // Offline: use cached profile; Online: fetch fresh data
        if (!navigator.onLine) {
          applyCachedProfile(session.user.id);
        } else {
          fetchUserInfo(session.user.id);
        }
      } else if (!navigator.onLine) {
        // Offline fallback: restore user from cache
        console.log('AuthContext: Offline with no session, trying cache');
        const restored = restoreFromCache();
        setLoading(false);
        if (restored) {
          console.log('AuthContext: Restored user from offline cache');
        }
      } else {
        setSession(null);
        setUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserInfo = async (userId: string) => {
    // Offline guard: never make network calls offline, use cached profile
    if (!navigator.onLine) {
      applyCachedProfile(userId);
      return;
    }

    try {
      // Parallel queries for profile+company and role
      const [profileResult, roleResult] = await Promise.all([
        supabase
          .from('profiles')
          .select(`
            company_id,
            approved,
            companies (
              id,
              navn,
              selskapstype
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
        isApproved: false,
        userRole: null,
        isAdmin: false,
        isSuperAdmin: false,
      };

      // If both queries failed (e.g. network error), fall back to cache
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
      }

      if (roleResult.data) {
        profileData.userRole = roleResult.data.role;
        profileData.isSuperAdmin = roleResult.data.role === 'superadmin';
        profileData.isAdmin = roleResult.data.role === 'admin' || roleResult.data.role === 'superadmin';
      }

      // Apply to state
      setCompanyId(profileData.companyId);
      setCompanyName(profileData.companyName);
      setCompanyType(profileData.companyType);
      setIsApproved(profileData.isApproved);
      setUserRole(profileData.userRole);
      setIsAdmin(profileData.isAdmin);
      setIsSuperAdmin(profileData.isSuperAdmin);

      // Cache for offline use
      saveCachedProfile(userId, profileData);
    } catch (error) {
      console.error('Error fetching user info:', error);
      // If fetch failed (likely offline), try cached profile
      if (!navigator.onLine) {
        applyCachedProfile(userId);
      }
    }
  };

  const signOut = async () => {
    // Clear offline caches before signing out
    try {
      localStorage.removeItem(SESSION_CACHE_KEY);
      if (user) {
        localStorage.removeItem(PROFILE_CACHE_KEY(user.id));
      }
    } catch {
      // ignore
    }
    await supabase.auth.signOut();
  };

  const refetchUserInfo = async () => {
    if (user) {
      await fetchUserInfo(user.id);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      loading, 
      companyId, 
      companyName, 
      companyType, 
      isSuperAdmin, 
      isAdmin,
      isApproved,
      userRole, 
      signOut, 
      refetchUserInfo 
    }}>
      {children}
    </AuthContext.Provider>
  );
};
