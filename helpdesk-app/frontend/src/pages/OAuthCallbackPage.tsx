import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useGmail } from '../contexts/GmailContext';
import { useGoogleCalendar } from '../contexts/GoogleCalendarContext';
import { useTenant } from '../contexts/TenantContext';
import { oauthExchangeOnce } from '../services/oauthExchangeOnce';
import { supabase } from '../services/supabase';

export function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { handleOAuthCallback } = useGmail();
  const { handleOAuthCallback: handleCalendarOAuthCallback } = useGoogleCalendar();
  const { setCurrentTenantId } = useTenant();
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [message, setMessage] = useState('');
  const gmailHandlerRef = useRef(handleOAuthCallback);
  const calendarHandlerRef = useRef(handleCalendarOAuthCallback);
  gmailHandlerRef.current = handleOAuthCallback;
  calendarHandlerRef.current = handleCalendarOAuthCallback;

  useEffect(() => {
    const code = searchParams.get('code');
    const errorParam = searchParams.get('error');
    const state = searchParams.get('state');

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

    setStatus('pending');
    setMessage('');

    const calendarStateMatch = typeof state === 'string' ? /^calendar:([a-f0-9-]{36})/i.exec(state) : null;
    const isCalendarState = !!calendarStateMatch;
    const calendarTenantIdFromState = calendarStateMatch?.[1] ?? null;
    const tenantIdFromState = state && /^[a-f0-9-]{36}$/i.test(state) ? state : null;
    const groupEmail =
      typeof window !== 'undefined' ? window.sessionStorage.getItem('helpdesk_gmail_connect_group_email') : null;

    let cancelled = false;
    const watchdog = setTimeout(() => {
      if (cancelled) return;
      setStatus('error');
      setMessage('Tilkoblingen tok for lang tid. Prøv igjen.');
    }, 25000);

    const runExchange = async () => {
      // After redirect from Google, session may not be restored yet. Wait briefly for it.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        await new Promise((r) => setTimeout(r, 300));
        const { data: { session: retrySession } } = await supabase.auth.getSession();
        if (!retrySession?.access_token) {
          if (cancelled) return;
          setStatus('error');
          setMessage('Du må være innlogget. Gå til innstillinger og prøv igjen.');
          return;
        }
      }

      const exchangePromise = oauthExchangeOnce(code, () =>
        isCalendarState
          ? calendarHandlerRef.current(code, calendarTenantIdFromState)
          : gmailHandlerRef.current(code, tenantIdFromState, groupEmail)
      );

      const withTimeout = Promise.race([
        exchangePromise,
        new Promise<{ ok: false; error: string }>((resolve) =>
          setTimeout(() => resolve({ ok: false, error: 'Tilkoblingen tok for lang tid. Prøv igjen.' }), 20000)
        ),
      ]);
      withTimeout
        .then((result) => {
          clearTimeout(watchdog);
          if (cancelled) return;
          if (result.ok) {
            if (tenantIdFromState) setCurrentTenantId(tenantIdFromState);
            if (calendarTenantIdFromState && /^[a-f0-9-]{36}$/i.test(calendarTenantIdFromState)) {
              setCurrentTenantId(calendarTenantIdFromState);
            }
            setStatus('success');
            setMessage(isCalendarState ? 'Google Kalender er koblet til. Omdirigerer…' : 'Gmail er koblet til. Omdirigerer…');
            setTimeout(
              () => navigate(isCalendarState ? '/kalender' : '/settings?tab=inboxes', { replace: true }),
              1500
            );
          } else {
            setStatus('error');
            setMessage(result.error || (isCalendarState ? 'Kunne ikke koble til Google Kalender. Prøv igjen.' : 'Kunne ikke koble til Gmail. Prøv igjen.'));
          }
        })
        .catch((e) => {
          clearTimeout(watchdog);
          if (cancelled) return;
          setStatus('error');
          setMessage(e?.message || 'Noe gikk galt. Gå til innstillinger og prøv igjen.');
        });
    };

    runExchange();

    return () => {
      cancelled = true;
      clearTimeout(watchdog);
    };
  }, [searchParams, navigate, setCurrentTenantId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm text-center">
        <h1 className="text-lg font-semibold text-slate-900">Google-tilkobling</h1>
        {status === 'pending' && (
          <p className="text-slate-600 mt-3">
            {searchParams.get('state')?.startsWith('calendar:') ? 'Kobler til Google Kalender…' : 'Kobler til Gmail-kontoen din…'}
          </p>
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
