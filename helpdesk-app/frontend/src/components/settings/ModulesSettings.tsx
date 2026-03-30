import { useEffect, useState } from 'react';
import { Blocks, Calendar, CalendarDays, Clock, BarChart3, Save } from 'lucide-react';
import { useModules, type ModuleSettings } from '../../contexts/ModulesContext';
import { useToast } from '../../contexts/ToastContext';
import { ROLE_LABELS, ROLES, type Role } from '../../types/roles';
import {
  MODULE_IDS,
  MODULE_LABELS,
  defaultRoleAccessAll,
  type ModuleId,
} from '../../types/modules';

const MODULE_ICONS: Record<ModuleId, typeof Blocks> = {
  planning: Calendar,
  time_registration: Clock,
  calendar: CalendarDays,
  analytics: BarChart3,
};

function ToggleSwitch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
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

function settingsEqual(a: ModuleSettings, b: ModuleSettings): boolean {
  if (
    a.planningEnabled !== b.planningEnabled ||
    a.timeRegistrationEnabled !== b.timeRegistrationEnabled ||
    a.calendarEnabled !== b.calendarEnabled ||
    a.analyticsEnabled !== b.analyticsEnabled
  ) {
    return false;
  }
  for (const id of MODULE_IDS) {
    for (const r of ROLES) {
      if (a.roleAccess[id][r] !== b.roleAccess[id][r]) return false;
    }
  }
  return true;
}

export function ModulesSettings() {
  const {
    loading,
    planningEnabled,
    timeRegistrationEnabled,
    calendarEnabled,
    analyticsEnabled,
    roleAccess,
    updateModules,
  } = useModules();
  const toast = useToast();
  const [draft, setDraft] = useState<ModuleSettings>(() => ({
    planningEnabled: true,
    timeRegistrationEnabled: true,
    calendarEnabled: true,
    analyticsEnabled: true,
    roleAccess: defaultRoleAccessAll(),
  }));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft({
      planningEnabled,
      timeRegistrationEnabled,
      calendarEnabled,
      analyticsEnabled,
      roleAccess: MODULE_IDS.reduce(
        (acc, id) => {
          acc[id] = { ...roleAccess[id] };
          return acc;
        },
        {} as ModuleSettings['roleAccess']
      ),
    });
  }, [planningEnabled, timeRegistrationEnabled, calendarEnabled, analyticsEnabled, roleAccess]);

  const serverState: ModuleSettings = {
    planningEnabled,
    timeRegistrationEnabled,
    calendarEnabled,
    analyticsEnabled,
    roleAccess,
  };

  const hasChanges = !settingsEqual(draft, serverState);

  const moduleEnabled = (id: ModuleId): boolean => {
    switch (id) {
      case 'planning':
        return draft.planningEnabled;
      case 'time_registration':
        return draft.timeRegistrationEnabled;
      case 'calendar':
        return draft.calendarEnabled;
      case 'analytics':
        return draft.analyticsEnabled;
      default:
        return false;
    }
  };

  const setModuleEnabled = (id: ModuleId, v: boolean) => {
    setDraft((prev) => {
      const next = { ...prev };
      switch (id) {
        case 'planning':
          next.planningEnabled = v;
          break;
        case 'time_registration':
          next.timeRegistrationEnabled = v;
          break;
        case 'calendar':
          next.calendarEnabled = v;
          break;
        case 'analytics':
          next.analyticsEnabled = v;
          break;
        default:
          break;
      }
      return next;
    });
  };

  const setRoleAccess = (moduleId: ModuleId, role: Role, v: boolean) => {
    setDraft((prev) => ({
      ...prev,
      roleAccess: {
        ...prev.roleAccess,
        [moduleId]: { ...prev.roleAccess[moduleId], [role]: v },
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    const result = await updateModules(draft);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error || 'Kunne ikke lagre moduler.');
      return;
    }
    toast.success('Moduler er oppdatert.');
  };

  if (loading) {
    return <div className="text-sm text-[var(--hiver-text-muted)]">Laster…</div>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold text-[var(--hiver-text)] flex items-center gap-2">
          <Blocks className="w-5 h-5" />
          Moduler
        </h2>
        <p className="text-sm text-[var(--hiver-text-muted)] mt-1">
          Slå moduler av eller på for organisasjonen, og velg hvilke brukergrupper som ser hver modul i menyen.
        </p>
      </div>

      <div className="space-y-4">
        {MODULE_IDS.map((id) => {
          const Icon = MODULE_ICONS[id];
          const enabled = moduleEnabled(id);
          return (
            <div key={id} className="card-panel p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-sm font-medium text-[var(--hiver-text)] flex items-center gap-2">
                    <Icon className="w-4 h-4 shrink-0" />
                    {MODULE_LABELS[id]}
                  </span>
                  <p className="text-xs text-[var(--hiver-text-muted)] mt-1">
                    {id === 'planning' && 'Planleggingssiden og relaterte snarveier.'}
                    {id === 'time_registration' && 'Timeregistrering i menyen.'}
                    {id === 'calendar' && 'Kalenderside og kalender på dashbord.'}
                    {id === 'analytics' && 'Analyse-siden med nøkkeltall.'}
                  </p>
                </div>
                <ToggleSwitch
                  checked={enabled}
                  onChange={(v) => setModuleEnabled(id, v)}
                  label={`Vis ${MODULE_LABELS[id]}`}
                />
              </div>

              <div className={`pt-3 border-t border-[var(--hiver-border)] ${!enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                <p className="text-xs font-medium text-[var(--hiver-text-muted)] mb-2">Tilgang etter rolle</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {ROLES.map((role) => (
                    <label key={role} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--hiver-border)] px-2.5 py-2 bg-[var(--hiver-bg)]/50">
                      <span className="text-xs text-[var(--hiver-text)]">{ROLE_LABELS[role]}</span>
                      <ToggleSwitch
                        checked={draft.roleAccess[id][role]}
                        onChange={(v) => setRoleAccess(id, role, v)}
                        label={`${MODULE_LABELS[id]} for ${ROLE_LABELS[role]}`}
                        disabled={!enabled}
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)] disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Lagrer…' : 'Lagre moduler'}
        </button>
      </div>
    </div>
  );
}
