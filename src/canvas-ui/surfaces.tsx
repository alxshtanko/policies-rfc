import type { CSSProperties, ReactNode } from 'react';
import { useState } from 'react';

type CardVariant = 'default' | 'borderless';
type CardSize = 'base' | 'lg';

export function Card({
  children,
  variant = 'default',
  stickyHeader = false,
  collapsible = false,
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  style,
}: {
  children?: ReactNode;
  variant?: CardVariant;
  size?: CardSize;
  stickyHeader?: boolean;
  collapsible?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  style?: CSSProperties;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = typeof openProp === 'boolean';
  const open = isControlled ? openProp : internalOpen;
  const toggle = () => {
    const next = !open;
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <div
      data-canvas-card
      data-canvas-card-open={open ? 'true' : 'false'}
      data-canvas-card-collapsible={collapsible ? 'true' : 'false'}
      data-canvas-sticky-header={stickyHeader ? 'true' : 'false'}
      data-canvas-card-toggle={collapsible ? toggle.toString() : undefined}
      style={{
        border: variant === 'default' ? '1px solid var(--stroke)' : 'none',
        borderRadius: variant === 'default' ? 6 : 0,
        background: 'var(--bg-elevated)',
        overflow: 'hidden',
        ...style,
      }}
    >
      {wrapCardChildren(children, collapsible, open, toggle)}
    </div>
  );
}

function wrapCardChildren(
  children: ReactNode,
  collapsible: boolean,
  open: boolean,
  toggle: () => void,
): ReactNode {
  // Lightweight conditional rendering: when collapsible & closed, hide CardBody.
  if (!collapsible) return children;
  return (
    <CardCollapsibleContext.Provider value={{ collapsible, open, toggle }}>
      {children}
    </CardCollapsibleContext.Provider>
  );
}

import { createContext, useContext } from 'react';
const CardCollapsibleContext = createContext<{ collapsible: boolean; open: boolean; toggle: () => void }>(
  { collapsible: false, open: true, toggle: () => {} },
);

export function CardHeader({
  children,
  trailing,
  style,
}: {
  children?: ReactNode;
  trailing?: ReactNode;
  style?: CSSProperties;
}) {
  const { collapsible, open, toggle } = useContext(CardCollapsibleContext);
  return (
    <div
      onClick={collapsible ? toggle : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        height: 28,
        background: 'var(--fill-tertiary)',
        borderBottom: '1px solid var(--stroke-subtle)',
        cursor: collapsible ? 'pointer' : 'default',
        ...style,
      }}
    >
      {collapsible && (
        <span
          style={{
            display: 'inline-block',
            width: 10,
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 120ms ease',
            color: 'var(--text-tertiary)',
            fontSize: 10,
          }}
        >
          ▶
        </span>
      )}
      <span style={{ fontSize: 12, fontWeight: 590, color: 'var(--text)' }}>{children}</span>
      <span style={{ flex: 1 }} />
      {trailing}
    </div>
  );
}

export function CardBody({ children, style }: { children?: ReactNode; style?: CSSProperties }) {
  const { collapsible, open } = useContext(CardCollapsibleContext);
  if (collapsible && !open) return null;
  return <div style={{ padding: 12, ...style }}>{children}</div>;
}

type CalloutTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

const calloutColors: Record<CalloutTone, { border: string; bg: string; title: string }> = {
  info:    { border: '#599ce7', bg: 'rgba(89,156,231,0.10)',  title: '#599ce7' },
  success: { border: '#3fa266', bg: 'rgba(63,162,102,0.10)',  title: '#3fa266' },
  warning: { border: '#e8a043', bg: 'rgba(232,160,67,0.10)',  title: '#e8a043' },
  danger:  { border: '#c04848', bg: 'rgba(192,72,72,0.10)',   title: '#c04848' },
  neutral: { border: 'var(--stroke)', bg: 'var(--fill-tertiary)', title: 'var(--text)' },
};

export function Callout({
  children,
  tone = 'neutral',
  title,
  icon,
  style,
}: {
  children?: ReactNode;
  tone?: CalloutTone;
  title?: ReactNode;
  icon?: ReactNode;
  style?: CSSProperties;
}) {
  const c = calloutColors[tone];
  return (
    <div
      style={{
        border: `1px solid ${c.border}`,
        background: c.bg,
        borderRadius: 6,
        padding: 12,
        ...style,
      }}
    >
      {(title || icon) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          {icon}
          {title && (
            <span style={{ color: c.title, fontWeight: 590, fontSize: 13 }}>{title}</span>
          )}
        </div>
      )}
      <div style={{ color: 'var(--text)', fontSize: 14, lineHeight: '20px' }}>{children}</div>
    </div>
  );
}
