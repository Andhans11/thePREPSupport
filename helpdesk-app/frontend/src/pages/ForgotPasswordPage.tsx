import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const landingFont = 'Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { resetPasswordForEmail } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await resetPasswordForEmail(email);
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSent(true);
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
        <h1 className="text-xl font-semibold text-[#0f172a] text-center">Glemt passord</h1>
        <p className="text-[#64748b] text-sm text-center mt-1">
          Skriv inn e-posten din, så sender vi deg en lenke for å tilbakestille passordet.
        </p>
        {sent ? (
          <div className="mt-6 p-4 rounded-lg bg-[#f0fdf4] border border-[#bbf7d0] text-[#166534] text-sm text-center">
            Sjekk e-posten din. Vi har sendt en lenke for å tilbakestille passordet.
          </div>
        ) : (
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
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-[#0f766e] text-white text-sm font-medium hover:bg-[#115e59] disabled:opacity-50 transition-colors"
            >
              {loading ? 'Sender…' : 'Send tilbakestillingslenke'}
            </button>
          </form>
        )}
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
