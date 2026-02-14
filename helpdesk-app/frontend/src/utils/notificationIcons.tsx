import { Calendar, Ticket, MessageSquare, Bell, type LucideIcon } from 'lucide-react';

export type NotificationIconPayload = { link: string | null; title: string };

/**
 * Returns the icon component for a notification based on its link and title.
 * - Planning: Calendar
 * - Ticket mention: MessageSquare
 * - Tickets (assigned, status): Ticket
 * - Default: Bell
 */
export function getNotificationIcon(n: NotificationIconPayload): LucideIcon {
  if (n.link?.startsWith('/planning')) return Calendar;
  if (n.title.toLowerCase().includes('nevnt')) return MessageSquare;
  if (n.link?.includes('/tickets')) return Ticket;
  return Bell;
}
