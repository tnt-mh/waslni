import type { StaffRole, User } from './types';

export type StaffPermission =
  | 'view_admin'
  | 'moderate_content'
  | 'manage_reports'
  | 'review_verification'
  | 'manage_staff'
  | 'reverse_restriction'
  | 'decide_appeals'
  | 'manage_cities'
  | 'send_announcements';

const MODERATOR_PERMISSIONS: StaffPermission[] = [
  'view_admin',
  'moderate_content',
  'manage_reports',
  'review_verification',
];

const ADMIN_PERMISSIONS: StaffPermission[] = [
  ...MODERATOR_PERMISSIONS,
  'reverse_restriction',
  'decide_appeals',
  'manage_cities',
  'send_announcements',
];

export function staffRoleOf(user: Pick<User, 'role' | 'staffRole' | 'status'> | null | undefined): StaffRole | null {
  if (!user || user.status !== 'active') return null;
  return user.staffRole ?? (user.role === 'admin' ? 'admin' : null);
}

export function canStaff(user: Pick<User, 'role' | 'staffRole' | 'status'> | null | undefined, permission: StaffPermission): boolean {
  const role = staffRoleOf(user);
  if (!role) return false;
  if (role === 'super_admin') return true;
  if (role === 'admin') return ADMIN_PERMISSIONS.includes(permission);
  if (role === 'moderator') return MODERATOR_PERMISSIONS.includes(permission);
  return permission === 'view_admin';
}

export function isAdminRole(role: StaffRole | null): boolean {
  return role === 'super_admin' || role === 'admin';
}
