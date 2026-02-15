import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Ticket,
  Users,
  BarChart3,
  Calendar,
  Clock,
  Settings,
  Building2,
  ChevronDown,
  Plus,
  Loader2,
  X,
} from 'lucide-react';
import { useCurrentUserRole } from '../../hooks/useCurrentUserRole';
import { canAccessSettings, canAccessAnalytics, canAccessTimeRegistration } from '../../types/roles';
import { useTenant } from '../../contexts/TenantContext';
import { supabase } from '../../services/supabase';

const MAIN_NAV_ITEMS = [
  { to: '/', label: 'Dashbord', icon: LayoutDashboard, show: () => true },
  { to: '/tickets', label: 'Saker', icon: Ticket, show: () => true },
  { to: '/planning', label: 'Planlegging', icon: Calendar, show: () => true },
  { to: '/timeregistrering', label: 'Timeregistrering', icon: Clock, show: canAccessTimeRegistration },
  { to: '/customers', label: 'Kunder', icon: Users, show: () => true },
  { to: '/analytics', label: 'Analyse', icon: BarChart3, show: canAccessAnalytics },
] as const;

export function Sidebar() {
  const location = useLocation();
  const { role } = useCurrentUserRole();
  const showSettings = canAccessSettings(role);
  const mainNav = MAIN_NAV_ITEMS.filter((item) => item.show(role));
  const { tenants, currentTenantId, setCurrentTenantId, loading: tenantLoading } = useTenant();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [tenantOpen, setTenantOpen] = useState(false);
  const [createOrgModalOpen, setCreateOrgModalOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [createOrgError, setCreateOrgError] = useState<string | null>(null);
  const tenantRef = useRef<HTMLDivElement>(null);

  const currentTenant = tenants.find((t) => t.id === currentTenantId);
  const organisationName = currentTenant?.name ?? 'Organisasjon';

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (tenantRef.current && !tenantRef.current.contains(e.target as Node)) setTenantOpen(false);
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  async function handleCreateOrg() {
    const name = newOrgName.trim();
    if (!name) return;
    setCreateOrgError(null);
    setCreatingOrg(true);
    const { data, error } = await supabase.rpc('create_tenant_and_join', { tenant_name: name });
    setCreatingOrg(false);
    if (error) {
      setCreateOrgError(error.message || 'Kunne ikke opprette organisasjon');
      return;
    }
    const payload = data as { ok?: boolean; tenant_id?: string; error?: string };
    if (!payload?.ok || !payload.tenant_id) {
      setCreateOrgError(payload?.error || 'Kunne ikke opprette organisasjon');
      return;
    }
    setCurrentTenantId(payload.tenant_id);
    setCreateOrgModalOpen(false);
    setTenantOpen(false);
    setNewOrgName('');
    setCreateOrgError(null);
    window.location.reload();
  }

  useEffect(() => {
    if (!currentTenantId) {
      setLogoUrl(null);
      return;
    }
    supabase
      .from('company_settings')
      .select('value')
      .eq('tenant_id', currentTenantId)
      .eq('key', 'company_logo_url')
      .maybeSingle()
      .then(({ data }) => {
        const v = (data as { value: unknown } | null)?.value;
        setLogoUrl(typeof v === 'string' ? v : null);
      });
  }, [currentTenantId]);

  return (
    <aside className="w-56 flex flex-col bg-[var(--hiver-sidebar-bg)] border-r border-[var(--hiver-border)] shrink-0">
      <div className="p-4 border-b border-[var(--hiver-border)] flex items-center justify-center min-h-[4.5rem]">
        <Link to="/" className="flex flex-col items-center justify-center gap-1 text-center">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              className="h-8 w-auto max-w-[180px] object-contain"
            />
          ) : (
            <>
              <img src="/thePREP.svg" alt="thePREP" className="h-8 w-auto" />
              <span className="text-xs font-medium text-[var(--hiver-text-muted)] truncate w-full">
                {organisationName}
              </span>
            </>
          )}
        </Link>
      </div>
      {/* Tenant switcher */}
      <div className="px-3 py-2 border-b border-[var(--hiver-border)]" ref={tenantRef}>
        {!tenantLoading && tenants.length === 0 && (
          <p className="text-xs text-[var(--hiver-text-muted)]">
            Ingen organisasjon.{' '}
            <a href="/accept-invite" className="text-[var(--hiver-accent)] hover:underline">
              Åpne invitasjonslenken
            </a>
          </p>
        )}
        {!tenantLoading && tenants.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setTenantOpen((v) => !v)}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)] border border-[var(--hiver-border)]"
              aria-label="Bytt organisasjon"
            >
              <Building2 className="w-4 h-4 text-[var(--hiver-text-muted)] shrink-0" />
              <span className="min-w-0 truncate flex-1 text-left">{currentTenant?.name ?? 'Organisasjon'}</span>
              <ChevronDown className={`w-4 h-4 text-[var(--hiver-text-muted)] shrink-0 transition ${tenantOpen ? 'rotate-180' : ''}`} />
            </button>
            {tenantOpen && (
              <div className="absolute left-0 top-full mt-1 w-[calc(14rem-1.5rem)] min-w-[200px] max-h-80 overflow-y-auto card-panel shadow-[var(--hiver-shadow-md)] z-50">
                <ul>
                  {tenants.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentTenantId(t.id);
                          setTenantOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-[var(--hiver-bg)] ${t.id === currentTenantId ? 'font-medium text-[var(--hiver-accent)]' : 'text-[var(--hiver-text)]'}`}
                      >
                        {t.name}
                      </button>
                    </li>
                  ))}
                </ul>
                <hr className="border-[var(--hiver-border)] my-1" />
                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setTenantOpen(false);
                      setNewOrgName('');
                      setCreateOrgError(null);
                      setCreateOrgModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-[var(--hiver-accent)] hover:bg-[var(--hiver-bg)] whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    Ny organisasjon
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {mainNav.map(({ to, label, icon: Icon }) => {
          const isActive =
            to === '/'
              ? location.pathname === '/'
              : location.pathname === to || location.pathname.startsWith(to + '/');
          return (
            <Link
              key={to}
              to={to === '/tickets' ? '/tickets?view=mine' : to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-[var(--hiver-selected-bg)] text-[var(--hiver-accent)]'
                  : 'text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]'
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
      {showSettings && (
        <div className="p-3 border-t border-[var(--hiver-border)]">
          <Link
            to="/settings"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              location.pathname === '/settings' || location.pathname.startsWith('/settings')
                ? 'bg-[var(--hiver-selected-bg)] text-[var(--hiver-accent)]'
                : 'text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]'
            }`}
          >
            <Settings className="w-5 h-5 shrink-0" />
            Innstillinger
          </Link>
        </div>
      )}

      {/* Create new organisation modal */}
      {createOrgModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
          onClick={() => !creatingOrg && (setCreateOrgModalOpen(false), setCreateOrgError(null))}
          onKeyDown={(e) => e.key === 'Escape' && !creatingOrg && (setCreateOrgModalOpen(false), setCreateOrgError(null))}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-xl card-panel shadow-[var(--hiver-shadow-md)] p-6"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === 'Escape' && (setCreateOrgModalOpen(false), setCreateOrgError(null))}
            aria-modal="true"
            aria-labelledby="create-org-modal-title"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="create-org-modal-title" className="text-lg font-semibold text-[var(--hiver-text)]">
                Ny organisasjon
              </h2>
              <button
                type="button"
                onClick={() => !creatingOrg && (setCreateOrgModalOpen(false), setCreateOrgError(null))}
                disabled={creatingOrg}
                className="p-1.5 rounded-lg text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)] hover:text-[var(--hiver-text)] disabled:opacity-50"
                aria-label="Lukk"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-[var(--hiver-text-muted)] mb-4">
              Fyll ut informasjonen under for å opprette en ny organisasjon. Du blir satt som administrator.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (newOrgName.trim()) handleCreateOrg();
              }}
              className="space-y-4"
            >
              <div>
                <label htmlFor="create-org-name" className="block text-sm font-medium text-[var(--hiver-text)] mb-1.5">
                  Organisasjonsnavn <span className="text-red-500">*</span>
                </label>
                <input
                  id="create-org-name"
                  type="text"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="F.eks. Mitt selskap AS"
                  className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2.5 text-sm text-[var(--hiver-text)] placeholder:text-[var(--hiver-text-muted)] bg-[var(--hiver-panel-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30 focus:border-[var(--hiver-accent)]"
                  autoFocus
                  disabled={creatingOrg}
                />
              </div>
              {createOrgError && (
                <p className="text-sm text-red-600" role="alert">
                  {createOrgError}
                </p>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setCreateOrgModalOpen(false);
                    setNewOrgName('');
                    setCreateOrgError(null);
                  }}
                  disabled={creatingOrg}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-[var(--hiver-border)] text-sm font-medium text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)] disabled:opacity-50"
                >
                  Avbryt
                </button>
                <button
                  type="submit"
                  disabled={!newOrgName.trim() || creatingOrg}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--hiver-accent)] text-sm font-medium text-white hover:bg-[var(--hiver-accent-hover)] disabled:opacity-50"
                >
                  {creatingOrg ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Opprett organisasjon
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  );
}
