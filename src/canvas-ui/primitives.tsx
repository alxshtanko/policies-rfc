import type { CSSProperties, ReactNode } from 'react';

// ─── Layout ─────────────────────────────────────────────────────────────────

export function Stack({
  children,
  gap = 12,
  style,
}: {
  children?: ReactNode;
  gap?: number;
  style?: CSSProperties;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap, ...style }}>{children}</div>
  );
}

type RowAlign = 'start' | 'center' | 'end' | 'stretch';
type RowJustify = 'start' | 'center' | 'end' | 'space-between';

export function Row({
  children,
  gap = 8,
  align = 'stretch',
  justify = 'start',
  wrap = false,
  style,
}: {
  children?: ReactNode;
  gap?: number;
  align?: RowAlign;
  justify?: RowJustify;
  wrap?: boolean;
  style?: CSSProperties;
}) {
  const alignItems = align === 'stretch' ? 'stretch' : `flex-${align}`.replace('flex-start', 'flex-start');
  const justifyContent =
    justify === 'space-between' ? 'space-between' : `flex-${justify}`.replace('flex-start', 'flex-start');
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        gap,
        alignItems: alignItems === 'flex-stretch' ? 'stretch' : alignItems,
        justifyContent,
        flexWrap: wrap ? 'wrap' : 'nowrap',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Grid({
  children,
  columns,
  gap = 12,
  align,
  style,
}: {
  children?: ReactNode;
  columns: number | string;
  gap?: number;
  align?: RowAlign;
  style?: CSSProperties;
}) {
  const gridTemplateColumns =
    typeof columns === 'number' ? `repeat(${columns}, minmax(0, 1fr))` : columns;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns,
        gap,
        alignItems: align === 'stretch' ? 'stretch' : align ? `flex-${align}` : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Divider({ style }: { style?: CSSProperties }) {
  return (
    <hr
      style={{
        border: 0,
        height: 1,
        backgroundColor: 'var(--stroke-subtle)',
        margin: 0,
        ...style,
      }}
    />
  );
}

export function Spacer() {
  return <div style={{ flex: 1 }} />;
}

// ─── Style utility ──────────────────────────────────────────────────────────

export function mergeStyle(base: CSSProperties, override?: CSSProperties): CSSProperties {
  return { ...base, ...(override ?? {}) };
}
