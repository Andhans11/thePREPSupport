import { useState, useEffect } from 'react';
import { Plus, Loader2, Pencil, Trash2, Tag, ListOrdered, X } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useMasterData, type TicketStatusRow, type TicketCategoryRow } from '../../contexts/MasterDataContext';

const DEFAULT_HEX = '#6b7280';

function pillStyle(hex: string | null) {
  const bg = hex || DEFAULT_HEX;
  return {
    backgroundColor: bg,
    color: hex ? (isDark(bg) ? '#fff' : '#1f2937') : 'var(--hiver-text)',
  };
}

function isDark(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

type StatusModalState = { kind: 'add' } | { kind: 'edit'; row: TicketStatusRow } | null;
type CategoryModalState = { kind: 'add' } | { kind: 'edit'; row: TicketCategoryRow } | null;

export function MasterDataSettings() {
  const { currentTenantId } = useTenant();
  const { statuses, categories, loading, refetch } = useMasterData();
  const [error, setError] = useState<string | null>(null);

  const [statusModal, setStatusModal] = useState<StatusModalState>(null);
  const [statusForm, setStatusForm] = useState<{
    code: string;
    label: string;
    sort_order: number;
    color: string;
    description: string;
    color_hex: string;
  }>({
    code: '',
    label: '',
    sort_order: 100,
    color: 'neutral',
    description: '',
    color_hex: DEFAULT_HEX,
  });
  const [savingStatus, setSavingStatus] = useState(false);

  const [categoryModal, setCategoryModal] = useState<CategoryModalState>(null);
  const [categoryForm, setCategoryForm] = useState<{
    name: string;
    description: string;
    color_hex: string;
  }>({ name: '', description: '', color_hex: DEFAULT_HEX });
  const [savingCategory, setSavingCategory] = useState(false);

  // Sync form when opening edit modal
  useEffect(() => {
    if (statusModal?.kind === 'edit') {
      const row = statusModal.row;
      setStatusForm({
        code: row.code,
        label: row.label,
        sort_order: row.sort_order,
        color: row.color || 'neutral',
        description: row.description || '',
        color_hex: row.color_hex || DEFAULT_HEX,
      });
    } else if (statusModal?.kind === 'add') {
      setStatusForm({
        code: '',
        label: '',
        sort_order: 100,
        color: 'neutral',
        description: '',
        color_hex: DEFAULT_HEX,
      });
    }
  }, [statusModal]);

  useEffect(() => {
    if (categoryModal?.kind === 'edit') {
      const row = categoryModal.row;
      setCategoryForm({
        name: row.name,
        description: row.description || '',
        color_hex: row.color_hex || DEFAULT_HEX,
      });
    } else if (categoryModal?.kind === 'add') {
      setCategoryForm({ name: '', description: '', color_hex: DEFAULT_HEX });
    }
  }, [categoryModal]);

  const handleSaveStatus = async () => {
    const code = statusForm.code.trim().toLowerCase().replace(/\s+/g, '_');
    const label = statusForm.label.trim();
    if (!code || !label) {
      setError('Kode og etiketten er påkrevd.');
      return;
    }
    setError(null);
    setSavingStatus(true);
    const payload = {
      code,
      label,
      sort_order: statusForm.sort_order,
      color: statusForm.color,
      description: statusForm.description.trim() || null,
      color_hex: statusForm.color_hex || null,
    };
    if (statusModal?.kind === 'edit') {
      const { error: e } = await supabase
        .from('ticket_statuses')
        .update(payload)
        .eq('id', statusModal.row.id);
      if (e) setError(e.message);
      else {
        await refetch();
        setStatusModal(null);
      }
    } else {
      if (!currentTenantId) return;
      const { error: e } = await supabase.from('ticket_statuses').insert({ ...payload, tenant_id: currentTenantId });
      if (e) setError(e.message);
      else {
        await refetch();
        setStatusModal(null);
      }
    }
    setSavingStatus(false);
  };

  const handleDeleteStatus = async (id: string, code: string) => {
    if (!confirm(`Slette status «${code}»? Saker med denne statusen kan bli påvirket.`)) return;
    const { error: e } = await supabase.from('ticket_statuses').delete().eq('id', id);
    if (e) setError(e.message);
    else {
      await refetch();
      setStatusModal(null);
    }
  };

  const handleSaveCategory = async () => {
    const name = categoryForm.name.trim();
    if (!name) {
      setError('Navn er påkrevd.');
      return;
    }
    setError(null);
    setSavingCategory(true);
    const payload = {
      name,
      description: categoryForm.description.trim() || null,
      color_hex: categoryForm.color_hex || null,
    };
    if (categoryModal?.kind === 'edit') {
      const { error: e } = await supabase
        .from('ticket_categories')
        .update(payload)
        .eq('id', categoryModal.row.id);
      if (e) setError(e.message);
      else {
        await refetch();
        setCategoryModal(null);
      }
    } else {
      if (!currentTenantId) return;
      const { error: e } = await supabase.from('ticket_categories').insert({ ...payload, tenant_id: currentTenantId });
      if (e) setError(e.message);
      else {
        await refetch();
        setCategoryModal(null);
      }
    }
    setSavingCategory(false);
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    if (!confirm(`Slette kategorien «${name}»?`)) return;
    const { error: e } = await supabase.from('ticket_categories').delete().eq('id', id);
    if (e) setError(e.message);
    else {
      await refetch();
      setCategoryModal(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--hiver-text-muted)]">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-6">
      <p className="text-sm text-[var(--hiver-text-muted)]">
        Administrer statuser og kategorier for saker. Status brukes i sakslisten og -detaljer; kategorier kan brukes til
        å gruppere saker.
      </p>
      {error && (
        <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Saksstatuser — 50% */}
        <section className="card-panel p-6 flex flex-col min-w-0">
          <h2 className="text-lg font-semibold text-[var(--hiver-text)] flex items-center gap-2 mb-3">
            <ListOrdered className="w-5 h-5" />
            Saksstatuser
          </h2>
          <button
            type="button"
            onClick={() => setStatusModal({ kind: 'add' })}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--hiver-border)] bg-[var(--hiver-panel-bg)] text-sm font-medium text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)] mb-4 w-fit"
          >
            <Plus className="w-4 h-4" />
            Legg til ny status
          </button>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2">
            {statuses.map((s) => (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={() => setStatusModal({ kind: 'edit', row: s })}
                onKeyDown={(e) => e.key === 'Enter' && setStatusModal({ kind: 'edit', row: s })}
                className="group relative flex items-center gap-1 rounded-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hiver-accent)] min-h-[2rem]"
              >
                {/* Hover popover */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-2 rounded-lg border border-[var(--hiver-border)] bg-white shadow-[var(--hiver-shadow-md)] text-left opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-10 w-48">
                  <p className="font-medium text-[var(--hiver-text)] text-sm">{s.label}</p>
                  <p className="text-xs text-[var(--hiver-text-muted)] mt-0.5">{s.code}</p>
                  {s.description && (
                    <p className="text-xs text-[var(--hiver-text-muted)] mt-1 line-clamp-2">{s.description}</p>
                  )}
                </div>
                <span
                  className="inline-block px-3 py-1 rounded-full text-sm font-medium transition-opacity group-hover:opacity-90 flex-1 min-w-0 truncate"
                  style={pillStyle(s.color_hex)}
                >
                  {s.label}
                </span>
                <span className="inline-flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setStatusModal({ kind: 'edit', row: s });
                    }}
                    className="p-1.5 rounded-lg border border-[var(--hiver-border)] bg-white text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)] hover:text-[var(--hiver-text)]"
                    aria-label="Rediger"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteStatus(s.id, s.code);
                    }}
                    className="p-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200"
                    aria-label="Slett"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Kategorier — 50% */}
        <section className="card-panel p-6 flex flex-col min-w-0">
          <h2 className="text-lg font-semibold text-[var(--hiver-text)] flex items-center gap-2 mb-3">
            <Tag className="w-5 h-5" />
            Kategorier
          </h2>
          <button
            type="button"
            onClick={() => setCategoryModal({ kind: 'add' })}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--hiver-border)] bg-[var(--hiver-panel-bg)] text-sm font-medium text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)] mb-4 w-fit"
          >
            <Plus className="w-4 h-4" />
            Legg til ny kategori
          </button>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2">
            {categories.map((c) => (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => setCategoryModal({ kind: 'edit', row: c })}
                onKeyDown={(e) => e.key === 'Enter' && setCategoryModal({ kind: 'edit', row: c })}
                className="group relative flex items-center gap-1 rounded-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hiver-accent)] min-h-[2rem]"
              >
                {/* Hover popover */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-2 rounded-lg border border-[var(--hiver-border)] bg-white shadow-[var(--hiver-shadow-md)] text-left opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-10 w-48">
                  <p className="font-medium text-[var(--hiver-text)] text-sm">{c.name}</p>
                  {c.description && (
                    <p className="text-xs text-[var(--hiver-text-muted)] mt-1 line-clamp-2">{c.description}</p>
                  )}
                </div>
                <span
                  className="inline-block px-3 py-1 rounded-full text-sm font-medium transition-opacity group-hover:opacity-90 flex-1 min-w-0 truncate"
                  style={pillStyle(c.color_hex)}
                >
                  {c.name}
                </span>
                <span className="inline-flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCategoryModal({ kind: 'edit', row: c });
                    }}
                    className="p-1.5 rounded-lg border border-[var(--hiver-border)] bg-white text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)] hover:text-[var(--hiver-text)]"
                    aria-label="Rediger"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCategory(c.id, c.name);
                    }}
                    className="p-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200"
                    aria-label="Slett"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Status modal */}
      {statusModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setStatusModal(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="status-modal-title"
        >
          <div
            className="bg-[var(--hiver-panel-bg)] rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto border border-[var(--hiver-border)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--hiver-border)]">
              <h3 id="status-modal-title" className="text-lg font-semibold text-[var(--hiver-text)]">
                {statusModal.kind === 'add' ? 'Ny status' : 'Rediger status'}
              </h3>
              <button
                type="button"
                onClick={() => setStatusModal(null)}
                className="p-2 rounded-lg text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)]"
                aria-label="Lukk"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--hiver-text)] mb-1">Kode</label>
                <input
                  type="text"
                  value={statusForm.code}
                  onChange={(e) => setStatusForm((p) => ({ ...p, code: e.target.value }))}
                  placeholder="f.eks. open"
                  className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm bg-[var(--hiver-panel-bg)]"
                  disabled={statusModal.kind === 'edit'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--hiver-text)] mb-1">Etiketten</label>
                <input
                  type="text"
                  value={statusForm.label}
                  onChange={(e) => setStatusForm((p) => ({ ...p, label: e.target.value }))}
                  placeholder="f.eks. Åpen"
                  className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm bg-[var(--hiver-panel-bg)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--hiver-text)] mb-1">Sortering</label>
                <input
                  type="number"
                  value={statusForm.sort_order}
                  onChange={(e) => setStatusForm((p) => ({ ...p, sort_order: parseInt(e.target.value, 10) || 0 }))}
                  className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm bg-[var(--hiver-panel-bg)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--hiver-text)] mb-1">Farge</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={statusForm.color_hex}
                    onChange={(e) => setStatusForm((p) => ({ ...p, color_hex: e.target.value }))}
                    className="h-9 w-12 rounded border border-[var(--hiver-border)] cursor-pointer bg-transparent"
                  />
                  <input
                    type="text"
                    value={statusForm.color_hex}
                    onChange={(e) => setStatusForm((p) => ({ ...p, color_hex: e.target.value }))}
                    placeholder="#6b7280"
                    className="flex-1 rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm bg-[var(--hiver-panel-bg)] font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--hiver-text)] mb-1">Beskrivelse (valgfritt)</label>
                <input
                  type="text"
                  value={statusForm.description}
                  onChange={(e) => setStatusForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Kort beskrivelse av statusen"
                  className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm bg-[var(--hiver-panel-bg)]"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 p-4 border-t border-[var(--hiver-border)]">
              <div>
                {statusModal.kind === 'edit' && (
                  <button
                    type="button"
                    onClick={() => statusModal.kind === 'edit' && handleDeleteStatus(statusModal.row.id, statusModal.row.code)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                    Slett status
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStatusModal(null)}
                  className="px-4 py-2 rounded-lg border border-[var(--hiver-border)] bg-[var(--hiver-panel-bg)] text-sm font-medium text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]"
                >
                  Avbryt
                </button>
                <button
                  type="button"
                  onClick={handleSaveStatus}
                  disabled={savingStatus}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium disabled:opacity-50"
                >
                  {savingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {statusModal.kind === 'add' ? 'Legg til' : 'Lagre'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Category modal */}
      {categoryModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setCategoryModal(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="category-modal-title"
        >
          <div
            className="bg-[var(--hiver-panel-bg)] rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto border border-[var(--hiver-border)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--hiver-border)]">
              <h3 id="category-modal-title" className="text-lg font-semibold text-[var(--hiver-text)]">
                {categoryModal.kind === 'add' ? 'Ny kategori' : 'Rediger kategori'}
              </h3>
              <button
                type="button"
                onClick={() => setCategoryModal(null)}
                className="p-2 rounded-lg text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)]"
                aria-label="Lukk"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--hiver-text)] mb-1">Navn</label>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="f.eks. Faktura"
                  className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm bg-[var(--hiver-panel-bg)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--hiver-text)] mb-1">Farge</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={categoryForm.color_hex}
                    onChange={(e) => setCategoryForm((p) => ({ ...p, color_hex: e.target.value }))}
                    className="h-9 w-12 rounded border border-[var(--hiver-border)] cursor-pointer bg-transparent"
                  />
                  <input
                    type="text"
                    value={categoryForm.color_hex}
                    onChange={(e) => setCategoryForm((p) => ({ ...p, color_hex: e.target.value }))}
                    placeholder="#6b7280"
                    className="flex-1 rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm bg-[var(--hiver-panel-bg)] font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--hiver-text)] mb-1">Beskrivelse (valgfritt)</label>
                <input
                  type="text"
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Kort beskrivelse"
                  className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm bg-[var(--hiver-panel-bg)]"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 p-4 border-t border-[var(--hiver-border)]">
              <div>
                {categoryModal.kind === 'edit' && (
                  <button
                    type="button"
                    onClick={() =>
                      categoryModal.kind === 'edit' && handleDeleteCategory(categoryModal.row.id, categoryModal.row.name)
                    }
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                    Slett kategori
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCategoryModal(null)}
                  className="px-4 py-2 rounded-lg border border-[var(--hiver-border)] bg-[var(--hiver-panel-bg)] text-sm font-medium text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]"
                >
                  Avbryt
                </button>
                <button
                  type="button"
                  onClick={handleSaveCategory}
                  disabled={savingCategory}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium disabled:opacity-50"
                >
                  {savingCategory ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {categoryModal.kind === 'add' ? 'Legg til' : 'Lagre'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
