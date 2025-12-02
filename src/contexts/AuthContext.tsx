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
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        // Check approval for Google sign-in users
        if (event === 'SIGNED_IN' && session?.user) {
          setTimeout(async () => {
            const { data: profileData } = await supabase
              .from("profiles")
              .select("approved")
              .eq("id", session.user.id)
              .maybeSingle();

            if (profileData && !profileData.approved) {
              await supabase.auth.signOut();
              toast.error("Din konto venter på godkjenning fra administrator");
            } else {
              // Fetch company info after approval check
              fetchUserInfo(session.user.id);
            }
          }, 0);
        } else if (event === 'SIGNED_OUT') {
          setCompanyId(null);
          setCompanyName(null);
          setCompanyType(null);
          setIsSuperAdmin(false);
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
      // Fetch company info including type
      const { data: profile } = await supabase
        .from('profiles')
        .select(`
          company_id,
          companies (
            id,
            navn,
            selskapstype
          )
        `)
        .eq('id', userId)
        .single();
      
      if (profile) {
        setCompanyId(profile.company_id);
        const company = profile.companies as any;
        setCompanyName(company?.navn || null);
        setCompanyType(company?.selskapstype || 'droneoperator');
      }

      // Fetch user's single role
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (roleData) {
        setUserRole(roleData.role);
        setIsSuperAdmin(roleData.role === 'superadmin');
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
    <AuthContext.Provider value={{ user, session, loading, companyId, companyName, companyType, isSuperAdmin, userRole, signOut, refetchUserInfo }}>
      {children}
    </AuthContext.Provider>
  );
};