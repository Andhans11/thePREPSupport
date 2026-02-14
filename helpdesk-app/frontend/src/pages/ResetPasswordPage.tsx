import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const landingFont = 'Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif';

export function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const { user, loading: authLoading, updatePassword } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      const hash = window.location.hash;
      if (!hash || !hash.includes('access_token')) {
        setError('Ugyldig eller utløpt lenke. Be om en ny tilbakestillingslenke.');
      }
    }
  }, [user, authLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passordene stemmer ikke overens.');
      return;
    }
    if (password.length < 6) {
      setError('Passordet må være minst 6 tegn.');
      return;
    }
    setLoading(true);
    const { error: err } = await updatePassword(password);
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDone(true);
    setTimeout(() => navigate('/', { replace: true }), 2000);
  };

  if (done) {
    return (
      <div
        className="min-h-screen flex flex-col bg-[#f8fafc] p-4"
        style={{ fontFamily: landingFont }}
      >
        <div className="absolute top-4 left-4">
          <Link to="/" className="text-sm font-medium text-[#64748b] hover:text-[#0f172a] flex items-center gap-1.5">
            ← Tilbake til forsiden
          </Link>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-sm p-6 rounded-xl border border-[#e2e8f0] bg-white shadow-sm text-center">
          <p className="text-[#0f172a] font-medium">Passordet er oppdatert.</p>
          <p className="text-[#64748b] text-sm mt-1">Du videresendes til appen…</p>
          </div>
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-4"
        style={{ fontFamily: landingFont }}
      >
        <p className="text-[#64748b]">Laster…</p>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div
        className="min-h-screen flex flex-col bg-[#f8fafc] p-4"
        style={{ fontFamily: landingFont }}
      >
        <div className="absolute top-4 left-4">
          <Link to="/" className="text-sm font-medium text-[#64748b] hover:text-[#0f172a] flex items-center gap-1.5">
            ← Tilbake til forsiden
          </Link>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-sm p-6 rounded-xl border border-[#e2e8f0] bg-white shadow-sm">
          <p className="text-red-600 text-sm text-center">{error}</p>
          <p className="text-center text-sm text-[#64748b] mt-4">
            <Link to="/forgot-password" className="text-[#0f766e] hover:underline font-medium">
              Be om ny lenke
            </Link>
          </p>
          <p className="text-center text-sm mt-2">
            <Link to="/login" className="text-[#0f766e] hover:underline font-medium">
            Tilbake til innlogging
          </Link>
        </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col bg-[#f8fafc] p-4"
      style={{ fontFamily: landingFont }}
    >
      <div className="absolute top-4 left-4">
        <Link to="/" className="text-sm font-medium text-[#64748b] hover:text-[#0f172a] flex items-center gap-1.5">
          ← Tilbake til forsiden
        </Link>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-sm p-6 rounded-xl border border-[#e2e8f0] bg-white shadow-sm">
        <h1 className="text-xl font-semibold text-[#0f172a] text-center">Sett nytt passord</h1>
        <p className="text-[#64748b] text-sm text-center mt-1">
          Velg et nytt passord for kontoen din.
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
          )}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-[#334155] mb-1">
              Nytt passord
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full rounded-lg border border-[#cbd5e1] px-3 py-2 text-sm text-[#0f172a] focus:border-[#0f766e] focus:ring-1 focus:ring-[#0f766e] outline-none"
            />
          </div>
          <div>
            <label htmlFor="confirm" className="block text-sm font-medium text-[#334155] mb-1">
              Bekreft passord
            </label>
            <input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full rounded-lg border border-[#cbd5e1] px-3 py-2 text-sm text-[#0f172a] focus:border-[#0f766e] focus:ring-1 focus:ring-[#0f766e] outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-[#0f766e] text-white text-sm font-medium hover:bg-[#115e59] disabled:opacity-50 transition-colors"
          >
            {loading ? 'Oppdaterer…' : 'Oppdater passord'}
          </button>
        </form>
        <p className="text-center text-sm text-[#64748b] mt-4">
          <Link to="/login" className="text-[#0f766e] hover:underline font-medium">
            Tilbake til innlogging
          </Link>
        </p>
        </div>
      </div>
    </div>
  );
}
