import { useEffect, useState } from 'react';
import { Plus, UserPlus, Loader2, X, Copy, Mail, MailPlus, Trash2, UserCheck, UserX, Mail as MailIcon } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { ROLES, ROLE_LABELS, type Role } from '../../types/roles';
import { sendInvitationEmail } from '../../services/api';
import { Select } from '../ui/Select';
import { SaveButton } from '../ui/SaveButton';

type FilterTab = 'all' | 'active' | 'inactive';

function ToggleSwitch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-0 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hiver-accent)] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? 'bg-[var(--hiver-accent)]' : 'bg-[var(--hiver-border)]'
      }`}
      aria-label={label}
    >
      <span
        className={`pointer-events-none absolute top-1/2 inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-200 -translate-y-1/2 ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}

interface TeamMemberRow {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
  available_for_email?: boolean;
  email_on_new_ticket?: boolean;
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
  const { user: currentUser } = useAuth();
  const toast = useToast();
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
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [modalMember, setModalMember] = useState<TeamMemberRow | null>(null);

  const fetchMembers = async () => {
    if (!currentTenantId) return;
    setLoading(true);
    const [membersRes, teamsRes, memberTeamsRes] = await Promise.all([
      supabase.from('team_members').select('id, user_id, name, email, role, is_active, available_for_email, email_on_new_ticket').eq('tenant_id', currentTenantId).order('name'),
      supabase.from('teams').select('id, name').eq('tenant_id', currentTenantId).order('name'),
      supabase.from('team_member_teams').select('team_member_id, team_id'),
    ]);
    const membersList = (membersRes.data as TeamMemberRow[]) || [];
    const teamsList = (teamsRes.data as TeamOption[]) || [];
    const memberTeamsList = (memberTeamsRes.data as MemberTeam[]) || [];
    const memberIds = new Set(membersList.map((m) => m.id));
    const teamIds = new Set(teamsList.map((t) => t.id));
    const tenantMemberTeams = memberTeamsList.filter(
      (mt) => memberIds.has(mt.team_member_id) && teamIds.has(mt.team_id)
    );
    if (membersRes.error) {
      setError(membersRes.error.message);
      setMembers([]);
    } else {
      setError(null);
      setMembers(membersList);
    }
    setTeams(teamsList);
    setMemberTeams(tenantMemberTeams);
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
      const msg = (rpcData as { error?: string })?.error ?? rpcError?.message ?? 'Kunne ikke opprette invitasjon';
      setError(msg);
      toast.error(msg);
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
      toast.warning('Invitasjon opprettet, men e-post kunne ikke sendes. Kopier lenken under.');
    } else {
      toast.success('Invitasjon er sendt');
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
    if (!currentTenantId) return;
    setSaving(id);
    setError(null);
    const { error: e } = await supabase
      .from('team_members')
      .update({ role })
      .eq('id', id)
      .eq('tenant_id', currentTenantId);
    if (e) {
      setError(e.message);
      toast.error(e.message);
    } else {
      setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, role } : m)));
      toast.success('Rolle er oppdatert');
    }
    setSaving(null);
  };

  const handleToggleActive = async (id: string, is_active: boolean) => {
    if (!currentTenantId) return;
    setSaving(id);
    setError(null);
    const { error: e } = await supabase
      .from('team_members')
      .update({ is_active })
      .eq('id', id)
      .eq('tenant_id', currentTenantId);
    if (e) {
      setError(e.message);
      toast.error(e.message);
    } else {
      setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, is_active } : m)));
      toast.success(is_active ? 'Bruker er aktivert' : 'Bruker er deaktivert');
    }
    setSaving(null);
  };

  const handleToggleEmailOnNewTicket = async (id: string, email_on_new_ticket: boolean) => {
    if (!currentTenantId) return;
    setSaving(id);
    setError(null);
    const { error: e } = await supabase
      .from('team_members')
      .update({ email_on_new_ticket })
      .eq('id', id)
      .eq('tenant_id', currentTenantId);
    if (e) {
      setError(e.message);
      toast.error(e.message);
    } else {
      setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, email_on_new_ticket } : m)));
      setModalMember((prev) => (prev && prev.id === id ? { ...prev, email_on_new_ticket } : prev));
      toast.success(email_on_new_ticket ? 'E-post ved ny sak er aktivert' : 'E-post ved ny sak er deaktivert');
    }
    setSaving(null);
  };

  const handleToggleAvailability = async (id: string, value: boolean) => {
    if (!currentTenantId) return;
    setSaving(id);
    setError(null);
    const { error: e } = await supabase
      .from('team_members')
      .update({ available_for_email: value })
      .eq('id', id)
      .eq('tenant_id', currentTenantId);
    if (e) {
      setError(e.message);
      toast.error(e.message);
    } else {
      setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, available_for_email: value } : m)));
      toast.success('E-postvarsling er oppdatert');
    }
    setSaving(null);
  };

  const handleResendInvitation = async (m: TeamMemberRow) => {
    if (!currentTenantId || m.user_id) return;
    setError(null);
    setResendingId(m.id);
    try {
      const { data: pending } = await supabase
        .from('tenant_invitations')
        .select('invitation_code')
        .eq('tenant_id', currentTenantId)
        .eq('email', m.email)
        .is('used_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      let invitationCode: string | undefined;
      let invitePath: string;
      if (pending?.invitation_code) {
        invitationCode = pending.invitation_code;
        invitePath = `/accept-invite?code=${invitationCode}`;
      } else {
        const { data: rpcData, error: rpcError } = await supabase.rpc('create_tenant_invitation', {
          p_tenant_id: currentTenantId,
          p_email: m.email,
          p_name: m.name,
          p_role: m.role,
        });
        if (rpcError || !(rpcData as { ok?: boolean })?.ok) {
          const msg = (rpcData as { error?: string })?.error ?? rpcError?.message ?? 'Kunne ikke opprette invitasjon';
          setError(msg);
          toast.error(msg);
          setResendingId(null);
          return;
        }
        invitationCode = (rpcData as { invitation_code?: string })?.invitation_code;
        invitePath = (rpcData as { invite_path?: string })?.invite_path ?? `/accept-invite?code=${invitationCode}`;
      }
      const inviteLink = `${window.location.origin}${invitePath}`;
      const result = await sendInvitationEmail(invitationCode ?? '', inviteLink);
      if (result.sent) {
        setLastInviteLink(inviteLink);
        toast.success('Invitasjon er sendt på nytt');
      } else {
        setError(result.error ?? 'E-post kunne ikke sendes.');
        toast.warning(result.error ?? 'E-post kunne ikke sendes. Kopier lenken.');
      }
    } finally {
      setResendingId(null);
    }
  };

  const handleDeleteMember = async (id: string): Promise<boolean> => {
    if (!currentTenantId) return false;
    setError(null);
    setDeletingId(id);
    const { error: e } = await supabase
      .from('team_members')
      .delete()
      .eq('id', id)
      .eq('tenant_id', currentTenantId);
    if (e) {
      setError(e.message);
      toast.error(e.message);
      setDeletingId(null);
      return false;
    }
    setMembers((prev) => prev.filter((m) => m.id !== id));
    setConfirmDeleteId(null);
    setDeletingId(null);
    toast.success('Bruker er fjernet');
    return true;
  };

  const adminCount = members.filter((m) => m.role === 'admin').length;
  const currentUserId = currentUser?.id ?? null;

  const filteredMembers =
    filterTab === 'active'
      ? members.filter((m) => m.is_active)
      : filterTab === 'inactive'
        ? members.filter((m) => !m.is_active)
        : members;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--hiver-text-muted)]">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const tabs: { value: FilterTab; label: string }[] = [
    { value: 'all', label: 'Alle' },
    { value: 'active', label: 'Aktive' },
    { value: 'inactive', label: 'Inaktive' },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[var(--hiver-text)] tracking-tight">Teammedlemmer</h2>
          <p className="text-sm text-[var(--hiver-text-muted)] mt-0.5">
            {filteredMembers.length} {filteredMembers.length === 1 ? 'bruker' : 'brukere'}
            {filterTab !== 'all' && ` (${members.length} totalt)`}
          </p>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)] shadow-sm transition-colors shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            Legg til bruker
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-[var(--hiver-bg)] border border-[var(--hiver-border)] w-fit">
        {tabs.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilterTab(value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filterTab === value
                ? 'bg-[var(--hiver-panel-bg)] text-[var(--hiver-text)] shadow-sm'
                : 'text-[var(--hiver-text-muted)] hover:text-[var(--hiver-text)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {lastInviteLink && (
        <div className="rounded-xl p-4 flex flex-wrap items-center gap-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
          <Mail className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">Invitasjon sendt</p>
            <p className="text-xs text-emerald-700 dark:text-emerald-300 truncate" title={lastInviteLink}>{lastInviteLink}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copyInviteLink}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
            >
              <Copy className="w-4 h-4" />
              Kopier lenke
            </button>
            <button
              type="button"
              onClick={() => setLastInviteLink(null)}
              className="p-2 rounded-lg text-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
              aria-label="Lukk"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {adding && (
        <div className="card-panel p-5 space-y-4 rounded-xl">
          <h3 className="text-base font-medium text-[var(--hiver-text)]">Legg til teammedlem</h3>
          <p className="text-sm text-[var(--hiver-text-muted)]">
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
            <Select
              value={addRole}
              onChange={(v) => setAddRole(v as Role)}
              options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
              size="lg"
            />
            <SaveButton
              onClick={handleAdd}
              loading={saving === 'add'}
              icon={<Plus className="w-4 h-4" />}
            >
              Legg til
            </SaveButton>
            <button
              type="button"
              onClick={() => { setAdding(false); setError(null); }}
              className="px-4 py-2 rounded-lg border border-[var(--hiver-border)] text-sm font-medium text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]"
            >
              Avbryt
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {filteredMembers.length === 0 ? (
          <div className="card-panel rounded-xl p-10 text-center">
            <p className="text-[var(--hiver-text-muted)] text-sm">
              {members.length === 0
                ? 'Ingen teammedlemmer ennå. Legg til en bruker over.'
                : filterTab === 'active'
                  ? 'Ingen aktive brukere.'
                  : filterTab === 'inactive'
                    ? 'Ingen inaktive brukere.'
                    : 'Ingen teammedlemmer.'}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {filteredMembers.map((m) => {
              const memberTeamIds = getMemberTeamIds(m.id);
              return (
                <li key={m.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setModalMember(m)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setModalMember(m);
                      }
                    }}
                    className={`w-full text-left card-panel rounded-xl p-4 transition-all duration-200 hover:shadow-md hover:border-[var(--hiver-accent)]/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hiver-accent)]/50 cursor-pointer ${
                      !m.is_active ? 'opacity-75' : ''
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg ${
                            m.is_active
                              ? 'bg-[var(--hiver-accent)]/15 text-[var(--hiver-accent)]'
                              : 'bg-[var(--hiver-border)] text-[var(--hiver-text-muted)]'
                          }`}
                          aria-hidden
                        >
                          {m.is_active ? <UserCheck className="w-5 h-5" /> : <UserX className="w-5 h-5" />}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-[var(--hiver-text)] truncate">{m.name}</p>
                          <p className="text-sm text-[var(--hiver-text-muted)] truncate">{m.email}</p>
                          {!m.user_id && (
                            <span className="inline-block mt-1 text-xs text-amber-600 dark:text-amber-400">Venter på invitasjon</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <span className="text-xs px-2.5 py-1 rounded-lg bg-[var(--hiver-bg)] text-[var(--hiver-text-muted)] font-medium">
                          {ROLE_LABELS[m.role]}
                        </span>
                        <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-2">
                            <ToggleSwitch
                              checked={m.is_active}
                              onChange={(v) => handleToggleActive(m.id, v)}
                              disabled={saving === m.id}
                              label={m.is_active ? 'Deaktiver' : 'Aktiver'}
                            />
                            <span className="text-xs text-[var(--hiver-text-muted)] w-8">Aktiv</span>
                          </div>
                          {m.user_id && m.email && (
                            <div className="flex items-center gap-2" title="Motta e-post når en ny sak opprettes">
                              <ToggleSwitch
                                checked={!!m.email_on_new_ticket}
                                onChange={(v) => handleToggleEmailOnNewTicket(m.id, v)}
                                disabled={saving === m.id}
                                label={m.email_on_new_ticket ? 'Slå av e-post ved ny sak' : 'Slå på e-post ved ny sak'}
                              />
                              <span className="text-xs text-[var(--hiver-text-muted)] whitespace-nowrap">E-post ved ny sak</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {memberTeamIds.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-[var(--hiver-border)]">
                        {memberTeamIds.map((tid) => {
                          const team = teams.find((t) => t.id === tid);
                          return team ? (
                            <span
                              key={tid}
                              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--hiver-accent)]/15 text-[var(--hiver-accent)]"
                            >
                              {team.name}
                            </span>
                          ) : null;
                        })}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Member edit modal */}
      {modalMember && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setModalMember(null)}
          onKeyDown={(e) => e.key === 'Escape' && setModalMember(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="member-modal-title"
        >
          <div
            className="bg-[var(--hiver-panel-bg)] border border-[var(--hiver-border)] rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--hiver-border)] shrink-0">
              <h3 id="member-modal-title" className="text-lg font-semibold text-[var(--hiver-text)]">
                Rediger bruker
              </h3>
              <button
                type="button"
                onClick={() => setModalMember(null)}
                className="p-2 rounded-lg text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)] hover:text-[var(--hiver-text)] transition-colors"
                aria-label="Lukk"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-6 space-y-5">
              <div>
                <p className="font-medium text-[var(--hiver-text)]">{modalMember.name}</p>
                <p className="text-sm text-[var(--hiver-text-muted)]">{modalMember.email}</p>
                {!modalMember.user_id && (
                  <span className="inline-block mt-1 text-xs text-amber-600">Venter på invitasjon</span>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--hiver-text-muted)] mb-2">Rolle</label>
                <Select
                  value={modalMember.role}
                  onChange={(v) => handleUpdateRole(modalMember.id, v as Role)}
                  options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
                  disabled={saving === modalMember.id}
                  size="lg"
                  className="w-full"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {modalMember.is_active ? (
                    <UserCheck className="w-5 h-5 text-[var(--hiver-accent)]" />
                  ) : (
                    <UserX className="w-5 h-5 text-[var(--hiver-text-muted)]" />
                  )}
                  <span className="text-sm font-medium text-[var(--hiver-text)]">Aktiv</span>
                </div>
                <ToggleSwitch
                  checked={modalMember.is_active}
                  onChange={(v) => handleToggleActive(modalMember.id, v)}
                  disabled={saving === modalMember.id}
                  label="Aktiv"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MailIcon className="w-5 h-5 text-[var(--hiver-text-muted)]" />
                  <span className="text-sm font-medium text-[var(--hiver-text)]">E-postvarsler</span>
                </div>
                <ToggleSwitch
                  checked={modalMember.available_for_email !== false}
                  onChange={(v) => handleToggleAvailability(modalMember.id, v)}
                  disabled={saving === modalMember.id}
                  label="E-post"
                />
              </div>

              {modalMember.user_id && modalMember.email && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MailIcon className="w-5 h-5 text-[var(--hiver-text-muted)]" />
                    <span className="text-sm font-medium text-[var(--hiver-text)]">E-post ved ny sak</span>
                  </div>
                  <ToggleSwitch
                    checked={!!modalMember.email_on_new_ticket}
                    onChange={(v) => handleToggleEmailOnNewTicket(modalMember.id, v)}
                    disabled={saving === modalMember.id}
                    label="Motta e-post når en ny sak opprettes"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-[var(--hiver-text-muted)] mb-2">Team</label>
                <div className="flex flex-wrap gap-2">
                  {getMemberTeamIds(modalMember.id).map((tid) => {
                    const team = teams.find((t) => t.id === tid);
                    return team ? (
                      <span
                        key={tid}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--hiver-accent)]/15 text-[var(--hiver-accent)] text-sm"
                      >
                        {team.name}
                        <button
                          type="button"
                          onClick={() => handleRemoveMemberFromTeam(modalMember.id, tid)}
                          disabled={saving === modalMember.id}
                          className="p-0.5 rounded hover:bg-[var(--hiver-accent)]/25 disabled:opacity-50"
                          aria-label={`Fjern fra ${team.name}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ) : null;
                  })}
                  {teams.filter((t) => !getMemberTeamIds(modalMember.id).includes(t.id)).length > 0 && (
                    <Select
                      value=""
                      onChange={(v) => v && handleAddMemberToTeam(modalMember.id, v)}
                      options={teams.filter((t) => !getMemberTeamIds(modalMember.id).includes(t.id)).map((t) => ({ value: t.id, label: t.name }))}
                      placeholder="Legg til team…"
                      disabled={saving === modalMember.id}
                      size="md"
                      className="min-w-[120px]"
                    />
                  )}
                </div>
              </div>

              {!modalMember.user_id && (
                <button
                  type="button"
                  onClick={() => handleResendInvitation(modalMember)}
                  disabled={resendingId === modalMember.id}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-[var(--hiver-border)] text-sm font-medium text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)] disabled:opacity-50"
                >
                  {resendingId === modalMember.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <MailPlus className="w-4 h-4" />
                  )}
                  Send invitasjon på nytt
                </button>
              )}

              {confirmDeleteId === modalMember.id ? (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--hiver-border)]">
                  <span className="text-sm text-amber-700 dark:text-amber-400">Slette denne brukeren?</span>
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await handleDeleteMember(modalMember.id);
                      if (ok) setModalMember(null);
                    }}
                    disabled={deletingId === modalMember.id}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                  >
                    {deletingId === modalMember.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    Ja, slett
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(null)}
                    className="px-3 py-1.5 rounded-lg border border-[var(--hiver-border)] text-sm text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]"
                  >
                    Avbryt
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(modalMember.id)}
                  disabled={
                    saving === modalMember.id ||
                    (modalMember.user_id !== null && modalMember.user_id === currentUserId) ||
                    (modalMember.role === 'admin' && adminCount <= 1)
                  }
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
                  title={
                    modalMember.user_id === currentUserId
                      ? 'Du kan ikke slette deg selv'
                      : modalMember.role === 'admin' && adminCount <= 1
                        ? 'Kan ikke slette siste admin'
                        : 'Slett bruker'
                  }
                >
                  <Trash2 className="w-4 h-4" />
                  Slett bruker
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
