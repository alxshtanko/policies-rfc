import type { CSSProperties, ReactNode } from 'react';

type Tone = 'primary' | 'secondary' | 'tertiary' | 'quaternary';
type Weight = 'normal' | 'medium' | 'semibold' | 'bold';
type Size = 'body' | 'small';

const toneColor: Record<Tone, string> = {
  primary: 'var(--text)',
  secondary: 'var(--text-secondary)',
  tertiary: 'var(--text-tertiary)',
  quaternary: 'var(--text-quaternary)',
};

const weightValue: Record<Weight, number> = {
  normal: 400,
  medium: 500,
  semibold: 590,
  bold: 700,
};

function parseInlineMarkdown(input: ReactNode): ReactNode {
  // Lightweight inline parser for backticks and [text](url) so that
  // `<Text>Run `npm install`</Text>` keeps working from the ported canvas.
  if (typeof input !== 'string') return input;
  const out: ReactNode[] = [];
  const re = /(`[^`]+`)|(\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(input)) !== null) {
    if (match.index > lastIndex) out.push(input.slice(lastIndex, match.index));
    if (match[1]) {
      out.push(<Code key={`md-${i++}`}>{match[1].slice(1, -1)}</Code>);
    } else if (match[2]) {
      const m = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(match[2])!;
      out.push(
        <Link key={`md-${i++}`} href={m[2]}>
          {m[1]}
        </Link>,
      );
    }
    lastIndex = re.lastIndex;
  }
  if (lastIndex < input.length) out.push(input.slice(lastIndex));
  return out.length === 1 ? out[0] : out;
}

export function Text({
  children,
  tone = 'primary',
  size = 'body',
  as,
  weight = 'normal',
  italic,
  truncate,
  style,
}: {
  children?: ReactNode;
  tone?: Tone;
  size?: Size;
  as?: 'p' | 'span';
  weight?: Weight;
  italic?: boolean;
  truncate?: boolean | 'start' | 'end';
  style?: CSSProperties;
}) {
  const Tag = (as ?? 'p') as keyof JSX.IntrinsicElements;
  const truncStyle: CSSProperties = truncate
    ? { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
    : {};
  return (
    <Tag
      style={{
        color: toneColor[tone],
        fontSize: size === 'small' ? 12 : 14,
        lineHeight: size === 'small' ? '16px' : '20px',
        fontWeight: weightValue[weight],
        fontStyle: italic ? 'italic' : 'normal',
        margin: 0,
        ...truncStyle,
        ...style,
      }}
    >
      {parseInlineMarkdown(children)}
    </Tag>
  );
}

export function H1({ children, style }: { children?: ReactNode; style?: CSSProperties }) {
  return (
    <h1
      style={{
        margin: 0,
        fontSize: 24,
        lineHeight: '30px',
        fontWeight: 590,
        color: 'var(--text)',
        ...style,
      }}
    >
      {children}
    </h1>
  );
}

export function H2({ children, style }: { children?: ReactNode; style?: CSSProperties }) {
  return (
    <h2
      style={{
        margin: 0,
        fontSize: 18,
        lineHeight: '24px',
        fontWeight: 590,
        color: 'var(--text)',
        ...style,
      }}
    >
      {children}
    </h2>
  );
}

export function H3({ children, style }: { children?: ReactNode; style?: CSSProperties }) {
  return (
    <h3
      style={{
        margin: 0,
        fontSize: 16,
        lineHeight: '22px',
        fontWeight: 590,
        color: 'var(--text)',
        ...style,
      }}
    >
      {children}
    </h3>
  );
}

export function Code({ children, style }: { children?: ReactNode; style?: CSSProperties }) {
  return (
    <code
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.92em',
        padding: '1px 5px',
        borderRadius: 3,
        background: 'var(--fill-tertiary)',
        ...style,
      }}
    >
      {children}
    </code>
  );
}

export function Link({
  children,
  href,
  style,
}: {
  children?: ReactNode;
  href: string;
  style?: CSSProperties;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: 'var(--accent)', textDecoration: 'none', ...style }}
    >
      {children}
    </a>
  );
}
