import type { CSSProperties, ReactNode } from 'react';

type PillTone = 'neutral' | 'added' | 'deleted' | 'renamed' | 'success' | 'warning' | 'info' | 'danger';
type PillSize = 'sm' | 'md';

const pillColor: Record<PillTone, string> = {
  neutral: 'var(--text-secondary)',
  added:   '#3fa266',
  deleted: '#c04848',
  renamed: '#7b64b8',
  success: '#3fa266',
  warning: '#e8a043',
  info:    '#599ce7',
  danger:  '#c04848',
};

export function Pill({
  children,
  active = false,
  tone = 'neutral',
  size = 'md',
  leadingContent,
  keyboardHint,
  disabled = false,
  title,
  onClick,
  style,
}: {
  children?: ReactNode;
  active?: boolean;
  tone?: PillTone;
  size?: PillSize;
  leadingContent?: ReactNode;
  keyboardHint?: string;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
  style?: CSSProperties;
}) {
  const color = pillColor[tone];
  const baseBg = active ? color + '22' : 'transparent';
  const border = size === 'sm' ? 'none' : `1px solid ${color}55`;
  const padding = size === 'sm' ? '1px 6px' : '2px 8px';
  const fontSize = size === 'sm' ? 11 : 12;
  return (
    <span
      role={onClick ? 'button' : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
      onClick={onClick && !disabled ? onClick : undefined}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding,
        borderRadius: 9999,
        border,
        background: baseBg,
        color,
        fontSize,
        fontWeight: 500,
        cursor: onClick && !disabled ? 'pointer' : 'default',
        opacity: disabled ? 0.5 : 1,
        userSelect: 'none',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {leadingContent}
      {children}
      {keyboardHint && (
        <span style={{ color: 'var(--text-tertiary)', marginLeft: 2 }}>{keyboardHint}</span>
      )}
    </span>
  );
}

export function Button({
  children,
  variant = 'primary',
  disabled = false,
  type = 'button',
  onClick,
  style,
}: {
  children?: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: () => void;
  style?: CSSProperties;
}) {
  const isPrimary = variant === 'primary';
  const isGhost = variant === 'ghost';
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{
        height: 24,
        padding: '0 10px',
        borderRadius: 4,
        border: isGhost ? 'none' : isPrimary ? 'none' : '1px solid var(--stroke)',
        background: isPrimary
          ? 'var(--accent)'
          : isGhost
            ? 'transparent'
            : 'var(--fill-tertiary)',
        color: isPrimary ? 'var(--accent-text)' : 'var(--text)',
        fontSize: 13,
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function Toggle({
  checked = false,
  onChange,
  disabled = false,
  size = 'sm',
  style,
}: {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  style?: CSSProperties;
}) {
  const track = size === 'md' ? { w: 32, h: 20 } : { w: 28, h: 16 };
  const knob = size === 'md' ? 16 : 12;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onChange?.(!checked)}
      style={{
        position: 'relative',
        width: track.w,
        height: track.h,
        borderRadius: 9999,
        border: 'none',
        padding: 0,
        background: checked ? 'var(--accent)' : 'var(--fill-tertiary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background-color 120ms ease',
        ...style,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: (track.h - knob) / 2,
          left: checked ? track.w - knob - (track.h - knob) / 2 : (track.h - knob) / 2,
          width: knob,
          height: knob,
          borderRadius: 9999,
          background: '#fff',
          transition: 'left 120ms ease',
        }}
      />
    </button>
  );
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  style,
}: {
  value?: string;
  onChange?: (value: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
      disabled={disabled}
      style={{
        height: 28,
        padding: '0 8px',
        borderRadius: 4,
        border: '1px solid var(--stroke)',
        background: 'var(--bg-elevated)',
        color: 'var(--text)',
        fontSize: 13,
        fontFamily: 'inherit',
        ...style,
      }}
    >
      {placeholder !== undefined && value === '' && (
        <option value="" disabled hidden>
          {placeholder}
        </option>
      )}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} disabled={opt.disabled}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
