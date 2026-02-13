import { useGmail as useGmailContext } from '../contexts/GmailContext';

export function useGmail() {
  return useGmailContext();
}
