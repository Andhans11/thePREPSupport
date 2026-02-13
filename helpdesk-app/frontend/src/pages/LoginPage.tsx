import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirect');
  const isAcceptInviteRedirect = Boolean(redirectTo?.includes('/accept-invite'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await signIn(email, password);
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    const target = redirectTo && redirectTo.startsWith('/') ? redirectTo : '/';
    navigate(target, { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--hiver-bg)] p-4">
      <div className="card-panel w-full max-w-sm p-6 shadow-[var(--hiver-shadow-md)]">
        <h1 className="text-xl font-semibold text-[var(--hiver-text)] text-center">Support Helpdesk</h1>
        <p className="text-[var(--hiver-text-muted)] text-sm text-center mt-1">Logg inn på kontoen din</p>
        {isAcceptInviteRedirect && (
          <p className="mt-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center">
            Logg inn for å godta invitasjonen og bli med i teamet.
          </p>
        )}
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
          )}
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
              autoComplete="current-password"
              className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm text-[var(--hiver-text)] focus:border-[var(--hiver-accent)] focus:ring-1 focus:ring-[var(--hiver-accent)] outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)] disabled:opacity-50"
          >
            {loading ? 'Logger inn…' : 'Logg inn'}
          </button>
        </form>
        <p className="text-center text-sm text-[var(--hiver-text-muted)] mt-4">
          Har du ikke konto?{' '}
          <Link to="/signup" className="text-[var(--hiver-accent)] hover:underline">
            Registrer deg
          </Link>
        </p>
      </div>
    </div>
  );
}
