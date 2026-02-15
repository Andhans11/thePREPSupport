import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Ticket, TicketInsert, TicketUpdate } from '../types/ticket';
import type { Message } from '../types/message';
import { supabase } from '../services/supabase';
import { notifyNewTicket } from '../services/api';
import { useAuth } from './AuthContext';
import { useTenant } from './TenantContext';

export type AssignmentView = 'all' | 'mine' | 'unassigned' | 'team' | 'archived';

export type ViewCounts = Record<AssignmentView, number>;

const TICKETS_PAGE_SIZE = 25;

interface TicketContextValue {
  tickets: Ticket[];
  selectedTicket: Ticket | null;
  messages: Message[];
  loading: boolean;
  loadingMore: boolean;
  hasMoreTickets: boolean;
  error: string | null;
  assignmentView: AssignmentView;
  setAssignmentView: (view: AssignmentView) => void;
  viewCounts: ViewCounts;
  fetchTickets: (filters?: { status?: string; search?: string; assignmentView?: AssignmentView; userId?: string | null }) => Promise<void>;
  loadMoreTickets: () => Promise<void>;
  selectTicket: (ticket: Ticket | null) => void;
  fetchMessages: (ticketId: string) => Promise<void>;
  createTicket: (data: TicketInsert) => Promise<Ticket | null>;
  updateTicket: (id: string, data: TicketUpdate) => Promise<void>;
  deleteTicket: (id: string) => Promise<void>;
  addMessage: (data: {
    ticket_id: string;
    from_email: string;
    from_name?: string;
    content: string;
    html_content?: string | null;
    is_customer: boolean;
    is_internal_note?: boolean;
    mentioned_user_ids?: string[];
    created_by?: string;
  }) => Promise<string | null>;
}

const TicketContext = createContext<TicketContextValue | null>(null);

export function TicketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreTickets, setHasMoreTickets] = useState(false);
  const [_searchResultIds, setSearchResultIds] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assignmentView, setAssignmentView] = useState<AssignmentView>('mine');
  const [viewCounts, setViewCounts] = useState<ViewCounts>({ all: 0, mine: 0, unassigned: 0, team: 0, archived: 0 });
  const lastFiltersRef = useRef<{ status?: string; search?: string; assignmentView: AssignmentView; userId: string | null } | null>(null);
  const searchResultIdsRef = useRef<string[] | null>(null);

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
      const base = supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('tenant_id', currentTenantId).neq('status', 'archived').neq('status', 'closed');
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
    async (
      filters?: { status?: string; search?: string; assignmentView?: AssignmentView; userId?: string | null },
      options?: { append?: boolean; offset?: number }
    ) => {
      if (!currentTenantId) {
        setTickets([]);
        setLoading(false);
        setHasMoreTickets(false);
        setSearchResultIds(null);
        searchResultIdsRef.current = null;
        setViewCounts({ all: 0, mine: 0, unassigned: 0, team: 0, archived: 0 });
        return;
      }
      const append = options?.append ?? false;
      const offset = options?.offset ?? 0;
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setSearchResultIds(null);
        searchResultIdsRef.current = null;
      }
      setError(null);
      const last = lastFiltersRef.current;
      const view = filters?.assignmentView ?? assignmentView;
      const uid = filters?.userId ?? user?.id ?? null;
      const status = filters?.status ?? last?.status;
      const search = filters?.search?.trim() || undefined;
      const effectiveSearch = search ?? last?.search;
      lastFiltersRef.current = { status, search: effectiveSearch, assignmentView: view, userId: uid };

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
          setLoadingMore(false);
          setHasMoreTickets(false);
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
          setLoadingMore(false);
          setHasMoreTickets(false);
          fetchViewCounts(uid);
          return;
        }
        query = query.in('team_id', teamIds);
      } else if (view === 'archived') {
        query = query.eq('status', 'archived');
      } else if (view === 'all') {
        query = query.neq('status', 'archived').neq('status', 'closed');
      }

      if (status) {
        query = query.eq('status', status);
      }

      if (effectiveSearch) {
        let ids: string[];
        if (append && searchResultIdsRef.current && searchResultIdsRef.current.length > 0) {
          ids = searchResultIdsRef.current;
        } else {
          const { data: searchIds, error: searchErr } = await supabase.rpc('search_ticket_ids', {
            search_term: effectiveSearch,
            filter_tenant_id: currentTenantId,
          });
          if (searchErr) {
            setError(searchErr.message);
            setTickets([]);
            setLoading(false);
            setLoadingMore(false);
            setHasMoreTickets(false);
            fetchViewCounts(uid);
            return;
          }
          ids = (searchIds as string[] | null) ?? [];
          if (!append) {
            const next = ids.length > 0 ? ids : null;
            setSearchResultIds(next);
            searchResultIdsRef.current = next;
          }
        }
        if (ids.length === 0) {
          setTickets(append ? (prev) => prev : []);
          setLoading(false);
          setLoadingMore(false);
          setHasMoreTickets(false);
          fetchViewCounts(uid);
          return;
        }
        const pageIds = ids.slice(offset, offset + TICKETS_PAGE_SIZE);
        if (pageIds.length === 0) {
          setHasMoreTickets(false);
          setLoading(false);
          setLoadingMore(false);
          fetchViewCounts(uid);
          return;
        }
        query = query.in('id', pageIds);
      } else {
        query = query.range(offset, offset + TICKETS_PAGE_SIZE - 1);
      }

      const { data, error: e } = await query;
      if (e) {
        setError(e.message);
        if (!append) setTickets([]);
        setHasMoreTickets(false);
      } else {
        const next = (data as Ticket[]) || [];
        if (append) {
          setTickets((prev) => [...prev, ...next]);
        } else {
          setTickets(next);
        }
        setHasMoreTickets(next.length === TICKETS_PAGE_SIZE);
      }
      setLoading(false);
      setLoadingMore(false);
      fetchViewCounts(uid);
    },
    [assignmentView, currentTenantId, fetchViewCounts, getMyTeamIds, getManagedTeamIds, user?.id]
  );

  const loadMoreTickets = useCallback(async () => {
    const last = lastFiltersRef.current;
    if (!last || loadingMore || !hasMoreTickets || !currentTenantId) return;
    const currentLength = tickets.length;
    await fetchTickets(
      {
        status: last.status,
        search: last.search,
        assignmentView: last.assignmentView,
        userId: last.userId,
      },
      { append: true, offset: currentLength }
    );
  }, [currentTenantId, fetchTickets, hasMoreTickets, loadingMore, tickets.length]);

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

  // When switching tenant, clear selected ticket so we don't show the previous tenant's ticket detail
  useEffect(() => {
    setSelectedTicket(null);
    setMessages([]);
  }, [currentTenantId]);

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
    const ticket = inserted as Ticket;
    notifyNewTicket(ticket.id, typeof window !== 'undefined' ? window.location.origin : undefined).catch(() => {});
    return ticket;
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
    mentioned_user_ids?: string[];
    created_by?: string;
  }): Promise<string | null> => {
    if (!currentTenantId) {
      setError('Ingen tenant valgt');
      return null;
    }
    const payload: Record<string, unknown> = {
      ticket_id: data.ticket_id,
      tenant_id: currentTenantId,
      from_email: data.from_email,
      from_name: data.from_name ?? null,
      content: data.content,
      html_content: data.html_content ?? null,
      is_customer: data.is_customer,
      is_internal_note: data.is_internal_note ?? false,
    };
    if (data.mentioned_user_ids != null && data.mentioned_user_ids.length > 0) {
      payload.mentioned_user_ids = data.mentioned_user_ids;
    }
    if (data.created_by != null) {
      payload.created_by = data.created_by;
    }
    const { data: inserted, error: e } = await supabase.from('messages').insert(payload).select('id').single();
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
    loadingMore,
    hasMoreTickets,
    error,
    assignmentView,
    setAssignmentView,
    viewCounts,
    fetchTickets,
    loadMoreTickets,
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
