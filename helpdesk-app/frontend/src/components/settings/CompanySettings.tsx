import { useEffect, useState, useRef } from 'react';
import { Building2, Save, Loader2, Upload, X, Ticket } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useToast } from '../../contexts/ToastContext';
import { SaveButton } from '../ui/SaveButton';
import { GmailIntegration } from './GmailIntegration';

const LOGO_ACCEPT = 'image/png,image/jpeg,image/jpg,image/svg+xml';
const LOGO_MAX_SIZE_MB = 2;

export interface CompanyInfo {
  name: string;
  address: string;
  zip: string;
  city: string;
  opening_hours: string;
  description: string;
  dept: string;
}

const defaultCompanyInfo: CompanyInfo = {
  name: '',
  address: '',
  zip: '',
  city: '',
  opening_hours: '',
  description: '',
  dept: '',
};

function parseCompanyInfo(value: unknown): CompanyInfo {
  if (value == null || typeof value !== 'object') return defaultCompanyInfo;
  const o = value as Record<string, unknown>;
  return {
    name: typeof o.name === 'string' ? o.name : '',
    address: typeof o.address === 'string' ? o.address : '',
    zip: typeof o.zip === 'string' ? o.zip : '',
    city: typeof o.city === 'string' ? o.city : '',
    opening_hours: typeof o.opening_hours === 'string' ? o.opening_hours : '',
    description: typeof o.description === 'string' ? o.description : '',
    dept: typeof o.dept === 'string' ? o.dept : '',
  };
}

export function CompanySettings() {
  const { currentTenantId } = useTenant();
  const toast = useToast();
  const [info, setInfo] = useState<CompanyInfo>(defaultCompanyInfo);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [expectedSolutionDays, setExpectedSolutionDays] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!currentTenantId) return;
    (async () => {
      const [infoRes, logoRes, solutionRes] = await Promise.all([
        supabase.from('company_settings').select('value').eq('tenant_id', currentTenantId).eq('key', 'company_info').maybeSingle(),
        supabase.from('company_settings').select('value').eq('tenant_id', currentTenantId).eq('key', 'company_logo_url').maybeSingle(),
        supabase.from('company_settings').select('value').eq('tenant_id', currentTenantId).eq('key', 'expected_solution_days').maybeSingle(),
      ]);
      if (infoRes.error) {
        setInfo(defaultCompanyInfo);
      } else {
        setInfo(parseCompanyInfo((infoRes.data as { value: unknown } | null)?.value));
      }
      const logoVal = (logoRes.data as { value: unknown } | null)?.value;
      setLogoUrl(typeof logoVal === 'string' ? logoVal : null);
      const daysVal = (solutionRes.data as { value: unknown } | null)?.value;
      setExpectedSolutionDays(typeof daysVal === 'number' ? daysVal : Number(daysVal) || 0);
      setLoading(false);
    })();
  }, [currentTenantId]);

  const handleSave = async () => {
    if (!currentTenantId) return;
    setError(null);
    setSaved(false);
    setSaving(true);
    const days = Math.max(0, Math.min(365, expectedSolutionDays));
    const [infoErr, daysErr] = await Promise.all([
      supabase.from('company_settings').upsert(
        { tenant_id: currentTenantId, key: 'company_info', value: info, updated_at: new Date().toISOString() },
        { onConflict: 'tenant_id,key' }
      ),
      supabase.from('company_settings').upsert(
        { tenant_id: currentTenantId, key: 'expected_solution_days', value: days, updated_at: new Date().toISOString() },
        { onConflict: 'tenant_id,key' }
      ),
    ]);
    if (infoErr.error) {
      setError(infoErr.error.message || 'Kunne ikke lagre');
      toast.error(infoErr.error.message || 'Kunne ikke lagre selskapsopplysninger');
    } else if (daysErr.error) {
      setError(daysErr.error.message || 'Kunne ikke lagre');
      toast.error(daysErr.error.message || 'Kunne ikke lagre selskapsopplysninger');
    } else {
      setExpectedSolutionDays(days);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      toast.success('Selskapsopplysninger er lagret');
    }
    setSaving(false);
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !currentTenantId) return;
    if (file.size > LOGO_MAX_SIZE_MB * 1024 * 1024) {
      setError(`Filen er for stor. Maks ${LOGO_MAX_SIZE_MB} MB.`);
      return;
    }
    setError(null);
    setLogoUploading(true);
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const path = `${currentTenantId}/logo.${ext}`;
    const { error: uploadErr } = await supabase.storage.from('company-logos').upload(path, file, { upsert: true });
    if (uploadErr) {
      setError(uploadErr.message || 'Kunne ikke laste opp logo');
      setLogoUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from('company-logos').getPublicUrl(path);
    const url = urlData.publicUrl;
    const { error: saveErr } = await supabase.from('company_settings').upsert(
      { tenant_id: currentTenantId, key: 'company_logo_url', value: url, updated_at: new Date().toISOString() },
      { onConflict: 'tenant_id,key' }
    );
    if (saveErr) setError(saveErr.message);
    else setLogoUrl(url);
    setLogoUploading(false);
  };

  const handleRemoveLogo = async () => {
    if (!currentTenantId) return;
    setError(null);
    setLogoUploading(true);
    if (logoUrl) {
      const pathMatch = logoUrl.match(/\/company-logos\/(.+)$/);
      if (pathMatch) await supabase.storage.from('company-logos').remove([pathMatch[1]]);
    }
    await supabase.from('company_settings').delete().eq('tenant_id', currentTenantId).eq('key', 'company_logo_url');
    setLogoUrl(null);
    setLogoUploading(false);
  };

  const inputClass =
    'w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm text-[var(--hiver-text)] placeholder:text-[var(--hiver-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30';
  const labelClass = 'block text-sm font-medium text-[var(--hiver-text)] mb-1.5';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <section className="card-panel p-6 min-w-0">
        <h2 className="text-lg font-semibold text-[var(--hiver-text)] flex items-center gap-2 mb-4">
          <Building2 className="w-5 h-5" />
          Selskap
        </h2>
        <p className="text-sm text-[var(--hiver-text-muted)] mb-6">
          Selskapsinnstillinger og -info. Koble til en delt innboks (Gmail) til høyre for å opprette
          og svare på saker fra e-post.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-[var(--hiver-text-muted)]">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <>
            <h3 className="text-sm font-medium text-[var(--hiver-text-muted)] mb-4 uppercase tracking-wide">
              Selskapsopplysninger
            </h3>
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm dark:bg-red-900/20 dark:text-red-300">
                {error}
              </div>
            )}
            {saved && (
              <div className="mb-4 p-3 rounded-lg bg-green-50 text-green-800 text-sm dark:bg-green-900/20 dark:text-green-300">
                Lagret i Supabase.
              </div>
            )}
            <div className="grid gap-4 grid-cols-1">
              <div>
                <label className={labelClass}>Selskapsnavn</label>
                <input
                  type="text"
                  value={info.name}
                  onChange={(e) => setInfo((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Acme AS"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Adresse</label>
                <input
                  type="text"
                  value={info.address}
                  onChange={(e) => setInfo((p) => ({ ...p, address: e.target.value }))}
                  placeholder="Gate og nummer"
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Postnummer</label>
                  <input
                    type="text"
                    value={info.zip}
                    onChange={(e) => setInfo((p) => ({ ...p, zip: e.target.value }))}
                    placeholder="0123"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Sted</label>
                  <input
                    type="text"
                    value={info.city}
                    onChange={(e) => setInfo((p) => ({ ...p, city: e.target.value }))}
                    placeholder="Oslo"
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Åpningstider</label>
                <input
                  type="text"
                  value={info.opening_hours}
                  onChange={(e) => setInfo((p) => ({ ...p, opening_hours: e.target.value }))}
                  placeholder="f.eks. Man–Fre 09:00–17:00, Lør 10:00–14:00"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Avdeling</label>
                <input
                  type="text"
                  value={info.dept}
                  onChange={(e) => setInfo((p) => ({ ...p, dept: e.target.value }))}
                  placeholder="f.eks. Support, Kundeservice"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Beskrivelse</label>
                <textarea
                  value={info.description}
                  onChange={(e) => setInfo((p) => ({ ...p, description: e.target.value }))}
                  rows={3}
                  placeholder="Kort beskrivelse av selskapet eller supportteamet"
                  className={`${inputClass} resize-y`}
                />
              </div>
            </div>

            <h3 className="text-sm font-medium text-[var(--hiver-text-muted)] mt-6 mb-3 uppercase tracking-wide">
              Logo
            </h3>
            <p className="text-sm text-[var(--hiver-text-muted)] mb-3">
              Logo vises øverst til høyre i headeren. PNG, JPG eller SVG, maks {LOGO_MAX_SIZE_MB} MB.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              {logoUrl ? (
                <div className="flex items-center gap-3">
                  <img
                    src={logoUrl}
                    alt="Selskapslogo"
                    className="h-12 object-contain max-w-[180px] border border-[var(--hiver-border)] rounded-lg bg-white p-1"
                  />
                  <div className="flex gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={LOGO_ACCEPT}
                      onChange={handleLogoChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={logoUploading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--hiver-border)] text-sm text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)] disabled:opacity-50"
                    >
                      {logoUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      Bytt logo
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      disabled={logoUploading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <X className="w-4 h-4" />
                      Fjern
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={LOGO_ACCEPT}
                    onChange={handleLogoChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={logoUploading}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed border-[var(--hiver-border)] text-sm text-[var(--hiver-text-muted)] hover:border-[var(--hiver-accent)] hover:text-[var(--hiver-accent)] disabled:opacity-50"
                  >
                    {logoUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                    Last opp logo
                  </button>
                </>
              )}
            </div>

            <h3 className="text-sm font-medium text-[var(--hiver-text-muted)] mt-8 mb-3 uppercase tracking-wide flex items-center gap-2">
              <Ticket className="w-4 h-4" />
              Saker (forventet løsningstid)
            </h3>
            <p className="text-sm text-[var(--hiver-text-muted)] mb-3">
              Antall dager fra mottak til forventet løsning. Nye saker får automatisk forventet frist. Sett 0 for å ikke bruke.
            </p>
            <div>
              <label className={labelClass}>Forventet løsningstid (dager)</label>
              <input
                type="number"
                min={0}
                max={365}
                value={expectedSolutionDays || ''}
                onChange={(e) => setExpectedSolutionDays(Math.max(0, parseInt(e.target.value, 10) || 0))}
                placeholder="0"
                className={inputClass}
              />
            </div>

            <SaveButton
              loading={saving}
              onClick={handleSave}
              icon={<Save className="w-4 h-4" />}
              className="mt-4"
            >
              Lagre selskapsopplysninger
            </SaveButton>
          </>
        )}
      </section>
      <div className="min-w-0">
        <GmailIntegration />
      </div>
    </div>
  );
}
