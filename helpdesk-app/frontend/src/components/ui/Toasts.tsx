import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useToast, type ToastType } from '../../contexts/ToastContext';

const typeStyles: Record<
  ToastType,
  { bg: string; border: string; icon: typeof CheckCircle; iconColor: string }
> = {
  success: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    border: 'border-emerald-200 dark:border-emerald-800',
    icon: CheckCircle,
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  error: {
    bg: 'bg-red-50 dark:bg-red-950/40',
    border: 'border-red-200 dark:border-red-800',
    icon: XCircle,
    iconColor: 'text-red-600 dark:text-red-400',
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    border: 'border-amber-200 dark:border-amber-800',
    icon: AlertTriangle,
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  info: {
    bg: 'bg-sky-50 dark:bg-sky-950/40',
    border: 'border-sky-200 dark:border-sky-800',
    icon: Info,
    iconColor: 'text-sky-600 dark:text-sky-400',
  },
};

export function Toasts() {
  const { toasts, removeToast } = useToast();

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-[380px] w-full pointer-events-none"
      aria-live="polite"
      aria-label="Varsler"
    >
      {toasts.map((toast) => {
        const style = typeStyles[toast.type];
        const Icon = style.icon;
        return (
          <ToastItem
            key={toast.id}
            id={toast.id}
            type={toast.type}
            message={toast.message}
            icon={Icon}
            iconColor={style.iconColor}
            bg={style.bg}
            border={style.border}
            onDismiss={() => removeToast(toast.id)}
          />
        );
      })}
    </div>
  );
}

function ToastItem({
  id: _id,
  message,
  icon: Icon,
  iconColor,
  bg,
  border,
  onDismiss,
}: {
  id: string;
  type: ToastType;
  message: string;
  icon: typeof CheckCircle;
  iconColor: string;
  bg: string;
  border: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      className={`pointer-events-auto flex items-start gap-3 rounded-xl border shadow-lg p-4 ${bg} ${border}`}
    >
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${iconColor}`} aria-hidden />
      <p className="flex-1 text-sm font-medium text-[var(--hiver-text)] min-w-0">
        {message}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 p-1 rounded-lg text-[var(--hiver-text-muted)] hover:bg-black/5 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/50"
        aria-label="Lukk"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
