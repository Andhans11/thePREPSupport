import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useTenant } from '../../contexts/TenantContext';

export interface TeamRow {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export function TeamsSettings() {
  const { currentTenantId } = useTenant();
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  const fetchTeams = async () => {
    if (!currentTenantId) return;
    setLoading(true);
    const { data, error: e } = await supabase
      .from('teams')
      .select('id, name, description, created_at, updated_at')
      .eq('tenant_id', currentTenantId)
      .order('name');
    if (e) {
      setError(e.message);
      setTeams([]);
    } else {
      setError(null);
      setTeams((data as TeamRow[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTeams();
  }, [currentTenantId]);

  const handleSaveEdit = async (id: string) => {
    const name = formName.trim();
    if (!name) {
      setError('Navn er påkrevd.');
      return;
    }
    setError(null);
    setSaving(id);
    const { error: e } = await supabase.from('teams').update({ name, description: formDescription.trim() || null }).eq('id', id);
    if (e) setError(e.message);
    else {
      setTeams((prev) => prev.map((t) => (t.id === id ? { ...t, name, description: formDescription.trim() || null } : t)));
      setEditingId(null);
      setFormName('');
      setFormDescription('');
    }
    setSaving(null);
  };

  const handleAdd = async () => {
    const name = formName.trim();
    if (!name) {
      setError('Navn er påkrevd.');
      return;
    }
    setError(null);
    setSaving('add');
    if (!currentTenantId) return;
    const { error: e } = await supabase.from('teams').insert({ tenant_id: currentTenantId, name, description: formDescription.trim() || null });
    if (e) {
      setError(e.message);
      setSaving(null);
      return;
    }
    setFormName('');
    setFormDescription('');
    setAdding(false);
    setSaving(null);
    await fetchTeams();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Slette team «${name}»? Saker som er knyttet til teamet vil få fjernet teamtilknytningen.`)) return;
    setError(null);
    setSaving(id);
    const { error: e } = await supabase.from('teams').delete().eq('id', id);
    if (e) setError(e.message);
    else {
      setTeams((prev) => prev.filter((t) => t.id !== id));
      if (editingId === id) setEditingId(null);
    }
    setSaving(null);
  };

  const startEdit = (t: TeamRow) => {
    setEditingId(t.id);
    setFormName(t.name);
    setFormDescription(t.description ?? '');
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setAdding(false);
    setFormName('');
    setFormDescription('');
    setError(null);
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
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--hiver-text)]">Team</h2>
        {!adding && !editingId ? (
          <button
            type="button"
            onClick={() => { setAdding(true); setError(null); }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)]"
          >
            <Plus className="w-4 h-4" />
            Legg til team
          </button>
        ) : null}
      </div>

      <p className="text-sm text-[var(--hiver-text-muted)]">
        Team brukes for å gruppere saker og brukere. I sakslisten viser fanen «Team» saker som tilhører teamene du er med i.
      </p>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
      )}

      {adding && (
        <div className="card-panel p-4 space-y-3">
          <h3 className="text-sm font-medium text-[var(--hiver-text)]">Nytt team</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="text"
              placeholder="Teamnavn"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm text-[var(--hiver-text)] placeholder:text-[var(--hiver-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30"
            />
            <input
              type="text"
              placeholder="Beskrivelse (valgfritt)"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              className="rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm text-[var(--hiver-text)] placeholder:text-[var(--hiver-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30 sm:col-span-2"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving === 'add'}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)] disabled:opacity-50"
            >
              {saving === 'add' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Lagre
            </button>
            <button type="button" onClick={cancelEdit} className="px-3 py-2 rounded-lg border border-[var(--hiver-border)] text-sm font-medium text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]">
              Avbryt
            </button>
          </div>
        </div>
      )}

      <div className="card-panel overflow-hidden">
        {teams.length === 0 && !adding ? (
          <div className="p-8 text-center text-[var(--hiver-text-muted)] text-sm">
            Ingen team ennå. Legg til et team over for å bruke team-fanen i sakslisten.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--hiver-border)]">
            {teams.map((t) => (
              <li key={t.id} className="px-4 py-3 flex items-center justify-between gap-3">
                {editingId === t.id ? (
                  <>
                    <div className="flex-1 grid gap-2 sm:grid-cols-2">
                      <input
                        type="text"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        placeholder="Teamnavn"
                        className="rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                        placeholder="Beskrivelse"
                        className="rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm sm:col-span-2"
                      />
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(t.id)}
                        disabled={saving === t.id}
                        className="px-3 py-1.5 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium disabled:opacity-50"
                      >
                        {saving === t.id ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Lagre'}
                      </button>
                      <button type="button" onClick={cancelEdit} className="px-3 py-1.5 rounded-lg border border-[var(--hiver-border)] text-sm">
                        Avbryt
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--hiver-text)] truncate">{t.name}</p>
                      {t.description && <p className="text-sm text-[var(--hiver-text-muted)] truncate">{t.description}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEdit(t)}
                        className="p-2 rounded text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)] hover:text-[var(--hiver-text)]"
                        title="Rediger"
                        aria-label="Rediger"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(t.id, t.name)}
                        disabled={saving === t.id}
                        className="p-2 rounded text-[var(--hiver-text-muted)] hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        title="Slett"
                        aria-label="Slett"
                      >
                        {saving === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
