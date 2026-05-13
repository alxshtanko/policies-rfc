import type { CSSProperties, ReactNode } from 'react';

type TableColumnAlign = 'left' | 'center' | 'right';
type TableRowTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

const rowToneBg: Record<TableRowTone, string> = {
  success: 'rgba(63,162,102,0.12)',
  danger:  'rgba(192,72,72,0.12)',
  warning: 'rgba(232,160,67,0.12)',
  info:    'rgba(89,156,231,0.12)',
  neutral: 'var(--fill-tertiary)',
};

export function Table({
  headers,
  rows,
  columnAlign,
  rowTone,
  framed = true,
  striped = false,
  stickyHeader = false,
  style,
  emptyMessage,
}: {
  headers: ReactNode[];
  rows: ReactNode[][];
  columnAlign?: Array<TableColumnAlign | undefined>;
  rowTone?: Array<TableRowTone | undefined>;
  framed?: boolean;
  striped?: boolean;
  stickyHeader?: boolean;
  style?: CSSProperties;
  emptyMessage?: ReactNode;
}) {
  const alignFor = (i: number): TableColumnAlign => columnAlign?.[i] ?? 'left';
  const hasRows = rows.length > 0;
  return (
    <div
      style={{
        border: framed ? '1px solid var(--stroke)' : 'none',
        borderRadius: framed ? 6 : 0,
        overflow: 'auto',
        ...style,
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead
          style={{
            background: 'var(--fill-tertiary)',
            position: stickyHeader ? 'sticky' : 'static',
            top: 0,
          }}
        >
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                style={{
                  textAlign: alignFor(i),
                  padding: '6px 10px',
                  fontWeight: 590,
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  borderBottom: '1px solid var(--stroke-subtle)',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!hasRows && (
            <tr>
              <td
                colSpan={headers.length}
                style={{
                  padding: '12px 10px',
                  textAlign: 'center',
                  color: 'var(--text-tertiary)',
                }}
              >
                {emptyMessage ?? 'No data'}
              </td>
            </tr>
          )}
          {rows.map((row, rIdx) => {
            const tone = rowTone?.[rIdx];
            const isStriped = striped && rIdx % 2 === 1;
            const bg = tone
              ? rowToneBg[tone]
              : isStriped
                ? 'var(--fill-tertiary)'
                : 'transparent';
            return (
              <tr key={rIdx} style={{ background: bg }}>
                {Array.from({ length: headers.length }).map((_, cIdx) => (
                  <td
                    key={cIdx}
                    style={{
                      textAlign: alignFor(cIdx),
                      padding: '6px 10px',
                      borderBottom: rIdx < rows.length - 1 ? '1px solid var(--stroke-subtle)' : undefined,
                      verticalAlign: 'top',
                    }}
                  >
                    {row[cIdx]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type StatTone = 'success' | 'danger' | 'warning' | 'info';
const statToneColor: Record<StatTone, string> = {
  success: '#3fa266',
  danger:  '#c04848',
  warning: '#e8a043',
  info:    '#599ce7',
};

export function Stat({
  value,
  label,
  tone,
  style,
}: {
  value: ReactNode;
  label: string;
  tone?: StatTone;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: 12,
        border: '1px solid var(--stroke-subtle)',
        borderRadius: 6,
        background: 'var(--bg-elevated)',
        ...style,
      }}
    >
      <span
        style={{
          fontSize: 24,
          lineHeight: '28px',
          fontWeight: 590,
          color: tone ? statToneColor[tone] : 'var(--text)',
        }}
      >
        {value}
      </span>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
    </div>
  );
}
