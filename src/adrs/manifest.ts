/**
 * Bundle every ADR markdown file in this folder at build time. Vite resolves
 * the glob eagerly and emits one string per file. The manifest pairs that
 * content with display metadata (title, summary, category) so the ADRsPage
 * can render an index and per-ADR detail without listing files manually.
 */

const RAW_FILES = import.meta.glob('./ADR-*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export interface AdrEntry {
  /** Three-digit ADR number, e.g. "008". */
  id: string;
  /** Filename stem, e.g. "ADR-008-scope-hierarchy-and-targeting". */
  slug: string;
  /** "ADR-008: Scope Hierarchy & Targeting" — derived from H1 in the file. */
  title: string;
  /** First paragraph after the metadata block. */
  summary: string;
  /** "Foundational" or "PRD-driven extensions" — derived from `category` front matter or numbering. */
  category: 'Foundational' | 'PRD extensions';
  /** Raw markdown body. */
  content: string;
}

const PRD_EXTENSION_IDS = new Set(['008', '009', '010']);

function parseTitle(slug: string, content: string): string {
  // First H1 ATX heading: "# ADR-001: ..." or "# Some Title".
  const m = content.match(/^#\s+(.+)$/m);
  const raw = m ? m[1].trim() : slug;
  // Some files use "ADR-001: SDK / Library Design" — keep as-is.
  return raw;
}

function parseSummary(content: string): string {
  // Find the first paragraph after the H1 + metadata block. We skip lines that
  // look like front matter (**Key**: value), separators (---), or empty lines.
  const lines = content.split(/\r?\n/);
  let skipFrontMatter = true;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '' || line.startsWith('#') || line.startsWith('---') || line.startsWith('**')) {
      // Continue scanning past header / metadata.
      if (line === '---' || line === '') skipFrontMatter = true;
      continue;
    }
    // Found body content; take the first sentence/paragraph (up to ~200 chars).
    void skipFrontMatter;
    return line.replace(/\*\*/g, '').slice(0, 220);
  }
  return '';
}

function fileIdFromSlug(slug: string): string {
  const m = slug.match(/^ADR-(\d{3})/);
  return m ? m[1] : slug;
}

export const ADR_INDEX: AdrEntry[] = Object.entries(RAW_FILES)
  .map(([path, content]) => {
    const filename = path.replace(/^\.\/|\.md$/g, '');
    const id = fileIdFromSlug(filename);
    return {
      id,
      slug: filename,
      title:    parseTitle(filename, content),
      summary:  parseSummary(content),
      category: PRD_EXTENSION_IDS.has(id) ? 'PRD extensions' : 'Foundational',
      content,
    } as AdrEntry;
  })
  .sort((a, b) => a.id.localeCompare(b.id));

export function getAdrById(id: string): AdrEntry | undefined {
  return ADR_INDEX.find((a) => a.id === id);
}
