import { useEffect, useState } from 'react';
import { Plus, Clock, Loader2, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '../../services/supabase';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const DAY_LABELS: Record<string, string> = {
  monday: 'Mandag',
  tuesday: 'Tirsdag',
  wednesday: 'Onsdag',
  thursday: 'Torsdag',
  friday: 'Fredag',
  saturday: 'Lørdag',
  sunday: 'Søndag',
};

// UTC and common timezones for business hours (value is IANA or UTC offset)
const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: 'UTC', label: 'UTC' },
  { value: 'UTC+1', label: 'UTC+1' },
  { value: 'UTC+2', label: 'UTC+2' },
  { value: 'UTC+3', label: 'UTC+3' },
  { value: 'UTC+4', label: 'UTC+4' },
  { value: 'UTC+5', label: 'UTC+5' },
  { value: 'UTC+5.5', label: 'UTC+5:30' },
  { value: 'UTC+6', label: 'UTC+6' },
  { value: 'UTC+7', label: 'UTC+7' },
  { value: 'UTC+8', label: 'UTC+8' },
  { value: 'UTC+9', label: 'UTC+9' },
  { value: 'UTC+10', label: 'UTC+10' },
  { value: 'UTC+11', label: 'UTC+11' },
  { value: 'UTC+12', label: 'UTC+12' },
  { value: 'UTC-1', label: 'UTC−1' },
  { value: 'UTC-2', label: 'UTC−2' },
  { value: 'UTC-3', label: 'UTC−3' },
  { value: 'UTC-4', label: 'UTC−4' },
  { value: 'UTC-5', label: 'UTC−5' },
  { value: 'UTC-6', label: 'UTC−6' },
  { value: 'UTC-7', label: 'UTC−7' },
  { value: 'UTC-8', label: 'UTC−8' },
  { value: 'UTC-9', label: 'UTC−9' },
  { value: 'UTC-10', label: 'UTC−10' },
  { value: 'UTC-11', label: 'UTC−11' },
  { value: 'UTC-12', label: 'UTC−12' },
  { value: 'Europe/Oslo', label: 'Europe/Oslo (Norge)' },
  { value: 'Europe/Stockholm', label: 'Europe/Stockholm (Sverige)' },
  { value: 'Europe/Copenhagen', label: 'Europe/Copenhagen (Danmark)' },
  { value: 'Europe/London', label: 'Europe/London (Storbritannia)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (Tyskland)' },
  { value: 'America/New_York', label: 'America/New_York' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo' },
];

interface BusinessHourTemplate {
  id: string;
  name: string;
  timezone: string;
  schedule: Record<string, { start: string; end: string } | null>;
  is_default: boolean;
}

const defaultSchedule: Record<string, { start: string; end: string } | null> = {
  monday: { start: '09:00', end: '17:00' },
  tuesday: { start: '09:00', end: '17:00' },
  wednesday: { start: '09:00', end: '17:00' },
  thursday: { start: '09:00', end: '17:00' },
  friday: { start: '09:00', end: '17:00' },
  saturday: null,
  sunday: null,
};

export function BusinessHoursSettings() {
  const [templates, setTemplates] = useState<BusinessHourTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [formName, setFormName] = useState('');
  const [formTimezone, setFormTimezone] = useState('UTC');
  const [formSchedule, setFormSchedule] = useState<Record<string, { start: string; end: string } | null>>(defaultSchedule);
  const [applyToAllStart, setApplyToAllStart] = useState('09:00');
  const [applyToAllEnd, setApplyToAllEnd] = useState('17:00');
  const [saving, setSaving] = useState(false);

  const fetchTemplates = async () => {
    const { data } = await supabase
      .from('business_hour_templates')
      .select('id, name, timezone, schedule, is_default')
      .order('name');
    setTemplates((data as BusinessHourTemplate[]) ?? []);
  };

  useEffect(() => {
    (async () => {
      await fetchTemplates();
      setLoading(false);
    })();
  }, []);

  const resetForm = () => {
    setFormName('');
    setFormTimezone('UTC');
    setFormSchedule(JSON.parse(JSON.stringify(defaultSchedule)));
    setEditingId(null);
    setCreating(false);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      setError('Navn er påkrevd.');
      return;
    }
    setError(null);
    setSaving(true);
    const payload = { name: formName.trim(), timezone: formTimezone, schedule: formSchedule };
    if (editingId) {
      const { error: e } = await supabase
        .from('business_hour_templates')
        .update(payload)
        .eq('id', editingId);
      if (e) setError(e.message);
      else {
        await fetchTemplates();
        resetForm();
      }
    } else {
      const { error: e } = await supabase.from('business_hour_templates').insert(payload);
      if (e) setError(e.message);
      else {
        await fetchTemplates();
        resetForm();
      }
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Slette denne åpningstidsmalen?')) return;
    const { error: e } = await supabase.from('business_hour_templates').delete().eq('id', id);
    if (e) setError(e.message);
    else await fetchTemplates();
  };

  const setDefault = async (id: string) => {
    await supabase.from('business_hour_templates').update({ is_default: false }).neq('id', id);
    await supabase.from('business_hour_templates').update({ is_default: true }).eq('id', id);
    await fetchTemplates();
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
        <Clock className="w-5 h-5 text-[var(--hiver-accent)]" />
        <h2 className="text-lg font-semibold text-[var(--hiver-text)]">Åpningstider</h2>
      </div>
      <p className="text-sm text-[var(--hiver-text-muted)]">
        Opprett og administrer maler for åpningstider. Bruk dem i kapasitetsplanlegging og for å vise
        når teamet ditt er tilgjengelig.
      </p>
      {error && (
        <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
      )}

      {(creating || editingId) && (
        <div className="card-panel p-6 space-y-4">
          <h3 className="text-sm font-medium text-[var(--hiver-text)]">
            {editingId ? 'Rediger mal' : 'Ny mal'}
          </h3>
          <div>
            <label className="block text-sm font-medium text-[var(--hiver-text)] mb-1">Navn</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Standard (Mon–Fri 9–5)"
              className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--hiver-text)] mb-1">Tidssone</label>
            <select
              value={TIMEZONE_OPTIONS.some((o) => o.value === formTimezone) ? formTimezone : 'UTC'}
              onChange={(e) => setFormTimezone(e.target.value)}
              className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm bg-[var(--hiver-panel-bg)] text-[var(--hiver-text)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30"
            >
              {TIMEZONE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--hiver-text)] mb-2">Timeplan</label>
            <div className="flex flex-wrap items-center gap-2 mb-3 p-2 rounded-lg bg-[var(--hiver-bg)]/50">
              <span className="text-sm text-[var(--hiver-text-muted)]">Sett tid for alle åpne dager:</span>
              <input
                type="time"
                value={applyToAllStart}
                onChange={(e) => setApplyToAllStart(e.target.value)}
                className="rounded border border-[var(--hiver-border)] px-2 py-1 text-sm"
              />
              <span className="text-[var(--hiver-text-muted)]">–</span>
              <input
                type="time"
                value={applyToAllEnd}
                onChange={(e) => setApplyToAllEnd(e.target.value)}
                className="rounded border border-[var(--hiver-border)] px-2 py-1 text-sm"
              />
              <button
                type="button"
                onClick={() => {
                  setFormSchedule((prev) => {
                    const next = { ...prev };
                    DAYS.forEach((day) => {
                      if (next[day] != null) next[day] = { start: applyToAllStart, end: applyToAllEnd };
                    });
                    return next;
                  });
                }}
                className="px-2 py-1 rounded text-sm font-medium text-[var(--hiver-accent)] hover:bg-[var(--hiver-accent-light)]"
              >
                Bruk på alle
              </button>
            </div>
            <div className="space-y-2">
              {DAYS.map((day) => (
                <div key={day} className="flex items-center gap-3">
                  <span className="w-24 text-sm text-[var(--hiver-text-muted)]">{DAY_LABELS[day]}</span>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formSchedule[day] !== null}
                      onChange={(e) => {
                        setFormSchedule((s) => ({
                          ...s,
                          [day]: e.target.checked ? { start: '09:00', end: '17:00' } : null,
                        }));
                      }}
                    />
                    Åpen
                  </label>
                  {formSchedule[day] && (
                    <>
                      <input
                        type="time"
                        value={formSchedule[day]!.start}
                        onChange={(e) =>
                          setFormSchedule((s) => ({
                            ...s,
                            [day]: { ...s[day]!, start: e.target.value },
                          }))
                        }
                        className="rounded border border-[var(--hiver-border)] px-2 py-1 text-sm"
                      />
                      <span className="text-[var(--hiver-text-muted)]">–</span>
                      <input
                        type="time"
                        value={formSchedule[day]!.end}
                        onChange={(e) =>
                          setFormSchedule((s) => ({
                            ...s,
                            [day]: { ...s[day]!, end: e.target.value },
                          }))
                        }
                        className="rounded border border-[var(--hiver-border)] px-2 py-1 text-sm"
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Lagre
            </button>
            <button type="button" onClick={resetForm} className="px-4 py-2 rounded-lg border border-[var(--hiver-border)] text-sm font-medium">
              Avbryt
            </button>
          </div>
        </div>
      )}

      {!creating && !editingId && (
        <button
          type="button"
          onClick={() => { setCreating(true); setFormName(''); setFormTimezone('UTC'); setFormSchedule(JSON.parse(JSON.stringify(defaultSchedule))); }}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)]"
        >
          <Plus className="w-4 h-4" />
          Legg til timeplan
        </button>
      )}

      <div className="card-panel overflow-hidden">
        {templates.length === 0 ? (
          <div className="p-8 text-center text-[var(--hiver-text-muted)] text-sm">
            Ingen åpningstidsmaler ennå.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--hiver-border)]">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium text-[var(--hiver-text)]">{t.name}</p>
                  <p className="text-xs text-[var(--hiver-text-muted)]">{t.timezone}</p>
                </div>
                <div className="flex items-center gap-2">
                  {t.is_default && (
                    <span className="text-xs px-2 py-0.5 rounded bg-[var(--hiver-accent-light)] text-[var(--hiver-accent)]">Standard</span>
                  )}
                  {!t.is_default && (
                    <button
                      type="button"
                      onClick={() => setDefault(t.id)}
                      className="text-xs text-[var(--hiver-accent)] hover:underline"
                    >
                      Sett som standard
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(t.id);
                      setFormName(t.name);
                      setFormTimezone(t.timezone);
                      setFormSchedule(JSON.parse(JSON.stringify(t.schedule || defaultSchedule)));
                    }}
                    className="p-2 rounded-lg text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)]"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(t.id)}
                    className="p-2 rounded-lg text-[var(--hiver-text-muted)] hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
