import { getRoleColor, getRoleLabel } from '../lib/permissions';

export default function RoleBadge({ role }) {
  const colorClass = getRoleColor(role);
  const label = getRoleLabel(role);

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  );
}