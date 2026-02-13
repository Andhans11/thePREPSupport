import { useEffect, useState } from 'react';
import { Save, Loader2, FileSignature } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useTenant } from '../../contexts/TenantContext';

export function SignaturesSettings() {
  const { currentTenantId } = useTenant();
  const [signatureNew, setSignatureNew] = useState('');
  const [signatureFollowUp, setSignatureFollowUp] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentTenantId) return;
    (async () => {
      const { data } = await supabase
        .from('company_settings')
        .select('key, value')
        .eq('tenant_id', currentTenantId)
        .in('key', ['signature_new', 'signature_follow_up']);
      const rows = (data ?? []) as { key: string; value: unknown }[];
      rows.forEach((r) => {
        const v = r.value != null ? (typeof r.value === 'string' ? r.value : String(r.value)) : '';
        if (r.key === 'signature_new') setSignatureNew(v);
        if (r.key === 'signature_follow_up') setSignatureFollowUp(v);
      });
      setLoading(false);
    })();
  }, [currentTenantId]);

  const handleSave = async () => {
    if (!currentTenantId) return;
    setError(null);
    setSaving(true);
    const { error: e1 } = await supabase
      .from('company_settings')
      .upsert({ tenant_id: currentTenantId, key: 'signature_new', value: signatureNew }, { onConflict: 'tenant_id,key' });
    const { error: e2 } = await supabase
      .from('company_settings')
      .upsert({ tenant_id: currentTenantId, key: 'signature_follow_up', value: signatureFollowUp }, { onConflict: 'tenant_id,key' });
    if (e1 || e2) setError(e1?.message || e2?.message || 'Kunne ikke lagre');
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--hiver-text-muted)]">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-2 mb-4">
        <FileSignature className="w-5 h-5 text-[var(--hiver-accent)]" />
        <h2 className="text-lg font-semibold text-[var(--hiver-text)]">E-postsignaturer</h2>
      </div>
      <p className="text-sm text-[var(--hiver-text-muted)]">
        Disse signaturene legges til alle utgående e-poster. Bruk <strong>Ny</strong> for første
        svar i en tråd og <strong>Oppfølging</strong> for senere svar.
      </p>
      {error && (
        <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
      )}
      <div className="card-panel p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-[var(--hiver-text)] mb-2">
            Signatur for nye samtaler (første svar)
          </label>
          <textarea
            value={signatureNew}
            onChange={(e) => setSignatureNew(e.target.value)}
            rows={5}
            placeholder="Med vennlig hilsen,&#10;Support"
            className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm text-[var(--hiver-text)] placeholder:text-[var(--hiver-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30 resize-y"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--hiver-text)] mb-2">
            Signatur for oppfølgingssvar
          </label>
          <textarea
            value={signatureFollowUp}
            onChange={(e) => setSignatureFollowUp(e.target.value)}
            rows={5}
            placeholder="Med vennlig hilsen,&#10;Support"
            className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm text-[var(--hiver-text)] placeholder:text-[var(--hiver-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30 resize-y"
          />
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)] disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Lagre signaturer
        </button>
      </div>
    </div>
  );
}
