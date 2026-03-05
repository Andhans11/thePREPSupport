import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '../services/supabase';
import { useTenant } from './TenantContext';

export interface TicketStatusRow {
  id: string;
  code: string;
  label: string;
  sort_order: number;
  color: string;
  description: string | null;
  color_hex: string | null;
}

export interface TicketCategoryRow {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  color_hex: string | null;
}

interface MasterDataContextValue {
  statuses: TicketStatusRow[];
  categories: TicketCategoryRow[];
  loading: boolean;
  refetch: () => Promise<void>;
}

const MasterDataContext = createContext<MasterDataContextValue | null>(null);

export function MasterDataProvider({ children }: { children: ReactNode }) {
  const { currentTenantId } = useTenant();
  const [statuses, setStatuses] = useState<TicketStatusRow[]>([]);
  const [categories, setCategories] = useState<TicketCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!currentTenantId) {
      setStatuses([]);
      setCategories([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [statusRes, categoryRes] = await Promise.all([
        supabase
          .from('ticket_statuses')
          .select('id, code, label, sort_order, color, description, color_hex')
          .eq('tenant_id', currentTenantId)
          .order('sort_order'),
        supabase
          .from('ticket_categories')
          .select('id, name, description, sort_order, color_hex')
          .eq('tenant_id', currentTenantId)
          .order('sort_order'),
      ]);
      setStatuses((statusRes.data as TicketStatusRow[]) ?? []);
      setCategories((categoryRes.data as TicketCategoryRow[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [currentTenantId]);

  useEffect(() => {
    refetch();
  }, [refetch, currentTenantId]);

  const value = useMemo(
    () => ({ statuses, categories, loading, refetch }),
    [statuses, categories, loading, refetch]
  );

  return (
    <MasterDataContext.Provider value={value}>
      {children}
    </MasterDataContext.Provider>
  );
}

export function useMasterData() {
  const ctx = useContext(MasterDataContext);
  if (!ctx) {
    return {
      statuses: [] as TicketStatusRow[],
      categories: [] as TicketCategoryRow[],
      loading: true,
      refetch: async () => {},
    };
  }
  return ctx;
}
