/**
 * Role-based access for the helpdesk.
 *
 * Suggested roles:
 * - admin: Full access — company settings, Gmail, users (add/edit/roles/status), templates, all tickets.
 * - agent: Support access — tickets, customers, templates (use only). No settings, no user management.
 * - viewer: Read-only — view tickets, customers, dashboard. No replies, no edits, no settings.
 */
export const ROLES = ['admin', 'agent', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  agent: 'Agent',
  viewer: 'Kun leser',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: 'Full tilgang: innstillinger, brukere, maler og alle saker.',
  agent: 'Kan håndtere saker, svare kunder og bruke maler.',
  viewer: 'Kun lesing: se saker og kunder.',
};

export function isAdmin(role: Role | null | undefined): boolean {
  return role === 'admin';
}

/** Any team member can open Settings; Company tab is visible to all, Users/Templates to admin only. */
export function canAccessSettings(role: Role | null | undefined): boolean {
  return role !== null && role !== undefined;
}

export function canManageUsers(role: Role | null | undefined): boolean {
  return role === 'admin';
}

export function canManageTemplates(role: Role | null | undefined): boolean {
  return role === 'admin';
}

export function canReplyToTickets(role: Role | null | undefined): boolean {
  return role === 'admin' || role === 'agent';
}
