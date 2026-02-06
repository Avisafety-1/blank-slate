import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
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
 * 
 * IMPORTANT: Does NOT redirect from /auth route - Auth.tsx handles its own OAuth redirect logic
 */
export const DomainGuard = ({ children, requireAuth = true }: DomainGuardProps) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  
  // Check if we're on the auth page - let Auth.tsx handle its own redirects
  const isAuthPage = location.pathname === '/auth';

  useEffect(() => {
    // Skip domain checks in development
    if (!isProductionDomain() || loading) {
      return;
    }

    // Skip redirects when offline - user can't reach other domains anyway
    if (!navigator.onLine) {
      console.log('DomainGuard: Offline, skipping redirects');
      return;
    }

    // IMPORTANT: Don't auto-redirect from /auth page
    // Auth.tsx needs to handle OAuth callbacks and profile verification first
    if (isAuthPage) {
      console.log('DomainGuard: On /auth page, skipping auto-redirect to let Auth.tsx handle OAuth flow');
      return;
    }

    // If user is logged in and on login domain → redirect to app domain
    if (user && isLoginDomain()) {
      console.log('DomainGuard: User logged in on login domain, redirecting to app domain');
      redirectToApp('/');
      return;
    }

    // If user is NOT logged in and on app domain → redirect to login domain
    if (!user && isAppDomain() && requireAuth) {
      console.log('DomainGuard: User not logged in on app domain, redirecting to login domain');
      redirectToLogin('/auth');
      return;
    }
  }, [user, loading, requireAuth, isAuthPage]);

  // Show nothing during redirect
  if (!isProductionDomain() || loading) {
    return <>{children}</>;
  }

  // Don't block rendering on /auth page - Auth.tsx handles it
  if (isAuthPage) {
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
