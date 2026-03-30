import { useState } from 'react';
import { X, Video } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { format } from 'date-fns';
import { nb } from 'date-fns/locale';

export interface GoogleCalendarEventModalData {
  id: string;
  summary: string | null;
  description: string | null;
  start_at: string;
  end_at: string;
  is_all_day: boolean;
  owner_team_member_id: string | null;
  raw_json: Record<string, unknown> | null;
  /** When true, event is hidden from dashboard and calendar (unless calendar "show hidden" is on). */
  hidden_from_app?: boolean;
}

interface MemberOption {
  id: string;
  name: string;
}

interface Props {
  event: GoogleCalendarEventModalData | null;
  memberOptions: MemberOption[];
  onClose: () => void;
  onAssignOwner: (
    eventId: string,
    ownerTeamMemberId: string | null,
    previousOwnerId: string | null
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Toggle "Ikke vis" — hide from dashboard + calendar week view. */
  onHiddenChange?: (hidden: boolean) => Promise<{ ok: boolean; error?: string }>;
}

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

function extractParticipants(raw: Record<string, unknown> | null): string[] {
  if (!raw) return [];
  const attendees = raw.attendees;
  if (!Array.isArray(attendees)) return [];
  return attendees
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const attendee = entry as Record<string, unknown>;
      const email = typeof attendee.email === 'string' ? attendee.email : null;
      const displayName = typeof attendee.displayName === 'string' ? attendee.displayName : null;
      return displayName && email ? `${displayName} (${email})` : email ?? displayName;
    })
    .filter((v): v is string => !!v);
}

function extractMeetLink(raw: Record<string, unknown> | null): string | null {
  if (!raw) return null;
  if (typeof raw.hangoutLink === 'string') return raw.hangoutLink;
  const conferenceData = raw.conferenceData;
  if (!conferenceData || typeof conferenceData !== 'object') return null;
  const entryPoints = (conferenceData as Record<string, unknown>).entryPoints;
  if (!Array.isArray(entryPoints)) return null;
  const video = entryPoints.find((p) => {
    if (!p || typeof p !== 'object') return false;
    return (p as Record<string, unknown>).entryPointType === 'video';
  }) as Record<string, unknown> | undefined;
  return video && typeof video.uri === 'string' ? video.uri : null;
}

export function GoogleCalendarEventModal({
  event,
  memberOptions,
  onClose,
  onAssignOwner,
  onHiddenChange,
}: Props) {
  const toast = useToast();
  const [hiddenBusy, setHiddenBusy] = useState(false);
  if (!event) return null;

  const participants = extractParticipants(event.raw_json);
  const meetLink = extractMeetLink(event.raw_json);
  const hidden = !!event.hidden_from_app;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true">
      <div className="w-full max-w-2xl rounded-xl card-panel shadow-[var(--hiver-shadow-md)] p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--hiver-text)]">{event.summary || '(Uten tittel)'}</h2>
            <p className="text-sm text-[var(--hiver-text-muted)] mt-1">
              {format(new Date(event.start_at), 'd. MMM yyyy HH:mm', { locale: nb })} - {format(new Date(event.end_at), 'HH:mm', { locale: nb })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)]"
            aria-label="Lukk"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {onHiddenChange && (
            <div className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg border border-[var(--hiver-border)] bg-[var(--hiver-bg)]/50">
              <div>
                <p className="text-sm font-medium text-[var(--hiver-text)]">Ikke vis</p>
                <p className="text-xs text-[var(--hiver-text-muted)] mt-0.5">
                  Skjul hendelsen på dashbord og i kalender (synk fra Google påvirkes ikke).
                </p>
              </div>
              <ToggleSwitch
                checked={hidden}
                disabled={hiddenBusy}
                label="Ikke vis"
                onChange={async (next) => {
                  setHiddenBusy(true);
                  const result = await onHiddenChange(next);
                  setHiddenBusy(false);
                  if (!result.ok) {
                    toast.error(result.error || 'Kunne ikke oppdatere.');
                  }
                }}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[var(--hiver-text)] mb-1">Eier i systemet</label>
            <select
              value={event.owner_team_member_id ?? ''}
              onChange={async (e) => {
                const next = e.target.value || null;
                const prev = event.owner_team_member_id;
                const result = await onAssignOwner(event.id, next, prev);
                if (!result.ok) {
                  toast.error(result.error || 'Kunne ikke lagre eier.');
                  e.target.value = prev ?? '';
                }
              }}
              className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm bg-[var(--hiver-panel-bg)]"
            >
              <option value="">Ingen valgt</option>
              {memberOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {meetLink && (
            <div className="p-3 rounded-lg border border-[var(--hiver-border)] bg-[var(--hiver-bg)]/40">
              <p className="text-sm font-medium text-[var(--hiver-text)] flex items-center gap-2">
                <Video className="w-4 h-4" />
                Google Meet
              </p>
              <a href={meetLink} target="_blank" rel="noreferrer" className="text-sm text-[var(--hiver-accent)] hover:underline break-all">
                {meetLink}
              </a>
            </div>
          )}

          {event.description && (
            <div>
              <p className="text-sm font-medium text-[var(--hiver-text)] mb-1">Beskrivelse</p>
              <p className="text-sm text-[var(--hiver-text-muted)] whitespace-pre-wrap">{event.description}</p>
            </div>
          )}

          <div>
            <p className="text-sm font-medium text-[var(--hiver-text)] mb-1">Deltakere</p>
            {participants.length === 0 ? (
              <p className="text-sm text-[var(--hiver-text-muted)]">Ingen deltakere funnet.</p>
            ) : (
              <ul className="space-y-1">
                {participants.map((p) => (
                  <li key={p} className="text-sm text-[var(--hiver-text-muted)]">
                    {p}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
