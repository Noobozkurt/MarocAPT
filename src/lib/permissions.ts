// Granular RBAC. Server code checks *permissions*, never role names.
// This file is imported by edge middleware, so it must stay dependency-free.

export const ROLES = ['CUSTOMER', 'SUPER_ADMIN', 'CATALOG_MANAGER', 'SUPPORT_AGENT', 'FINANCE', 'MARKETING'] as const;
export type RoleName = (typeof ROLES)[number];

export const PERMISSIONS = [
  'admin:access',
  'dashboard:view',
  'products:read',
  'products:write',
  'products:publish',
  'categories:write',
  'bundles:write',
  'orders:read',
  'orders:write',
  'orders:manual_grant',
  'refunds:request',
  'refunds:execute',
  'refunds:approve',
  'customers:read',
  'customers:write',
  'customers:impersonate',
  'licenses:read',
  'licenses:write',
  'downloads:reset_limit',
  'support:inbox',
  'support:canned_replies',
  'support:help_center',
  'reviews:moderate',
  'marketing:coupons',
  'marketing:sales',
  'marketing:campaigns',
  'finance:reports',
  'finance:settings',
  'settings:manage',
  'staff:manage',
  'audit:read',
  'system:health',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const STAFF_BASE: Permission[] = ['admin:access', 'dashboard:view'];

export const ROLE_PERMISSIONS: Record<RoleName, readonly Permission[]> = {
  CUSTOMER: [],
  SUPER_ADMIN: PERMISSIONS,
  CATALOG_MANAGER: [...STAFF_BASE, 'products:read', 'products:write', 'products:publish', 'categories:write', 'bundles:write', 'reviews:moderate'],
  SUPPORT_AGENT: [
    ...STAFF_BASE,
    'products:read',
    'orders:read', // read-only order lookup
    'refunds:request', // can only *request*; finance approves
    'customers:read',
    'licenses:read',
    'downloads:reset_limit',
    'support:inbox',
    'support:canned_replies',
    'support:help_center',
    'marketing:coupons', // issue goodwill coupons from chat
  ],
  FINANCE: [
    ...STAFF_BASE,
    'products:read',
    'orders:read',
    'orders:write',
    'orders:manual_grant',
    'refunds:execute',
    'refunds:approve',
    'customers:read',
    'licenses:read',
    'licenses:write',
    'finance:reports',
    'finance:settings',
    'audit:read',
  ],
  MARKETING: [...STAFF_BASE, 'products:read', 'marketing:coupons', 'marketing:sales', 'marketing:campaigns', 'reviews:moderate'],
};

export function isRole(v: unknown): v is RoleName {
  return typeof v === 'string' && (ROLES as readonly string[]).includes(v);
}

export function hasPermission(role: RoleName | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function permissionsFor(role: RoleName): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function isStaff(role: RoleName | null | undefined): boolean {
  return hasPermission(role, 'admin:access');
}

export class ForbiddenError extends Error {
  status = 403;
  constructor(public permission: string) {
    super(`Forbidden: missing permission "${permission}"`);
  }
}

export class UnauthorizedError extends Error {
  status = 401;
  constructor(message = 'Authentication required') {
    super(message);
  }
}
