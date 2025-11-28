import { useAuth } from '@/contexts/AuthContext';

const roleHierarchy = ['lesetilgang', 'operatør', 'saksbehandler', 'admin', 'superadmin'];

export const useRoleCheck = () => {
  const { userRole } = useAuth();
  
  const hasRole = (requiredRole: string): boolean => {
    if (!userRole) return false;
    const userLevel = roleHierarchy.indexOf(userRole);
    const requiredLevel = roleHierarchy.indexOf(requiredRole);
    return userLevel >= requiredLevel;
  };
  
  return { 
    userRole, 
    hasRole, 
    isAdmin: hasRole('admin'), 
    isSuperAdmin: hasRole('superadmin'),
    isSaksbehandler: hasRole('saksbehandler'),
    isOperator: hasRole('operatør')
  };
};
