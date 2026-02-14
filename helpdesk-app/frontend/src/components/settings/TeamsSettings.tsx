import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useToast } from '../../contexts/ToastContext';
import { SaveButton } from '../ui/SaveButton';

export interface TeamRow {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  manager_team_member_id: string | null;
}

interface TeamMemberOption {
  id: string;
  name: string;
  email: string;
}

export function TeamsSettings() {
  const { currentTenantId } = useTenant();
  const toast = useToast();
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formManagerId, setFormManagerId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMemberOption[]>([]);

  const fetchTeams = async () => {
    if (!currentTenantId) return;
    setLoading(true);
    const [teamsRes, membersRes] = await Promise.all([
      supabase
        .from('teams')
        .select('id, name, description, created_at, updated_at, manager_team_member_id')
        .eq('tenant_id', currentTenantId)
        .order('name'),
      supabase
        .from('team_members')
        .select('id, name, email')
        .eq('tenant_id', currentTenantId)
        .eq('is_active', true)
        .order('name'),
    ]);
    const { data: teamsData, error: e } = teamsRes;
    if (e) {
      setError(e.message);
      setTeams([]);
    } else {
      setError(null);
      setTeams((teamsData as TeamRow[]) ?? []);
    }
    setTeamMembers((membersRes.data as TeamMemberOption[]) ?? []);
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
    if (!currentTenantId) return;
    setError(null);
    setSaving(id);
    const { error: e } = await supabase
      .from('teams')
      .update({ name, description: formDescription.trim() || null, manager_team_member_id: formManagerId || null })
      .eq('id', id)
      .eq('tenant_id', currentTenantId);
    if (e) {
      setError(e.message);
      toast.error(e.message);
    } else {
      setTeams((prev) => prev.map((t) => (t.id === id ? { ...t, name, description: formDescription.trim() || null, manager_team_member_id: formManagerId } : t)));
      setEditingId(null);
      setFormName('');
      setFormDescription('');
      setFormManagerId(null);
      toast.success('Team er oppdatert');
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
      toast.error(e.message);
      setSaving(null);
      return;
    }
    setFormName('');
    setFormDescription('');
    setAdding(false);
    setSaving(null);
    await fetchTeams();
    toast.success('Team er opprettet');
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Slette team «${name}»? Saker som er knyttet til teamet vil få fjernet teamtilknytningen.`)) return;
    setError(null);
    setSaving(id);
    if (!currentTenantId) return;
    const { error: e } = await supabase
      .from('teams')
      .delete()
      .eq('id', id)
      .eq('tenant_id', currentTenantId);
    if (e) {
      setError(e.message);
      toast.error(e.message);
    } else {
      setTeams((prev) => prev.filter((t) => t.id !== id));
      if (editingId === id) setEditingId(null);
      toast.success('Team er slettet');
    }
    setSaving(null);
  };

  const startEdit = (t: TeamRow) => {
    setEditingId(t.id);
    setFormName(t.name);
    setFormDescription(t.description ?? '');
    setFormManagerId(t.manager_team_member_id ?? null);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setAdding(false);
    setFormName('');
    setFormDescription('');
    setFormManagerId(null);
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
            <SaveButton
              onClick={handleAdd}
              loading={saving === 'add'}
              icon={<Plus className="w-4 h-4" />}
            >
              Lagre
            </SaveButton>
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
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-[var(--hiver-text-muted)] mb-1">Leder</label>
                        <select
                          value={formManagerId ?? ''}
                          onChange={(e) => setFormManagerId(e.target.value || null)}
                          className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm text-[var(--hiver-text)]"
                        >
                          <option value="">Ingen</option>
                          {teamMembers.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name || m.email}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-[var(--hiver-text-muted)] mt-0.5">Lederen ser alle saker i teamet og kan håndtere status for teammedlemmer.</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <SaveButton
                        onClick={() => handleSaveEdit(t.id)}
                        loading={saving === t.id}
                        className="px-3 py-1.5"
                      >
                        Lagre
                      </SaveButton>
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
                      {t.manager_team_member_id && (
                        <p className="text-xs text-[var(--hiver-text-muted)] mt-0.5">
                          Leder: {teamMembers.find((m) => m.id === t.manager_team_member_id)?.name || teamMembers.find((m) => m.id === t.manager_team_member_id)?.email || '—'}
                        </p>
                      )}
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
