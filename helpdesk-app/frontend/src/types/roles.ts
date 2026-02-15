/**
 * Role-based access for the helpdesk.
 *
 * - admin: Full access — company settings, Gmail, users, templates, all tickets.
 * - manager: Manager of one or more teams — see all team tickets, manage team member statuses, see team list on dashboard.
 * - agent: Support access — tickets, customers, templates (use only). No settings, no user management.
 * - viewer: Read-only — view tickets, customers, dashboard. No replies, no edits, no settings.
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
  manager: 'Leder for team: se alle saker i teamet, håndtere status for teammedlemmer.',
  agent: 'Kan håndtere saker, svare kunder og bruke maler.',
  viewer: 'Kun lesing: se saker og kunder.',
};

export function isAdmin(role: Role | null | undefined): boolean {
  return role === 'admin';
}

export function isManager(role: Role | null | undefined): boolean {
  return role === 'manager';
}

/** Admin and manager can see the Brukere (team status) list on the dashboard. */
export function canSeeTeamStatusDashboard(role: Role | null | undefined): boolean {
  return role === 'admin' || role === 'manager';
}

/** Admin and manager can access the Analyse (analytics) page. */
export function canAccessAnalytics(role: Role | null | undefined): boolean {
  return role === 'admin' || role === 'manager';
}

/** Admin and viewer can open Settings; agents have no access. Company tab for both; Users/Templates etc. admin only. */
export function canAccessSettings(role: Role | null | undefined): boolean {
  return role === 'admin' || role === 'viewer';
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
