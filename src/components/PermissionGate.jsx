import { useAuth } from '../context/AuthContext';
import { hasPermission } from '../lib/permissions';

export default function PermissionGate({ permission, fallback = null, children }) {
  const { profile } = useAuth();

  if (!profile?.role) return fallback;
  if (!hasPermission(profile.role, permission)) return fallback;

  return children;
}