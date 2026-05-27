import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MfaChallengeDialog } from "@/components/MfaChallengeDialog";
import LoadingSpinner from "@/components/LoadingSpinner";

/**
 * MfaGate: enforces TOTP MFA for any user who has a verified factor,
 * regardless of how they signed in (password, Google OAuth, etc.).
 * Supabase does not enforce MFA server-side at login — the app must
 * gate access until the session is upgraded to AAL2.
 */
export const MfaGate = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [checking, setChecking] = useState(true);
  const [needsMfa, setNeedsMfa] = useState(false);
  const lastUserIdRef = useRef<string | null>(null);

  const runCheck = async () => {
    try {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error) {
        console.error('MfaGate AAL check failed:', error);
        setNeedsMfa(false);
        return;
      }
      setNeedsMfa(data?.nextLevel === 'aal2' && data?.currentLevel === 'aal1');
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setChecking(false);
      setNeedsMfa(false);
      lastUserIdRef.current = null;
      return;
    }
    // Re-run on user change
    if (lastUserIdRef.current !== user.id) {
      lastUserIdRef.current = user.id;
      setChecking(true);
      void runCheck();
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'MFA_CHALLENGE_VERIFIED') {
        void runCheck();
      }
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [user?.id]);

  if (user && checking) {
    return <LoadingSpinner />;
  }

  if (needsMfa) {
    return (
      <>
        <MfaChallengeDialog
          open
          onVerified={() => {
            setNeedsMfa(false);
            void runCheck();
          }}
          onCancel={() => {
            setNeedsMfa(false);
          }}
        />
      </>
    );
  }

  return <>{children}</>;
};
