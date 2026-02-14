/**
 * User availability status for team list and header.
 * Norwegian labels: Aktiv, Borte, Opptatt, Frakoblet.
 */
export const AVAILABILITY_STATUSES = ['active', 'away', 'busy', 'offline'] as const;
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

const STATUS_ORDER: Record<AvailabilityStatus, number> = {
  active: 0,
  away: 1,
  busy: 2,
  offline: 3,
};

export const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  active: 'Aktiv',
  away: 'Borte',
  busy: 'Opptatt',
  offline: 'Frakoblet',
};

/** Status colors used in header popup and Supportvakt/timeplan (circle + label). */
export const AVAILABILITY_COLORS: Record<AvailabilityStatus, string> = {
  active: '#28C76F',
  away: '#FFAA00',
  busy: '#EA5455',
  offline: '#4B4B4B',
};

export function sortByAvailabilityStatus<T extends { availability_status?: string | null }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    const codeA = (a.availability_status ?? 'active') as AvailabilityStatus;
    const codeB = (b.availability_status ?? 'active') as AvailabilityStatus;
    return (STATUS_ORDER[codeA] ?? 0) - (STATUS_ORDER[codeB] ?? 0);
  });
}
