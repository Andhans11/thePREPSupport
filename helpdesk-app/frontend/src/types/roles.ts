/**
 * Role-based access for the helpdesk.
 *
 * - admin: Full access — company settings, Gmail, users, templates, all tickets.
 * - manager: Manager of one or more teams — see all tenant tickets, manage team member statuses, team list on dashboard;
 *   optional read-only team directory under Innstillinger (same teams they belong to or lead).
 * - agent: Handle only tickets assigned to them or tickets in their teams (Mine / Team views). Team directory (read-only,
 *   team-scoped). No company/inbox/template admin.
 * - viewer: Read-only — view tickets, customers, dashboard. No replies, no edits; limited settings (company/inboxes).
 */
export const ROLES = ['admin', 'manager', 'agent', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  manager: 'Leder',
  agent: 'Agent',
  viewer: 'Kun leser',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: 'Full tilgang: innstillinger, brukere, maler og alle saker.',
  manager: 'Leder: se alle saker, team på dashbord, og teammedlemmer i egne team under Innstillinger.',
  agent: 'Ser egne og teamets saker (inkl. lukket/arkivert innenfor dette). Kan svare kunder og bruke maler. Ingen tilgang til Innstillinger.',
  viewer: 'Kun lesing: se saker og kunder.',
};

export function isAdmin(role: Role | null | undefined): boolean {
  return role === 'admin';
}

export function isManager(role: Role | null | undefined): boolean {
  return role === 'manager';
}

export function isAgent(role: Role | null | undefined): boolean {
  return role === 'agent';
}

/** Admin and manager can see the Brukere (team status) list on the dashboard. */
export function canSeeTeamStatusDashboard(role: Role | null | undefined): boolean {
  return role === 'admin' || role === 'manager';
}

/**
 * Legacy helper: default analytics visibility matched admin + manager.
 * Prefer `canAccessModule('analytics', …)` from `types/modules` with Innstillinger → Moduler.
 */
export function canAccessAnalytics(role: Role | null | undefined): boolean {
  return role === 'admin' || role === 'manager';
}

/** Settings: admin (all), viewer (company/innbokser), manager (company/innbokser + teamkatalog). Agents use the app without Innstillinger. */
export function canAccessSettings(role: Role | null | undefined): boolean {
  return role === 'admin' || role === 'viewer' || role === 'manager';
}

/** Managers see Brukere as a read-only, team-scoped directory under Innstillinger (not full user admin). */
export function canViewTeamDirectory(role: Role | null | undefined): boolean {
  return role === 'manager';
}

export function canManageUsers(role: Role | null | undefined): boolean {
  return role === 'admin';
}

export function canManageTeams(role: Role | null | undefined): boolean {
  return role === 'admin';
}

export function canManageTemplates(role: Role | null | undefined): boolean {
  return role === 'admin';
}

export function canReplyToTickets(role: Role | null | undefined): boolean {
  return role === 'admin' || role === 'agent';
}

/** Admin and manager can add/edit/delete planning slots and see all slots; agents see only their own and can approve/reject. */
export function canManagePlanningSlots(role: Role | null | undefined): boolean {
  if (role == null) return false;
  const r = role.toLowerCase();
  return r === 'admin' || r === 'manager';
}

/** Agents can approve or reject their own planning slots (no add/edit/delete). */
export function canApproveRejectOwnSlots(role: Role | null | undefined): boolean {
  return role === 'agent' || role === 'admin' || role === 'manager';
}

/** All team members can access time registration (timeregistrering). */
export function canAccessTimeRegistration(role: Role | null | undefined): boolean {
  return role != null;
}

/** Admin and manager can approve time entries; approvers list is also checked in the app. */
export function canApproveTimeRegistration(role: Role | null | undefined): boolean {
  return role === 'admin' || role === 'manager';
}
