/**
 * Renders "ADR-NNN" as a clickable link to the ADRs page detail route.
 * Use this anywhere the canvas pages reference an ADR by number so the
 * reader can jump straight to the underlying decision document.
 */
export function AdrLink({
  id,
  children,
  className,
}: {
  /** Three-digit ADR id, e.g. "008" or "010". */
  id: string;
  /** Optional label; defaults to "ADR-{id}". */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <a href={`#/adrs/${id}`} className={className ?? 'adr-inline-link'}>
      {children ?? `ADR-${id}`}
    </a>
  );
}
