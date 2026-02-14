import type { SelectHTMLAttributes } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

const baseClass =
  'rounded-lg border border-[var(--hiver-border)] bg-[var(--hiver-panel-bg)] text-[var(--hiver-text)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30 disabled:opacity-50 disabled:cursor-not-allowed';

const sizeClass = {
  sm: 'text-[11px] px-1.5 py-0.5 max-w-[120px]',
  md: 'text-sm px-2 py-1.5',
  lg: 'text-sm px-3 py-2',
} as const;

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'size'> {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Placeholder option label when value is empty (e.g. "—" or "Velg…") */
  placeholder?: string;
  size?: keyof typeof sizeClass;
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
  size = 'md',
  className = '',
  disabled,
  ...rest
}: SelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`${baseClass} ${sizeClass[size]} ${className}`.trim()}
      {...rest}
    >
      {placeholder !== undefined && (
        <option value="">{placeholder}</option>
      )}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
