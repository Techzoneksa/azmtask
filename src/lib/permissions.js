export const ROLES = {
  ADMIN: 'admin',
  DIRECTOR: 'director',
  SUPERVISOR: 'supervisor',
  EMPLOYEE: 'employee'
};

export const PERMISSIONS = {
  // Users
  USERS_VIEW: 'users:view',
  USERS_CREATE: 'users:create',
  USERS_EDIT: 'users:edit',
  USERS_DELETE: 'users:delete',
  USERS_MANAGE_ROLES: 'users:manage_roles',

  // Tasks
  TASKS_VIEW_ALL: 'tasks:view_all',
  TASKS_CREATE: 'tasks:create',
  TASKS_EDIT_ALL: 'tasks:edit_all',
  TASKS_EDIT_OWN: 'tasks:edit_own',
  TASKS_DELETE: 'tasks:delete',
  TASKS_ASSIGN: 'tasks:assign',

  // Phases
  PHASES_MANAGE: 'phases:manage',

  // Documents
  DOCUMENTS_VIEW_ALL: 'documents:view_all',
  DOCUMENTS_UPLOAD: 'documents:upload',
  DOCUMENTS_DELETE: 'documents:delete',

  // Attendance
  ATTENDANCE_VIEW_ALL: 'attendance:view_all',
  ATTENDANCE_MANAGE: 'attendance:manage',

  // Reports
  REPORTS_VIEW_ALL: 'reports:view_all',
  REPORTS_EXPORT: 'reports:export',

  // Settings
  SETTINGS_MANAGE: 'settings:manage',
  SETTINGS_COMPANY_EDIT: 'settings:company_edit'
};

const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: Object.values(PERMISSIONS),
  [ROLES.DIRECTOR]: [
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.TASKS_VIEW_ALL,
    PERMISSIONS.TASKS_CREATE,
    PERMISSIONS.TASKS_EDIT_ALL,
    PERMISSIONS.TASKS_DELETE,
    PERMISSIONS.TASKS_ASSIGN,
    PERMISSIONS.PHASES_MANAGE,
    PERMISSIONS.DOCUMENTS_VIEW_ALL,
    PERMISSIONS.DOCUMENTS_UPLOAD,
    PERMISSIONS.ATTENDANCE_VIEW_ALL,
    PERMISSIONS.REPORTS_VIEW_ALL,
    PERMISSIONS.REPORTS_EXPORT,
  ],
  [ROLES.SUPERVISOR]: [
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.TASKS_VIEW_ALL,
    PERMISSIONS.TASKS_CREATE,
    PERMISSIONS.TASKS_EDIT_OWN,
    PERMISSIONS.TASKS_ASSIGN,
    PERMISSIONS.DOCUMENTS_VIEW_ALL,
    PERMISSIONS.DOCUMENTS_UPLOAD,
    PERMISSIONS.ATTENDANCE_VIEW_ALL,
    PERMISSIONS.REPORTS_VIEW_ALL,
  ],
  [ROLES.EMPLOYEE]: [
    PERMISSIONS.TASKS_VIEW_ALL,
    PERMISSIONS.TASKS_CREATE,
    PERMISSIONS.TASKS_EDIT_OWN,
    PERMISSIONS.DOCUMENTS_VIEW_ALL,
    PERMISSIONS.DOCUMENTS_UPLOAD,
    PERMISSIONS.REPORTS_VIEW_ALL,
  ]
};

export function hasPermission(userRole, permission) {
  if (!userRole) return false;
  const permissions = ROLE_PERMISSIONS[userRole] || [];
  return permissions.includes(permission);
}

export function getRoleColor(role) {
  switch (role) {
    case ROLES.ADMIN: return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    case ROLES.DIRECTOR: return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
    case ROLES.SUPERVISOR: return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case ROLES.EMPLOYEE: return 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400';
    default: return 'bg-slate-100 text-slate-700';
  }
}

export function getRoleLabel(role) {
  switch (role) {
    case ROLES.ADMIN: return 'مدير النظام';
    case ROLES.DIRECTOR: return 'مدير';
    case ROLES.SUPERVISOR: return 'مشرف';
    case ROLES.EMPLOYEE: return 'موظف';
    default: return role;
  }
}

export function canManageUser(currentUserRole, targetUserRole) {
  if (currentUserRole === ROLES.ADMIN) return true;
  if (currentUserRole === ROLES.DIRECTOR && targetUserRole !== ROLES.ADMIN && targetUserRole !== ROLES.DIRECTOR) return true;
  return false;
}

export function isRoleHigherOrEqual(userRole, targetRole) {
  const hierarchy = [ROLES.EMPLOYEE, ROLES.SUPERVISOR, ROLES.DIRECTOR, ROLES.ADMIN];
  return hierarchy.indexOf(userRole) >= hierarchy.indexOf(targetRole);
}