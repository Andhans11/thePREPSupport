import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabase';

const STORAGE_KEY = 'helpdesk_current_tenant_id';

export function SignupPage() {
  const [searchParams] = useSearchParams();
  const inviteCode = searchParams.get('code')?.trim() ?? '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const isInviteFlow = Boolean(inviteCode);

  useEffect(() => {
    if (inviteCode) {
      supabase.rpc('get_invitation_by_code', { p_code: inviteCode }).then(({ data }) => {
        if ((data as { ok?: boolean })?.ok && (data as { email?: string })?.email) {
          setEmail((data as { email: string }).email);
        }
      });
    }
  }, [inviteCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await signUp(email, password, name || undefined);
    if (err) {
      setLoading(false);
      setError(err.message);
      return;
    }
    if (isInviteFlow) {
      // Session may be null if email confirmation is required; then we must redirect to accept-invite after login
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: acceptData, error: acceptErr } = await supabase.rpc('accept_tenant_invitation', { p_code: inviteCode });
        setLoading(false);
        if (acceptErr || !(acceptData as { ok?: boolean })?.ok) {
          setError((acceptData as { error?: string })?.error ?? acceptErr?.message ?? 'Kunne ikke godta invitasjonen.');
          return;
        }
        const tenantId = (acceptData as { tenant_id?: string })?.tenant_id;
        if (tenantId) window.localStorage.setItem(STORAGE_KEY, tenantId);
        navigate('/', { replace: true });
        return;
      }
      setLoading(false);
      const acceptInviteUrl = `/accept-invite?code=${encodeURIComponent(inviteCode)}`;
      navigate(`/login?redirect=${encodeURIComponent(acceptInviteUrl)}`, { replace: true });
      return;
    }
    const trimmed = tenantName?.trim();
    if (!trimmed) {
      setError('Organisasjonsnavn er påkrevd');
      setLoading(false);
      return;
    }
    const { data: rpcData, error: rpcErr } = await supabase.rpc('create_tenant_and_join', { tenant_name: trimmed });
    setLoading(false);
    if (rpcErr || !(rpcData as { ok?: boolean })?.ok) {
      setError((rpcData as { error?: string })?.error || rpcErr?.message || 'Kunne ikke opprette organisasjon');
      return;
    }
    const tenantId = (rpcData as { tenant_id?: string })?.tenant_id;
    if (tenantId) window.localStorage.setItem(STORAGE_KEY, tenantId);
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--hiver-bg)] p-4">
      <div className="card-panel w-full max-w-sm p-6 shadow-[var(--hiver-shadow-md)]">
        <h1 className="text-xl font-semibold text-[var(--hiver-text)] text-center">Support Helpdesk</h1>
        <p className="text-[var(--hiver-text-muted)] text-sm text-center mt-1">Opprett konto</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
          )}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-[var(--hiver-text)] mb-1">
              Navn (valgfritt)
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm text-[var(--hiver-text)] focus:border-[var(--hiver-accent)] focus:ring-1 focus:ring-[var(--hiver-accent)] outline-none"
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[var(--hiver-text)] mb-1">
              E-post
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm text-[var(--hiver-text)] focus:border-[var(--hiver-accent)] focus:ring-1 focus:ring-[var(--hiver-accent)] outline-none"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-[var(--hiver-text)] mb-1">
              Passord
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm text-[var(--hiver-text)] focus:border-[var(--hiver-accent)] focus:ring-1 focus:ring-[var(--hiver-accent)] outline-none"
            />
          </div>
          {!isInviteFlow && (
            <div>
              <label htmlFor="tenantName" className="block text-sm font-medium text-[var(--hiver-text)] mb-1">
                Organisasjonsnavn
              </label>
              <input
                id="tenantName"
                type="text"
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                required
                placeholder="F.eks. Mitt supportteam"
                className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm text-[var(--hiver-text)] focus:border-[var(--hiver-accent)] focus:ring-1 focus:ring-[var(--hiver-accent)] outline-none"
              />
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)] disabled:opacity-50"
          >
            {loading ? (isInviteFlow ? 'Registrerer og godtar invitasjon…' : 'Oppretter konto…') : 'Registrer deg'}
          </button>
        </form>
        <p className="text-center text-sm text-[var(--hiver-text-muted)] mt-4">
          Har du allerede en konto?{' '}
          <Link
            to={isInviteFlow ? `/login?redirect=${encodeURIComponent(`/accept-invite?code=${inviteCode}`)}` : '/login'}
            className="text-[var(--hiver-accent)] hover:underline"
          >
            Logg inn
          </Link>
        </p>
      </div>
    </div>
  );
}
