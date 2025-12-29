import { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type CompanyType = 'droneoperator' | 'flyselskap' | null;

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

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        if (event === 'SIGNED_IN' && session?.user) {
          // Defer Supabase calls with setTimeout to prevent deadlock
          setTimeout(() => {
            fetchUserInfo(session.user.id);
          }, 0);
        } else if (event === 'SIGNED_OUT') {
          setCompanyId(null);
          setCompanyName(null);
          setCompanyType(null);
          setIsSuperAdmin(false);
          setIsAdmin(false);
          setIsApproved(false);
          setUserRole(null);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      
      if (session?.user) {
        fetchUserInfo(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserInfo = async (userId: string) => {
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
      
      if (profileResult.data) {
        const profile = profileResult.data;
        setCompanyId(profile.company_id);
        setIsApproved(profile.approved ?? false);
        
        const company = profile.companies as any;
        setCompanyName(company?.navn || null);
        setCompanyType(company?.selskapstype || 'droneoperator');
      }

      if (roleResult.data) {
        setUserRole(roleResult.data.role);
        setIsSuperAdmin(roleResult.data.role === 'superadmin');
        setIsAdmin(roleResult.data.role === 'admin' || roleResult.data.role === 'superadmin');
      }
    } catch (error) {
      console.error('Error fetching user info:', error);
    }
  };

  const signOut = async () => {
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
