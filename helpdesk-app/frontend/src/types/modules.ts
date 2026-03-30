import { ROLES, type Role } from './roles';

export type ModuleId = 'planning' | 'time_registration' | 'calendar' | 'analytics';

export type ModuleRoleAccess = Record<Role, boolean>;

export const MODULE_IDS: ModuleId[] = ['planning', 'time_registration', 'calendar', 'analytics'];

export const MODULE_LABELS: Record<ModuleId, string> = {
  planning: 'Planlegging',
  time_registration: 'Timeregistrering',
  calendar: 'Kalender',
  analytics: 'Analyse',
};

/** Default role visibility when `role_access` is missing (matches previous hard-coded rules). */
export function defaultRoleAccessForModule(module: ModuleId): ModuleRoleAccess {
  if (module === 'analytics') {
    return { admin: true, manager: true, agent: false, viewer: false };
  }
  return { admin: true, manager: true, agent: true, viewer: true };
}

export function defaultRoleAccessAll(): Record<ModuleId, ModuleRoleAccess> {
  return {
    planning: defaultRoleAccessForModule('planning'),
    time_registration: defaultRoleAccessForModule('time_registration'),
    calendar: defaultRoleAccessForModule('calendar'),
    analytics: defaultRoleAccessForModule('analytics'),
  };
}

export function parseRoleAccessFromJson(raw: unknown): Record<ModuleId, ModuleRoleAccess> {
  const out = defaultRoleAccessAll();
  if (!raw || typeof raw !== 'object') return out;
  const ra = (raw as { role_access?: unknown }).role_access;
  if (!ra || typeof ra !== 'object') return out;
  for (const id of MODULE_IDS) {
    const mod = (ra as Record<string, unknown>)[id];
    if (!mod || typeof mod !== 'object') continue;
    for (const r of ROLES) {
      if (typeof (mod as Record<string, unknown>)[r] === 'boolean') {
        out[id] = { ...out[id], [r]: (mod as Record<string, boolean>)[r] };
      }
    }
  }
  return out;
}

export function canAccessModule(
  _moduleId: ModuleId,
  moduleEnabled: boolean,
  roleAccess: ModuleRoleAccess,
  role: Role | null | undefined
): boolean {
  if (!role) return false;
  if (!moduleEnabled) return false;
  return !!roleAccess[role];
}
