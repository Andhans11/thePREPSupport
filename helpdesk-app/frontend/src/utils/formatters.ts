import { format, formatDistanceToNow } from 'date-fns';
import { nb } from 'date-fns/locale';

const locale = nb;

export function formatDate(date: string | Date): string {
  return format(new Date(date), 'd. MMM yyyy', { locale });
}

export function formatDateTime(date: string | Date): string {
  return format(new Date(date), 'd. MMM yyyy HH:mm', { locale });
}

export function formatRelative(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale });
}

export function formatListTime(date: string | Date): string {
  return format(new Date(date), 'd. MMM, HH:mm', { locale });
}

export function formatTicketNumber(num: string): string {
  return num || '—';
}
