import { useMemo } from 'react';
import { marked } from 'marked';
import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Code,
  H1,
  H2,
  Pill,
  Row,
  Stack,
  Text,
} from '@/canvas-ui';
import { ADR_INDEX, getAdrById, type AdrEntry } from '@/adrs/manifest';

marked.use({
  gfm:       true,
  breaks:    false,
  pedantic:  false,
});

export default function ADRsPage({ adrId }: { adrId?: string }) {
  if (adrId) {
    const adr = getAdrById(adrId);
    if (!adr) {
      return (
        <Stack gap={20} style={{ padding: 24 }}>
          <H1>ADR not found</H1>
          <Text tone="secondary">
            No ADR with id <Code>{adrId}</Code>. <a href="#/adrs">Back to the index</a>.
          </Text>
        </Stack>
      );
    }
    return <AdrDetail adr={adr} />;
  }
  return <AdrIndex />;
}

function AdrIndex() {
  const groups = useMemo(() => {
    const foundational = ADR_INDEX.filter((a) => a.category === 'Foundational');
    const extensions   = ADR_INDEX.filter((a) => a.category === 'PRD extensions');
    return { foundational, extensions };
  }, []);

  return (
    <Stack gap={28} style={{ padding: 24 }}>
      <Stack gap={6}>
        <H1>Architecture Decision Records</H1>
        <Text tone="secondary">
          Ten ADRs that define the policy framework. The foundational set (001–007) establishes
          the SDK, override flows, storage, audit, API, MFE, and data model. The PRD-driven
          extensions (008–010) cover the six-level scope hierarchy, policy composition + side
          effects, and the lifecycle / exemption workflow.
        </Text>
      </Stack>

      <Callout tone="info" title="Reading order">
        Start with <a href="#/adrs/001">ADR-001</a> (SDK design) to understand the runtime model,
        then <a href="#/adrs/008">ADR-008</a> (scope hierarchy) for how levels and targeting work.
        ADR-007 + ADR-008/009/010 together describe the full data model.
      </Callout>

      <Section title="Foundational design" adrs={groups.foundational} />
      <Section title="PRD-driven extensions" adrs={groups.extensions} />
    </Stack>
  );
}

function Section({ title, adrs }: { title: string; adrs: AdrEntry[] }) {
  return (
    <Stack gap={12}>
      <H2>{title}</H2>
      <Stack gap={10}>
        {adrs.map((adr) => (
          <Card key={adr.id}>
            <CardHeader trailing={<Pill size="sm" tone={adr.category === 'PRD extensions' ? 'warning' : 'info'}>ADR-{adr.id}</Pill>}>
              {stripAdrPrefix(adr.title)}
            </CardHeader>
            <CardBody>
              <Stack gap={8}>
                {adr.summary && <Text size="small">{adr.summary}</Text>}
                <Row gap={10} align="center">
                  <a href={`#/adrs/${adr.id}`} className="adr-open-link">Open ADR →</a>
                </Row>
              </Stack>
            </CardBody>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
}

function AdrDetail({ adr }: { adr: AdrEntry }) {
  const html = useMemo(() => marked.parse(adr.content) as string, [adr.content]);

  return (
    <Stack gap={20} style={{ padding: 24 }}>
      <Row gap={10} align="center" wrap>
        <a href="#/adrs" className="adr-back-link">← All ADRs</a>
        <Pill size="sm" tone={adr.category === 'PRD extensions' ? 'warning' : 'info'}>
          {adr.category}
        </Pill>
      </Row>

      <article
        className="adr-markdown"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html }}
      />

      <AdrPager id={adr.id} />
    </Stack>
  );
}

function AdrPager({ id }: { id: string }) {
  const idx = ADR_INDEX.findIndex((a) => a.id === id);
  const prev = idx > 0 ? ADR_INDEX[idx - 1] : undefined;
  const next = idx >= 0 && idx < ADR_INDEX.length - 1 ? ADR_INDEX[idx + 1] : undefined;
  return (
    <Row gap={12} justify="space-between" wrap>
      {prev ? (
        <a href={`#/adrs/${prev.id}`} className="adr-pager-link">
          ← ADR-{prev.id}: {stripAdrPrefix(prev.title)}
        </a>
      ) : <span />}
      {next ? (
        <a href={`#/adrs/${next.id}`} className="adr-pager-link" style={{ textAlign: 'right' }}>
          ADR-{next.id}: {stripAdrPrefix(next.title)} →
        </a>
      ) : <span />}
    </Row>
  );
}

function stripAdrPrefix(title: string): string {
  // Turn "ADR-008: Scope Hierarchy & Targeting" into just the descriptive part.
  return title.replace(/^ADR-\d{3}\s*[:—-]\s*/i, '').trim();
}
