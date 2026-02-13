import { useState, useRef, useEffect } from 'react';
import { useTickets } from '../../contexts/TicketContext';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { useMasterData } from '../../contexts/MasterDataContext';
import { useGmail } from '../../contexts/GmailContext';
import { supabase } from '../../services/supabase';
import { getMessageDisplayHtml } from '../../utils/sanitizeHtml';
import { StatusBadge } from './StatusBadge';
import { TicketMessage } from './TicketMessage';
import { ReplyBox } from './ReplyBox';
import { ForwardBox } from './ForwardBox';
import {
  User,
  MessageSquare,
  Reply,
  ReplyAll,
  Forward,
  ChevronLeft,
  ChevronRight,
  Mail,
  Printer,
  MoreVertical,
  X,
  FileText,
  Image,
} from 'lucide-react';

function formatMessageDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const isYesterday =
    new Date(now.getTime() - 86400000).toDateString() === d.toDateString();
  if (isToday) return d.toLocaleTimeString('nb-NO', { hour: 'numeric', minute: '2-digit' });
  if (isYesterday) return 'I går, ' + d.toLocaleTimeString('nb-NO', { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString('nb-NO', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function getInitial(name: string | null, email: string) {
  if (name && name.trim()) return name.trim().charAt(0).toUpperCase();
  if (email) return email.charAt(0).toUpperCase();
  return '?';
}

interface TeamOption {
  id: string;
  name: string;
}

export function TicketDetail() {
  const { selectedTicket, messages, updateTicket, selectTicket, addMessage, fetchMessages } = useTickets();
  const { user } = useAuth();
  const { statuses, categories } = useMasterData();
  const gmail = useGmail();
  const supportEmail = gmail?.groupEmail?.trim() || gmail?.gmailEmail?.trim() || null;
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [notesTab, setNotesTab] = useState<'activities' | 'notes'>('activities');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [composeMode, setComposeMode] = useState<'reply' | 'replyAll' | 'forward'>('reply');
  const [sidebarTab, setSidebarTab] = useState<'details' | 'contact'>('details');
  const [newTag, setNewTag] = useState('');
  const [showAddNoteForm, setShowAddNoteForm] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const mainScrollRef = useRef<HTMLDivElement>(null);

  const { currentTenantId } = useTenant();
  useEffect(() => {
    if (!currentTenantId) return;
    supabase.from('teams').select('id, name').eq('tenant_id', currentTenantId).order('name').then(({ data }) => setTeams((data as TeamOption[]) ?? []));
  }, [currentTenantId]);

  useEffect(() => {
    if (showReplyBox && mainScrollRef.current) {
      mainScrollRef.current.scrollTop = 0;
    }
  }, [showReplyBox]);

  if (!selectedTicket) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--hiver-text-muted)] p-8 bg-[var(--hiver-panel-bg)]">
        Velg en samtale eller opprett en
      </div>
    );
  }

  const customer = selectedTicket.customer;
  const customerEmail = customer?.email ?? '';
  const assigneeLabel = selectedTicket.assigned_to
    ? selectedTicket.assigned_to === user?.id
      ? 'Deg'
      : 'Tildelt'
    : 'Ingen';
  const canAssignToMe = !selectedTicket.assigned_to || selectedTicket.assigned_to !== user?.id;

  const firstMessage = messages.find((m) => m.is_customer && !m.is_internal_note) ?? messages[0];
  const messagesNewestFirst = [...messages].reverse();
  const ticketTags = selectedTicket.tags ?? [];
  const internalNotes = [...messages.filter((m) => m.is_internal_note)].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const categoryRow = categories.find((c) => c.name === selectedTicket.category);
  const categoryColor = categoryRow?.color_hex ?? '#6b7280';

  const handleSaveInternalNote = async () => {
    const text = newNoteContent.trim();
    if (!text || !user?.email || !selectedTicket) return;
    setSavingNote(true);
    await addMessage({
      ticket_id: selectedTicket.id,
      from_email: user.email,
      from_name: user.user_metadata?.full_name ?? null,
      content: text,
      is_customer: false,
      is_internal_note: true,
    });
    await fetchMessages(selectedTicket.id);
    setNewNoteContent('');
    setShowAddNoteForm(false);
    setSavingNote(false);
    setNotesTab('notes');
  };

  return (
    <div className="flex flex-1 min-w-0 h-full bg-[var(--hiver-panel-bg)]">
      {/* Left: Email content */}
      <div className="flex flex-col flex-1 min-w-0 border-r border-[var(--hiver-border)] bg-white">
        {/* Top action bar */}
        <div className="shrink-0 flex items-center gap-1 px-3 py-2 border-b border-[var(--hiver-border)] bg-[var(--hiver-bg)]/80">
          <button
            type="button"
            className="p-2 rounded-lg text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)] hover:text-[var(--hiver-text)]"
            aria-label="Forrige"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            className="p-2 rounded-lg text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)] hover:text-[var(--hiver-text)]"
            aria-label="Neste"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <button
            type="button"
            className="p-2 rounded-lg text-[var(--hiver-accent)] bg-[var(--hiver-bg)]"
            aria-label="Innboks"
          >
            <Mail className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => { setComposeMode('reply'); setShowReplyBox(true); }}
            className="flex flex-col items-center gap-0.5 p-2 rounded-lg text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)] hover:text-[var(--hiver-text)]"
            aria-label="Svar"
          >
            <Reply className="w-5 h-5" />
            <span className="text-[10px]">Svar</span>
          </button>
          <button
            type="button"
            onClick={() => { setComposeMode('replyAll'); setShowReplyBox(true); }}
            className="flex flex-col items-center gap-0.5 p-2 rounded-lg text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)] hover:text-[var(--hiver-text)]"
            aria-label="Svar alle"
          >
            <ReplyAll className="w-5 h-5" />
            <span className="text-[10px]">Svar alle</span>
          </button>
          <button
            type="button"
            onClick={() => { setComposeMode('forward'); setShowReplyBox(true); }}
            className="flex flex-col items-center gap-0.5 p-2 rounded-lg text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)] hover:text-[var(--hiver-text)]"
            aria-label="Videresend"
          >
            <Forward className="w-5 h-5" />
            <span className="text-[10px]">Videresend</span>
          </button>
          <button
            type="button"
            className="p-2 rounded-lg text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)] hover:text-[var(--hiver-text)]"
            aria-label="Skriv ut"
          >
            <Printer className="w-5 h-5" />
          </button>
          <button
            type="button"
            className="p-2 rounded-lg text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)] hover:text-[var(--hiver-text)]"
            aria-label="Mer"
          >
            <MoreVertical className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => selectTicket(null)}
            className="p-2 rounded-lg text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)] hover:text-[var(--hiver-text)]"
            aria-label="Lukk"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Subject + Assign to me when unassigned */}
        <div className="shrink-0 px-6 pt-5 pb-2 border-b border-[var(--hiver-border)] flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-[var(--hiver-text)] min-w-0 flex-1">
            {selectedTicket.subject}
          </h1>
          {!selectedTicket.assigned_to && user && (
            <button
              type="button"
              onClick={() => updateTicket(selectedTicket.id, { assigned_to: user.id })}
              className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium bg-[var(--hiver-accent)] text-white hover:bg-[var(--hiver-accent-hover)]"
            >
              Tildel meg
            </button>
          )}
        </div>

        {/* From / To / Date block */}
        {firstMessage && (
          <div className="shrink-0 px-6 py-4 border-b border-[var(--hiver-border)]">
            <div className="flex items-start gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-semibold shrink-0 bg-amber-200 text-amber-900"
                aria-hidden
              >
                {getInitial(firstMessage.from_name, firstMessage.from_email)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[var(--hiver-text)]">
                  {firstMessage.from_name || firstMessage.from_email}
                </p>
                <p className="text-sm text-[var(--hiver-text-muted)]">
                  {firstMessage.from_email}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm text-[var(--hiver-text-muted)]">
                  {formatMessageDate(firstMessage.created_at)}
                </span>
                <button
                  type="button"
                  className="p-1.5 rounded text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)]"
                  aria-label="Mer"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Scrollable: reply box at top when open, then messages newest first */}
        <div ref={mainScrollRef} className="flex-1 overflow-y-auto">
          {showReplyBox && (
            <div className="border-b border-[var(--hiver-border)] bg-white">
              <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--hiver-border)] bg-[var(--hiver-bg)]/50">
                <span className="text-sm font-medium text-[var(--hiver-text)]">
                  {composeMode === 'forward' ? 'Videresend' : composeMode === 'replyAll' ? 'Svar alle' : 'Svar på samtale'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowReplyBox(false)}
                  className="p-1.5 rounded-lg text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)] hover:text-[var(--hiver-text)]"
                  aria-label="Lukk"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {composeMode === 'forward' ? (
                <ForwardBox
                  ticketSubject={selectedTicket.subject}
                  onSent={() => setShowReplyBox(false)}
                />
              ) : (
                <ReplyBox
                  ticketId={selectedTicket.id}
                  customerEmail={customerEmail}
                  gmailThreadId={selectedTicket.gmail_thread_id}
                  ticketSubject={selectedTicket.subject}
                  ticketNumber={selectedTicket.ticket_number ?? ''}
                  customerName={customer?.name ?? null}
                  customerCompany={null}
                  replyAll={composeMode === 'replyAll'}
                  onSent={() => setShowReplyBox(false)}
                />
              )}
            </div>
          )}

          <div className="px-6 py-4 space-y-4">
            {messagesNewestFirst.length > 0 ? (
              messagesNewestFirst.map((msg) => (
                <TicketMessage
                  key={msg.id}
                  message={msg}
                  customerEmail={customerEmail}
                  customerName={customer?.name ?? null}
                  supportEmail={supportEmail}
                  onReply={() => { setComposeMode('reply'); setShowReplyBox(true); }}
                  onReplyAll={() => { setComposeMode('replyAll'); setShowReplyBox(true); }}
                  onForward={() => { setComposeMode('forward'); setShowReplyBox(true); }}
                />
              ))
            ) : (
              <p className="text-[var(--hiver-text-muted)] text-sm">Ingen meldinger ennå.</p>
            )}
          </div>
        </div>
      </div>

      {/* Right: Support sidebar (replicated from reference) */}
      {!sidebarCollapsed && (
        <aside className="w-80 shrink-0 flex flex-col border-l border-[var(--hiver-border)] bg-white">
          <div className="shrink-0 flex items-center justify-between p-3 border-b border-[var(--hiver-border)]">
            <h3 className="text-sm font-semibold text-[var(--hiver-text)]">
              Support
            </h3>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setSidebarTab('details')}
                className={`p-2 rounded-lg ${sidebarTab === 'details' ? 'text-[var(--hiver-accent)] bg-[var(--hiver-bg)]' : 'text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)]'}`}
                aria-label="Detaljer"
              >
                <FileText className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab('contact')}
                className={`p-2 rounded-lg ${sidebarTab === 'contact' ? 'text-[var(--hiver-accent)] bg-[var(--hiver-bg)]' : 'text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)]'}`}
                aria-label="Kontakt"
              >
                <User className="w-4 h-4" />
              </button>
              <button
                type="button"
                className="p-2 rounded-lg text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)]"
                aria-label="Bilder"
              >
                <Image className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                className="p-2 rounded-lg text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)]"
                aria-label="Lukk panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Sidebar tabs: Detaljer | Kontakt */}
          <div className="shrink-0 flex border-b border-[var(--hiver-border)]">
            <button
              type="button"
              onClick={() => setSidebarTab('details')}
              className={`flex-1 px-3 py-2.5 text-sm font-medium ${
                sidebarTab === 'details'
                  ? 'text-[var(--hiver-accent)] border-b-2 border-[var(--hiver-accent)] -mb-px'
                  : 'text-[var(--hiver-text-muted)] hover:text-[var(--hiver-text)]'
              }`}
            >
              Detaljer
            </button>
            <button
              type="button"
              onClick={() => setSidebarTab('contact')}
              className={`flex-1 px-3 py-2.5 text-sm font-medium ${
                sidebarTab === 'contact'
                  ? 'text-[var(--hiver-accent)] border-b-2 border-[var(--hiver-accent)] -mb-px'
                  : 'text-[var(--hiver-text-muted)] hover:text-[var(--hiver-text)]'
              }`}
            >
              Kontakt
            </button>
          </div>

          <div className="shrink-0 p-3">
            {sidebarTab === 'details' && (
              <>
                {/* Compact grid: Tildelt, Status, Kategori, Merker + pills */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 shrink-0 mb-2">
                  <div>
                    <label className="text-[10px] font-medium text-[var(--hiver-text-muted)] uppercase tracking-wide">Tildelt</label>
                    <div className="flex items-center gap-1 flex-wrap mt-0.5">
                      <span className="text-xs text-[var(--hiver-text)]">{assigneeLabel}</span>
                      {canAssignToMe && user && (
                        <button type="button" onClick={() => updateTicket(selectedTicket.id, { assigned_to: user.id })} className="text-[10px] text-[var(--hiver-accent)] hover:underline">
                          Tildel meg
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-[var(--hiver-text-muted)] uppercase tracking-wide">Status</label>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      <StatusBadge status={selectedTicket.status} />
                      <select
                        value={selectedTicket.status}
                        onChange={(e) => updateTicket(selectedTicket.id, { status: e.target.value })}
                        className="rounded border border-[var(--hiver-border)] text-[11px] px-1.5 py-0.5 bg-white max-w-[100px]"
                      >
                        {statuses.map((s) => (
                          <option key={s.id} value={s.code}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-[var(--hiver-text-muted)] uppercase tracking-wide">Kategori</label>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      {selectedTicket.category ? (
                        <span
                          className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium text-white"
                          style={{ backgroundColor: categoryColor }}
                        >
                          {selectedTicket.category}
                        </span>
                      ) : null}
                      <select
                        value={selectedTicket.category ?? ''}
                        onChange={(e) => updateTicket(selectedTicket.id, { category: e.target.value || null })}
                        className="rounded border border-[var(--hiver-border)] text-[11px] px-1.5 py-0.5 bg-white max-w-[100px]"
                      >
                        <option value="">—</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-[var(--hiver-text-muted)] uppercase tracking-wide">Eierteam</label>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      <select
                        value={selectedTicket.team_id ?? ''}
                        onChange={(e) => updateTicket(selectedTicket.id, { team_id: e.target.value || null })}
                        className="rounded border border-[var(--hiver-border)] text-[11px] px-1.5 py-0.5 bg-white max-w-[120px]"
                      >
                        <option value="">—</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-[var(--hiver-text-muted)] uppercase tracking-wide">Merker</label>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      {ticketTags.map((t) => (
                        <span key={t} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] bg-[var(--hiver-bg)] text-[var(--hiver-text)]">
                          {t}
                          <button
                            type="button"
                            onClick={() => updateTicket(selectedTicket.id, { tags: (ticketTags as string[]).filter((x) => x !== t) || [] })}
                            className="hover:text-red-600"
                            aria-label="Fjern"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      <div className="flex gap-1">
                        <input
                          type="text"
                          value={newTag}
                          onChange={(e) => setNewTag(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newTag.trim()) {
                              updateTicket(selectedTicket.id, { tags: [...ticketTags, newTag.trim()] });
                              setNewTag('');
                            }
                          }}
                          placeholder="+ Merke"
                          className="w-20 rounded border border-[var(--hiver-border)] text-[11px] px-1.5 py-0.5"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (newTag.trim()) {
                              updateTicket(selectedTicket.id, { tags: [...ticketTags, newTag.trim()] });
                              setNewTag('');
                            }
                          }}
                          className="text-[10px] text-[var(--hiver-accent)] hover:underline"
                        >
                          Legg til
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {sidebarTab === 'contact' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-semibold shrink-0 bg-amber-200 text-amber-900"
                    aria-hidden
                  >
                    {customer ? getInitial(customer.name, customer.email) : '?'}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--hiver-text)] truncate">
                      {customer?.name || customer?.email || 'Ukjent'}
                    </p>
                    <p className="text-sm text-[var(--hiver-text-muted)] truncate">
                      {customerEmail || '—'}
                    </p>
                  </div>
                </div>
                <div className="pt-2 border-t border-[var(--hiver-border)] space-y-2">
                  <p className="text-xs font-medium text-[var(--hiver-text-muted)]">E-post</p>
                  <p className="text-sm text-[var(--hiver-text)]">{customerEmail || '—'}</p>
                </div>
                {customer?.name && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-[var(--hiver-text-muted)]">Navn</p>
                    <p className="text-sm text-[var(--hiver-text)]">{customer.name}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Alle aktiviteter / Notater — starts below Merker, takes remaining space */}
          <div className="flex-1 flex flex-col min-h-0 border-t border-[var(--hiver-border)]">
            <div className="flex border-b border-[var(--hiver-border)] shrink-0">
              <button
                type="button"
                onClick={() => setNotesTab('activities')}
                className={`flex-1 px-3 py-2.5 text-sm font-medium ${
                  notesTab === 'activities'
                    ? 'text-[var(--hiver-accent)] border-b-2 border-[var(--hiver-accent)] -mb-px'
                    : 'text-[var(--hiver-text-muted)] hover:text-[var(--hiver-text)]'
                }`}
              >
                Alle aktiviteter
              </button>
              <button
                type="button"
                onClick={() => setNotesTab('notes')}
                className={`flex-1 px-3 py-2.5 text-sm font-medium ${
                  notesTab === 'notes'
                    ? 'text-[var(--hiver-accent)] border-b-2 border-[var(--hiver-accent)] -mb-px'
                    : 'text-[var(--hiver-text-muted)] hover:text-[var(--hiver-text)]'
                }`}
              >
                Notater
              </button>
            </div>
            <div className="p-2 border-b border-[var(--hiver-border)] shrink-0 space-y-2">
              {!showAddNoteForm ? (
                <button
                  type="button"
                  onClick={() => setShowAddNoteForm(true)}
                  className="flex items-center justify-center gap-2 w-full text-sm text-[var(--hiver-text)] bg-[var(--hiver-bg)] border border-[var(--hiver-border)] rounded-lg px-3 py-2 hover:bg-[var(--hiver-border)]/50 hover:border-[var(--hiver-text-muted)]/50"
                >
                  <MessageSquare className="w-4 h-4 shrink-0" />
                  Legg til notat
                </button>
              ) : (
                <div className="space-y-2">
                  <textarea
                    value={newNoteContent}
                    onChange={(e) => setNewNoteContent(e.target.value)}
                    placeholder="Skriv et intern notat…"
                    rows={3}
                    className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm text-[var(--hiver-text)] placeholder:text-[var(--hiver-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30 resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSaveInternalNote}
                      disabled={!newNoteContent.trim() || savingNote}
                      className="flex-1 py-1.5 rounded-lg text-sm font-medium bg-[var(--hiver-accent)] text-white hover:bg-[var(--hiver-accent-hover)] disabled:opacity-50 disabled:pointer-events-none"
                    >
                      {savingNote ? 'Lagrer…' : 'Lagre notat'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowAddNoteForm(false); setNewNoteContent(''); }}
                      disabled={savingNote}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium bg-[var(--hiver-bg)] border border-[var(--hiver-border)] text-[var(--hiver-text)] hover:bg-[var(--hiver-border)]/50 disabled:opacity-50"
                    >
                      Avbryt
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-3 min-h-[180px]">
              {notesTab === 'activities' && (
                <div className="space-y-3 text-sm">
                  {messagesNewestFirst.length === 0 && (
                    <div className="flex gap-2">
                      <MessageSquare className="w-4 h-4 text-[var(--hiver-text-muted)] shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[var(--hiver-text)]">Ny samtale opprettet</p>
                        <p className="text-xs text-[var(--hiver-text-muted)]">
                          {new Date(selectedTicket.created_at).toLocaleTimeString('nb-NO', { hour: 'numeric', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  )}
                  {messagesNewestFirst.map((msg) => (
                    <div key={msg.id} className="flex gap-2">
                      <MessageSquare className="w-4 h-4 text-[var(--hiver-text-muted)] shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[var(--hiver-text)]">
                          {msg.is_internal_note
                            ? 'Intern notat lagt til'
                            : msg.is_customer
                              ? 'Melding mottatt fra kunde'
                              : 'Svar sendt'}
                        </p>
                        <p className="text-xs text-[var(--hiver-text-muted)]">
                          {formatMessageDate(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {notesTab === 'notes' && (
                <div className="space-y-3">
                  {internalNotes.length === 0 ? (
                    <p className="text-sm text-[var(--hiver-text-muted)]">
                      Ingen notater. Klikk «Legg til notat» for å legge til et intern notat.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {internalNotes.map((msg) => (
                        <div key={msg.id} className="rounded-lg border border-[var(--hiver-border)] p-2 bg-amber-50/50">
                          <p className="text-xs text-[var(--hiver-text-muted)] mb-1">
                            {msg.from_name || msg.from_email} · {formatMessageDate(msg.created_at)}
                          </p>
                          <div
                            className="text-sm text-[var(--hiver-text)] break-words [&_p]:my-0.5 whitespace-pre-wrap"
                            dangerouslySetInnerHTML={{ __html: getMessageDisplayHtml(msg.html_content, msg.content) }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </aside>
      )}

      {sidebarCollapsed && (
        <button
          type="button"
          onClick={() => setSidebarCollapsed(false)}
          className="shrink-0 w-10 flex flex-col items-center justify-center border-l border-[var(--hiver-border)] bg-[var(--hiver-bg)]/50 text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)] hover:text-[var(--hiver-text)]"
          aria-label="Vis Support-panel"
        >
          <FileText className="w-5 h-5" />
          <span className="text-[10px] mt-1">Support</span>
        </button>
      )}
    </div>
  );
}
