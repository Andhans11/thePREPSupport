import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGmail } from '../../contexts/GmailContext';
import { useTickets } from '../../contexts/TicketContext';
import { useTenant } from '../../contexts/TenantContext';
import { useCurrentUserRole } from '../../hooks/useCurrentUserRole';
import { isAdmin } from '../../types/roles';
import { formatRelative, formatDateTime } from '../../utils/formatters';
import { supabase } from '../../services/supabase';
import { useToast } from '../../contexts/ToastContext';
import { Mail, RefreshCw, Unplug, Building2, User, Users, ArrowLeft, Key } from 'lucide-react';
import { SaveButton } from '../ui/SaveButton';

type AccountType = 'user' | 'group';

export function GmailIntegration({ mode = 'full' }: { mode?: 'full' | 'addOnly' }) {
  const {
    isConnected,
    gmailEmail,
    groupEmail,
    lastSyncAt,
    loading,
    syncing,
    savingGroupEmail,
    error,
    connectGmail,
    isGmailOAuthConfigured,
    syncNow,
    disconnect,
    updateGroupEmail,
    clearError,
    refetchTenantOAuth,
  } = useGmail();
  const { fetchTickets, setAssignmentView } = useTickets();
  const { currentTenantId } = useTenant();
  const { role } = useCurrentUserRole();
  const toast = useToast();
  const navigate = useNavigate();

  const [groupEmailInput, setGroupEmailInput] = useState(groupEmail ?? '');
  const [groupEmailTouched, setGroupEmailTouched] = useState(false);
  const [cronLastRunAt, setCronLastRunAt] = useState<string | null>(null);

  const [oauthClientId, setOauthClientId] = useState('');
  const [oauthClientSecret, setOauthClientSecret] = useState('');
  const [savingOAuth, setSavingOAuth] = useState(false);
  const adminCanEditOAuth = isAdmin(role);

  // Hiver-style flow: step 1 = enter email + type, step 2 = authorize
  const [setupStep, setSetupStep] = useState<1 | 2>(1);
  const [teamEmail, setTeamEmail] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('user');
  const [teamEmailTouched, setTeamEmailTouched] = useState(false);

  const teamEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(teamEmail.trim());
  const canContinue = teamEmail.trim().length > 0 && teamEmailValid;

  useEffect(() => {
    setGroupEmailInput(groupEmail ?? '');
  }, [groupEmail]);

  useEffect(() => {
    if (!isConnected) setSetupStep(1);
  }, [isConnected]);

  useEffect(() => {
    if (!currentTenantId || !adminCanEditOAuth) return;
    supabase
      .from('tenant_google_oauth')
      .select('client_id')
      .eq('tenant_id', currentTenantId)
      .maybeSingle()
      .then(({ data }) => {
        const row = data as { client_id?: string } | null;
        setOauthClientId(row?.client_id?.trim() ?? '');
      });
  }, [currentTenantId, adminCanEditOAuth]);

  const handleSaveOAuth = async () => {
    if (!currentTenantId || !oauthClientId.trim() || !oauthClientSecret.trim()) {
      toast.error('Fyll ut både Client ID og Client Secret.');
      return;
    }
    setSavingOAuth(true);
    const { error: upsertError } = await supabase
      .from('tenant_google_oauth')
      .upsert(
        {
          tenant_id: currentTenantId,
          client_id: oauthClientId.trim(),
          client_secret: oauthClientSecret.trim(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id' }
      );
    setSavingOAuth(false);
    if (upsertError) {
      toast.error(upsertError.message);
      return;
    }
    setOauthClientSecret('');
    toast.success('Google OAuth er lagret for denne organisasjonen.');
    refetchTenantOAuth();
  };

  useEffect(() => {
    supabase
      .from('gmail_sync_cron_last_run')
      .select('last_run_at')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => {
        const row = data as { last_run_at: string } | null;
        setCronLastRunAt(row?.last_run_at ?? null);
      });
  }, []);

  const handleSaveGroupEmail = () => {
    setGroupEmailTouched(true);
    const value = groupEmailInput.trim() || null;
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return;
    }
    updateGroupEmail(value);
  };

  if (loading) {
    return (
      <div className="text-[var(--hiver-text-muted)] text-sm">Laster…</div>
    );
  }

  const showConnectedView = mode === 'full' && isConnected;

  return (
    <div className="card-panel p-6">
      {mode === 'addOnly' && (
        <h2 className="text-lg font-semibold text-[var(--hiver-text)] flex items-center gap-2 mb-4">
          <Mail className="w-5 h-5" />
          Legg til e-postinnboks
        </h2>
      )}
      {mode === 'full' && (
        <h2 className="text-lg font-semibold text-[var(--hiver-text)] flex items-center gap-2">
          <Mail className="w-5 h-5" />
          Gmail-integrasjon
        </h2>
      )}
      {error && (
        <div className="mt-3 p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={clearError} className="text-red-500 hover:underline">
            Lukk
          </button>
        </div>
      )}
      {showConnectedView ? (
        <div className="mt-4 space-y-5">
          <p className="text-sm text-[var(--hiver-text-muted)]">
            Tilkoblet som <strong className="text-[var(--hiver-text)]">{gmailEmail}</strong>
          </p>

          <div>
            <h3 className="text-sm font-medium text-[var(--hiver-text)] flex items-center gap-2 mb-1">
              <Building2 className="w-4 h-4" />
              Gruppe-e-post å speile (Google Workspace)
            </h3>
            <p className="text-xs text-[var(--hiver-text-muted)] mb-2">
              Sett adressen til den delte eller gruppeinnboksen (f.eks. support@dittdomene.no). Vi synkroniserer
              kun meldinger som sendes <em>til</em> denne adressen. La stå tom for å synkronisere din personlige innboks.
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
              <strong>Svaring vises fra denne adressen:</strong> For at utgående svar skal vises som sendt fra gruppe-e-posten, må du legge den til i Gmail/Workspace: <strong>Innstillinger → Kontoer → Send e-post som → Legg til annen e-postadresse</strong>. Verifiser adressen hvis Google ber om det.
            </p>
            <div className="flex gap-2 flex-wrap">
              <input
                type="email"
                value={groupEmailInput}
                onChange={(e) => setGroupEmailInput(e.target.value)}
                onBlur={() => setGroupEmailTouched(true)}
                placeholder="f.eks. support@dittdomene.no"
                className="flex-1 min-w-[200px] rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm text-[var(--hiver-text)] placeholder:text-[var(--hiver-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30 focus:border-[var(--hiver-accent)]"
              />
              <SaveButton
                onClick={handleSaveGroupEmail}
                loading={savingGroupEmail}
                disabled={groupEmailInput.trim() === (groupEmail ?? '')}
              >
                Lagre
              </SaveButton>
            </div>
            {groupEmailTouched && groupEmailInput.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(groupEmailInput.trim()) && (
              <p className="text-xs text-red-600 mt-1">Skriv inn en gyldig e-postadresse.</p>
            )}
          </div>

          {lastSyncAt && (
            <p className="text-xs text-[var(--hiver-text-muted)]">
              Sist synkronisert: {formatRelative(lastSyncAt)}
            </p>
          )}
          {cronLastRunAt && (
            <p className="text-xs text-[var(--hiver-text-muted)]">
              Siste sync kjørt fra db: {formatDateTime(cronLastRunAt)}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={async () => {
                const result = await syncNow();
                if (result.success) {
                  fetchTickets();
                  if (result.created && result.created > 0) {
                    setAssignmentView('unassigned');
                    navigate('/tickets?view=unassigned');
                  }
                }
              }}
              disabled={syncing}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)] disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Synkroniserer…' : 'Synkroniser nå'}
            </button>
            <button
              type="button"
              onClick={disconnect}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--hiver-border)] text-[var(--hiver-text)] text-sm font-medium hover:bg-[var(--hiver-bg)]"
            >
              <Unplug className="w-4 h-4" />
              Koble fra
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          {adminCanEditOAuth && (
            <div className="mb-5 p-4 rounded-lg border border-[var(--hiver-border)] bg-[var(--hiver-bg)]/50">
              <h3 className="text-sm font-semibold text-[var(--hiver-text)] flex items-center gap-2 mb-3">
                <Key className="w-4 h-4" />
                Google OAuth for denne organisasjonen (kun admin)
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <p className="text-xs text-[var(--hiver-text-muted)] mb-3">
                    Hver organisasjon har sin egen Google OAuth-klient. Følg stegene til høyre i ditt eget Google Cloud-prosjekt, deretter lim inn Client ID og Secret her.
                  </p>
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="oauth-client-id" className="block text-xs font-medium text-[var(--hiver-text-muted)] mb-1">Client ID</label>
                      <input
                        id="oauth-client-id"
                        type="text"
                        value={oauthClientId}
                        onChange={(e) => setOauthClientId(e.target.value)}
                        placeholder="xxx.apps.googleusercontent.com"
                        className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm text-[var(--hiver-text)] placeholder:text-[var(--hiver-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30"
                      />
                    </div>
                    <div>
                      <label htmlFor="oauth-client-secret" className="block text-xs font-medium text-[var(--hiver-text-muted)] mb-1">Client Secret</label>
                      <input
                        id="oauth-client-secret"
                        type="password"
                        value={oauthClientSecret}
                        onChange={(e) => setOauthClientSecret(e.target.value)}
                        placeholder="Skriv inn for å sette eller endre"
                        autoComplete="off"
                        className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm text-[var(--hiver-text)] placeholder:text-[var(--hiver-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30"
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <SaveButton
                      onClick={handleSaveOAuth}
                      loading={savingOAuth}
                      disabled={!oauthClientId.trim() || !oauthClientSecret.trim()}
                    >
                      Lagre OAuth-innstillinger
                    </SaveButton>
                  </div>
                </div>
                <div className="text-sm">
                  <p className="font-medium text-[var(--hiver-text)] mb-2">Slik setter du opp (i ditt eget prosjekt):</p>
                  <ol className="list-decimal list-inside space-y-2 text-[var(--hiver-text-muted)]">
                    <li>
                      Opprett eller velg et prosjekt i{' '}
                      <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="text-[var(--hiver-accent)] underline hover:no-underline">Google Cloud Console</a>.
                    </li>
                    <li>
                      <strong className="text-[var(--hiver-text)]">Konfigurer OAuth-samtykkeskjermen</strong> (påkrevd). Gå til{' '}
                      <a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noopener noreferrer" className="text-[var(--hiver-accent)] underline hover:no-underline">OAuth-samtykkeskjerm</a>, velg brukertype (ekstern hvis brukere utenfor Workspace), fyll ut appnavn og brukerstøtte-e-post, og lagre.
                    </li>
                    <li>
                      Opprett legitimasjon: gå til{' '}
                      <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-[var(--hiver-accent)] underline hover:no-underline">Legitimasjoner</a> → Opprett legitimasjon → OAuth 2.0-klient-ID. Type: Web-applikasjon.
                    </li>
                    <li>
                      <strong className="text-[var(--hiver-text)]">Autoriserte JavaScript-origins:</strong> legg til appens opprinnelse (uten sti), f.eks. <code className="text-xs bg-[var(--hiver-bg)] px-1 rounded">{typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'}</code>. Brukes når brukeren starter innloggingen fra nettleseren.
                    </li>
                    <li>
                      <strong className="text-[var(--hiver-text)]">Autoriserte omdirigerings-URI-er:</strong> legg til callback-URL (med sti), f.eks. <code className="text-xs bg-[var(--hiver-bg)] px-1 rounded">{typeof window !== 'undefined' ? (import.meta.env?.VITE_GOOGLE_REDIRECT_URI || `${window.location.origin}/oauth/callback`) : 'https://.../oauth/callback'}</code>. Denne må være nøyaktig lik i Google, i frontend (VITE_GOOGLE_REDIRECT_URI) og i backend (REDIRECT_URI i Edge Function-miljø).
                    </li>
                    <li>
                      Kopier Client ID og Client Secret fra Google og lim inn i feltene til venstre. Klikk Lagre.
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {!isGmailOAuthConfigured && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <p className="font-medium">Google OAuth er ikke konfigurert for denne organisasjonen</p>
              <p className="mt-1 text-amber-700">
                Be en administrator om å legge til Client ID og Client Secret i feltet over (kun synlig for administratorer). Deretter kan du koble til e-post med team-e-post og Google-innlogging.
              </p>
            </div>
          )}

          {setupStep === 1 ? (
            <>
              <h3 className="text-base font-semibold text-[var(--hiver-text)] mb-2">
                Opprett e-postinnboks
              </h3>
              <p className="text-sm text-[var(--hiver-text-muted)] mb-4">
                Skriv inn team-e-posten for å opprette en delt innboks. Du autoriserer kontoen i neste steg.
              </p>
              <div className="space-y-4">
                <div>
                  <label htmlFor="gmail-team-email" className="block text-sm font-medium text-[var(--hiver-text)] mb-1">
                    Team-e-post
                  </label>
                  <input
                    id="gmail-team-email"
                    type="email"
                    value={teamEmail}
                    onChange={(e) => setTeamEmail(e.target.value)}
                    onBlur={() => setTeamEmailTouched(true)}
                    placeholder="f.eks. support@dittdomene.no"
                    className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm text-[var(--hiver-text)] placeholder:text-[var(--hiver-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30 focus:border-[var(--hiver-accent)]"
                  />
                  {teamEmailTouched && teamEmail.trim() && !teamEmailValid && (
                    <p className="text-xs text-red-600 mt-1">Skriv inn en gyldig e-postadresse.</p>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--hiver-text)] mb-2">
                    Hva slags konto er dette?
                  </p>
                  <div className="space-y-3">
                    <label className="flex items-start gap-3 p-3 rounded-lg border border-[var(--hiver-border)] cursor-pointer hover:bg-[var(--hiver-bg)]/50 has-[:checked]:border-[var(--hiver-accent)] has-[:checked]:bg-[var(--hiver-accent)]/5">
                      <input
                        type="radio"
                        name="gmail-account-type"
                        value="user"
                        checked={accountType === 'user'}
                        onChange={() => setAccountType('user')}
                        className="mt-1 text-[var(--hiver-accent)]"
                      />
                      <div className="flex items-start gap-2">
                        <User className="w-4 h-4 text-[var(--hiver-text-muted)] shrink-0 mt-0.5" />
                        <div>
                          <span className="font-medium text-[var(--hiver-text)]">Google brukerkonto</span>
                          <p className="text-xs text-[var(--hiver-text-muted)] mt-0.5">
                            En vanlig e-postkonto med adresse og passord.
                          </p>
                        </div>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 p-3 rounded-lg border border-[var(--hiver-border)] cursor-pointer hover:bg-[var(--hiver-bg)]/50 has-[:checked]:border-[var(--hiver-accent)] has-[:checked]:bg-[var(--hiver-accent)]/5">
                      <input
                        type="radio"
                        name="gmail-account-type"
                        value="group"
                        checked={accountType === 'group'}
                        onChange={() => setAccountType('group')}
                        className="mt-1 text-[var(--hiver-accent)]"
                      />
                      <div className="flex items-start gap-2">
                        <Users className="w-4 h-4 text-[var(--hiver-text-muted)] shrink-0 mt-0.5" />
                        <div>
                          <span className="font-medium text-[var(--hiver-text)]">Google-gruppe</span>
                          <p className="text-xs text-[var(--hiver-text-muted)] mt-0.5">
                            En Google-gruppe du er med i, med e-postadresse men uten eget passord.
                          </p>
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
              {cronLastRunAt && (
                <p className="text-xs text-[var(--hiver-text-muted)] mt-3">
                  Siste sync kjørt fra db: {formatDateTime(cronLastRunAt)}
                </p>
              )}
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSetupStep(2)}
                  disabled={!isGmailOAuthConfigured || !canContinue}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Fortsett
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 className="text-base font-semibold text-[var(--hiver-text)] mb-2">
                Autoriser e-postkontoen
              </h3>
              <p className="text-sm text-[var(--hiver-text)] mb-1">
                Autoriser <strong>{teamEmail || 'e-postadressen'}</strong>
                ({accountType === 'group' ? 'Google-gruppe' : 'Google brukerkonto'})
              </p>
              <p className="text-sm text-[var(--hiver-text-muted)] mb-6">
                Du blir omdirigert til Google for å logge inn og gi nødvendige tillatelser for å koble innboksen til denne organisasjonen.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setSetupStep(1)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--hiver-border)] text-[var(--hiver-text)] text-sm font-medium hover:bg-[var(--hiver-bg)]"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Tilbake
                </button>
                <button
                  type="button"
                  onClick={() => connectGmail(teamEmail.trim() || null, accountType)}
                  disabled={!isGmailOAuthConfigured}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Mail className="w-4 h-4" />
                  Autoriser
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
