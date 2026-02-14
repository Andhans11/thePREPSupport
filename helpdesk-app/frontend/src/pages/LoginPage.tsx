import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const landingFont = 'Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif';

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
    <div
      className="min-h-screen flex flex-col bg-[#f8fafc] p-4"
      style={{ fontFamily: landingFont }}
    >
      <div className="absolute top-4 left-4">
        <Link
          to="/"
          className="text-sm font-medium text-[#64748b] hover:text-[#0f172a] flex items-center gap-1.5"
        >
          ← Tilbake til forsiden
        </Link>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-sm p-6 rounded-xl border border-[#e2e8f0] bg-white shadow-sm">
        <h1 className="text-xl font-semibold text-[#0f172a] text-center">Support Helpdesk</h1>
        <p className="text-[#64748b] text-sm text-center mt-1">Logg inn på kontoen din</p>
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
            <label htmlFor="email" className="block text-sm font-medium text-[#334155] mb-1">
              E-post
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-lg border border-[#cbd5e1] px-3 py-2 text-sm text-[#0f172a] focus:border-[#0f766e] focus:ring-1 focus:ring-[#0f766e] outline-none"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="password" className="block text-sm font-medium text-[#334155]">
                Passord
              </label>
              <Link
                to="/forgot-password"
                className="text-xs text-[#0f766e] hover:underline font-medium"
              >
                Glemt passord?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-[#cbd5e1] px-3 py-2 text-sm text-[#0f172a] focus:border-[#0f766e] focus:ring-1 focus:ring-[#0f766e] outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-[#0f766e] text-white text-sm font-medium hover:bg-[#115e59] disabled:opacity-50 transition-colors"
          >
            {loading ? 'Logger inn…' : 'Logg inn'}
          </button>
        </form>
        <p className="text-center text-sm text-[#64748b] mt-4">
          Har du ikke konto?{' '}
          <Link to="/signup" className="text-[#0f766e] hover:underline font-medium">
            Registrer deg
          </Link>
        </p>
        </div>
      </div>
    </div>
  );
}
