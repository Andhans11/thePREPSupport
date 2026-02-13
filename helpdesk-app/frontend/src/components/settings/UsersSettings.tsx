import { useEffect, useState } from 'react';
import { Plus, UserPlus, Loader2, X, Copy, Mail } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { ROLES, ROLE_LABELS, type Role } from '../../types/roles';
import { sendInvitationEmail } from '../../services/api';

interface TeamMemberRow {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
  available_for_email?: boolean;
  available_for_chat?: boolean;
}

interface TeamOption {
  id: string;
  name: string;
}

interface MemberTeam {
  team_member_id: string;
  team_id: string;
}

export function UsersSettings() {
  const { currentTenantId } = useTenant();
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [memberTeams, setMemberTeams] = useState<MemberTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addName, setAddName] = useState('');
  const [addRole, setAddRole] = useState<Role>('agent');
  const [saving, setSaving] = useState<string | null>(null);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);

  const fetchMembers = async () => {
    if (!currentTenantId) return;
    setLoading(true);
    const [membersRes, teamsRes, memberTeamsRes] = await Promise.all([
      supabase.from('team_members').select('id, user_id, name, email, role, is_active, available_for_email, available_for_chat').eq('tenant_id', currentTenantId).order('name'),
      supabase.from('teams').select('id, name').eq('tenant_id', currentTenantId).order('name'),
      supabase.from('team_member_teams').select('team_member_id, team_id'),
    ]);
    if (membersRes.error) {
      setError(membersRes.error.message);
      setMembers([]);
    } else {
      setError(null);
      setMembers((membersRes.data as TeamMemberRow[]) || []);
    }
    setTeams(teamsRes.data ? (teamsRes.data as TeamOption[]) : []);
    setMemberTeams(memberTeamsRes.data ? (memberTeamsRes.data as MemberTeam[]) : []);
    setLoading(false);
  };

  const getMemberTeamIds = (memberId: string) => memberTeams.filter((mt) => mt.team_member_id === memberId).map((mt) => mt.team_id);

  const handleAddMemberToTeam = async (teamMemberId: string, teamId: string) => {
    setError(null);
    setSaving(teamMemberId);
    const { error: e } = await supabase.from('team_member_teams').insert({ team_member_id: teamMemberId, team_id: teamId });
    if (e) setError(e.message);
    else setMemberTeams((prev) => [...prev, { team_member_id: teamMemberId, team_id: teamId }]);
    setSaving(null);
  };

  const handleRemoveMemberFromTeam = async (teamMemberId: string, teamId: string) => {
    setError(null);
    setSaving(teamMemberId);
    const { error: e } = await supabase.from('team_member_teams').delete().eq('team_member_id', teamMemberId).eq('team_id', teamId);
    if (e) setError(e.message);
    else setMemberTeams((prev) => prev.filter((mt) => !(mt.team_member_id === teamMemberId && mt.team_id === teamId)));
    setSaving(null);
  };

  useEffect(() => {
    fetchMembers();
  }, [currentTenantId]);

  const handleAdd = async () => {
    const email = addEmail.trim().toLowerCase();
    const name = addName.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Vennligst oppgi en gyldig e-postadresse.');
      return;
    }
    if (!name) {
      setError('Vennligst oppgi et navn.');
      return;
    }
    setError(null);
    setLastInviteLink(null);
    setSaving('add');
    if (!currentTenantId) return;
    const { data: rpcData, error: rpcError } = await supabase.rpc('create_tenant_invitation', {
      p_tenant_id: currentTenantId,
      p_email: email,
      p_name: name,
      p_role: addRole,
    });
    if (rpcError || !(rpcData as { ok?: boolean })?.ok) {
      setError((rpcData as { error?: string })?.error ?? rpcError?.message ?? 'Kunne ikke opprette invitasjon');
      setSaving(null);
      return;
    }
    const invitationCode = (rpcData as { invitation_code?: string })?.invitation_code;
    const invitePath = (rpcData as { invite_path?: string })?.invite_path ?? `/accept-invite?code=${invitationCode}`;
    const inviteLink = `${window.location.origin}${invitePath}`;
    setLastInviteLink(inviteLink);
    const result = await sendInvitationEmail(invitationCode ?? '', inviteLink);
    if (!result.sent) {
      setError(result.error ?? 'Invitasjon opprettet, men e-post kunne ikke sendes. Kopier lenken under og del den manuelt.');
    }
    setAddEmail('');
    setAddName('');
    setAddRole('agent');
    setAdding(false);
    setSaving(null);
    await fetchMembers();
  };

  const copyInviteLink = () => {
    if (!lastInviteLink) return;
    navigator.clipboard.writeText(lastInviteLink).then(() => {
      setLastInviteLink(null);
    });
  };

  const handleUpdateRole = async (id: string, role: Role) => {
    setSaving(id);
    setError(null);
    const { error: e } = await supabase.from('team_members').update({ role }).eq('id', id);
    if (e) setError(e.message);
    else setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, role } : m)));
    setSaving(null);
  };

  const handleToggleActive = async (id: string, is_active: boolean) => {
    setSaving(id);
    setError(null);
    const { error: e } = await supabase.from('team_members').update({ is_active }).eq('id', id);
    if (e) setError(e.message);
    else setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, is_active } : m)));
    setSaving(null);
  };

  const handleToggleAvailability = async (
    id: string,
    field: 'available_for_email' | 'available_for_chat',
    value: boolean
  ) => {
    setSaving(id);
    setError(null);
    const { error: e } = await supabase.from('team_members').update({ [field]: value }).eq('id', id);
    if (e) setError(e.message);
    else setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
    setSaving(null);
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
        <h2 className="text-lg font-semibold text-[var(--hiver-text)]">Teammedlemmer</h2>
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)]"
          >
            <UserPlus className="w-4 h-4" />
            Legg til bruker
          </button>
        ) : null}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
      )}

      {lastInviteLink && (
        <div className="card-panel p-4 flex flex-wrap items-center gap-3 bg-green-50 border border-green-200">
          <Mail className="w-5 h-5 text-green-600 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-green-800">Invitasjon sendt</p>
            <p className="text-xs text-green-700 truncate" title={lastInviteLink}>{lastInviteLink}</p>
          </div>
          <button
            type="button"
            onClick={copyInviteLink}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700"
          >
            <Copy className="w-4 h-4" />
            Kopier lenke
          </button>
          <button
            type="button"
            onClick={() => setLastInviteLink(null)}
            className="p-2 rounded-lg text-green-700 hover:bg-green-100"
            aria-label="Lukk"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {adding && (
        <div className="card-panel p-4 space-y-3">
          <h3 className="text-sm font-medium text-[var(--hiver-text)]">Legg til teammedlem</h3>
          <p className="text-xs text-[var(--hiver-text-muted)]">
            Vi sender en invitasjonslenke på e-post. Mottakeren registrerer seg eller logger inn og får tilgang til denne tenanten med valgt rolle.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="text"
              placeholder="Navn"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              className="rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm text-[var(--hiver-text)] placeholder:text-[var(--hiver-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30"
            />
            <input
              type="email"
              placeholder="E-post"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              className="rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm text-[var(--hiver-text)] placeholder:text-[var(--hiver-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-[var(--hiver-text-muted)]">Rolle:</label>
            <select
              value={addRole}
              onChange={(e) => setAddRole(e.target.value as Role)}
              className="rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm text-[var(--hiver-text)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving === 'add'}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)] disabled:opacity-50"
            >
              {saving === 'add' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Legg til
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setError(null); }}
              className="px-3 py-2 rounded-lg border border-[var(--hiver-border)] text-sm font-medium text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]"
            >
              Avbryt
            </button>
          </div>
        </div>
      )}

      <div className="card-panel overflow-hidden">
        {members.length === 0 ? (
          <div className="p-8 text-center text-[var(--hiver-text-muted)] text-sm">
            Ingen teammedlemmer ennå. Legg til en bruker over, eller sørg for at det finnes minst én rad i team_members.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--hiver-border)]">
            {members.map((m) => {
              const memberTeamIds = getMemberTeamIds(m.id);
              const availableTeams = teams.filter((t) => !memberTeamIds.includes(t.id));
              return (
                <li
                  key={m.id}
                  className={`flex flex-col gap-2 px-4 py-3 ${!m.is_active ? 'opacity-60' : ''}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--hiver-text)] truncate">{m.name}</p>
                      <p className="text-sm text-[var(--hiver-text-muted)] truncate">{m.email}</p>
                      {!m.user_id && (
                        <span className="text-xs text-amber-600">Venter på invitasjon</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <select
                        value={m.role}
                        onChange={(e) => handleUpdateRole(m.id, e.target.value as Role)}
                        disabled={saving === m.id}
                        className="rounded-lg border border-[var(--hiver-border)] px-2 py-1.5 text-sm text-[var(--hiver-text)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30 disabled:opacity-50"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                      <label className="flex items-center gap-2 text-sm text-[var(--hiver-text-muted)]">
                        <input
                          type="checkbox"
                          checked={m.is_active}
                          onChange={(e) => handleToggleActive(m.id, e.target.checked)}
                          disabled={saving === m.id}
                          className="rounded border-[var(--hiver-border)] text-[var(--hiver-accent)] focus:ring-[var(--hiver-accent)]"
                        />
                        Active
                      </label>
                      <label className="flex items-center gap-1.5 text-sm text-[var(--hiver-text-muted)]" title="Available for Email">
                        <input
                          type="checkbox"
                          checked={m.available_for_email !== false}
                          onChange={(e) => handleToggleAvailability(m.id, 'available_for_email', e.target.checked)}
                          disabled={saving === m.id}
                          className="rounded border-[var(--hiver-border)] text-[var(--hiver-accent)] focus:ring-[var(--hiver-accent)]"
                        />
                        E-post
                      </label>
                      <label className="flex items-center gap-1.5 text-sm text-[var(--hiver-text-muted)]" title="Available for Chat">
                        <input
                          type="checkbox"
                          checked={m.available_for_chat !== false}
                          onChange={(e) => handleToggleAvailability(m.id, 'available_for_chat', e.target.checked)}
                          disabled={saving === m.id}
                          className="rounded border-[var(--hiver-border)] text-[var(--hiver-accent)] focus:ring-[var(--hiver-accent)]"
                        />
                        Chat
                      </label>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-sm">
                    <span className="text-[var(--hiver-text-muted)]">Team:</span>
                    {memberTeamIds.map((tid) => {
                      const team = teams.find((t) => t.id === tid);
                      return team ? (
                        <span
                          key={tid}
                          className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-[var(--hiver-accent)]/15 text-[var(--hiver-accent)]"
                        >
                          {team.name}
                          <button
                            type="button"
                            onClick={() => handleRemoveMemberFromTeam(m.id, tid)}
                            disabled={saving === m.id}
                            className="p-0.5 rounded hover:bg-[var(--hiver-accent)]/30 disabled:opacity-50"
                            aria-label={`Fjern fra ${team.name}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ) : null;
                    })}
                    {availableTeams.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v) handleAddMemberToTeam(m.id, v);
                          e.target.value = '';
                        }}
                        disabled={saving === m.id}
                        className="rounded border border-[var(--hiver-border)] px-2 py-1 text-xs text-[var(--hiver-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30 disabled:opacity-50"
                      >
                        <option value="">Legg til team…</option>
                        {availableTeams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
