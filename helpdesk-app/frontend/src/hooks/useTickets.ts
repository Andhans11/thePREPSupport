import { useTickets as useTicketContext } from '../contexts/TicketContext';

export function useTickets() {
  return useTicketContext();
}
