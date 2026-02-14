import { Loader2 } from 'lucide-react';

export interface SaveButtonProps {
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  type?: 'button' | 'submit';
  className?: string;
  /** Optional icon to show when not loading (e.g. Save). When loading, spinner is shown. */
  icon?: React.ReactNode;
  /** Use for secondary save (e.g. "Avbryt" style) - outline instead of filled */
  variant?: 'primary' | 'secondary';
}

const baseClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/50 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none transition-colors';

export function SaveButton({
  loading = false,
  disabled = false,
  onClick,
  children,
  type = 'button',
  className = '',
  icon,
  variant = 'primary',
}: SaveButtonProps) {
  const variantClass =
    variant === 'primary'
      ? 'bg-[var(--hiver-accent)] text-white hover:bg-[var(--hiver-accent-hover)] shadow-sm'
      : 'border border-[var(--hiver-border)] bg-[var(--hiver-panel-bg)] text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${baseClass} ${variantClass} ${className}`}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden />
      ) : (
        icon && <span className="shrink-0 [&>svg]:w-4 [&>svg]:h-4">{icon}</span>
      )}
      {children}
    </button>
  );
}
