interface DomainGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean;
}

/**
 * DomainGuard is intentionally a pass-through wrapper.
 *
 * Auth and the app both live on app.avisafe.no. The login.avisafe.no domain is
 * kept only as a 301 fallback at the hosting layer (Lovable Primary domain), so
 * no client-side cross-domain redirects are needed. Authentication gating is
 * handled by the route-level auth guards.
 *
 * The wrapper is kept (instead of being removed from App.tsx) to minimise diff
 * and make the change trivially reversible.
 */
export const DomainGuard = ({ children }: DomainGuardProps) => {
  return <>{children}</>;
};
