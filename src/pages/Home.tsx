import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Code,
  Grid,
  H1,
  H2,
  Pill,
  Row,
  Stack,
  Text,
} from '@/canvas-ui';
import { ADR_INDEX } from '@/adrs/manifest';

export default function Home() {
  return (
    <Stack gap={28} style={{ padding: 24 }}>
      <Stack gap={6}>
        <H1>Policy Design</H1>
        <Text tone="secondary">
          Centralized policy management — definition-driven, four-level override hierarchy
          (L0 → L1 → L2 → L3), event-driven cache invalidation, and a distributed audit pipeline.
        </Text>
      </Stack>

      <Callout tone="info" title="Two interactive views">
        Each page below is a self-contained interactive canvas. State (selected level, simulator
        inputs, etc.) is persisted to <Code>localStorage</Code> so your exploration survives page
        reloads.
      </Callout>

      <Grid columns={2} gap={16}>
        <Card>
          <CardHeader trailing={<Pill size="sm" tone="info">interactive</Pill>}>
            Integration design
          </CardHeader>
          <CardBody>
            <Stack gap={12}>
              <Text size="small">
                Service topology, hierarchy reference, MFA stage matrix, lifecycle of a tenant
                override, and a live policy resolution simulator (pick L0/L1/L2, user type, opt-out
                → see resolved value and emitted audit event).
              </Text>
              <Row gap={6} wrap>
                <Pill tone="neutral" size="sm">topology</Pill>
                <Pill tone="neutral" size="sm">simulator</Pill>
                <Pill tone="neutral" size="sm">stage matrix</Pill>
                <Pill tone="neutral" size="sm">lifecycle</Pill>
              </Row>
              <Row gap={8}>
                <a href="#/integration" style={linkStyle}>Open →</a>
              </Row>
            </Stack>
          </CardBody>
        </Card>

        <Card>
          <CardHeader trailing={<Pill size="sm" tone="info">interactive</Pill>}>
            PolicyService — data model & API
          </CardHeader>
          <CardBody>
            <Stack gap={12}>
              <Text size="small">
                Service overview, ER diagram, per-table columns, atomic upsert sequence, full API
                surface, indexes, and an instance scope browser that walks through each level's
                rejections, override flow, exception path, and lifecycle.
              </Text>
              <Row gap={6} wrap>
                <Pill tone="neutral" size="sm">ER diagram</Pill>
                <Pill tone="neutral" size="sm">scope browser</Pill>
                <Pill tone="neutral" size="sm">upsert SQL</Pill>
                <Pill tone="neutral" size="sm">API</Pill>
              </Row>
              <Row gap={8}>
                <a href="#/data-model" style={linkStyle}>Open →</a>
              </Row>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <Stack gap={10}>
        <H2>Architecture Decision Records</H2>
        <Text size="small" tone="secondary">
          Every design choice is captured in a numbered ADR. Foundational decisions
          (001–007) cover SDK, override flows, storage, audit, API, MFE, and data model.
          PRD-driven extensions (008–010) introduce the six-level scope hierarchy,
          policy composition + side effects, and the lifecycle / exemption workflow.
        </Text>
        <Row gap={8} wrap>
          {ADR_INDEX.map((adr) => (
            <a key={adr.id} href={`#/adrs/${adr.id}`} className="adr-inline-link">
              <Pill size="sm" tone={adr.category === 'PRD extensions' ? 'warning' : 'info'}>
                ADR-{adr.id}
              </Pill>
            </a>
          ))}
        </Row>
        <Row gap={10} align="center">
          <a href="#/adrs" className="adr-open-link">Open ADRs tab →</a>
        </Row>
      </Stack>
    </Stack>
  );
}

const linkStyle: React.CSSProperties = {
  color: 'var(--accent)',
  fontWeight: 590,
  fontSize: 13,
  textDecoration: 'none',
};
