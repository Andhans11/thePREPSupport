import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { supabase } from '../services/supabase';

export interface NotificationRow {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

const DEFAULT_LIMIT = 20;

export function useNotifications(options: { limit?: number; unreadOnly?: boolean } = {}) {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const limit = options.limit ?? DEFAULT_LIMIT;
  const unreadOnly = options.unreadOnly ?? false;
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) {
      setItems([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }
    const baseListQuery = () => {
      let q = supabase
        .from('notifications')
        .select('id, title, body, link, read_at, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (currentTenantId) q = q.eq('tenant_id', currentTenantId);
      if (unreadOnly) q = q.is('read_at', null);
      return q;
    };
    const countQuery = () => {
      let q = supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('read_at', null);
      if (currentTenantId) q = q.eq('tenant_id', currentTenantId);
      return q;
    };
    const [listRes, countRes] = await Promise.all([baseListQuery(), countQuery()]);
    if (listRes.error) {
      setItems([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }
    const list = (listRes.data as NotificationRow[]) ?? [];
    setItems(list);
    setUnreadCount(countRes.count ?? list.filter((n) => !n.read_at).length);
    setLoading(false);
  }, [user?.id, currentTenantId, limit, unreadOnly]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchNotifications();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchNotifications]);

  const markAsRead = useCallback(
    async (id: string) => {
      if (!user?.id) return;
      await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', user.id);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    },
    [user?.id]
  );

  const markAllAsRead = useCallback(async () => {
    if (!user?.id) return;
    let q = supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('read_at', null);
    if (currentTenantId) {
      q = q.eq('tenant_id', currentTenantId);
    }
    await q;
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    setUnreadCount(0);
  }, [user?.id, currentTenantId]);

  return { items, unreadCount, loading, markAsRead, markAllAsRead, refetch: fetchNotifications };
}
