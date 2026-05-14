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
import { AdrLink } from '@/components/AdrLink';
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

      <Stack gap={12}>
        <SectionHeading term="data-model:targeting" title="Targeting filters" subtitle="Data model">
          Targeting filters
        </SectionHeading>
        <Row gap={6}><AdrLink id="008">From ADR-008</AdrLink></Row>
        <Text tone="secondary">
          Orthogonal to the scope hierarchy: roles, environments, and actions are JSONB filters
          on the instance row. The same instance can target "only admins in Enterprise Hub" without
          creating a new definition or scope level.
        </Text>
        <TargetingFiltersTable />
      </Stack>

      <Stack gap={12}>
        <SectionHeading term="data-model:lifecycle" title="Instance lifecycle" subtitle="Data model">
          Instance lifecycle
        </SectionHeading>
        <Row gap={6}><AdrLink id="010">From ADR-010</AdrLink></Row>
        <Text tone="secondary">
          The <Code>status</Code> column now has five values. Drafts are invisible at evaluation
          time, can be grouped into a <Code>policy_plan</Code> for atomic activation, and may
          require approval before going Active depending on the definition.
        </Text>
        <LifecycleStateMachine />
      </Stack>

      <Stack gap={12}>
        <SectionHeading term="data-model:exemptions" title="Exemption workflow" subtitle="Data model">
          Exemption workflow
        </SectionHeading>
        <Row gap={6}><AdrLink id="010">From ADR-010</AdrLink></Row>
        <Text tone="secondary">
          A separate entity tracks self-service exemption requests through approval. Approved
          requests materialize a User or Group instance with <Code>expires_at</Code> set to the
          requested value; the linked <Code>exemption_request_id</Code> on the instance preserves
          the audit chain.
        </Text>
        <ExemptionStateMachine />
      </Stack>

      <Stack gap={12}>
        <SectionHeading term="data-model:catalogs" title="Reference catalogs" subtitle="Data model">
          Reference catalogs
        </SectionHeading>
        <Row gap={6}><AdrLink id="009">From ADR-009</AdrLink></Row>
        <Text tone="secondary">
          Platform-managed lookup tables that composite policies reference. Adding a new factor or
          provider is a Flyway row insert; no schema churn.
        </Text>
        <CatalogTables />
      </Stack>

      <Stack gap={12}>
        <SectionHeading term="data-model:dependencies" title="Policy dependencies" subtitle="Data model">
          Policy dependencies
        </SectionHeading>
        <Row gap={6}><AdrLink id="009">From ADR-009</AdrLink></Row>
        <Text tone="secondary">
          Declarative relations between definitions used by the admin UI to grey out controls
          superseded by an active parent (e.g. <Code>SsoOnly</Code> invalidates account-linking
          toggles) and to enforce write-time prerequisites.
        </Text>
        <DependencyExamples />
      </Stack>

      <Callout tone="info" title="Source of truth">
        Full DDL, stored procedure body, and migration order in
        <Text as="span"> </Text><AdrLink id="007">ADR-007 Data Models & Schema</AdrLink>.
        REST contract in <AdrLink id="005">ADR-005 PolicyService API</AdrLink>. Browse all ten ADRs in
        the <a href="#/adrs" className="adr-inline-link">ADRs tab</a>.
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
        Authoritative store for policy definitions and instances across six scope levels
        (<Code>Platform</Code> · <Code>Org</Code> · <Code>Tenant</Code> · <Code>App</Code> ·
        <Text as="span"> </Text><Code>Group</Code> · <Code>User</Code>). PostgreSQL-backed,
        ServiceBus + Kafka eventing, deployed as the <Code>policy-service</Code> microservice.
      </Text>
      <Text size="small" tone="tertiary">
        Schema reflects <AdrLink id="007">ADR-007</AdrLink> plus the PRD-driven extensions in
        <Text as="span"> </Text><AdrLink id="008">ADR-008 (scope hierarchy)</AdrLink>,
        <Text as="span"> </Text><AdrLink id="009">ADR-009 (value composition + side effects)</AdrLink>,
        and <AdrLink id="010">ADR-010 (lifecycle + exemption workflow)</AdrLink>.
      </Text>
    </Stack>
  );
}

function SummaryStats() {
  return (
    <Grid columns={4} gap={16}>
      <Stat value="6"   label="Scope levels" tone="info" />
      <Stat value="10"  label="Core tables" />
      <Stat value="45+" label="REST endpoints" />
      <Stat value="9"   label="Auth scopes" />
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

  const W = 900;
  const H = 440;

  const tables: ErTable[] = [
    {
      id: 'pd', x: 30, y: 30, w: 290,
      title: 'policy_definitions',
      rows: [
        { name: 'id', type: 'UUID', flag: 'PK' },
        { name: 'key', type: 'TEXT' },
        { name: 'version', type: 'INT' },
        { name: 'value_type', type: 'TEXT' },
        { name: 'allowed_values', type: 'JSONB' },
        { name: 'value_schema', type: 'JSONB' },
        { name: 'default_value', type: 'TEXT' },
        { name: 'scope', type: 'TEXT' },
        { name: 'org/tenant/app/group/user_allowed', type: 'BOOL' },
        { name: 'relaxation_allowed_at', type: 'JSONB' },
        { name: 'applicable_roles', type: 'JSONB' },
        { name: 'applicable_environments', type: 'JSONB' },
        { name: 'opt_in/out_allowed', type: 'BOOL' },
        { name: 'requires_approval', type: 'BOOL' },
        { name: 'approval_routing', type: 'JSONB' },
        { name: 'owner_org_required', type: 'BOOL' },
        { name: 'is_active', type: 'BOOL' },
        { name: 'superseded_by', type: 'UUID', flag: 'FK self' },
      ],
    },
    {
      id: 'pi', x: 350, y: 30, w: 290,
      title: 'policy_instances',
      rows: [
        { name: 'id', type: 'UUID', flag: 'PK' },
        { name: 'policy_definition_id', type: 'UUID', flag: 'FK' },
        { name: 'definition_version', type: 'INT' },
        { name: 'level', type: 'TEXT' },
        { name: 'org_id', type: 'INT?' },
        { name: 'tenant_id', type: 'INT?' },
        { name: 'app_id', type: 'TEXT?' },
        { name: 'group_id', type: 'UUID?', flag: 'FK' },
        { name: 'user_id', type: 'INT?' },
        { name: 'value', type: 'TEXT' },
        { name: 'applies_to_roles', type: 'JSONB?' },
        { name: 'applies_to_environments', type: 'JSONB?' },
        { name: 'applies_to_actions', type: 'JSONB?' },
        { name: 'effective_at', type: 'TIMESTAMPTZ' },
        { name: 'expires_at', type: 'TIMESTAMPTZ?' },
        { name: 'status', type: 'TEXT' },
        { name: 'exemption_request_id', type: 'UUID?', flag: 'FK' },
        { name: 'superseded_by', type: 'UUID', flag: 'FK self' },
      ],
    },
    {
      id: 'pl', x: 670, y: 30, w: 200,
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
            ['id',                                      'UUID PK',                       'gen_random_uuid()'],
            ['key',                                     'TEXT',                          'stable string e.g. policy.mfa.enforcement_stage'],
            ['version',                                 'INT',                           'starts at 1; bumped on breaking change'],
            ['value_type',                              'TEXT CHECK',                    'Enum | Bool | Int | String | Json'],
            ['allowed_values',                          'JSONB',                         'null = unconstrained'],
            ['value_schema',                            'JSONB',                         'JSON Schema; only for value_type=Json (ADR-009)'],
            ['default_value',                           'TEXT',                          'served when no instance exists'],
            ['scope',                                   'TEXT CHECK',                    'Global | PerOrg | PerTenant | PerApp | PerGroup | PerUser'],
            ['platform_allowed (implicit)',             '—',                             'platform is always allowed; not a column'],
            ['org_allowed / tenant_allowed',            'BOOLEAN',                       'which levels may write instances'],
            ['app_allowed / group_allowed / user_allowed', 'BOOLEAN',                    'continued'],
            ['relaxation_allowed_at',                   'JSONB',                         'list of levels permitted to relax their parent, e.g. ["Org","Tenant"] (ADR-008)'],
            ['applicable_roles',                        'JSONB',                         'null = any role; list of role IDs otherwise (ADR-008)'],
            ['applicable_environments',                 'JSONB',                         'null = any env; ["Monolith","EnterpriseHub","Mobile",...] (ADR-008)'],
            ['opt_in_allowed / opt_out_allowed',        'BOOLEAN',                       'user-driven User flows'],
            ['opt_out_eligible_values',                 'JSONB',                         'enum values at which opt-out is permitted'],
            ['is_ordered_enum',                         'BOOLEAN',                       'enables "max wins" resolution semantics'],
            ['requires_approval',                       'BOOLEAN',                       'instances start as PendingApproval (ADR-010)'],
            ['approval_routing',                        'JSONB',                         'approver rule + sources (ADR-010)'],
            ['owner_org_required',                      'BOOLEAN',                       'managed-identity ownership check (ADR-009)'],
            ['is_active',                               'BOOLEAN',                       'false after supersession; never deleted'],
            ['superseded_by',                           'UUID FK -> policy_definitions', 'links breaking-change history'],
            ['created_by / created_at / updated_at',    'TEXT / TIMESTAMPTZ',            'audit columns'],
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
            ['id',                                   'UUID PK',                                          ''],
            ['policy_definition_id',                 'UUID FK -> policy_definitions',                    ''],
            ['definition_version',                   'INT',                                              'snapshot at write time'],
            ['level',                                "TEXT CHECK ('Platform','Org','Tenant','App','Group','User')", '(ADR-008)'],
            ['org_id',                               'INT (nullable)',                                   'set for Org'],
            ['tenant_id',                            'INT (nullable)',                                   'set for Tenant, App, Group'],
            ['app_id',                               'TEXT (nullable)',                                  'set for App'],
            ['group_id',                             'UUID FK -> policy_group (nullable)',               'set for Group (ADR-008)'],
            ['user_id',                              'INT (nullable)',                                   'set for User'],
            ['value',                                'TEXT',                                             'string-encoded; SDK deserializes per value_type'],
            ['applies_to_roles',                     'JSONB (nullable)',                                 'null = any role (ADR-008)'],
            ['applies_to_environments',              'JSONB (nullable)',                                 'null = any environment (ADR-008)'],
            ['applies_to_actions',                   'JSONB (nullable)',                                 'step-up MFA per action (ADR-009)'],
            ['effective_at / expires_at',            'TIMESTAMPTZ',                                      'expires_at NULL for permanent rows'],
            ['override_reason / approved_by',        'TEXT (nullable)',                                  'required for exceptions'],
            ['ticket_ref',                           'TEXT (nullable)',                                  'mandatory when approved_by is set'],
            ['status',                               "TEXT CHECK ('Draft','PendingApproval','Active','Revoked','Expired')", '5-state lifecycle (ADR-010)'],
            ['superseded_by',                        'UUID FK -> policy_instances (self)',               'links replacement chain'],
            ['revoked_at / revoked_by',              'TIMESTAMPTZ / TEXT',                               'populated on supersede'],
            ['exemption_request_id',                 'UUID FK (nullable)',                               'when materialized from an exemption_request (ADR-010)'],
            ['created_by / created_at / updated_at', 'TEXT / TIMESTAMPTZ',                               'audit columns'],
          ]}
        />
        <div style={{ padding: 12 }}>
          <Text size="small" tone="secondary" weight="semibold">CHECK constraints (ADR-008)</Text>
          <Text size="small">
            <Code>chk_level_scope</Code> enforces the correct scope columns per level:
          </Text>
          <Text size="small">• <Code>Platform</Code> — all scope columns NULL</Text>
          <Text size="small">• <Code>Org</Code> — only <Code>org_id</Code> set</Text>
          <Text size="small">• <Code>Tenant</Code> — only <Code>tenant_id</Code> set</Text>
          <Text size="small">• <Code>App</Code> — <Code>tenant_id</Code> and <Code>app_id</Code> set, user/group NULL</Text>
          <Text size="small">• <Code>Group</Code> — <Code>tenant_id</Code> and <Code>group_id</Code> set, user/app NULL</Text>
          <Text size="small">• <Code>User</Code> — <Code>user_id</Code> set, app/group NULL</Text>
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

type Level = 'Platform' | 'Org' | 'Tenant' | 'App' | 'Group' | 'User';
const ALL_LEVELS: Level[] = ['Platform', 'Org', 'Tenant', 'App', 'Group', 'User'];

type RejectionTone = 'warning' | 'danger' | 'info';

type LevelEntry = {
  description: string;
  orgId: number | null;
  tenant: string | null;
  appId: string | null;
  groupId: string | null;
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
  Platform: {
    description: 'Platform default. Exactly one Active per definition; rarely written outside Flyway migrations.',
    orgId: null, tenant: null, appId: null, groupId: null, userId: null,
    check: 'chk_level_scope — all scope columns NULL',
    scope: 'Global',
    scopeWriter: 'policy:admin (Platform Ops)',
    scopeReader: 'policy:read',
    exampleValue: 'Disabled',
    rejections: [
      { scenario: 'Definition is deprecated',              code: '410', tone: 'warning' },
      { scenario: 'Value not in allowed_values',           code: '400', tone: 'info' },
      { scenario: 'Caller lacks policy:admin scope',       code: '403', tone: 'danger' },
      { scenario: 'Stale ETag (concurrent platform edit)', code: '409', tone: 'warning' },
    ],
    overriddenBy: [
      { label: 'Org',      tone: 'info',    detail: 'Franchise admins tighten across all owned tenants via PUT /orgs/{id}/policies/{key}.' },
      { label: 'Tenant',   tone: 'info',    detail: 'Tenant admin tightens via PUT /tenants/{id}/policies/{key}.' },
      { label: 'App',      tone: 'info',    detail: 'App tightens via PUT /apps/{appId}/... or in-process IPolicyOverrideProvider.' },
      { label: 'Group',    tone: 'info',    detail: 'Tenant admins can grant or restrict for a group via PUT /tenants/{tid}/groups/{gid}/policies/{key}.' },
      { label: 'User',     tone: 'info',    detail: 'User toggles via POST /me/policies/{key}/opt-out (when eligible).' },
      { label: 'Operator', tone: 'warning', detail: 'Platform Ops can supersede via /admin/exceptions — extremely rare; usually a Flyway-managed update.' },
    ],
    overrides: [
      { label: '(ceiling)', detail: 'Platform is the global default. Nothing above it.' },
    ],
    exception: {
      available: false,
      summary:
        'Platform level itself does not have an emergency-exception path — deviations live at Org / Tenant / App / Group / User so the platform default remains intact and auditable. Real Platform changes flow through Flyway migrations.',
    },
    concurrency: [
      'Standard ETag via policy_instance_lock.version.',
      'Writes are extremely rare and deployment-driven; conflicts are essentially impossible.',
      'Platform instances are seeded by V*__policy_*.sql migrations; new definitions bootstrap their Platform row in the same migration.',
    ],
    lifecycle: 'Active → Revoked only when the definition is superseded (definition_version bumps). Platform rows are never Expired.',
  },
  Org: {
    description: 'Franchise / parent-company override. Applies to every Tenant under the Org unless overridden lower.',
    orgId: 42, tenant: null, appId: null, groupId: null, userId: null,
    check: 'chk_level_scope — only org_id is set',
    scope: 'PerOrg',
    scopeWriter: 'policy:write:org (Org Admin)',
    scopeReader: 'policy:read (same org only)',
    exampleValue: 'AdminsAndPrivileged',
    rejections: [
      { scenario: 'Value would relax Platform and relaxation_allowed_at does not include Org', code: '422', tone: 'warning' },
      { scenario: 'Definition has org_allowed = false',                  code: '403', tone: 'danger' },
      { scenario: 'Org ID in path mismatches token claim',                code: '403', tone: 'danger' },
      { scenario: 'Value not in allowed_values',                          code: '400', tone: 'info' },
      { scenario: 'Stale ETag',                                           code: '409', tone: 'warning' },
    ],
    overriddenBy: [
      { label: 'Tenant', tone: 'info',    detail: 'Any owned tenant can tighten further for itself.' },
      { label: 'App',    tone: 'info',    detail: 'Apps under a tenant can tighten further.' },
      { label: 'Group',  tone: 'info',    detail: 'Group-scoped exemptions narrow the audience.' },
      { label: 'User',   tone: 'info',    detail: 'Eligible users may opt-out.' },
      { label: 'Operator', tone: 'warning', detail: 'Platform Ops can supersede via /admin/exceptions targeting Org.' },
    ],
    overrides: [
      { label: 'Platform', detail: 'Org instance supersedes the Platform default for every tenant in the org.' },
    ],
    exception: {
      available: true,
      summary:
        'Platform Ops can grant a time-bounded Org-level exception (rare). Used when a whole franchise needs a relaxation while merging entities or migrating identity providers.',
      sample: `POST /admin/exceptions
Authorization: Bearer <ops-token policy:admin>

{
  "policyKey":   "policy.mfa.enforcement_stage",
  "targetLevel": "Org",
  "orgId":       42,
  "value":       "Disabled",
  "reason":      "Org-wide identity migration in flight",
  "expiresAt":   "2026-06-30T23:59:59Z",
  "approvedBy":  "ops-user@example.com",
  "ticketRef":   "OPS-6210"
}`,
    },
    concurrency: [
      'ETag via policy_instance_lock; same idempotency rules as Tenant level.',
      'Org admins may be small in number — concurrent edits are uncommon.',
    ],
    lifecycle: 'Active → Revoked (on supersede or DELETE) or Expired (background job).',
  },
  Tenant: {
    description: 'Tenant override. The most common configuration level. One Active per (tenant, definition).',
    orgId: null, tenant: '12345', appId: null, groupId: null, userId: null,
    check: 'chk_level_scope — only tenant_id is set',
    scope: 'PerTenant',
    scopeWriter: 'policy:write:tenant (Tenant Admin)',
    scopeReader: 'policy:read (same tenant only)',
    exampleValue: 'EmployeesOptOut',
    rejections: [
      { scenario: 'Value would relax Org/Platform and relaxation not permitted', code: '422', tone: 'warning' },
      { scenario: 'Definition has tenant_allowed = false',          code: '403', tone: 'danger' },
      { scenario: 'Tenant ID in path mismatches token claim',        code: '403', tone: 'danger' },
      { scenario: 'Value not in allowed_values',                     code: '400', tone: 'info' },
      { scenario: 'Stale ETag (concurrent admin edit)',              code: '409', tone: 'warning' },
    ],
    overriddenBy: [
      { label: 'App',    tone: 'info',    detail: 'App may tighten further via code override or DB row.' },
      { label: 'Group',  tone: 'info',    detail: 'Group-scoped exemptions narrow the audience.' },
      { label: 'User',   tone: 'info',    detail: 'Eligible users can opt-out per definition rules.' },
      { label: 'Operator', tone: 'warning', detail: 'Platform Ops may grant a time-bounded Tenant exception via /admin/exceptions.' },
    ],
    overrides: [
      { label: 'Org',      detail: 'Tenant supersedes Org for itself, within definition constraints.' },
      { label: 'Platform', detail: 'By transitivity when no Org instance exists.' },
    ],
    exception: {
      available: true,
      summary:
        'Platform Ops can create a time-bounded Tenant exception that bypasses normal "tighten-only" validation (e.g. relax MFA for a migrating tenant). Mandatory ticket_ref + expires_at.',
      sample: `POST /admin/exceptions
Authorization: Bearer <ops-token policy:admin>

{
  "policyKey":   "policy.mfa.enforcement_stage",
  "targetLevel": "Tenant",
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
  App: {
    description: 'Application override. DB-stored rows live here; in-process code overrides exist alongside but are not persisted.',
    orgId: null, tenant: '12345', appId: 'mfa-service', groupId: null, userId: null,
    check: 'chk_level_scope — tenant_id and app_id are set',
    scope: 'PerApp',
    scopeWriter: 'policy:write:app (service account whose sub matches app_id)',
    scopeReader: 'policy:read',
    exampleValue: 'AdminsAndPrivileged',
    rejections: [
      { scenario: 'Value would relax Tenant for this app',                  code: '422', tone: 'warning' },
      { scenario: 'Definition has app_allowed = false',                     code: '403', tone: 'danger' },
      { scenario: 'Token sub does not match path appId (cross-app write)',  code: '403', tone: 'danger' },
      { scenario: 'Definition value_type mismatch (e.g. enum vs json)',     code: '400', tone: 'info' },
      { scenario: 'Stale ETag',                                             code: '409', tone: 'warning' },
    ],
    overriddenBy: [
      { label: 'Group',    tone: 'info',    detail: 'Group exemption applies on top of App when the user is in the group.' },
      { label: 'User',     tone: 'info',    detail: 'User opt-out applies on top of App when eligible.' },
      { label: 'Operator', tone: 'warning', detail: 'Platform Ops can override per (app, tenant) for incident response.' },
    ],
    overrides: [
      { label: 'Tenant',   detail: 'App may not relax Tenant; only tighten further.' },
      { label: 'Org',      detail: 'By transitivity.' },
      { label: 'Platform', detail: 'By transitivity.' },
    ],
    exception: {
      available: true,
      summary:
        'Per-app exceptions allow Platform Ops to relax or tighten an app\'s policy floor during incidents. Note: code-registered overrides (IPolicyOverrideProvider) take precedence over DB overrides at evaluation time — a database exception cannot bypass a deployed code floor.',
      sample: `POST /admin/exceptions
Authorization: Bearer <ops-token policy:admin>

{
  "policyKey":   "policy.mfa.enforcement_stage",
  "targetLevel": "App",
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
  Group: {
    description: 'Group exemption — applies only to users in the named group. Most exemption-request approvals land here.',
    orgId: null, tenant: '12345', appId: null, groupId: 'a1b2-...sales-team', userId: null,
    check: 'chk_level_scope — tenant_id and group_id are set',
    scope: 'PerGroup',
    scopeWriter: 'policy:write:group (Tenant Admin or exemption approver)',
    scopeReader: 'policy:read (same tenant only)',
    exampleValue: 'AdminsAndPrivileged',
    rejections: [
      { scenario: 'Definition has group_allowed = false',                code: '403', tone: 'danger' },
      { scenario: 'Group does not belong to path tenantId',              code: '403', tone: 'danger' },
      { scenario: 'Value would relax Platform/Org/Tenant impermissibly', code: '422', tone: 'warning' },
      { scenario: 'Value not in allowed_values',                         code: '400', tone: 'info' },
      { scenario: 'Stale ETag',                                          code: '409', tone: 'warning' },
    ],
    overriddenBy: [
      { label: 'User',     tone: 'info',    detail: 'Individual opt-out still wins for that user.' },
      { label: 'Operator', tone: 'warning', detail: 'Platform Ops can grant a Group-level exception via /admin/exceptions.' },
    ],
    overrides: [
      { label: 'App',      detail: 'Applies to all users in the group regardless of which app they\'re using.' },
      { label: 'Tenant',   detail: 'By transitivity.' },
      { label: 'Org',      detail: 'By transitivity.' },
      { label: 'Platform', detail: 'By transitivity.' },
    ],
    exception: {
      available: true,
      summary:
        'Approved exemption requests targeting a Group materialize as a Group-level PolicyInstance with expires_at = requested value. Ops can also create one directly via /admin/exceptions for incident response.',
      sample: `# Most common path: approver action on an exemption_request
POST /exemption-requests/{id}/approve
{ "decision_notes": "Approved for 90 days, see ticket SEC-411" }

# Creates a Group instance internally:
INSERT INTO policy.policy_instances (
  level, tenant_id, group_id, value, expires_at,
  approved_by, ticket_ref, status, ...
) VALUES (
  'Group', 12345, 'a1b2-...sales-team', 'AdminsAndPrivileged',
  '2026-08-13T00:00:00Z', 'security@example.com', 'SEC-411',
  'Active', ...
);`,
    },
    concurrency: [
      'Approval-driven; an in-flight exemption_request that already resulted in an Active Group instance returns 409 on a second approve.',
      'Group membership is sourced via IPolicyGroupSource (SDK) or POST /tenants/{tid}/groups/{gid}/members — eventual consistency on membership.',
    ],
    lifecycle:
      'Active → Expired (at exemption_request.requested_expires_at) or Revoked (when approver rescinds). Linked exemption_request transitions to Expired in lockstep.',
  },
  User: {
    description: 'User opt-out or opt-in. Always scoped to user_id; almost always time-bounded.',
    orgId: null, tenant: null, appId: null, groupId: null, userId: 99887,
    check: 'chk_level_scope — user_id is set',
    scope: 'PerUser',
    scopeWriter: 'policy:write:user (the user themselves)',
    scopeReader: 'policy:read (self)',
    exampleValue: 'Disabled',
    rejections: [
      { scenario: 'Resolved stage not in opt_out_eligible_values',                       code: '422', tone: 'warning' },
      { scenario: 'User role not affected at current stage (nothing to opt out of)',     code: '422', tone: 'warning' },
      { scenario: 'Definition has opt_out_allowed = false',                              code: '403', tone: 'danger' },
      { scenario: 'expires_at > 180 days (self-service maximum)',                        code: '422', tone: 'warning' },
      { scenario: 'user_id from token does not match path :userId',                      code: '403', tone: 'danger' },
      { scenario: 'Rate limit exceeded (10 req/min per user)',                           code: '429', tone: 'info' },
    ],
    overriddenBy: [
      { label: 'Operator', tone: 'warning', detail: 'Platform Ops can revoke a user\'s row or override it with an emergency exception.' },
    ],
    overrides: [
      { label: 'Group',    detail: 'For this user only, User supersedes the group setting when opt-out is permitted.' },
      { label: 'App',      detail: 'By transitivity.' },
      { label: 'Tenant',   detail: 'By transitivity.' },
      { label: 'Org',      detail: 'By transitivity.' },
      { label: 'Platform', detail: 'By transitivity.' },
    ],
    exception: {
      available: true,
      summary:
        'Platform Ops can grant an emergency User opt-out that bypasses opt_out_eligible_values and applicable_roles checks (e.g. regulator-mandated exception, accessibility accommodation). Mandatory ticket_ref and expires_at — never permanent.',
      sample: `POST /admin/exceptions
Authorization: Bearer <ops-token policy:admin>

{
  "policyKey":   "policy.mfa.enforcement_stage",
  "targetLevel": "User",
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
      'Background job re-evaluates the User row at expires_at and emits PolicyInstanceExpired.',
    ],
    lifecycle:
      'Active → Expired (background job at expires_at) or Revoked (user DELETE or operator revocation). Always emits audit events including the originating actor.',
  },
};

function InstanceBrowser() {
  const [level, setLevel] = useCanvasState<Level>('pdm.level.v2', 'Tenant');
  const info = LEVEL_INFO[level];

  const sample = buildSampleInstance(level, info);

  return (
    <Card>
      <CardHeader>policy_instances — write surface by level</CardHeader>
      <CardBody>
        <Row gap={8} wrap>
          {ALL_LEVELS.map((l) => (
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
              <ScopeIndicator
                orgId={info.orgId}
                tenant={info.tenant}
                appId={info.appId}
                groupId={info.groupId}
                userId={info.userId}
              />
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
  const W = 400;
  const H = 270;
  const levels: { id: Level; label: string; sub: string }[] = [
    { id: 'Platform', label: 'Platform — Global default', sub: 'Platform Ops' },
    { id: 'Org',      label: 'Org — Franchise / parent',  sub: 'Org Admin' },
    { id: 'Tenant',   label: 'Tenant — Per-tenant',       sub: 'Tenant Admin' },
    { id: 'App',      label: 'App — Per-(app, tenant)',   sub: 'Service account / code' },
    { id: 'Group',    label: 'Group — Per-group',         sub: 'Approver / Tenant Admin' },
    { id: 'User',     label: 'User — Individual',         sub: 'End user' },
  ];
  const rowH = 32;
  const rowGap = 6;
  const rowY = (i: number) => 10 + i * (rowH + rowGap);
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
          y2={rowY(5) + rowH / 2}
          stroke={theme.text.quaternary}
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        <text
          x={rowX + rowW + 18}
          y={(rowY(0) + rowH / 2 + rowY(5) + rowH / 2) / 2}
          fontSize={10}
          fill={theme.text.tertiary}
          transform={`rotate(90 ${rowX + rowW + 18},${(rowY(0) + rowH / 2 + rowY(5) + rowH / 2) / 2})`}
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
                y={y + 13}
                fontSize={11}
                fontWeight={590}
                fill={isSelected ? theme.text.primary : theme.text.secondary}
              >
                {l.label}
              </text>
              <text x={rowX + 12} y={y + 26} fontSize={10} fill={theme.text.tertiary}>
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
  orgId,
  tenant,
  appId,
  groupId,
  userId,
}: {
  orgId: number | null;
  tenant: string | null;
  appId: string | null;
  groupId: string | null;
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
        <Text size="small" tone={isSet ? 'secondary' : 'quaternary'} truncate>
          {isSet ? String(value) : 'NULL'}
        </Text>
      </div>
    );
  };
  return (
    <Row gap={8} wrap>
      {item('org_id',    orgId)}
      {item('tenant_id', tenant)}
      {item('app_id',    appId)}
      {item('group_id',  groupId)}
      {item('user_id',   userId)}
    </Row>
  );
}

function buildSampleInstance(level: Level, info: LevelEntry) {
  const id =
      level === 'Platform' ? '0a0a-...'
    : level === 'Org'      ? '1b1b-...'
    : level === 'Tenant'   ? '3f2a-...'
    : level === 'App'      ? '7c4b-...'
    : level === 'Group'    ? '8d5e-...'
    :                        '9e8d-...';
  const createdBy =
      level === 'User'     ? 'user:99887'
    : level === 'Platform' ? 'system-seed'
    : level === 'Group'    ? 'security@example.com'
    :                        'admin@acme.com';
  const expires = level === 'User' || level === 'Group' ? '"2026-09-01T00:00:00Z"' : 'null';
  return `{
  "id":                     "${id}",
  "policy_definition_id":   "9b1f-policy.mfa.enforcement_stage-v1",
  "definition_version":     1,
  "level":                  "${level}",
  "org_id":                 ${info.orgId    === null ? 'null' : info.orgId},
  "tenant_id":              ${info.tenant   === null ? 'null' : info.tenant},
  "app_id":                 ${info.appId    === null ? 'null' : `"${info.appId}"`},
  "group_id":               ${info.groupId  === null ? 'null' : `"${info.groupId}"`},
  "user_id":                ${info.userId   === null ? 'null' : info.userId},
  "value":                  "${info.exampleValue}",
  "applies_to_roles":       ${level === 'Tenant' ? '["admin","manager"]' : 'null'},
  "applies_to_environments": ${level === 'Tenant' ? '["Monolith","EnterpriseHub"]' : 'null'},
  "effective_at":           "2026-06-01T00:00:00Z",
  "expires_at":             ${expires},
  "status":                 "Active",
  "created_by":             "${createdBy}"
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
        ['GET',  '/definitions',                          'List active definitions'],
        ['GET',  '/definitions/{key}',                    'Active definition for a key'],
        ['GET',  '/definitions/{key}/dependencies',       'Resolved deps for UI (ADR-009)'],
        ['GET',  '/definitions/{key}/versions',           'Full version history (admin)'],
        ['POST', '/definitions',                          'Register definition or new version'],
        ['PUT',  '/definitions/{key}',                    'Non-breaking update'],
      ],
    },
    {
      title: 'Org Instances',
      scope: 'policy:read / policy:write:org',
      rows: [
        ['GET',    '/orgs/{orgId}/policies',              'All Org overrides (ADR-008)'],
        ['PUT',    '/orgs/{orgId}/policies/{key}',        'Create or replace Org override'],
        ['DELETE', '/orgs/{orgId}/policies/{key}',        'Revert to Platform default'],
      ],
    },
    {
      title: 'Tenant Instances',
      scope: 'policy:read / policy:write:tenant',
      rows: [
        ['GET',    '/tenants/{tenantId}/policies',               'All Tenant overrides'],
        ['GET',    '/tenants/{tenantId}/policies/{key}',         'Single Tenant instance'],
        ['PUT',    '/tenants/{tenantId}/policies/{key}',         'Create or replace; ?status=Draft for ADR-010 drafts'],
        ['DELETE', '/tenants/{tenantId}/policies/{key}',         'Revert to Org/Platform'],
        ['GET',    '/tenants/{tenantId}/policies/{key}/history', 'Paginated history'],
      ],
    },
    {
      title: 'Application Instances',
      scope: 'policy:read / policy:write:app',
      rows: [
        ['GET',    '/apps/{appId}/tenants/{tenantId}/policies',         'App overrides for an app+tenant'],
        ['PUT',    '/apps/{appId}/tenants/{tenantId}/policies/{key}',   'Create or replace App override'],
        ['DELETE', '/apps/{appId}/tenants/{tenantId}/policies/{key}',   'Remove App DB override'],
      ],
    },
    {
      title: 'Group Instances + Group Management',
      scope: 'policy:read / policy:write:group / policy:groups:manage',
      rows: [
        ['GET',    '/tenants/{tenantId}/groups',                                        'List groups (ADR-008)'],
        ['POST',   '/tenants/{tenantId}/groups',                                        'Create a group'],
        ['GET',    '/tenants/{tenantId}/groups/{groupId}/members',                      'List members'],
        ['POST',   '/tenants/{tenantId}/groups/{groupId}/members',                      'Add member(s)'],
        ['DELETE', '/tenants/{tenantId}/groups/{groupId}/members/{userId}',             'Remove member'],
        ['GET',    '/tenants/{tenantId}/groups/{groupId}/policies',                     'Group-scoped instances'],
        ['PUT',    '/tenants/{tenantId}/groups/{groupId}/policies/{key}',               'Set Group override'],
        ['DELETE', '/tenants/{tenantId}/groups/{groupId}/policies/{key}',               'Remove Group override'],
      ],
    },
    {
      title: 'User Instances',
      scope: 'policy:write:user',
      rows: [
        ['GET',    '/me/policies',                           'All User instances for current user'],
        ['POST',   '/me/policies/{key}/opt-out',             'Submit opt-out (subject to eligibility)'],
        ['DELETE', '/me/policies/{key}/opt-out',             'Cancel opt-out'],
        ['POST',   '/me/policies/{key}/opt-in',              'Voluntary tightening above App'],
      ],
    },
    {
      title: 'Plans & Drafts',
      scope: 'policy:plan:manage',
      rows: [
        ['POST',   '/policies/{instance_id}/activate', 'Draft → Active (ADR-010)'],
        ['POST',   '/plans',                           'Create a plan'],
        ['POST',   '/plans/{id}/items',                'Add Draft instance to plan'],
        ['POST',   '/plans/{id}/dry-run',              'Preview resolved values before activation'],
        ['POST',   '/plans/{id}/activate',             'Atomic activation of all items'],
        ['DELETE', '/plans/{id}',                      'Discard'],
      ],
    },
    {
      title: 'Exemption Requests',
      scope: 'policy:request:exemption / policy:approve:exemption',
      rows: [
        ['POST',   '/exemption-requests',               'Submit request (ADR-010)'],
        ['GET',    '/me/exemption-requests',            'List mine'],
        ['GET',    '/tenants/{tid}/exemption-requests', 'Approver inbox (tenant scope)'],
        ['GET',    '/orgs/{oid}/exemption-requests',    'Approver inbox (org scope)'],
        ['POST',   '/exemption-requests/{id}/claim',    'Approver claim'],
        ['POST',   '/exemption-requests/{id}/approve', 'Approve (materializes Group/User instance)'],
        ['POST',   '/exemption-requests/{id}/deny',     'Deny with reason'],
        ['DELETE', '/exemption-requests/{id}',          'Withdraw'],
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
      title: 'Catalogs (read-only)',
      scope: 'policy:read',
      rows: [
        ['GET', '/factors',   'MFA factor catalog (ADR-009)'],
        ['GET', '/providers', 'Auth provider catalog'],
        ['GET', '/actions',   'Step-up action catalog'],
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

// ─── Targeting filters ───────────────────────────────────────────────────────

function TargetingFiltersTable() {
  return (
    <Table
      headers={['Filter', 'Column', 'Example value', 'Semantics']}
      columnAlign={['left', 'left', 'left', 'left']}
      rows={[
        [
          <Text weight="semibold">Roles</Text>,
          <Code>applies_to_roles</Code>,
          <Code>["admin","manager"]</Code>,
          <Text size="small">Instance only matches when <Code>context.roles ∩ applies_to_roles ≠ ∅</Code>. Null = any role.</Text>,
        ],
        [
          <Text weight="semibold">Environment</Text>,
          <Code>applies_to_environments</Code>,
          <Code>["Monolith","EnterpriseHub"]</Code>,
          <Text size="small">Matches by <Code>context.environment</Code>. Used for "force Enterprise Hub" / "block Next".</Text>,
        ],
        [
          <Text weight="semibold">Actions</Text>,
          <Code>applies_to_actions</Code>,
          <Code>["payroll.approve_run"]</Code>,
          <Text size="small">Step-up MFA per action. Matches by <Code>context.action</Code>.</Text>,
        ],
        [
          <Text weight="semibold">User type (deprecated)</Text>,
          <Code>applies_to_user_types</Code>,
          <Code>["Employee","Technician"]</Code>,
          <Text size="small" tone="tertiary">Transition compatibility; migrating to <Code>applies_to_roles</Code> per ADR-008 §7.</Text>,
        ],
      ]}
    />
  );
}

// ─── Lifecycle state machine ─────────────────────────────────────────────────

function LifecycleStateMachine() {
  const theme = useHostTheme();
  const W = 880;
  const H = 200;

  type Node = { id: string; x: number; y: number; w: number; h: number; label: string; tone: 'neutral' | 'accent' | 'success' | 'danger' };
  const nodes: Node[] = [
    { id: 'draft',    x:  30, y:  80, w: 130, h: 50, label: 'Draft',           tone: 'neutral' },
    { id: 'pending',  x: 210, y:  80, w: 170, h: 50, label: 'PendingApproval', tone: 'accent' },
    { id: 'active',   x: 430, y:  80, w: 130, h: 50, label: 'Active',          tone: 'success' },
    { id: 'expired',  x: 620, y:  20, w: 130, h: 50, label: 'Expired',         tone: 'neutral' },
    { id: 'revoked',  x: 620, y: 140, w: 130, h: 50, label: 'Revoked',         tone: 'danger' },
  ];

  type Edge = { from: string; to: string; label: string; dashed?: boolean };
  const edges: Edge[] = [
    { from: 'draft',   to: 'pending', label: 'submit (requires_approval=true)' },
    { from: 'draft',   to: 'active',  label: 'activate' },
    { from: 'draft',   to: 'revoked', label: 'discard', dashed: true },
    { from: 'pending', to: 'active',  label: 'approve' },
    { from: 'pending', to: 'revoked', label: 'deny' },
    { from: 'active',  to: 'expired', label: 'expires_at reached', dashed: true },
    { from: 'active',  to: 'revoked', label: 'supersede / DELETE' },
  ];

  const byId = Object.fromEntries(nodes.map((n) => [n.id, n] as const));

  function side(n: Node) {
    return {
      cx: n.x + n.w / 2,
      cy: n.y + n.h / 2,
      left:   { x: n.x,           y: n.y + n.h / 2 },
      right:  { x: n.x + n.w,     y: n.y + n.h / 2 },
      top:    { x: n.x + n.w / 2, y: n.y },
      bottom: { x: n.x + n.w / 2, y: n.y + n.h },
    };
  }

  function anchor(from: Node, to: Node) {
    const a = side(from), b = side(to);
    const dx = b.cx - a.cx;
    const dy = b.cy - a.cy;
    if (Math.abs(dy) > Math.abs(dx)) {
      return dy > 0 ? { p1: a.bottom, p2: b.top } : { p1: a.top, p2: b.bottom };
    }
    return dx > 0 ? { p1: a.right, p2: b.left } : { p1: a.left, p2: b.right };
  }

  const toneFill = (t: Node['tone']) =>
    t === 'success' ? 'rgba(63,162,102,0.18)'
    : t === 'danger' ? 'rgba(192,72,72,0.18)'
    : t === 'accent' ? theme.fill.tertiary
    : theme.bg.elevated;
  const toneStroke = (t: Node['tone']) =>
    t === 'success' ? '#3fa266'
    : t === 'danger' ? '#c04848'
    : t === 'accent' ? theme.accent.primary
    : theme.stroke.primary;

  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${theme.stroke.secondary}`, borderRadius: 8, background: theme.bg.editor }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Instance lifecycle state machine">
        <defs>
          <marker id="lm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={theme.text.tertiary} />
          </marker>
        </defs>

        {edges.map((e, i) => {
          const { p1, p2 } = anchor(byId[e.from], byId[e.to]);
          const mx = (p1.x + p2.x) / 2;
          const my = (p1.y + p2.y) / 2;
          return (
            <g key={i}>
              <line
                x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                stroke={theme.text.tertiary}
                strokeWidth={1.3}
                strokeDasharray={e.dashed ? '4 3' : undefined}
                markerEnd="url(#lm-arrow)"
              />
              <text x={mx} y={my - 6} fontSize={10} fill={theme.text.secondary} textAnchor="middle">
                {e.label}
              </text>
            </g>
          );
        })}

        {nodes.map((n) => (
          <g key={n.id}>
            <rect
              x={n.x} y={n.y} width={n.w} height={n.h}
              rx={6} ry={6}
              fill={toneFill(n.tone)}
              stroke={toneStroke(n.tone)}
              strokeWidth={1.4}
            />
            <text x={n.x + n.w / 2} y={n.y + n.h / 2 + 4} fontSize={13} fontWeight={590} textAnchor="middle" fill={theme.text.primary}>
              {n.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─── Exemption state machine ─────────────────────────────────────────────────

function ExemptionStateMachine() {
  const theme = useHostTheme();
  const W = 880;
  const H = 220;

  type Node = { id: string; x: number; y: number; w: number; h: number; label: string; tone: 'neutral' | 'accent' | 'success' | 'danger' };
  const nodes: Node[] = [
    { id: 'submitted',  x:  30, y:  90, w: 140, h: 48, label: 'Submitted',   tone: 'neutral' },
    { id: 'under',      x: 220, y:  90, w: 170, h: 48, label: 'UnderReview', tone: 'accent' },
    { id: 'approved',   x: 450, y:  20, w: 150, h: 48, label: 'Approved',    tone: 'success' },
    { id: 'denied',     x: 450, y: 160, w: 150, h: 48, label: 'Denied',      tone: 'danger' },
    { id: 'withdrawn',  x: 220, y: 170, w: 140, h: 40, label: 'Withdrawn',   tone: 'danger' },
    { id: 'expired',    x: 670, y:  20, w: 130, h: 48, label: 'Expired',     tone: 'neutral' },
  ];

  type Edge = { from: string; to: string; label: string; dashed?: boolean };
  const edges: Edge[] = [
    { from: 'submitted', to: 'under',     label: 'approver claims' },
    { from: 'submitted', to: 'withdrawn', label: 'requester withdraws', dashed: true },
    { from: 'under',     to: 'approved',  label: 'approve → creates instance' },
    { from: 'under',     to: 'denied',    label: 'deny' },
    { from: 'under',     to: 'withdrawn', label: 'withdraw', dashed: true },
    { from: 'approved',  to: 'expired',   label: 'instance expires', dashed: true },
  ];

  const byId = Object.fromEntries(nodes.map((n) => [n.id, n] as const));

  function side(n: Node) {
    return {
      cx: n.x + n.w / 2, cy: n.y + n.h / 2,
      left:   { x: n.x,           y: n.y + n.h / 2 },
      right:  { x: n.x + n.w,     y: n.y + n.h / 2 },
      top:    { x: n.x + n.w / 2, y: n.y },
      bottom: { x: n.x + n.w / 2, y: n.y + n.h },
    };
  }
  function anchor(from: Node, to: Node) {
    const a = side(from), b = side(to);
    const dx = b.cx - a.cx; const dy = b.cy - a.cy;
    if (Math.abs(dy) > Math.abs(dx)) return dy > 0 ? { p1: a.bottom, p2: b.top } : { p1: a.top, p2: b.bottom };
    return dx > 0 ? { p1: a.right, p2: b.left } : { p1: a.left, p2: b.right };
  }
  const toneFill = (t: Node['tone']) =>
    t === 'success' ? 'rgba(63,162,102,0.18)'
    : t === 'danger' ? 'rgba(192,72,72,0.18)'
    : t === 'accent' ? theme.fill.tertiary
    : theme.bg.elevated;
  const toneStroke = (t: Node['tone']) =>
    t === 'success' ? '#3fa266'
    : t === 'danger' ? '#c04848'
    : t === 'accent' ? theme.accent.primary
    : theme.stroke.primary;

  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${theme.stroke.secondary}`, borderRadius: 8, background: theme.bg.editor }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Exemption request state machine">
        <defs>
          <marker id="em-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={theme.text.tertiary} />
          </marker>
        </defs>
        {edges.map((e, i) => {
          const { p1, p2 } = anchor(byId[e.from], byId[e.to]);
          const mx = (p1.x + p2.x) / 2;
          const my = (p1.y + p2.y) / 2;
          return (
            <g key={i}>
              <line
                x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                stroke={theme.text.tertiary}
                strokeWidth={1.3}
                strokeDasharray={e.dashed ? '4 3' : undefined}
                markerEnd="url(#em-arrow)"
              />
              <text x={mx} y={my - 6} fontSize={10} fill={theme.text.secondary} textAnchor="middle">
                {e.label}
              </text>
            </g>
          );
        })}
        {nodes.map((n) => (
          <g key={n.id}>
            <rect
              x={n.x} y={n.y} width={n.w} height={n.h}
              rx={6} ry={6}
              fill={toneFill(n.tone)}
              stroke={toneStroke(n.tone)}
              strokeWidth={1.4}
            />
            <text x={n.x + n.w / 2} y={n.y + n.h / 2 + 4} fontSize={12} fontWeight={590} textAnchor="middle" fill={theme.text.primary}>
              {n.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─── Catalog tables ──────────────────────────────────────────────────────────

function CatalogTables() {
  return (
    <Grid columns={3} gap={16}>
      <Card>
        <CardHeader trailing={<Pill size="sm" tone="info">platform-managed</Pill>}>
          mfa_factor
        </CardHeader>
        <CardBody>
          <Stack gap={6}>
            <Text size="small" tone="secondary">Factor catalog used by required/allowed/disabled factor policies.</Text>
            <Table
              framed={false}
              headers={['Column', 'Type']}
              rows={[
                ['id',         'TEXT PK'],
                ['name',       'TEXT'],
                ['family',     'TEXT (otp | phishing-resistant | fallback)'],
                ['assurance',  'TEXT (low | medium | high)'],
                ['is_active',  'BOOL'],
              ]}
            />
            <Text size="small" tone="tertiary">
              Seeded values: <Code>totp</Code>, <Code>sms</Code>, <Code>passkey</Code>,
              <Text as="span"> </Text><Code>webauthn</Code>, <Code>email-otp</Code>.
            </Text>
          </Stack>
        </CardBody>
      </Card>

      <Card>
        <CardHeader trailing={<Pill size="sm" tone="info">platform-managed</Pill>}>
          auth_provider
        </CardHeader>
        <CardBody>
          <Stack gap={6}>
            <Text size="small" tone="secondary">Provider catalog used by multi-provider SSO policies.</Text>
            <Table
              framed={false}
              headers={['Column', 'Type']}
              rows={[
                ['id',        'TEXT PK'],
                ['name',      'TEXT'],
                ['kind',      'TEXT (oidc | saml | oauth | passkey | password)'],
                ['is_active', 'BOOL'],
                ['config',    'JSONB (non-secret metadata)'],
              ]}
            />
            <Text size="small" tone="tertiary">
              Seeded values: <Code>entra</Code>, <Code>google</Code>, <Code>okta</Code>,
              <Text as="span"> </Text><Code>st-internal</Code>.
            </Text>
          </Stack>
        </CardBody>
      </Card>

      <Card>
        <CardHeader trailing={<Pill size="sm" tone="info">platform-managed</Pill>}>
          policy_action
        </CardHeader>
        <CardBody>
          <Stack gap={6}>
            <Text size="small" tone="secondary">Action identifiers used for step-up MFA via <Code>context.action</Code>.</Text>
            <Table
              framed={false}
              headers={['Column', 'Type']}
              rows={[
                ['id',       'TEXT PK'],
                ['name',     'TEXT'],
                ['category', 'TEXT (payroll | payment | admin | data-export | ...)'],
              ]}
            />
            <Text size="small" tone="tertiary">
              Examples: <Code>payroll.approve_run</Code>, <Code>payment.send_high_value</Code>,
              <Text as="span"> </Text><Code>data.bulk_export</Code>.
            </Text>
          </Stack>
        </CardBody>
      </Card>
    </Grid>
  );
}

// ─── Dependency examples ─────────────────────────────────────────────────────

function DependencyExamples() {
  return (
    <Table
      headers={['Parent policy', 'When value =', 'Effect kind', 'Dependent policy', 'Effect']}
      columnAlign={['left', 'left', 'left', 'left', 'left']}
      rows={[
        [
          <Code>policy.auth.method</Code>,
          <Code>SsoOnly</Code>,
          <Pill tone="warning" size="sm" active>invalidates</Pill>,
          <Code>policy.auth.account_linking</Code>,
          <Text size="small">Account-linking control is greyed out in the admin UI; ignored at eval.</Text>,
        ],
        [
          <Code>policy.password.rotation_enforced</Code>,
          <Code>true</Code>,
          <Pill tone="info" size="sm" active>requires</Pill>,
          <Code>policy.password.rotation_interval</Code>,
          <Text size="small">Save in admin UI is blocked until interval is set.</Text>,
        ],
        [
          <Code>policy.mfa.enforcement_stage</Code>,
          <Code>Disabled</Code>,
          <Pill tone="warning" size="sm" active>invalidates</Pill>,
          <Code>policy.mfa.required_factors</Code>,
          <Text size="small">Required factors aren&rsquo;t evaluated when MFA itself is off.</Text>,
        ],
        [
          <Code>policy.mfa.enforcement_stage</Code>,
          <Code>Required</Code>,
          <Pill tone="info" size="sm" active>requires</Pill>,
          <Code>policy.mfa.allowed_factors</Code>,
          <Text size="small">At least one allowed factor must be configured.</Text>,
        ],
      ]}
    />
  );
}

function IndexTable() {
  return (
    <Table
      headers={['Index', 'Table', 'Coverage', 'Type']}
      columnAlign={['left', 'left', 'left', 'left']}
      rows={[
        ['idx_pd_active_key',         'policy_definitions',     'Active definition lookup by key',           'Partial (is_active)'],
        ['idx_pd_key_version',        'policy_definitions',     'Version history queries',                   'B-tree'],
        ['idx_pi_platform_lookup',    'policy_instances',       'SDK bulk fetch (Platform defaults)',        'Partial (Active + Platform)'],
        ['idx_pi_org_lookup',         'policy_instances',       'Org-level lookup (ADR-008)',                'Partial (Active + Org)'],
        ['idx_pi_tenant_lookup',      'policy_instances',       'Tenant lookup',                             'Partial (Active + Tenant)'],
        ['idx_pi_app_lookup',         'policy_instances',       'App lookup by (app, tenant)',               'Partial (Active + App)'],
        ['idx_pi_group_lookup',       'policy_instances',       'Group lookup by (tenant, group) (ADR-008)', 'Partial (Active + Group)'],
        ['idx_pi_user_lookup',        'policy_instances',       'User lookup',                               'Partial (Active + User)'],
        ['idx_pi_expiry_scan',        'policy_instances',       'Background expiry job',                     'Partial (Active + expires_at)'],
        ['idx_pi_draft_by_creator',   'policy_instances',       'Drafts inbox (ADR-010)',                    'Partial (Draft)'],
        ['idx_pi_pending_approval',   'policy_instances',       'Approver queue (ADR-010)',                  'Partial (PendingApproval)'],
        ['idx_pi_tenant_history',     'policy_instances',       'Tenant audit / admin UI history',           'B-tree'],
        ['idx_pi_user_history',       'policy_instances',       'User opt-out history',                      'B-tree'],
        ['idx_exemption_open',        'exemption_request',      'Approver inbox (ADR-010)',                  'Partial (Submitted/UnderReview)'],
        ['idx_exemption_target_user', 'exemption_request',      'User-scoped request lookup',                'Partial (user_id NOT NULL)'],
        ['idx_dep_parent',            'policy_dependency',      'Find dependents when parent changes (ADR-009)', 'B-tree (parent_key, parent_version)'],
      ]}
    />
  );
}
