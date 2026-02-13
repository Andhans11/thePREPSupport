import { useMasterData } from '../../contexts/MasterDataContext';

const COLOR_CLASSES: Record<string, { dotColor: string; bgColor: string; textColor: string }> = {
  new: {
    dotColor: 'bg-[var(--status-new)]',
    bgColor: 'bg-[#f5eef5]',
    textColor: 'text-[#6b5a6e]',
  },
  pending: {
    dotColor: 'bg-[var(--status-pending)]',
    bgColor: 'bg-[#f5efe5]',
    textColor: 'text-[#7a6b55]',
  },
  resolved: {
    dotColor: 'bg-[var(--status-resolved)]',
    bgColor: 'bg-[#eef5f0]',
    textColor: 'text-[#5a7a65]',
  },
  closed: {
    dotColor: 'bg-[var(--status-closed)]',
    bgColor: 'bg-[#f0f0f0]',
    textColor: 'text-[#6b6b6b]',
  },
  neutral: {
    dotColor: 'bg-[var(--hiver-text-muted)]',
    bgColor: 'bg-[var(--hiver-bg)]',
    textColor: 'text-[var(--hiver-text)]',
  },
};

interface StatusBadgeProps {
  status: string;
}

function isDark(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { statuses } = useMasterData();
  const row = statuses.find((s) => s.code === status);
  const label = row?.label ?? status;

  if (row?.color_hex) {
    const textColor = isDark(row.color_hex) ? '#fff' : '#1f2937';
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
        style={{ backgroundColor: row.color_hex, color: textColor }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full opacity-80"
          style={{ backgroundColor: textColor }}
          aria-hidden
        />
        {label}
      </span>
    );
  }

  const colorKey = row?.color && COLOR_CLASSES[row.color] ? row.color : 'neutral';
  const classes = COLOR_CLASSES[colorKey] ?? COLOR_CLASSES.neutral;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${classes.bgColor} ${classes.textColor}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${classes.dotColor}`} aria-hidden />
      {label}
    </span>
  );
}
