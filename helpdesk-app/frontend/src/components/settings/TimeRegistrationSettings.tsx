import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Loader2, X, UserCheck, UsersRound, User } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useToast } from '../../contexts/ToastContext';
import { Select } from '../ui/Select';

interface TeamMemberOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface TeamOption {
  id: string;
  name: string;
  manager_team_member_id: string | null;
}

interface ApproverRow {
  id: string;
  team_member_id: string;
}

interface ApproverAssignmentRow {
  id: string;
  approver_team_member_id: string;
  scope: 'team' | 'member';
  team_id: string | null;
  team_member_id: string | null;
}

interface WorkTypeRow {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
}

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
}

interface AbsenceTypeRow {
  id: string;
  code: string;
  label: string;
  sort_order: number;
}

export function TimeRegistrationSettings() {
  const { currentTenantId } = useTenant();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<TeamMemberOption[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [approvers, setApprovers] = useState<ApproverRow[]>([]);
  const [assignments, setAssignments] = useState<ApproverAssignmentRow[]>([]);
  const [workTypes, setWorkTypes] = useState<WorkTypeRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [absenceTypes, setAbsenceTypes] = useState<AbsenceTypeRow[]>([]);

  const [addApproverId, setAddApproverId] = useState('');
  const [addAssignmentApproverId, setAddAssignmentApproverId] = useState('');
  const [addAssignmentType, setAddAssignmentType] = useState<'team' | 'member'>('team');
  const [addAssignmentTeamId, setAddAssignmentTeamId] = useState('');
  const [addAssignmentMemberId, setAddAssignmentMemberId] = useState('');
  const [addWorkTypeName, setAddWorkTypeName] = useState('');
  const [addWorkTypeDesc, setAddWorkTypeDesc] = useState('');
  const [addProjectName, setAddProjectName] = useState('');
  const [addProjectDesc, setAddProjectDesc] = useState('');
  const [editingWorkTypeId, setEditingWorkTypeId] = useState<string | null>(null);
  const [editWorkTypeName, setEditWorkTypeName] = useState('');
  const [editWorkTypeDesc, setEditWorkTypeDesc] = useState('');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editProjectName, setEditProjectName] = useState('');
  const [editProjectDesc, setEditProjectDesc] = useState('');
  const [editingAbsenceId, setEditingAbsenceId] = useState<string | null>(null);
  const [editAbsenceLabel, setEditAbsenceLabel] = useState('');
  const [addAbsenceCode, setAddAbsenceCode] = useState('');
  const [addAbsenceLabel, setAddAbsenceLabel] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    if (!currentTenantId) return;
    setLoading(true);
    const [membersRes, teamsRes, approversRes, assignmentsRes, workRes, projRes, absRes] = await Promise.all([
      supabase.from('team_members').select('id, name, email, role').eq('tenant_id', currentTenantId).eq('is_active', true).order('name'),
      supabase.from('teams').select('id, name, manager_team_member_id').eq('tenant_id', currentTenantId).order('name'),
      supabase.from('time_registration_approvers').select('id, team_member_id').eq('tenant_id', currentTenantId),
      supabase.from('time_registration_approver_assignments').select('id, approver_team_member_id, scope, team_id, team_member_id').eq('tenant_id', currentTenantId),
      supabase.from('time_registration_work_types').select('*').eq('tenant_id', currentTenantId).order('sort_order'),
      supabase.from('time_registration_projects').select('*').eq('tenant_id', currentTenantId).order('name'),
      supabase.from('time_registration_absence_types').select('*').eq('tenant_id', currentTenantId).order('sort_order'),
    ]);
    setMembers((membersRes.data as TeamMemberOption[]) ?? []);
    setTeams((teamsRes.data as TeamOption[]) ?? []);
    setApprovers((approversRes.data as ApproverRow[]) ?? []);
    setAssignments((assignmentsRes.data as ApproverAssignmentRow[]) ?? []);
    setWorkTypes((workRes.data as WorkTypeRow[]) ?? []);
    setProjects((projRes.data as ProjectRow[]) ?? []);
    setAbsenceTypes((absRes.data as AbsenceTypeRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [currentTenantId]);

  const approverMemberIds = new Set(approvers.map((a) => a.team_member_id));
  const memberOptionsForApprover = members.filter((m) => !approverMemberIds.has(m.id)).map((m) => ({ value: m.id, label: `${m.name} (${m.email})` }));

  const addApprover = async () => {
    if (!currentTenantId || !addApproverId) return;
    setSaving(true);
    const { error } = await supabase.from('time_registration_approvers').insert({ tenant_id: currentTenantId, team_member_id: addApproverId });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Godkjennere lagt til.');
      setAddApproverId('');
      fetchData();
    }
    setSaving(false);
  };

  const removeApprover = async (id: string) => {
    const { error } = await supabase.from('time_registration_approvers').delete().eq('id', id);
    if (error) toast.error(error.message);
    else {
      toast.success('Godkjerner fjernet.');
      fetchData();
    }
  };

  const addAssignment = async () => {
    if (!currentTenantId || !addAssignmentApproverId) return;
    const isTeam = addAssignmentType === 'team';
    const teamId = isTeam ? addAssignmentTeamId : null;
    const teamMemberId = !isTeam ? addAssignmentMemberId : null;
    if (isTeam && !teamId) {
      toast.error('Velg et team.');
      return;
    }
    if (!isTeam && !teamMemberId) {
      toast.error('Velg en bruker.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('time_registration_approver_assignments').insert({
      tenant_id: currentTenantId,
      approver_team_member_id: addAssignmentApproverId,
      scope: addAssignmentType,
      team_id: teamId,
      team_member_id: teamMemberId,
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(isTeam ? 'Team tilordnet godkjerner.' : 'Bruker tilordnet godkjerner.');
      setAddAssignmentTeamId('');
      setAddAssignmentMemberId('');
      fetchData();
    }
    setSaving(false);
  };

  const removeAssignment = async (id: string) => {
    const { error } = await supabase.from('time_registration_approver_assignments').delete().eq('id', id);
    if (error) toast.error(error.message);
    else {
      toast.success('Tilordning fjernet.');
      fetchData();
    }
  };

  const getTeamName = (id: string) => teams.find((t) => t.id === id)?.name ?? '—';

  const addWorkType = async () => {
    const name = addWorkTypeName.trim();
    if (!currentTenantId || !name) return;
    setSaving(true);
    const maxOrder = workTypes.length ? Math.max(...workTypes.map((w) => w.sort_order)) + 1 : 0;
    const { error } = await supabase.from('time_registration_work_types').insert({ tenant_id: currentTenantId, name, description: addWorkTypeDesc.trim() || null, sort_order: maxOrder });
    if (error) toast.error(error.message);
    else {
      toast.success('Arbeidstype lagt til.');
      setAddWorkTypeName('');
      setAddWorkTypeDesc('');
      fetchData();
    }
    setSaving(false);
  };

  const saveWorkType = async () => {
    if (!editingWorkTypeId || !editWorkTypeName.trim()) return;
    const { error } = await supabase.from('time_registration_work_types').update({ name: editWorkTypeName.trim(), description: editWorkTypeDesc.trim() || null }).eq('id', editingWorkTypeId);
    if (error) toast.error(error.message);
    else {
      toast.success('Arbeidstype oppdatert.');
      setEditingWorkTypeId(null);
      fetchData();
    }
  };

  const deleteWorkType = async (id: string) => {
    if (!confirm('Slette denne arbeidstypen?')) return;
    const { error } = await supabase.from('time_registration_work_types').delete().eq('id', id);
    if (error) toast.error(error.message);
    else {
      toast.success('Slettet.');
      fetchData();
    }
  };

  const addProject = async () => {
    const name = addProjectName.trim();
    if (!currentTenantId || !name) return;
    setSaving(true);
    const { error } = await supabase.from('time_registration_projects').insert({ tenant_id: currentTenantId, name, description: addProjectDesc.trim() || null });
    if (error) toast.error(error.message);
    else {
      toast.success('Prosjekt lagt til.');
      setAddProjectName('');
      setAddProjectDesc('');
      fetchData();
    }
    setSaving(false);
  };

  const saveProject = async () => {
    if (!editingProjectId || !editProjectName.trim()) return;
    const { error } = await supabase.from('time_registration_projects').update({ name: editProjectName.trim(), description: editProjectDesc.trim() || null }).eq('id', editingProjectId);
    if (error) toast.error(error.message);
    else {
      toast.success('Prosjekt oppdatert.');
      setEditingProjectId(null);
      fetchData();
    }
  };

  const deleteProject = async (id: string) => {
    if (!confirm('Slette dette prosjektet?')) return;
    const { error } = await supabase.from('time_registration_projects').delete().eq('id', id);
    if (error) toast.error(error.message);
    else {
      toast.success('Slettet.');
      fetchData();
    }
  };

  const addAbsenceType = async () => {
    const code = addAbsenceCode.trim().toLowerCase().replace(/\s+/g, '_');
    const label = addAbsenceLabel.trim();
    if (!currentTenantId || !code || !label) return;
    setSaving(true);
    const maxOrder = absenceTypes.length ? Math.max(...absenceTypes.map((a) => a.sort_order)) + 1 : 0;
    const { error } = await supabase.from('time_registration_absence_types').insert({ tenant_id: currentTenantId, code, label, sort_order: maxOrder });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Fraværstype lagt til.');
      setAddAbsenceCode('');
      setAddAbsenceLabel('');
      fetchData();
    }
    setSaving(false);
  };

  const saveAbsenceType = async () => {
    if (!editingAbsenceId || !editAbsenceLabel.trim()) return;
    const { error } = await supabase.from('time_registration_absence_types').update({ label: editAbsenceLabel.trim() }).eq('id', editingAbsenceId);
    if (error) toast.error(error.message);
    else {
      toast.success('Fraværstype oppdatert.');
      setEditingAbsenceId(null);
      fetchData();
    }
  };

  const deleteAbsenceType = async (id: string) => {
    if (!confirm('Slette denne fraværstypen? Eksisterende registreringer beholder dato men mister type.')) return;
    const { error } = await supabase.from('time_registration_absence_types').delete().eq('id', id);
    if (error) toast.error(error.message);
    else {
      toast.success('Slettet.');
      fetchData();
    }
  };

  const getMemberName = (id: string) => members.find((m) => m.id === id)?.name ?? '—';

  const assignmentsByApprover = (teamMemberId: string) =>
    assignments.filter((a) => a.approver_team_member_id === teamMemberId);
  const teamOptions = teams.map((t) => ({ value: t.id, label: t.name }));
  const memberOptionsForAssignment = members.map((m) => ({ value: m.id, label: `${m.name} (${m.email})` }));

  if (!currentTenantId) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--hiver-text-muted)]">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Approval hierarchy */}
      <div className="card-panel p-6 rounded-xl bg-[var(--hiver-panel-bg)] border border-[var(--hiver-border)]">
        <h2 className="text-lg font-semibold text-[var(--hiver-text)] flex items-center gap-2 mb-2">
          <UserCheck className="w-5 h-5 text-[var(--hiver-accent)]" />
          Godkjennerhierarki
        </h2>
        <p className="text-sm text-[var(--hiver-text-muted)] mb-4">
          Administratorer kan alltid godkjenne alle. Ledere kan godkjenne alle i teamene de leder (satt under Team). Tilleggsgodkjennere må tilordnes enten et helt team eller enkeltbrukere nedenfor.
        </p>

        {/* Team managers info */}
        <div className="mb-6 p-4 rounded-lg bg-[var(--hiver-bg)] border border-[var(--hiver-border)]">
          <h3 className="text-sm font-medium text-[var(--hiver-text)] flex items-center gap-2 mb-2">
            <UsersRound className="w-4 h-4" />
            Team og ledere
          </h3>
          <p className="text-sm text-[var(--hiver-text-muted)] mb-2">
            Ledere som er satt på et team under innstillinger «Team» kan godkjenne timeregistrering for alle i det teamet.
          </p>
          {teams.filter((t) => t.manager_team_member_id).length > 0 ? (
            <ul className="text-sm text-[var(--hiver-text)] space-y-1">
              {teams.filter((t) => t.manager_team_member_id).map((t) => (
                <li key={t.id}>
                  <strong>{t.name}</strong> → leder: {getMemberName(t.manager_team_member_id!)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--hiver-text-muted)]">Ingen team har leder satt. Gå til fanen Team for å sette leder.</p>
          )}
        </div>

        {/* Explicit approvers + assignments */}
        <h3 className="text-sm font-medium text-[var(--hiver-text)] mb-3">Tilleggsgodkjennere</h3>
        <ul className="space-y-4 mb-4">
          {approvers.map((a) => {
            const approverAssignments = assignmentsByApprover(a.team_member_id);
            return (
              <li key={a.id} className="p-4 rounded-lg bg-[var(--hiver-bg)] border border-[var(--hiver-border)]">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-medium text-[var(--hiver-text)]">{getMemberName(a.team_member_id)}</span>
                  <button type="button" onClick={() => removeApprover(a.id)} className="p-1.5 rounded text-red-600 hover:bg-red-50" title="Fjern godkjerner">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {approverAssignments.map((asn) => (
                    <span
                      key={asn.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--hiver-panel-bg)] border border-[var(--hiver-border)] text-sm"
                    >
                      {asn.scope === 'team' ? (
                        <>
                          <UsersRound className="w-3.5 h-3.5 text-[var(--hiver-text-muted)]" />
                          {getTeamName(asn.team_id!)}
                        </>
                      ) : (
                        <>
                          <User className="w-3.5 h-3.5 text-[var(--hiver-text-muted)]" />
                          {getMemberName(asn.team_member_id!)}
                        </>
                      )}
                      <button type="button" onClick={() => removeAssignment(asn.id)} className="p-0.5 rounded text-red-600 hover:bg-red-50" title="Fjern tilordning">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                  {approverAssignments.length === 0 && (
                    <span className="text-sm text-[var(--hiver-text-muted)]">Ingen tilordninger — legg til team eller bruker under.</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap gap-4 items-end border-t border-[var(--hiver-border)] pt-4">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="min-w-[200px]">
              <Select value={addApproverId} onChange={setAddApproverId} options={memberOptionsForApprover} placeholder="Velg bruker som godkjerner" className="w-full" />
            </div>
            <button
              type="button"
              onClick={addApprover}
              disabled={!addApproverId || saving}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--hiver-border)] text-sm font-medium text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)] disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Legg til godkjerner
            </button>
          </div>
          {approvers.length > 0 && (
            <div className="flex flex-wrap gap-2 items-end">
              <Select
                value={addAssignmentApproverId}
                onChange={setAddAssignmentApproverId}
                options={approvers.map((ap) => ({ value: ap.team_member_id, label: getMemberName(ap.team_member_id) }))}
                placeholder="Godkjerner"
                className="min-w-[180px]"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAddAssignmentType('team')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border ${addAssignmentType === 'team' ? 'bg-[var(--hiver-accent)] text-white border-[var(--hiver-accent)]' : 'border-[var(--hiver-border)] text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]'}`}
                >
                  Team
                </button>
                <button
                  type="button"
                  onClick={() => setAddAssignmentType('member')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border ${addAssignmentType === 'member' ? 'bg-[var(--hiver-accent)] text-white border-[var(--hiver-accent)]' : 'border-[var(--hiver-border)] text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]'}`}
                >
                  Bruker
                </button>
              </div>
              {addAssignmentType === 'team' ? (
                <Select value={addAssignmentTeamId} onChange={setAddAssignmentTeamId} options={teamOptions} placeholder="Velg team" className="min-w-[160px]" />
              ) : (
                <Select value={addAssignmentMemberId} onChange={setAddAssignmentMemberId} options={memberOptionsForAssignment} placeholder="Velg bruker" className="min-w-[200px]" />
              )}
              <button
                type="button"
                onClick={addAssignment}
                disabled={!addAssignmentApproverId || saving || (addAssignmentType === 'team' ? !addAssignmentTeamId : !addAssignmentMemberId)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)] disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Tilordne
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Work types */}
      <div className="card-panel p-6 rounded-xl bg-[var(--hiver-panel-bg)] border border-[var(--hiver-border)]">
        <h2 className="text-lg font-semibold text-[var(--hiver-text)] mb-2">Arbeidstyper</h2>
        <p className="text-sm text-[var(--hiver-text-muted)] mb-4">Typer arbeid som brukere kan registrere (f.eks. Support, prosjekt).</p>
        <ul className="space-y-2 mb-4">
          {workTypes.map((w) => (
            <li key={w.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--hiver-bg)] border border-[var(--hiver-border)] text-[var(--hiver-text)]">
              {editingWorkTypeId === w.id ? (
                <div className="flex-1 flex gap-2 flex-wrap items-center">
                  <input
                    type="text"
                    value={editWorkTypeName}
                    onChange={(e) => setEditWorkTypeName(e.target.value)}
                    className="flex-1 min-w-[120px] rounded border border-[var(--hiver-border)] px-2 py-1 text-sm"
                    placeholder="Navn"
                  />
                  <input
                    type="text"
                    value={editWorkTypeDesc}
                    onChange={(e) => setEditWorkTypeDesc(e.target.value)}
                    className="flex-1 min-w-[120px] rounded border border-[var(--hiver-border)] px-2 py-1 text-sm"
                    placeholder="Beskrivelse"
                  />
                  <button type="button" onClick={saveWorkType} className="px-2 py-1 rounded bg-[var(--hiver-accent)] text-white text-sm">
                    Lagre
                  </button>
                  <button type="button" onClick={() => setEditingWorkTypeId(null)} className="p-1 rounded text-[var(--hiver-text-muted)]">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <span className="text-sm text-[var(--hiver-text)]">{w.name}</span>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => { setEditingWorkTypeId(w.id); setEditWorkTypeName(w.name); setEditWorkTypeDesc(w.description ?? ''); }} className="p-1.5 rounded text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)]" title="Rediger">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => deleteWorkType(w.id)} className="p-1.5 rounded text-red-600 hover:bg-red-50" title="Slett">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
        <div className="flex gap-2 flex-wrap items-end">
          <input
            type="text"
            value={addWorkTypeName}
            onChange={(e) => setAddWorkTypeName(e.target.value)}
            placeholder="Ny arbeidstype"
            className="rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm min-w-[160px]"
          />
          <input
            type="text"
            value={addWorkTypeDesc}
            onChange={(e) => setAddWorkTypeDesc(e.target.value)}
            placeholder="Beskrivelse (valgfritt)"
            className="rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm min-w-[160px]"
          />
          <button
            type="button"
            onClick={addWorkType}
            disabled={!addWorkTypeName.trim() || saving}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--hiver-border)] text-sm font-medium hover:bg-[var(--hiver-bg)] disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Legg til
          </button>
        </div>
      </div>

      {/* Projects */}
      <div className="card-panel p-6 rounded-xl bg-[var(--hiver-panel-bg)] border border-[var(--hiver-border)]">
        <h2 className="text-lg font-semibold text-[var(--hiver-text)] mb-2">Prosjekter</h2>
        <p className="text-sm text-[var(--hiver-text-muted)] mb-4">Valgfrie prosjekter som brukere kan knytte til timeregistrering.</p>
        <ul className="space-y-2 mb-4">
          {projects.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--hiver-bg)] border border-[var(--hiver-border)]">
              {editingProjectId === p.id ? (
                <div className="flex-1 flex gap-2 flex-wrap items-center">
                  <input
                    type="text"
                    value={editProjectName}
                    onChange={(e) => setEditProjectName(e.target.value)}
                    className="flex-1 min-w-[120px] rounded border border-[var(--hiver-border)] px-2 py-1 text-sm"
                    placeholder="Navn"
                  />
                  <input
                    type="text"
                    value={editProjectDesc}
                    onChange={(e) => setEditProjectDesc(e.target.value)}
                    className="flex-1 min-w-[120px] rounded border border-[var(--hiver-border)] px-2 py-1 text-sm"
                    placeholder="Beskrivelse"
                  />
                  <button type="button" onClick={saveProject} className="px-2 py-1 rounded bg-[var(--hiver-accent)] text-white text-sm">
                    Lagre
                  </button>
                  <button type="button" onClick={() => setEditingProjectId(null)} className="p-1 rounded text-[var(--hiver-text-muted)]">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <span className="text-sm text-[var(--hiver-text)]">{p.name}</span>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => { setEditingProjectId(p.id); setEditProjectName(p.name); setEditProjectDesc(p.description ?? ''); }} className="p-1.5 rounded text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)]" title="Rediger">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => deleteProject(p.id)} className="p-1.5 rounded text-red-600 hover:bg-red-50" title="Slett">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
        <div className="flex gap-2 flex-wrap items-end">
          <input
            type="text"
            value={addProjectName}
            onChange={(e) => setAddProjectName(e.target.value)}
            placeholder="Nytt prosjekt"
            className="rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm min-w-[160px]"
          />
          <input
            type="text"
            value={addProjectDesc}
            onChange={(e) => setAddProjectDesc(e.target.value)}
            placeholder="Beskrivelse (valgfritt)"
            className="rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm min-w-[160px]"
          />
          <button
            type="button"
            onClick={addProject}
            disabled={!addProjectName.trim() || saving}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--hiver-border)] text-sm font-medium hover:bg-[var(--hiver-bg)] disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Legg til
          </button>
        </div>
      </div>

      {/* Absence types */}
      <div className="card-panel p-6 rounded-xl bg-[var(--hiver-panel-bg)] border border-[var(--hiver-border)]">
        <h2 className="text-lg font-semibold text-[var(--hiver-text)] mb-2">Fraværstyper</h2>
        <p className="text-sm text-[var(--hiver-text-muted)] mb-4">Syk, sykt barn, permisjon m.m. Brukere velger type ved fravær.</p>
        <ul className="space-y-2 mb-4">
          {absenceTypes.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--hiver-bg)] border border-[var(--hiver-border)]">
              {editingAbsenceId === a.id ? (
                <div className="flex-1 flex gap-2 flex-wrap items-center">
                  <span className="text-sm text-[var(--hiver-text-muted)]">{a.code}</span>
                  <input
                    type="text"
                    value={editAbsenceLabel}
                    onChange={(e) => setEditAbsenceLabel(e.target.value)}
                    className="flex-1 min-w-[120px] rounded border border-[var(--hiver-border)] px-2 py-1 text-sm"
                    placeholder="Visningsnavn"
                  />
                  <button type="button" onClick={saveAbsenceType} className="px-2 py-1 rounded bg-[var(--hiver-accent)] text-white text-sm">
                    Lagre
                  </button>
                  <button type="button" onClick={() => setEditingAbsenceId(null)} className="p-1 rounded text-[var(--hiver-text-muted)]">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <span className="text-sm text-[var(--hiver-text)]">{a.label}</span>
                  <span className="text-xs text-[var(--hiver-text-muted)] mr-2">{a.code}</span>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => { setEditingAbsenceId(a.id); setEditAbsenceLabel(a.label); }} className="p-1.5 rounded text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)]" title="Rediger">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => deleteAbsenceType(a.id)} className="p-1.5 rounded text-red-600 hover:bg-red-50" title="Slett">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
        <div className="flex gap-2 flex-wrap items-end">
          <input
            type="text"
            value={addAbsenceCode}
            onChange={(e) => setAddAbsenceCode(e.target.value)}
            placeholder="Kode (f.eks. omsorgsdag)"
            className="rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm min-w-[140px]"
          />
          <input
            type="text"
            value={addAbsenceLabel}
            onChange={(e) => setAddAbsenceLabel(e.target.value)}
            placeholder="Visningsnavn"
            className="rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm min-w-[140px]"
          />
          <button
            type="button"
            onClick={addAbsenceType}
            disabled={!addAbsenceCode.trim() || !addAbsenceLabel.trim() || saving}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--hiver-border)] text-sm font-medium hover:bg-[var(--hiver-bg)] disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Legg til
          </button>
        </div>
      </div>
    </div>
  );
}
