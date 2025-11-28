import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { isLoginDomain, isAppDomain, isProductionDomain, redirectToLogin, redirectToApp } from '@/config/domains';

interface DomainGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean;
}

/**
 * DomainGuard ensures users are on the correct domain based on authentication state.
 * - Login domain (login.avisafe.no): For unauthenticated users
 * - App domain (app.avisafe.no): For authenticated users
 * - Development: No domain restrictions
 */
export const DomainGuard = ({ children, requireAuth = true }: DomainGuardProps) => {
  const { user, loading } = useAuth();

  useEffect(() => {
    // Skip domain checks in development
    if (!isProductionDomain() || loading) {
      return;
    }

    // If user is logged in and on login domain → redirect to app domain
    if (user && isLoginDomain()) {
      console.log('User logged in on login domain, redirecting to app domain');
      redirectToApp('/');
      return;
    }

    // If user is NOT logged in and on app domain → redirect to login domain
    if (!user && isAppDomain() && requireAuth) {
      console.log('User not logged in on app domain, redirecting to login domain');
      redirectToLogin('/auth');
      return;
    }
  }, [user, loading, requireAuth]);

  // Show nothing during redirect
  if (!isProductionDomain() || loading) {
    return <>{children}</>;
  }

  // In production, check domain rules
  if (user && isLoginDomain()) {
    return null; // Will redirect
  }

  if (!user && isAppDomain() && requireAuth) {
    return null; // Will redirect
  }

  return <>{children}</>;
};
