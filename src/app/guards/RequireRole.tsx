import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Role } from '../../services/session';
import { useSession } from '../../services/session';

export const RequireRole = ({ roles, admin, children }: { roles?: Role[]; admin?: boolean; children: ReactNode }) => {
  const session = useSession();
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(session.role)) return <Navigate to="/panel/espera" replace />;
  if (admin && !session.isAdmin) return <Navigate to="/panel/espera" replace />;
  return <>{children}</>;
};
