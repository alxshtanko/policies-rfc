import type { ReactNode } from 'react';
import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Code,
  Divider,
  Grid,
  H1,
  H3,
  Pill,
  Row,
  Stack,
  Stat,
  Table,
  Text,
  useCanvasState,
  useHostTheme,
  type HostTheme,
} from '@/canvas-ui';
import { SectionHeading } from '@/components/SectionHeading';

// ─── Page root ────────────────────────────────────────────────────────────────

export default function PolicyServiceDataModel() {
  return (
    <Stack gap={28} style={{ padding: 24 }}>
      <Header />
      <SummaryStats />

      <Stack gap={12}>
        <SectionHeading term="data-model:overview" title="Service overview" subtitle="Data model">
          Service overview
        </SectionHeading>
        <ServiceOverview />
      </Stack>

      <Stack gap={12}>
        <SectionHeading term="data-model:er-diagram" title="Entity relationships" subtitle="Data model">
          Entity relationships
        </SectionHeading>
        <Text tone="secondary">
          Three tables in the <Code>policy</Code> schema: definitions (versioned, append-only),
          instances (one per scope, soft-archived on supersede), and a lock row that enforces
          "one active instance per slot" with optimistic concurrency.
        </Text>
        <ERDiagram />
      </Stack>

      <Stack gap={12}>
        <SectionHeading term="data-model:tables" title="Tables" subtitle="Data model">
          Tables
        </SectionHeading>
        <Stack gap={16}>
          <PolicyDefinitionsCard />
          <PolicyInstancesCard />
          <PolicyInstanceLockCard />
        </Stack>
      </Stack>

      <Stack gap={12}>
        <SectionHeading
          term="data-model:scope-browser"
          title="Instance scope browser"
          subtitle="Data model"
        >
          Instance scope browser
        </SectionHeading>
        <Text tone="secondary">
          Pick a level to see which scope columns are populated and which CHECK constraint enforces it.
          The sample row reflects a realistic record at that level.
        </Text>
        <InstanceBrowser />
      </Stack>

      <Stack gap={12}>
        <SectionHeading
          term="data-model:upsert"
          title="Atomic upsert sequence"
          subtitle="Data model"
        >
          Atomic upsert sequence
        </SectionHeading>
        <Text tone="secondary">
          The <Code>policy.upsert_policy_instance(...)</Code> stored procedure is the only write path
          for instances. It guarantees single-active-instance per slot with ETag concurrency.
        </Text>
        <UpsertSequence />
      </Stack>

      <Stack gap={12}>
        <SectionHeading term="data-model:api" title="API surface" subtitle="Data model">
          API surface
        </SectionHeading>
        <ApiSurface />
      </Stack>

      <Stack gap={12}>
        <SectionHeading term="data-model:indexes" title="Index strategy" subtitle="Data model">
          Index strategy
        </SectionHeading>
        <IndexTable />
      </Stack>

      <Callout tone="info" title="Source of truth">
        Full DDL, stored procedure body, and migration order in
        <Text as="span"> </Text><Code>ADR-007 Data Models & Schema</Code>. REST contract in
        <Text as="span"> </Text><Code>ADR-005 PolicyService API</Code>.
      </Callout>
    </Stack>
  );
}

// ─── Header & stats ──────────────────────────────────────────────────────────

function Header() {
  return (
    <Stack gap={6}>
      <H1>PolicyService — Data Model & API</H1>
      <Text tone="secondary">
        Authoritative store for policy definitions and L0–L3 instances. PostgreSQL-backed,
        ServiceBus + Kafka eventing, deployed as the <Code>policy-service</Code> microservice.
      </Text>
    </Stack>
  );
}

function SummaryStats() {
  return (
    <Grid columns={4} gap={16}>
      <Stat value="3"  label="Tables" />
      <Stat value="7"  label="Index strategies" />
      <Stat value="25+" label="REST endpoints" />
      <Stat value="6"  label="Auth scopes" />
    </Grid>
  );
}

// ─── Service overview ────────────────────────────────────────────────────────

function ServiceOverview() {
  return (
    <Grid columns="minmax(0, 1.4fr) minmax(0, 1fr)" gap={20}>
      <Stack gap={10}>
        <H3>Responsibilities</H3>
        <Text size="small">
          CRUD for <Code>PolicyDefinitions</Code> (versioned, append-only).
        </Text>
        <Text size="small">
          CRUD for <Code>PolicyInstances</Code> at L0, L1, L2, and L3, with constraint validation
          (L1 cannot exceed L0, L2 cannot relax L1, etc.).
        </Text>
        <Text size="small">
          Single resolution endpoint <Code>POST /evaluate</Code> for cache misses or real-time
          checks; bulk-fetch endpoint <Code>POST /sdk/instances/bulk</Code> for SDK cache warm-up.
        </Text>
        <Text size="small">
          Change event publication to <Code>ServiceBus / policy-changes</Code> on every write —
          routed per <Code>(tenantId, policyKey)</Code> for SDK cache invalidation.
        </Text>
        <Text size="small">
          Audit / evaluation events stream to <Code>Kafka / policy-audit-events</Code> — emitted by
          every SDK consumer, partitioned by tenantId, consumed by the Audit Sink.
        </Text>
        <Text size="small">
          Background expiry job for time-bounded instances and exceptions.
        </Text>
      </Stack>
      <Stack gap={10}>
        <H3>Tech stack</H3>
        <Row gap={6} wrap>
          <Pill tone="info">.NET 10</Pill>
          <Pill tone="info">ASP.NET Core 10</Pill>
          <Pill tone="info">PostgreSQL 15</Pill>
          <Pill tone="info">Flyway migrations</Pill>
          <Pill tone="info">Azure ServiceBus</Pill>
          <Pill tone="info">Apache Kafka</Pill>
          <Pill tone="info">Dapper</Pill>
          <Pill tone="neutral">OpenTelemetry</Pill>
          <Pill tone="neutral">Prometheus</Pill>
        </Row>
        <Text size="small" tone="tertiary">
          ServiceBus carries low-volume change events (SDK cache invalidation via SQL filter subscriptions).
          Kafka carries high-volume audit/eval events (replayable, partitioned by tenantId).
        </Text>
        <Divider />
        <H3>Dependencies</H3>
        <Stack gap={4}>
          <Text size="small">
            <Code>token-service</Code> — JWT issuance and scope validation
          </Text>
          <Text size="small">
            <Code>policy-audit-sink</Code> — downstream consumer (no synchronous coupling)
          </Text>
          <Text size="small">
            All <Code>PolicyFramework</Code> consumer apps
          </Text>
        </Stack>
      </Stack>
    </Grid>
  );
}

// ─── ER Diagram ──────────────────────────────────────────────────────────────

type ErRow = { name: string; type: string; flag?: string };
type ErTable = {
  id: 'pd' | 'pi' | 'pl';
  x: number;
  y: number;
  w: number;
  title: string;
  rows: ErRow[];
};

function ERDiagram() {
  const theme = useHostTheme();

  const W = 880;
  const H = 420;

  const tables: ErTable[] = [
    {
      id: 'pd', x: 30, y: 30, w: 280,
      title: 'policy_definitions',
      rows: [
        { name: 'id', type: 'UUID', flag: 'PK' },
        { name: 'key', type: 'TEXT' },
        { name: 'version', type: 'INT' },
        { name: 'value_type', type: 'TEXT' },
        { name: 'allowed_values', type: 'JSONB' },
        { name: 'default_value', type: 'TEXT' },
        { name: 'scope', type: 'TEXT' },
        { name: 'l1/l2/l3_allowed', type: 'BOOL' },
        { name: 'opt_out_eligible_values', type: 'JSONB' },
        { name: 'is_ordered_enum', type: 'BOOL' },
        { name: 'is_active', type: 'BOOL' },
        { name: 'superseded_by', type: 'UUID', flag: 'FK self' },
      ],
    },
    {
      id: 'pi', x: 340, y: 30, w: 280,
      title: 'policy_instances',
      rows: [
        { name: 'id', type: 'UUID', flag: 'PK' },
        { name: 'policy_definition_id', type: 'UUID', flag: 'FK' },
        { name: 'definition_version', type: 'INT' },
        { name: 'level', type: 'TEXT' },
        { name: 'tenant_id', type: 'INT?' },
        { name: 'app_id', type: 'TEXT?' },
        { name: 'user_id', type: 'INT?' },
        { name: 'value', type: 'TEXT' },
        { name: 'effective_at', type: 'TIMESTAMPTZ' },
        { name: 'expires_at', type: 'TIMESTAMPTZ?' },
        { name: 'override_reason / approved_by', type: 'TEXT?' },
        { name: 'ticket_ref', type: 'TEXT?' },
        { name: 'status', type: 'TEXT' },
        { name: 'superseded_by', type: 'UUID', flag: 'FK self' },
      ],
    },
    {
      id: 'pl', x: 650, y: 30, w: 220,
      title: 'policy_instance_lock',
      rows: [
        { name: '(definition+level+scope)', type: '', flag: 'PK' },
        { name: 'current_instance_id', type: 'UUID' },
        { name: 'version', type: 'BIGINT' },
        { name: 'updated_at', type: 'TIMESTAMPTZ' },
      ],
    },
  ];
  const headerH = 28;
  const rowH = 18;
  const tableHeight = (t: ErTable) => headerH + 12 + t.rows.length * rowH;

  const byId = Object.fromEntries(tables.map((t) => [t.id, t])) as Record<
    'pd' | 'pi' | 'pl',
    ErTable
  >;
  const stroke = theme.stroke.primary;
  const accent = theme.accent.primary;
  const text = theme.text.primary;
  const sub = theme.text.secondary;
  const tertiary = theme.text.tertiary;
  const headerFill = theme.fill.tertiary;
  const surface = theme.bg.elevated;

  const pd = byId.pd;
  const pi = byId.pi;
  const pl = byId.pl;

  const piDefRowY = pi.y + headerH + 12 + 1 * rowH + rowH / 2;
  const pdIdRowY  = pd.y + headerH + 12 + 0 * rowH + rowH / 2;
  const plCurrentY = pl.y + headerH + 12 + 1 * rowH + rowH / 2;
  const piIdRowY   = pi.y + headerH + 12 + 0 * rowH + rowH / 2;

  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${theme.stroke.secondary}`, borderRadius: 8, background: theme.bg.editor }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="ER diagram">
        <defs>
          <marker id="er-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={tertiary} />
          </marker>
        </defs>

        <path
          d={`M ${pi.x} ${piDefRowY} C ${pi.x - 20} ${piDefRowY}, ${pd.x + pd.w + 20} ${pdIdRowY}, ${pd.x + pd.w} ${pdIdRowY}`}
          fill="none"
          stroke={tertiary}
          strokeWidth={1.2}
          markerEnd="url(#er-arrow)"
        />
        <text x={(pd.x + pd.w + pi.x) / 2} y={Math.min(piDefRowY, pdIdRowY) - 6} fontSize={10} textAnchor="middle" fill={sub}>
          FK
        </text>

        <path
          d={`M ${pl.x} ${plCurrentY} C ${pl.x - 20} ${plCurrentY}, ${pi.x + pi.w + 20} ${piIdRowY}, ${pi.x + pi.w} ${piIdRowY}`}
          fill="none"
          stroke={tertiary}
          strokeWidth={1.2}
          markerEnd="url(#er-arrow)"
        />
        <text x={(pi.x + pi.w + pl.x) / 2} y={Math.min(plCurrentY, piIdRowY) - 6} fontSize={10} textAnchor="middle" fill={sub}>
          tracks
        </text>

        {tables.map((t) => {
          const h = tableHeight(t);
          return (
            <g key={t.id}>
              <rect x={t.x} y={t.y} width={t.w} height={h} rx={6} ry={6} fill={surface} stroke={stroke} />
              <rect x={t.x} y={t.y} width={t.w} height={headerH} rx={6} ry={6} fill={headerFill} />
              <rect x={t.x} y={t.y + headerH - 6} width={t.w} height={6} fill={headerFill} />
              <line x1={t.x} y1={t.y + headerH} x2={t.x + t.w} y2={t.y + headerH} stroke={stroke} />
              <text x={t.x + 10} y={t.y + 18} fontSize={12} fontWeight={590} fill={text} fontFamily="monospace">
                {t.title}
              </text>

              {t.rows.map((r, i) => {
                const y = t.y + headerH + 12 + i * rowH;
                const flagColor =
                  r.flag === 'PK' ? accent : r.flag?.startsWith('FK') ? sub : tertiary;
                return (
                  <g key={r.name}>
                    <text x={t.x + 10} y={y + 12} fontSize={11} fill={text} fontFamily="monospace">
                      {r.name}
                    </text>
                    <text
                      x={t.x + t.w - 10}
                      y={y + 12}
                      fontSize={10}
                      fill={sub}
                      fontFamily="monospace"
                      textAnchor="end"
                    >
                      {r.type}
                    </text>
                    {r.flag && (
                      <text
                        x={t.x + t.w - 60}
                        y={y + 12}
                        fontSize={9}
                        fill={flagColor}
                        fontFamily="monospace"
                        textAnchor="end"
                      >
                        {r.flag}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Detailed table cards ────────────────────────────────────────────────────

function PolicyDefinitionsCard() {
  return (
    <Card>
      <CardHeader trailing={<Pill size="sm" tone="info">append-only versioning</Pill>}>
        policy_definitions
      </CardHeader>
      <CardBody style={{ padding: 0 }}>
        <Table
          framed={false}
          headers={['Column', 'Type', 'Notes']}
          columnAlign={['left', 'left', 'left']}
          rows={[
            ['id',                       'UUID PK',                       'gen_random_uuid()'],
            ['key',                      'TEXT',                          'stable string e.g. policy.mfa.enforcement_stage'],
            ['version',                  'INT',                           'starts at 1; bumped on breaking change'],
            ['value_type',               'TEXT CHECK',                    'Enum | Bool | Int | String | Json'],
            ['allowed_values',           'JSONB',                         'null = unconstrained'],
            ['default_value',            'TEXT',                          'served when no instance exists'],
            ['scope',                    'TEXT CHECK',                    'Global | PerTenant | PerApp | PerUser'],
            ['l1_allowed / l2_allowed / l3_allowed', 'BOOLEAN',           'which levels may write instances'],
            ['l1_relaxation_allowed',    'BOOLEAN',                       'rare; tenants relaxing the L0 default'],
            ['opt_in_allowed / opt_out_allowed', 'BOOLEAN',               'user-driven L3 flows'],
            ['opt_out_eligible_values',  'JSONB',                         'enum values at which opt-out is permitted'],
            ['is_ordered_enum',          'BOOLEAN',                       'enables "max wins" resolution semantics'],
            ['is_active',                'BOOLEAN',                       'false after supersession; never deleted'],
            ['superseded_by',            'UUID FK -> policy_definitions', 'links breaking-change history'],
            ['created_by / created_at / updated_at', 'TEXT / TIMESTAMPTZ', 'audit columns'],
          ]}
        />
      </CardBody>
    </Card>
  );
}

function PolicyInstancesCard() {
  return (
    <Card>
      <CardHeader trailing={<Pill size="sm" tone="warning">soft-archive only</Pill>}>
        policy_instances
      </CardHeader>
      <CardBody style={{ padding: 0 }}>
        <Table
          framed={false}
          headers={['Column', 'Type', 'Notes']}
          columnAlign={['left', 'left', 'left']}
          rows={[
            ['id',                                'UUID PK',                                          ''],
            ['policy_definition_id',              'UUID FK -> policy_definitions',                    ''],
            ['definition_version',                'INT',                                              'snapshot at write time'],
            ['level',                             "TEXT CHECK ('L0','L1','L2','L3')",                ''],
            ['tenant_id',                         'INT (nullable)',                                   'set for L1, L2'],
            ['app_id',                            'TEXT (nullable)',                                  'set for L2'],
            ['user_id',                           'INT (nullable)',                                   'set for L3'],
            ['value',                             'TEXT',                                             'string-encoded; SDK deserializes per value_type'],
            ['effective_at / expires_at',         'TIMESTAMPTZ',                                      'expires_at NULL for permanent rows'],
            ['override_reason / approved_by',     'TEXT (nullable)',                                  'required for exceptions'],
            ['ticket_ref',                        'TEXT (nullable)',                                  'mandatory when approved_by is set'],
            ['status',                            "TEXT CHECK ('Active','Revoked','Expired')",       'never DELETE'],
            ['superseded_by',                     'UUID FK -> policy_instances (self)',               'links replacement chain'],
            ['revoked_at / revoked_by',           'TIMESTAMPTZ / TEXT',                               'populated on supersede'],
            ['created_by / created_at / updated_at', 'TEXT / TIMESTAMPTZ',                            'audit columns'],
          ]}
        />
        <div style={{ padding: 12 }}>
          <Text size="small" tone="secondary" weight="semibold">CHECK constraints</Text>
          <Text size="small">
            <Code>chk_l0_scope</Code> — L0 row has tenant/app/user all NULL.
          </Text>
          <Text size="small">
            <Code>chk_l1_scope</Code> — L1 row has tenant_id set, app/user NULL.
          </Text>
          <Text size="small">
            <Code>chk_l2_scope</Code> — L2 row has tenant_id and app_id set, user NULL.
          </Text>
          <Text size="small">
            <Code>chk_l3_scope</Code> — L3 row has user_id set.
          </Text>
          <Text size="small">
            <Code>chk_exception_ticket</Code> — if <Code>approved_by</Code> is set, <Code>ticket_ref</Code> must be set.
          </Text>
        </div>
      </CardBody>
    </Card>
  );
}

function PolicyInstanceLockCard() {
  return (
    <Card>
      <CardHeader trailing={<Pill size="sm" tone="neutral">optimistic concurrency</Pill>}>
        policy_instance_lock
      </CardHeader>
      <CardBody>
        <Text size="small">
          One row per active slot. The composite PK uses <Code>COALESCE</Code> defaults
          (<Code>-1</Code> for nulls) so each (definition, level, tenant?, app?, user?) tuple
          collapses to a deterministic key. The <Code>version</Code> column is the ETag that
          callers pass back on subsequent writes for optimistic concurrency.
        </Text>
        <div style={{ marginTop: 12 }}>
          <Table
            framed={false}
            headers={['Column', 'Type', 'Notes']}
            columnAlign={['left', 'left', 'left']}
            rows={[
              ['policy_definition_id', 'UUID',         ''],
              ['level',                'TEXT',         ''],
              ['tenant_id',            'INT?',         'COALESCE(-1) in PK'],
              ['app_id',               'TEXT?',        "COALESCE('') in PK"],
              ['user_id',              'INT?',         'COALESCE(-1) in PK'],
              ['current_instance_id',  'UUID',         'points at the latest Active instance'],
              ['version',              'BIGINT',       'monotonic counter; the ETag'],
              ['updated_at',           'TIMESTAMPTZ',  ''],
            ]}
          />
        </div>
      </CardBody>
    </Card>
  );
}

// ─── Instance browser ────────────────────────────────────────────────────────

type Level = 'L0' | 'L1' | 'L2' | 'L3';

type RejectionTone = 'warning' | 'danger' | 'info';

type LevelEntry = {
  description: string;
  tenant: string | null;
  appId: string | null;
  userId: number | null;
  check: string;
  scope: string;
  scopeWriter: string;
  scopeReader: string;
  exampleValue: string;
  rejections: { scenario: string; code: string; tone: RejectionTone }[];
  overriddenBy: { label: string; tone: 'info' | 'warning' | 'danger'; detail: string }[];
  overrides: { label: string; detail: string }[];
  exception: { available: boolean; summary: string; sample?: string };
  concurrency: string[];
  lifecycle: string;
};

const LEVEL_INFO: Record<Level, LevelEntry> = {
  L0: {
    description: 'Platform default. Exactly one Active per definition.',
    tenant: null, appId: null, userId: null,
    check: 'chk_l0_scope — all scope columns NULL',
    scope: 'Global',
    scopeWriter: 'policy:admin (Platform Ops)',
    scopeReader: 'policy:read',
    exampleValue: 'Disabled',
    rejections: [
      { scenario: 'Definition is deprecated',              code: '410',  tone: 'warning' },
      { scenario: 'Value not in allowed_values',           code: '400',  tone: 'info' },
      { scenario: 'Caller lacks policy:admin scope',       code: '403',  tone: 'danger' },
      { scenario: 'Stale ETag (concurrent platform edit)', code: '409',  tone: 'warning' },
    ],
    overriddenBy: [
      { label: 'L1 — Tenant',  tone: 'info',    detail: 'Tenant Admin tightens via PUT /tenants/{id}/policies/{key}.' },
      { label: 'L2 — App',     tone: 'info',    detail: 'App tightens via PUT /apps/{appId}/... or in-process IPolicyOverrideProvider.' },
      { label: 'L3 — User',    tone: 'info',    detail: 'User toggles via POST /me/policies/{key}/opt-out (when eligible).' },
      { label: 'Operator',     tone: 'warning', detail: 'Platform Ops can supersede via /admin/exceptions targeting L0 — extremely rare; usually a Flyway-managed update.' },
    ],
    overrides: [
      { label: '(ceiling)', detail: 'L0 is the platform default. Nothing below it.' },
    ],
    exception: {
      available: false,
      summary:
        'L0 itself does not have an emergency-exception path — deviations live at L1/L2/L3 so that the platform default remains intact and auditable. Real L0 changes flow through Flyway migrations.',
    },
    concurrency: [
      'Standard ETag via policy_instance_lock.version.',
      'Writes are extremely rare and deployment-driven; conflicts are essentially impossible.',
      'L0 instances are seeded by V*__policy_*.sql migrations; new definitions bootstrap their L0 row in the same migration.',
    ],
    lifecycle: 'Active → Revoked only when the definition is superseded (definition_version bumps). L0 rows are never Expired.',
  },
  L1: {
    description: 'Tenant override. One Active per (tenant, definition).',
    tenant: '12345', appId: null, userId: null,
    check: 'chk_l1_scope — tenant_id set, app_id / user_id NULL',
    scope: 'PerTenant',
    scopeWriter: 'policy:write:l1 (Tenant Admin)',
    scopeReader: 'policy:read (same tenant only)',
    exampleValue: 'EmployeesOptOut',
    rejections: [
      { scenario: 'Value would relax L0 and l1_relaxation_allowed = false', code: '422', tone: 'warning' },
      { scenario: 'Definition has l1_allowed = false',                       code: '403', tone: 'danger'  },
      { scenario: 'Tenant ID in path mismatches token claim',                code: '403', tone: 'danger'  },
      { scenario: 'Value not in allowed_values',                             code: '400', tone: 'info'    },
      { scenario: 'Stale ETag (concurrent admin edit)',                      code: '409', tone: 'warning' },
    ],
    overriddenBy: [
      { label: 'L2 — App',     tone: 'info',    detail: 'App may tighten further via code override or DB row.' },
      { label: 'L3 — User',    tone: 'info',    detail: 'Eligible users can opt-out per L3 rules.' },
      { label: 'Operator',     tone: 'warning', detail: 'Platform Ops may grant a time-bounded L1 exception (e.g. relax during tenant migration) via /admin/exceptions.' },
    ],
    overrides: [
      { label: 'L0 — Platform default', detail: 'L1 supersedes L0 for this tenant whenever stageIdx(L1) > stageIdx(L0).' },
    ],
    exception: {
      available: true,
      summary:
        'Platform Ops can create a time-bounded L1 exception that bypasses normal "tighten-only" validation (e.g. relax MFA for a migrating tenant). Mandatory ticket_ref + expires_at. Auto-revoked by the expiry job; audit-tagged distinctly from normal overrides.',
      sample: `POST /admin/exceptions
Authorization: Bearer <ops-token policy:admin>

{
  "policyKey":   "policy.mfa.enforcement_stage",
  "targetLevel": "L1",
  "tenantId":    12345,
  "value":       "Disabled",
  "reason":      "Tenant migration — MFA temporarily suspended",
  "expiresAt":   "2026-05-18T23:59:59Z",
  "approvedBy":  "ops-user@example.com",
  "ticketRef":   "OPS-4521"
}`,
    },
    concurrency: [
      'ETag comes from policy_instance_lock.version; passed back on subsequent PUT.',
      'Idempotent within a (tenant, definition) slot — repeating the same PUT is a no-op once the version matches.',
      'Concurrent admin edits in two tabs: second write fails 409, UI prompts a reload + retry.',
    ],
    lifecycle:
      'Active → Revoked (on supersede or DELETE) or Expired (background job when expires_at passes). All transitions emit audit events; rows are never hard-deleted.',
  },
  L2: {
    description: 'Application override. DB-stored rows live here; in-process code overrides exist alongside but are not persisted.',
    tenant: '12345', appId: 'mfa-service', userId: null,
    check: 'chk_l2_scope — tenant_id and app_id set, user_id NULL',
    scope: 'PerApp',
    scopeWriter: 'policy:write:l2 (service account whose sub matches app_id)',
    scopeReader: 'policy:read',
    exampleValue: 'AdminsAndPrivileged',
    rejections: [
      { scenario: 'Value would relax L1 for this tenant',                    code: '422', tone: 'warning' },
      { scenario: 'Definition has l2_allowed = false',                       code: '403', tone: 'danger'  },
      { scenario: 'Token sub does not match path appId (cross-app write)',   code: '403', tone: 'danger'  },
      { scenario: 'Definition value_type mismatch (e.g. enum vs json)',      code: '400', tone: 'info'    },
      { scenario: 'Stale ETag',                                              code: '409', tone: 'warning' },
    ],
    overriddenBy: [
      { label: 'L3 — User',  tone: 'info',    detail: 'User opt-out applies on top of L2 when eligible.' },
      { label: 'Operator',   tone: 'warning', detail: 'Platform Ops can override per (app, tenant) for incident response.' },
    ],
    overrides: [
      { label: 'L1 — Tenant', detail: 'App may not relax L1; only tighten further.' },
      { label: 'L0 — Default', detail: 'By transitivity — when no L1 exists, L2 tightens against L0.' },
    ],
    exception: {
      available: true,
      summary:
        'Per-app exceptions allow Platform Ops to relax or tighten an app\'s policy floor during incidents. Note: code-registered overrides (IPolicyOverrideProvider) take precedence over DB overrides at evaluation time — a database exception cannot bypass a deployed code floor.',
      sample: `POST /admin/exceptions
Authorization: Bearer <ops-token policy:admin>

{
  "policyKey":   "policy.mfa.enforcement_stage",
  "targetLevel": "L2",
  "tenantId":    12345,
  "appId":       "mfa-service",
  "value":       "AdminsOnly",
  "reason":      "Provider degraded — temporary fallback",
  "expiresAt":   "2026-05-13T12:00:00Z",
  "approvedBy":  "oncall@example.com",
  "ticketRef":   "OPS-5102"
}`,
    },
    concurrency: [
      'App service-account writes are idempotent per (appId, tenantId, key).',
      'Code-registered overrides have no row and no DB concurrency — they are deployment-versioned.',
      'When both a code override and a DB row exist, code wins; SDK emits a PolicyL2Conflict audit event for visibility.',
    ],
    lifecycle:
      'Active → Revoked (on supersede). DB-backed rows can also Expire. Code overrides are versioned by app deployment, not by lifecycle state.',
  },
  L3: {
    description: 'User opt-out or opt-in. Always scoped to user_id; almost always time-bounded.',
    tenant: null, appId: null, userId: 99887,
    check: 'chk_l3_scope — user_id set',
    scope: 'PerUser',
    scopeWriter: 'policy:write:l3 (the user themselves)',
    scopeReader: 'policy:read (self)',
    exampleValue: 'Disabled',
    rejections: [
      { scenario: 'Resolved stage not in opt_out_eligible_values',                       code: '422', tone: 'warning' },
      { scenario: 'User type not affected at current stage (nothing to opt out of)',     code: '422', tone: 'warning' },
      { scenario: 'Definition has opt_out_allowed = false',                              code: '403', tone: 'danger'  },
      { scenario: 'expires_at > 180 days (self-service maximum)',                        code: '422', tone: 'warning' },
      { scenario: 'user_id from token does not match path :userId',                      code: '403', tone: 'danger'  },
      { scenario: 'Rate limit exceeded (10 req/min per user)',                           code: '429', tone: 'info'    },
    ],
    overriddenBy: [
      { label: 'Operator', tone: 'warning', detail: 'Platform Ops can revoke a user\'s L3 row or override it with an emergency exception (e.g. revoke a previously granted opt-out).' },
    ],
    overrides: [
      { label: 'L2 — App',     detail: 'For this user only, L3 supersedes the app floor when opt-out is permitted.' },
      { label: 'L1 — Tenant',  detail: 'By transitivity.' },
      { label: 'L0 — Default', detail: 'By transitivity.' },
    ],
    exception: {
      available: true,
      summary:
        'Platform Ops can grant an emergency L3 opt-out that bypasses opt_out_eligible_values and applicable_user_types checks (e.g. regulator-mandated exception, accessibility accommodation). Mandatory ticket_ref and expires_at — never permanent.',
      sample: `POST /admin/exceptions
Authorization: Bearer <ops-token policy:admin>

{
  "policyKey":   "policy.mfa.enforcement_stage",
  "targetLevel": "L3",
  "userId":      99887,
  "value":       "Disabled",
  "reason":      "Accessibility accommodation per ticket",
  "expiresAt":   "2026-08-13T00:00:00Z",
  "approvedBy":  "compliance@example.com",
  "ticketRef":   "COMPL-218"
}`,
    },
    concurrency: [
      'Per-user rate-limited to 10 req/min on /me/policies/* endpoints.',
      'Idempotent: repeated POST /me/policies/{key}/opt-out returns the existing Active row.',
      'Background job re-evaluates the L3 row at expires_at and emits PolicyInstanceExpired.',
    ],
    lifecycle:
      'Active → Expired (background job at expires_at) or Revoked (user DELETE or operator revocation). Always emits audit events including the originating actor.',
  },
};

function InstanceBrowser() {
  const [level, setLevel] = useCanvasState<Level>('pdm.level', 'L1');
  const info = LEVEL_INFO[level];

  const sample = buildSampleInstance(level, info);

  return (
    <Card>
      <CardHeader>policy_instances — write surface by level</CardHeader>
      <CardBody>
        <Row gap={8} wrap>
          {(['L0', 'L1', 'L2', 'L3'] as Level[]).map((l) => (
            <Pill key={l} active={level === l} onClick={() => setLevel(l)}>
              {l}
            </Pill>
          ))}
        </Row>

        <div style={{ height: 14 }} />

        <Grid columns="minmax(0, 1.1fr) minmax(0, 1fr)" gap={20}>
          <Stack gap={10}>
            <Stack gap={4}>
              <Text size="small" tone="secondary">Description</Text>
              <Text>{info.description}</Text>
            </Stack>

            <Stack gap={4}>
              <Text size="small" tone="secondary">Scope columns populated</Text>
              <ScopeIndicator tenant={info.tenant} appId={info.appId} userId={info.userId} />
            </Stack>

            <Stack gap={4}>
              <Text size="small" tone="secondary">Enforcing CHECK constraint</Text>
              <Text><Code>{info.check}</Code></Text>
            </Stack>

            <Row gap={8} wrap>
              <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                <Text size="small" tone="secondary">Writer</Text>
                <Pill tone="warning">{info.scopeWriter}</Pill>
              </Stack>
              <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                <Text size="small" tone="secondary">Reader</Text>
                <Pill tone="info">{info.scopeReader}</Pill>
              </Stack>
            </Row>
          </Stack>

          <Stack gap={6}>
            <Text size="small" tone="secondary">Override stack (this row in context)</Text>
            <OverrideStack selected={level} hasException={info.exception.available} />
          </Stack>
        </Grid>

        <div style={{ height: 14 }} />

        <Stack gap={4}>
          <Text size="small" tone="secondary">Sample row (SELECT * shape)</Text>
          <pre style={{ margin: 0, fontSize: 11.5, lineHeight: '17px', whiteSpace: 'pre-wrap' }}>
{sample}
          </pre>
        </Stack>

        <Divider style={{ marginTop: 18, marginBottom: 18 }} />

        <Stack gap={8}>
          <H3>Validation gates</H3>
          <Text size="small" tone="secondary">
            Common rejections PolicyService produces when a caller writes at this level. All
            failures are auditable; none mutate the table.
          </Text>
          <Table
            headers={['Scenario', 'HTTP', 'Class']}
            columnAlign={['left', 'center', 'left']}
            rows={info.rejections.map((r) => [
              <Text size="small">{r.scenario}</Text>,
              <Pill size="sm" tone={rejectionTone(r.code)} active>{r.code}</Pill>,
              <Text size="small" tone="secondary">{rejectionClass(r.code)}</Text>,
            ])}
          />
        </Stack>

        <Divider style={{ marginTop: 18, marginBottom: 18 }} />

        <Stack gap={12}>
          <H3>Override flow</H3>
          <Grid columns="minmax(0, 1fr) minmax(0, 1fr)" gap={20}>
            <Stack gap={6}>
              <Text size="small" tone="secondary" weight="semibold">What overrides this row</Text>
              <Stack gap={6}>
                {info.overriddenBy.length === 0 && (
                  <Text size="small" tone="tertiary">Nothing — this is the most specific row for its scope.</Text>
                )}
                {info.overriddenBy.map((o, i) => (
                  <Stack key={i} gap={2}>
                    <Pill tone={o.tone} size="sm">{o.label}</Pill>
                    <Text size="small" tone="secondary">{o.detail}</Text>
                  </Stack>
                ))}
              </Stack>
            </Stack>
            <Stack gap={6}>
              <Text size="small" tone="secondary" weight="semibold">What this row overrides</Text>
              <Stack gap={6}>
                {info.overrides.map((o, i) => (
                  <Stack key={i} gap={2}>
                    <Pill tone="neutral" size="sm">{o.label}</Pill>
                    <Text size="small" tone="secondary">{o.detail}</Text>
                  </Stack>
                ))}
              </Stack>
            </Stack>
          </Grid>

          <ExceptionPathPanel exception={info.exception} />
        </Stack>

        <Divider style={{ marginTop: 18, marginBottom: 18 }} />

        <Stack gap={10}>
          <H3>Concurrency & lifecycle</H3>
          <Grid columns="minmax(0, 1fr) minmax(0, 1fr)" gap={20}>
            <Stack gap={6}>
              <Text size="small" tone="secondary" weight="semibold">Concurrency & idempotency</Text>
              <Stack gap={4}>
                {info.concurrency.map((c, i) => (
                  <Text size="small" key={i}>• {c}</Text>
                ))}
              </Stack>
            </Stack>
            <Stack gap={6}>
              <Text size="small" tone="secondary" weight="semibold">Lifecycle</Text>
              <Text size="small">{info.lifecycle}</Text>
            </Stack>
          </Grid>
        </Stack>
      </CardBody>
    </Card>
  );
}

function rejectionTone(code: string): RejectionTone {
  if (code.startsWith('40') || code === '410') return 'danger';
  if (code === '422' || code === '409') return 'warning';
  return 'info';
}

function rejectionClass(code: string): string {
  switch (code) {
    case '400': return 'Bad Request (schema)';
    case '403': return 'Forbidden (scope/identity)';
    case '409': return 'Conflict (concurrency)';
    case '410': return 'Gone (deprecated)';
    case '422': return 'Unprocessable Entity (business rule)';
    case '429': return 'Too Many Requests (rate limit)';
    default:    return '';
  }
}

function OverrideStack({ selected, hasException }: { selected: Level; hasException: boolean }) {
  const theme = useHostTheme();
  const W = 380;
  const H = 200;
  const levels: { id: Level; label: string; sub: string }[] = [
    { id: 'L0', label: 'L0 — Platform default', sub: 'Platform Ops' },
    { id: 'L1', label: 'L1 — Tenant override',  sub: 'Tenant Admin' },
    { id: 'L2', label: 'L2 — App override',     sub: 'Service account / code' },
    { id: 'L3', label: 'L3 — User opt-out',     sub: 'End user' },
  ];
  const rowH = 36;
  const rowY = (i: number) => 14 + i * (rowH + 6);
  const rowX = 14;
  const rowW = 240;

  const selectedIdx = levels.findIndex((l) => l.id === selected);
  const sy = rowY(selectedIdx);
  const sCenter = sy + rowH / 2;

  return (
    <div style={{ border: `1px solid ${theme.stroke.secondary}`, borderRadius: 6, background: theme.bg.editor }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Override stack">
        <defs>
          <marker id="os-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={theme.text.tertiary} />
          </marker>
          <marker id="os-arrow-warn" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={theme.accent.primary} />
          </marker>
        </defs>

        <line
          x1={rowX + rowW + 12}
          y1={rowY(0) + rowH / 2}
          x2={rowX + rowW + 12}
          y2={rowY(3) + rowH / 2}
          stroke={theme.text.quaternary}
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        <text
          x={rowX + rowW + 18}
          y={(rowY(0) + rowH / 2 + rowY(3) + rowH / 2) / 2}
          fontSize={10}
          fill={theme.text.tertiary}
          transform={`rotate(90 ${rowX + rowW + 18},${(rowY(0) + rowH / 2 + rowY(3) + rowH / 2) / 2})`}
          textAnchor="middle"
        >
          resolution: most specific wins
        </text>

        {levels.map((l, i) => {
          const isSelected = l.id === selected;
          const y = rowY(i);
          return (
            <g key={l.id}>
              <rect
                x={rowX}
                y={y}
                width={rowW}
                height={rowH}
                rx={5}
                ry={5}
                fill={isSelected ? theme.fill.tertiary : theme.bg.elevated}
                stroke={isSelected ? theme.accent.primary : theme.stroke.secondary}
                strokeWidth={isSelected ? 1.5 : 1}
              />
              <text
                x={rowX + 12}
                y={y + 15}
                fontSize={12}
                fontWeight={590}
                fill={isSelected ? theme.text.primary : theme.text.secondary}
              >
                {l.label}
              </text>
              <text x={rowX + 12} y={y + 29} fontSize={10} fill={theme.text.tertiary}>
                {l.sub}
              </text>
            </g>
          );
        })}

        {hasException && (
          <g>
            <rect
              x={rowX + rowW + 36}
              y={sy - 6}
              width={130}
              height={rowH + 12}
              rx={5}
              ry={5}
              fill={theme.bg.elevated}
              stroke={theme.accent.primary}
              strokeWidth={1.2}
              strokeDasharray="3 3"
            />
            <text x={rowX + rowW + 46} y={sCenter - 4} fontSize={11} fontWeight={590} fill={theme.text.primary}>
              Operator exception
            </text>
            <text x={rowX + rowW + 46} y={sCenter + 10} fontSize={10} fill={theme.text.secondary}>
              policy:admin, ticketRef
            </text>
            <line
              x1={rowX + rowW + 36}
              y1={sCenter}
              x2={rowX + rowW}
              y2={sCenter}
              stroke={theme.accent.primary}
              strokeWidth={1.4}
              markerEnd="url(#os-arrow-warn)"
            />
          </g>
        )}
      </svg>
    </div>
  );
}

function ExceptionPathPanel({ exception }: { exception: LevelEntry['exception'] }) {
  const theme = useHostTheme();
  return (
    <Stack gap={6}>
      <Row gap={8} align="center">
        <Text size="small" tone="secondary" weight="semibold">Emergency / operator exception</Text>
        <Pill size="sm" tone={exception.available ? 'warning' : 'neutral'}>
          {exception.available ? 'available at this level' : 'not applicable'}
        </Pill>
      </Row>
      <Text size="small">{exception.summary}</Text>
      {exception.sample && (
        <pre
          style={{
            margin: 0,
            padding: 10,
            fontSize: 11.5,
            lineHeight: '17px',
            whiteSpace: 'pre-wrap',
            border: `1px solid ${theme.stroke.secondary}`,
            borderRadius: 6,
            background: theme.bg.editor,
          }}
        >
{exception.sample}
        </pre>
      )}
    </Stack>
  );
}

function ScopeIndicator({
  tenant,
  appId,
  userId,
}: {
  tenant: string | null;
  appId: string | null;
  userId: number | null;
}) {
  const theme = useHostTheme();
  const item = (name: string, value: string | number | null) => {
    const isSet = value !== null;
    return (
      <div
        key={name}
        style={{
          padding: '8px 10px',
          borderRadius: 6,
          border: `1px solid ${isSet ? theme.accent.primary : theme.stroke.secondary}`,
          background: isSet ? theme.fill.tertiary : 'transparent',
          minWidth: 0,
          flex: 1,
        }}
      >
        <Text size="small" tone={isSet ? 'primary' : 'tertiary'} weight={isSet ? 'semibold' : 'normal'}>
          {name}
        </Text>
        <Text size="small" tone={isSet ? 'secondary' : 'quaternary'}>
          {isSet ? String(value) : 'NULL'}
        </Text>
      </div>
    );
  };
  return (
    <Row gap={8}>
      {item('tenant_id', tenant)}
      {item('app_id', appId)}
      {item('user_id', userId)}
    </Row>
  );
}

function buildSampleInstance(level: Level, info: LevelEntry) {
  const id = level === 'L0' ? '0a0a-...'
    : level === 'L1' ? '3f2a-...'
    : level === 'L2' ? '7c4b-...'
    : '9e8d-...';
  return `{
  "id":                   "${id}",
  "policy_definition_id": "9b1f-policy.mfa.enforcement_stage-v1",
  "definition_version":   1,
  "level":                "${level}",
  "tenant_id":            ${info.tenant === null ? 'null' : info.tenant},
  "app_id":               ${info.appId === null ? 'null' : `"${info.appId}"`},
  "user_id":              ${info.userId === null ? 'null' : info.userId},
  "value":                "${info.exampleValue}",
  "effective_at":         "2026-06-01T00:00:00Z",
  "expires_at":           ${level === 'L3' ? '"2026-09-01T00:00:00Z"' : 'null'},
  "status":               "Active",
  "created_by":           "${level === 'L3' ? 'user:99887' : level === 'L0' ? 'system-seed' : 'admin@acme.com'}"
}`;
}

// ─── Upsert sequence ─────────────────────────────────────────────────────────

function UpsertSequence() {
  const theme = useHostTheme();
  const stepBorder = theme.stroke.secondary;
  const stepBg = theme.bg.elevated;
  const numBg = theme.fill.secondary;

  const steps: { title: string; sql: string; note: string }[] = [
    {
      title: 'Caller invokes the stored procedure',
      sql: `SELECT policy.upsert_policy_instance(
    $1::uuid, $2::int, 'L1', 12345, NULL, NULL,
    'EmployeesOptOut', NOW(), NULL,
    'Phase 2 rollout', NULL, NULL, NULL,
    'admin@acme.com', $expected_version
);`,
      note: 'PolicyService is the only caller; service-level code never INSERTs into policy_instances directly.',
    },
    {
      title: 'Lock row is upserted',
      sql: `INSERT INTO policy.policy_instance_lock (...)
ON CONFLICT (PK) DO UPDATE
  SET current_instance_id = $new_id,
      version = version + 1
RETURNING version;`,
      note: 'The lock row exists at most once per (definition, level, scope) tuple. Its version becomes the new ETag.',
    },
    {
      title: 'Optimistic concurrency check',
      sql: `IF p_expected_version IS NOT NULL
   AND v_lock_version != p_expected_version + 1 THEN
  RAISE EXCEPTION 'Concurrent modification'
    USING ERRCODE = 'serialization_failure';
END IF;`,
      note: 'If the caller passed an ETag and the lock has been bumped since, the entire transaction aborts.',
    },
    {
      title: 'Previous Active instance is revoked',
      sql: `UPDATE policy.policy_instances
   SET status = 'Revoked',
       superseded_by = $new_id,
       revoked_at = NOW(),
       revoked_by = $created_by
 WHERE policy_definition_id = $def_id
   AND level = $level
   AND tenant_id IS NOT DISTINCT FROM $tenant_id
   AND app_id    IS NOT DISTINCT FROM $app_id
   AND user_id   IS NOT DISTINCT FROM $user_id
   AND status = 'Active';`,
      note: 'Soft-archive only — the row stays in the table for audit. The supersede chain links to the new id.',
    },
    {
      title: 'New Active instance is inserted',
      sql: `INSERT INTO policy.policy_instances (
  id, policy_definition_id, definition_version,
  level, tenant_id, app_id, user_id,
  value, effective_at, expires_at,
  override_reason, approved_by, approved_at, ticket_ref,
  status, created_by, created_at, updated_at
) VALUES (...);`,
      note: 'Single INSERT; the CHECK constraints reject any row with malformed scope columns.',
    },
    {
      title: 'New id is returned and change event is published',
      sql: `RETURN v_new_id;
-- Outside the transaction (via transactional outbox):
ServiceBus.Publish("policy-changes", {
  EventType:  "PolicyInstanceChanged",
  policyKey:  "policy.mfa.enforcement_stage",
  tenantId:   12345,
  newValue:   "EmployeesOptOut", ...
});
// Audit / eval events from SDK consumers flow into
// Kafka topic "policy-audit-events" on a separate path.`,
      note: 'Outbox pattern guarantees at-least-once publish to ServiceBus; the sink and SDKs deduplicate by eventId. Kafka audit events are produced independently by SDK clients.',
    },
  ];

  return (
    <Stack gap={10}>
      {steps.map((s, i) => (
        <Row key={i} gap={14} align="start">
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              background: numBg,
              color: theme.text.primary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 590,
              flexShrink: 0,
            }}
          >
            {i + 1}
          </div>
          <Stack gap={6} style={{ flex: 1, minWidth: 0, padding: 12, border: `1px solid ${stepBorder}`, borderRadius: 6, background: stepBg }}>
            <Text weight="semibold">{s.title}</Text>
            <pre style={{ margin: 0, fontSize: 11.5, lineHeight: '17px', whiteSpace: 'pre-wrap' }}>{s.sql}</pre>
            <Text size="small" tone="tertiary">{s.note}</Text>
          </Stack>
        </Row>
      ))}
    </Stack>
  );
}

// ─── API surface ─────────────────────────────────────────────────────────────

function ApiSurface() {
  const groups: { title: string; scope: string; rows: [string, string, string][] }[] = [
    {
      title: 'Policy Definitions',
      scope: 'policy:read / policy:definitions:write',
      rows: [
        ['GET',  '/definitions',                       'List active definitions'],
        ['GET',  '/definitions/{key}',                 'Active definition for a key'],
        ['GET',  '/definitions/{key}/versions',        'Full version history (admin)'],
        ['POST', '/definitions',                       'Register definition or new version'],
        ['PUT',  '/definitions/{key}',                 'Non-breaking update'],
      ],
    },
    {
      title: 'Tenant Instances (L1)',
      scope: 'policy:read / policy:write:l1',
      rows: [
        ['GET',    '/tenants/{tenantId}/policies',               'All L1 overrides for a tenant'],
        ['GET',    '/tenants/{tenantId}/policies/{key}',         'Single L1 instance'],
        ['PUT',    '/tenants/{tenantId}/policies/{key}',         'Create or replace L1 override'],
        ['DELETE', '/tenants/{tenantId}/policies/{key}',         'Revert to L0 default'],
        ['GET',    '/tenants/{tenantId}/policies/{key}/history', 'Paginated history'],
      ],
    },
    {
      title: 'Application Instances (L2)',
      scope: 'policy:read / policy:write:l2',
      rows: [
        ['GET',    '/apps/{appId}/tenants/{tenantId}/policies',         'L2 overrides for an app+tenant'],
        ['PUT',    '/apps/{appId}/tenants/{tenantId}/policies/{key}',   'Create or replace L2 override'],
        ['DELETE', '/apps/{appId}/tenants/{tenantId}/policies/{key}',   'Remove L2 DB override'],
      ],
    },
    {
      title: 'User Instances (L3)',
      scope: 'policy:write:l3',
      rows: [
        ['GET',    '/me/policies',                           'All L3 instances for current user'],
        ['POST',   '/me/policies/{key}/opt-out',             'Submit opt-out (subject to eligibility)'],
        ['DELETE', '/me/policies/{key}/opt-out',             'Cancel opt-out'],
        ['POST',   '/me/policies/{key}/opt-in',              'Voluntary tightening above L2'],
      ],
    },
    {
      title: 'Evaluation',
      scope: 'policy:read',
      rows: [
        ['POST', '/evaluate',           'Resolve effective value for a context'],
        ['POST', '/evaluate/batch',     'Resolve many policies in one round-trip'],
        ['POST', '/sdk/instances/bulk', 'SDK warm-up: instances for (app, tenants, keys)'],
      ],
    },
    {
      title: 'Operator Exceptions',
      scope: 'policy:admin',
      rows: [
        ['POST',   '/admin/exceptions',           'Time-bounded exception (ticketRef required)'],
        ['GET',    '/admin/exceptions',           'List active exceptions'],
        ['DELETE', '/admin/exceptions/{id}',      'Revoke before expiry'],
      ],
    },
  ];

  const theme = useHostTheme();

  return (
    <Stack gap={18}>
      {groups.map((g) => (
        <Stack key={g.title} gap={8}>
          <Row gap={10} align="center">
            <H3>{g.title}</H3>
            <Pill tone="neutral" size="sm">{g.scope}</Pill>
          </Row>
          <Table
            headers={['Method', 'Path', 'Description']}
            columnAlign={['left', 'left', 'left']}
            rows={g.rows.map((r) => [
              <Text weight="semibold" style={{ color: methodColor(r[0], theme) }}>{r[0]}</Text>,
              <Code>{r[1]}</Code>,
              <Text size="small">{r[2]}</Text>,
            ])}
          />
        </Stack>
      ))}
    </Stack>
  );
}

function methodColor(method: string, theme: HostTheme): string {
  switch (method) {
    case 'GET':    return theme.text.primary;
    case 'POST':   return theme.accent.primary;
    case 'PUT':    return theme.accent.primary;
    case 'DELETE': return theme.text.secondary;
    default:       return theme.text.secondary;
  }
}

// ─── Indexes ─────────────────────────────────────────────────────────────────

function IndexTable() {
  return (
    <Table
      headers={['Index', 'Table', 'Coverage', 'Type']}
      columnAlign={['left', 'left', 'left', 'left']}
      rows={[
        ['idx_pd_active_key',     'policy_definitions', 'Active definition lookup by key',     'Partial (is_active)'],
        ['idx_pd_key_version',    'policy_definitions', 'Version history queries',             'B-tree'],
        ['idx_pi_l0_l1_lookup',   'policy_instances',   'SDK bulk fetch (L0 + L1 per tenant)', 'Partial (Active)'],
        ['idx_pi_l2_lookup',      'policy_instances',   'L2 lookup by (app, tenant)',          'Partial (Active)'],
        ['idx_pi_l3_lookup',      'policy_instances',   'L3 lookup by user',                   'Partial (Active)'],
        ['idx_pi_expiry_scan',    'policy_instances',   'Background expiry job',               'Partial (Active + expires_at)'],
        ['idx_pi_tenant_history', 'policy_instances',   'Tenant audit / admin UI history',     'B-tree'],
        ['idx_pi_user_history',   'policy_instances',   'User opt-out history',                'B-tree'],
      ]}
    />
  );
}
