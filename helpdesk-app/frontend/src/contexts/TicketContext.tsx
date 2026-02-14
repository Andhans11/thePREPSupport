import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Ticket, TicketInsert, TicketUpdate } from '../types/ticket';
import type { Message } from '../types/message';
import { supabase } from '../services/supabase';
import { useAuth } from './AuthContext';
import { useTenant } from './TenantContext';

export type AssignmentView = 'all' | 'mine' | 'unassigned' | 'team' | 'archived';

export type ViewCounts = Record<AssignmentView, number>;

interface TicketContextValue {
  tickets: Ticket[];
  selectedTicket: Ticket | null;
  messages: Message[];
  loading: boolean;
  error: string | null;
  assignmentView: AssignmentView;
  setAssignmentView: (view: AssignmentView) => void;
  viewCounts: ViewCounts;
  fetchTickets: (filters?: { status?: string; search?: string; assignmentView?: AssignmentView; userId?: string | null }) => Promise<void>;
  selectTicket: (ticket: Ticket | null) => void;
  fetchMessages: (ticketId: string) => Promise<void>;
  createTicket: (data: TicketInsert) => Promise<Ticket | null>;
  updateTicket: (id: string, data: TicketUpdate) => Promise<void>;
  deleteTicket: (id: string) => Promise<void>;
  addMessage: (data: { ticket_id: string; from_email: string; from_name?: string; content: string; html_content?: string | null; is_customer: boolean; is_internal_note?: boolean }) => Promise<string | null>;
}

const TicketContext = createContext<TicketContextValue | null>(null);

export function TicketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignmentView, setAssignmentView] = useState<AssignmentView>('mine');
  const [viewCounts, setViewCounts] = useState<ViewCounts>({ all: 0, mine: 0, unassigned: 0, team: 0, archived: 0 });

  const getMyTeamIds = useCallback(
    async (userId: string | null): Promise<string[]> => {
      if (!userId || !currentTenantId) return [];
      const { data: member } = await supabase
        .from('team_members')
        .select('id')
        .eq('user_id', userId)
        .eq('tenant_id', currentTenantId)
        .maybeSingle();
      if (!member?.id) return [];
      const { data: rows } = await supabase.from('team_member_teams').select('team_id').eq('team_member_id', member.id);
      return (rows ?? []).map((r) => r.team_id);
    },
    [currentTenantId]
  );

  const getManagedTeamIds = useCallback(
    async (userId: string | null): Promise<string[]> => {
      if (!userId || !currentTenantId) return [];
      const { data: member } = await supabase
        .from('team_members')
        .select('id')
        .eq('user_id', userId)
        .eq('tenant_id', currentTenantId)
        .maybeSingle();
      if (!member?.id) return [];
      const { data: rows } = await supabase.from('teams').select('id').eq('manager_team_member_id', member.id).eq('tenant_id', currentTenantId);
      return (rows ?? []).map((r) => r.id);
    },
    [currentTenantId]
  );

  const fetchViewCounts = useCallback(
    async (userId: string | null) => {
      if (!currentTenantId) {
        setViewCounts({ all: 0, mine: 0, unassigned: 0, team: 0, archived: 0 });
        return;
      }
      const base = supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('tenant_id', currentTenantId).neq('status', 'archived');
      const unassignedQ = supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('tenant_id', currentTenantId).is('assigned_to', null).neq('status', 'archived');
      const mineQ = userId ? supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('tenant_id', currentTenantId).eq('assigned_to', userId).neq('status', 'archived') : Promise.resolve({ count: 0 });
      const archivedQ = supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('tenant_id', currentTenantId).eq('status', 'archived');
      const [memberTeamIds, managedTeamIds] = await Promise.all([getMyTeamIds(userId), getManagedTeamIds(userId)]);
      const teamIds = [...new Set([...memberTeamIds, ...managedTeamIds])];
      const teamQ =
        teamIds.length > 0
          ? supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('tenant_id', currentTenantId).in('team_id', teamIds).neq('status', 'archived')
          : Promise.resolve({ count: 0 });

      const [allRes, unassignedRes, teamRes, mineRes, archivedRes] = await Promise.all([base, unassignedQ, teamQ, mineQ, archivedQ]);
      setViewCounts({
        all: allRes.count ?? 0,
        unassigned: unassignedRes.count ?? 0,
        team: teamRes.count ?? 0,
        mine: mineRes.count ?? 0,
        archived: archivedRes.count ?? 0,
      });
    },
    [currentTenantId, getMyTeamIds, getManagedTeamIds]
  );

  const fetchTickets = useCallback(
    async (filters?: { status?: string; search?: string; assignmentView?: AssignmentView; userId?: string | null }) => {
      if (!currentTenantId) {
        setTickets([]);
        setLoading(false);
        setViewCounts({ all: 0, mine: 0, unassigned: 0, team: 0, archived: 0 });
        return;
      }
      setLoading(true);
      setError(null);
      const view = filters?.assignmentView ?? assignmentView;
      const uid = filters?.userId ?? user?.id ?? null;

      let query = supabase
        .from('tickets')
        .select(
          `
        *,
        customer:customers(email, name),
        team:teams(id, name)
      `
        )
        .eq('tenant_id', currentTenantId)
        .order('updated_at', { ascending: false });

      if (view === 'unassigned') {
      query = query.is('assigned_to', null);
    } else if (view === 'mine') {
      if (!uid) {
        setTickets([]);
        setLoading(false);
        fetchViewCounts(uid);
        return;
      }
      query = query.eq('assigned_to', uid);
    } else if (view === 'team') {
      const [memberTeamIds, managedTeamIds] = await Promise.all([getMyTeamIds(uid), getManagedTeamIds(uid)]);
      const teamIds = [...new Set([...memberTeamIds, ...managedTeamIds])];
      if (teamIds.length === 0) {
        setTickets([]);
        setLoading(false);
        fetchViewCounts(uid);
        return;
      }
      query = query.in('team_id', teamIds);
    } else if (view === 'archived') {
      query = query.eq('status', 'archived');
    } else if (view === 'all') {
      query = query.neq('status', 'archived');
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.search?.trim()) {
      const term = filters.search.trim();
      const { data: searchIds, error: searchErr } = await supabase.rpc('search_ticket_ids', { search_term: term, filter_tenant_id: currentTenantId });
      if (searchErr) {
        setError(searchErr.message);
        setTickets([]);
        setLoading(false);
        fetchViewCounts(uid);
        return;
      }
      const ids = (searchIds as string[] | null) ?? [];
      if (ids.length === 0) {
        setTickets([]);
        setLoading(false);
        fetchViewCounts(uid);
        return;
      }
      query = query.in('id', ids);
    }

    const { data, error: e } = await query;
    if (e) {
      setError(e.message);
      setTickets([]);
    } else {
      setTickets((data as Ticket[]) || []);
    }
    setLoading(false);
    fetchViewCounts(uid);
  }, [assignmentView, currentTenantId, fetchViewCounts, getMyTeamIds, user?.id]);

  const fetchMessages = useCallback(async (ticketId: string) => {
    const { data, error: e } = await supabase
      .from('messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });
    if (e) {
      setError(e.message);
      setMessages([]);
    } else {
      setMessages((data as Message[]) || []);
    }
  }, []);

  useEffect(() => {
    fetchTickets({ assignmentView, userId: user?.id ?? null });
  }, [fetchTickets, assignmentView, user?.id, currentTenantId]);

  useEffect(() => {
    fetchViewCounts(user?.id ?? null);
  }, [fetchViewCounts, user?.id, currentTenantId]);

  useEffect(() => {
    if (!selectedTicket) {
      setMessages([]);
      return;
    }
    fetchMessages(selectedTicket.id);
  }, [selectedTicket?.id, fetchMessages]);

  useEffect(() => {
    const channel = supabase
      .channel('tickets-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        fetchTickets();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
        if (selectedTicket && (payload.new as { ticket_id: string }).ticket_id === selectedTicket.id) {
          fetchMessages(selectedTicket.id);
        }
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          // Realtime failed (e.g. wrong API key or Realtime disabled). App still works via manual refetch.
          console.debug('Realtime subscription unavailable; list will update on refresh.');
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTickets, fetchMessages, selectedTicket?.id]);

  const createTicket = async (data: TicketInsert): Promise<Ticket | null> => {
    if (!currentTenantId) return null;
    const { data: inserted, error: e } = await supabase.from('tickets').insert({ ...(data as unknown as Record<string, unknown>), tenant_id: currentTenantId }).select().single();
    if (e) {
      setError(e.message);
      return null;
    }
    await fetchTickets();
    return inserted as Ticket;
  };

  const updateTicket = async (id: string, data: TicketUpdate) => {
    const { error: e } = await supabase.from('tickets').update(data as unknown as Record<string, unknown>).eq('id', id);
    if (e) setError(e.message);
    else await fetchTickets();
    if (selectedTicket?.id === id) {
      setSelectedTicket((prev) => (prev ? { ...prev, ...data } : null));
    }
  };

  const deleteTicket = async (id: string) => {
    const { error: e } = await supabase.from('tickets').delete().eq('id', id);
    if (e) setError(e.message);
    else {
      if (selectedTicket?.id === id) setSelectedTicket(null);
      await fetchTickets();
      await fetchViewCounts(user?.id ?? null);
    }
  };

  const addMessage = async (data: {
    ticket_id: string;
    from_email: string;
    from_name?: string;
    content: string;
    html_content?: string | null;
    is_customer: boolean;
    is_internal_note?: boolean;
  }): Promise<string | null> => {
    if (!currentTenantId) {
      setError('Ingen tenant valgt');
      return null;
    }
    const { data: inserted, error: e } = await supabase.from('messages').insert({
      ticket_id: data.ticket_id,
      tenant_id: currentTenantId,
      from_email: data.from_email,
      from_name: data.from_name ?? null,
      content: data.content,
      html_content: data.html_content ?? null,
      is_customer: data.is_customer,
      is_internal_note: data.is_internal_note ?? false,
    } as unknown as Record<string, unknown>).select('id').single();
    if (e) {
      setError(e.message);
      return null;
    }
    await fetchMessages(data.ticket_id);
    if (!data.is_customer && !data.is_internal_note && user?.id) {
      await updateTicket(data.ticket_id, { assigned_to: user.id });
    }
    // When anything is done on the ticket (reply or internal note), set status to "under arbeid" (pending) if still open/new
    const { data: ticketRow } = await supabase.from('tickets').select('status').eq('id', data.ticket_id).single();
    const status = (ticketRow as { status?: string } | null)?.status;
    if (status === 'open' || status === 'new') {
      await updateTicket(data.ticket_id, { status: 'pending' });
    }
    return (inserted as { id: string } | null)?.id ?? null;
  };

  const value: TicketContextValue = {
    tickets,
    selectedTicket,
    messages,
    loading,
    error,
    assignmentView,
    setAssignmentView,
    viewCounts,
    fetchTickets,
    selectTicket: setSelectedTicket,
    fetchMessages,
    createTicket,
    updateTicket,
    deleteTicket,
    addMessage,
  };

  return <TicketContext.Provider value={value}>{children}</TicketContext.Provider>;
}

export function useTickets() {
  const ctx = useContext(TicketContext);
  if (!ctx) throw new Error('useTickets must be used within TicketProvider');
  return ctx;
}
