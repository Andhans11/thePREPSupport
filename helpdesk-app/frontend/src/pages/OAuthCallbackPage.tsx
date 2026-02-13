import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useGmail } from '../contexts/GmailContext';
import { supabase } from '../services/supabase';

export function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { handleOAuthCallback } = useGmail();
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [message, setMessage] = useState('');
  const hasStartedRef = useRef(false);

  useEffect(() => {
    const code = searchParams.get('code');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      setStatus('error');
      setMessage(errorParam === 'access_denied' ? 'Tilgang ble avvist.' : `Feil: ${errorParam}`);
      return;
    }

    if (!code) {
      setStatus('error');
      setMessage('Ingen autorisasjonskode mottatt.');
      return;
    }

    // Run only once per page load so we don't flood the API (avoids 401 spam from re-runs).
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    let cancelled = false;

    const runExchange = async () => {
      // After redirect from Google, session may not be restored yet. Wait briefly for it.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        // Give auth state a moment to hydrate (e.g. from localStorage), then retry once
        await new Promise((r) => setTimeout(r, 300));
        const { data: { session: retrySession } } = await supabase.auth.getSession();
        if (!retrySession?.access_token) {
          if (cancelled) return;
          setStatus('error');
          setMessage('Du må være innlogget. Gå til innstillinger og prøv igjen.');
          return;
        }
      }

      handleOAuthCallback(code)
        .then((ok) => {
          if (cancelled) return;
          if (ok) {
            setStatus('success');
            setMessage('Gmail er koblet til. Omdirigerer…');
            setTimeout(() => navigate('/settings', { replace: true }), 1500);
          } else {
            setStatus('error');
            setMessage('Kunne ikke koble til Gmail. Prøv igjen.');
          }
        })
        .catch(() => {
          if (cancelled) return;
          setStatus('error');
          setMessage('Noe gikk galt. Gå til innstillinger og prøv igjen.');
        });
    };

    runExchange();

    return () => {
      cancelled = true;
    };
  }, [searchParams, handleOAuthCallback, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm text-center">
        <h1 className="text-lg font-semibold text-slate-900">Gmail-tilkobling</h1>
        {status === 'pending' && (
          <p className="text-slate-600 mt-3">Kobler til Gmail-kontoen din…</p>
        )}
        {status === 'success' && (
          <p className="text-emerald-600 mt-3">{message}</p>
        )}
        {status === 'error' && (
          <>
            <p className="text-red-600 mt-3">{message}</p>
            <button
              type="button"
              onClick={() => navigate('/settings', { replace: true })}
              className="mt-4 px-4 py-2 rounded-lg bg-slate-200 text-slate-800 text-sm font-medium hover:bg-slate-300"
            >
              Tilbake til innstillinger
            </button>
          </>
        )}
      </div>
    </div>
  );
}
