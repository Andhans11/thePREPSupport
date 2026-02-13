import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { supabase } from '../services/supabase';
import { ROLE_LABELS, type Role } from '../types/roles';

const STORAGE_KEY = 'helpdesk_current_tenant_id';

export function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code')?.trim() ?? '';
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { refetchTenants } = useTenant();
  const [invitation, setInvitation] = useState<{
    tenant_name: string;
    email: string;
    role: Role;
    name?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!code) {
      setLoading(false);
      setError('Mangler invitasjonskode.');
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error: rpcError } = await supabase.rpc('get_invitation_by_code', { p_code: code });
      if (cancelled) return;
      if (rpcError || !(data as { ok?: boolean })?.ok) {
        setError((data as { error?: string })?.error ?? rpcError?.message ?? 'Invitasjonen finnes ikke eller er ugyldig.');
        setLoading(false);
        return;
      }
      const inv = data as { tenant_name?: string; email?: string; role?: Role; name?: string };
      setInvitation({
        tenant_name: inv.tenant_name ?? '',
        email: inv.email ?? '',
        role: (inv.role as Role) ?? 'agent',
        name: inv.name,
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [code]);

  useEffect(() => {
    if (!invitation || !user || accepting || error) return;
    const userEmail = user.email?.toLowerCase().trim();
    const invEmail = invitation.email?.toLowerCase().trim();
    if (userEmail !== invEmail) {
      setError('Denne invitasjonen ble sendt til en annen e-postadresse. Logg inn med ' + invitation.email);
      return;
    }
    setAccepting(true);
    supabase.rpc('accept_tenant_invitation', { p_code: code }).then(async ({ data, error: rpcErr }) => {
      if (!(data as { ok?: boolean })?.ok || rpcErr) {
        setError((data as { error?: string })?.error ?? rpcErr?.message ?? 'Kunne ikke godta invitasjonen.');
        setAccepting(false);
        return;
      }
      const tenantId = (data as { tenant_id?: string })?.tenant_id;
      if (tenantId) window.localStorage.setItem(STORAGE_KEY, tenantId);
      await refetchTenants();
      navigate('/', { replace: true });
    });
  }, [invitation, user, code, accepting, error, navigate, refetchTenants]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--hiver-bg)] p-4">
        <div className="flex flex-col items-center gap-3 text-[var(--hiver-text-muted)]">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p>Laster invitasjon…</p>
        </div>
      </div>
    );
  }

  if (error && !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--hiver-bg)] p-4">
        <div className="card-panel w-full max-w-sm p-6 text-center">
          <h1 className="text-xl font-semibold text-[var(--hiver-text)]">Ugyldig invitasjon</h1>
          <p className="mt-2 text-sm text-[var(--hiver-text-muted)]">{error}</p>
          <Link
            to="/login"
            className="mt-4 inline-block text-sm font-medium text-[var(--hiver-accent)] hover:underline"
          >
            Gå til innlogging
          </Link>
        </div>
      </div>
    );
  }

  if (user && invitation && invitation.email?.toLowerCase() !== user.email?.toLowerCase()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--hiver-bg)] p-4">
        <div className="card-panel w-full max-w-sm p-6">
          <h1 className="text-xl font-semibold text-[var(--hiver-text)] text-center">Feil e-post</h1>
          <p className="mt-2 text-sm text-[var(--hiver-text-muted)] text-center">{error}</p>
          <p className="mt-2 text-sm text-[var(--hiver-text-muted)] text-center">
            Logg ut og logg inn med <strong>{invitation.email}</strong>, eller bruk invitasjonslenken i e-posten du mottok.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <Link
              to="/login"
              className="text-center py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)]"
            >
              Gå til innlogging
            </Link>
            <Link
              to="/"
              className="text-center py-2 text-sm text-[var(--hiver-text-muted)] hover:underline"
            >
              Tilbake til appen
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const userEmailMatch = user && invitation && invitation.email?.toLowerCase() === user.email?.toLowerCase();
  if ((accepting || (userEmailMatch && !error)) && invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--hiver-bg)] p-4">
        <div className="flex flex-col items-center gap-3 text-[var(--hiver-text-muted)]">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p>Godtar invitasjon…</p>
        </div>
      </div>
    );
  }

  if (!user && invitation) {
    const loginRedirect = `/accept-invite?code=${encodeURIComponent(code)}`;
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--hiver-bg)] p-4">
        <div className="card-panel w-full max-w-sm p-6">
          <h1 className="text-xl font-semibold text-[var(--hiver-text)] text-center">Du er invitert</h1>
          <p className="mt-2 text-sm text-[var(--hiver-text-muted)] text-center">
            Du er invitert til å bli med i <strong>{invitation.tenant_name}</strong> som{' '}
            <strong>{ROLE_LABELS[invitation.role]}</strong>.
          </p>
          <p className="mt-2 text-xs text-[var(--hiver-text-muted)] text-center">
            Logg inn eller registrer deg med <strong>{invitation.email}</strong> for å godta.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Link
              to={`/login?redirect=${encodeURIComponent(loginRedirect)}`}
              className="w-full text-center py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)]"
            >
              Logg inn
            </Link>
            <Link
              to={`/signup?code=${encodeURIComponent(code)}`}
              className="w-full text-center py-2 rounded-lg border border-[var(--hiver-border)] text-[var(--hiver-text)] text-sm font-medium hover:bg-[var(--hiver-bg)]"
            >
              Registrer deg
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
