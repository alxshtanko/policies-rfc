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
  H2,
  Pill,
  Row,
  Select,
  Stack,
  Stat,
  Table,
  Text,
  Toggle,
  useCanvasState,
  useHostTheme,
} from '@/canvas-ui';

// ─── Domain data ─────────────────────────────────────────────────────────────

type StageKey =
  | 'Disabled'
  | 'EnabledAll'
  | 'AdminsOnly'
  | 'AdminsAndPrivileged'
  | 'EmployeesOptOut'
  | 'EmployeesAndTechsOptOut'
  | 'AllUsersOptOut';

const STAGES: { value: StageKey; short: string; full: string }[] = [
  { value: 'Disabled',                short: '0 — Disabled',          full: 'MFA unavailable' },
  { value: 'EnabledAll',              short: '1 — Enabled',           full: 'Available, not required' },
  { value: 'AdminsOnly',              short: '2 — Admins',            full: 'Required for Admins' },
  { value: 'AdminsAndPrivileged',     short: '3 — Admins + Privileged', full: 'Required for Admins & Privileged' },
  { value: 'EmployeesOptOut',         short: '4 — Employees',         full: 'Required for Employees (opt-out)' },
  { value: 'EmployeesAndTechsOptOut', short: '5 — Employees + Techs', full: 'Required for Employees & Techs (opt-out)' },
  { value: 'AllUsersOptOut',          short: '6 — All users',         full: 'Required for everyone (opt-out)' },
];
const stageIdx = (v: StageKey) => STAGES.findIndex((s) => s.value === v);
const OPT_OUT_ELIGIBLE: StageKey[] = ['EmployeesOptOut', 'EmployeesAndTechsOptOut', 'AllUsersOptOut'];

type UserType = 'Admin' | 'PrivilegedUser' | 'Employee' | 'Technician' | 'Other';
const USER_TYPES: { value: UserType; label: string }[] = [
  { value: 'Admin',          label: 'Admin' },
  { value: 'PrivilegedUser', label: 'Privileged User' },
  { value: 'Employee',       label: 'Employee' },
  { value: 'Technician',     label: 'Technician' },
  { value: 'Other',          label: 'Other user' },
];

const AFFECTED: Record<StageKey, UserType[]> = {
  Disabled:                [],
  EnabledAll:              [],
  AdminsOnly:              ['Admin'],
  AdminsAndPrivileged:     ['Admin', 'PrivilegedUser'],
  EmployeesOptOut:         ['Admin', 'PrivilegedUser', 'Employee'],
  EmployeesAndTechsOptOut: ['Admin', 'PrivilegedUser', 'Employee', 'Technician'],
  AllUsersOptOut:          ['Admin', 'PrivilegedUser', 'Employee', 'Technician', 'Other'],
};

function affected(stage: StageKey, user: UserType): 'required' | 'optional' | 'none' {
  if (stage === 'Disabled') return 'none';
  if (stage === 'EnabledAll') return 'optional';
  return AFFECTED[stage].includes(user) ? 'required' : 'none';
}

function resolveStage(l0: StageKey, l1: StageKey | '', l2: StageKey | '') {
  let value: StageKey = l0;
  let level: 'L0' | 'L1' | 'L2' = 'L0';
  if (l1 && stageIdx(l1 as StageKey) > stageIdx(value)) { value = l1 as StageKey; level = 'L1'; }
  if (l2 && stageIdx(l2 as StageKey) > stageIdx(value)) { value = l2 as StageKey; level = 'L2'; }
  return { value, level };
}

// ─── Page root ────────────────────────────────────────────────────────────────

export default function IntegrationDesign() {
  return (
    <Stack gap={28} style={{ padding: 24 }}>
      <Header />
      <SummaryStats />

      <Stack gap={12}>
        <H2>Service topology</H2>
        <Text tone="secondary">
          PolicyService is the authoritative store. Apps read via the SDK with a TTL cache. The bus
          tier is intentionally split: <Code>policy-changes</Code> on Azure ServiceBus uses
          SQL-filtered subscriptions to fan low-volume change events out to consumer caches, while
          <Text as="span"> </Text><Code>policy-audit-events</Code> on Kafka carries the high-volume
          evaluation / audit stream into the Audit Sink with replay support.
        </Text>
        <ArchitectureDiagram />
      </Stack>

      <Stack gap={12}>
        <H2>Policy resolution simulator</H2>
        <Text tone="secondary">
          Try the <Code>ium.mfa.enforcement_stage</Code> policy. Choose values at each level and a user
          type to see which level wins, whether the user is required, and what audit event is emitted.
        </Text>
        <Simulator />
      </Stack>

      <Stack gap={12}>
        <H2>Hierarchy at a glance</H2>
        <HierarchyTable />
      </Stack>

      <Stack gap={12}>
        <H2>MFA enforcement stages</H2>
        <Text tone="secondary">
          Each stage covers a strictly larger set of user types than the one below. Stages 4–6 permit
          per-user opt-out.
        </Text>
        <StageMatrix />
      </Stack>

      <Stack gap={12}>
        <H2>Lifecycle of a tenant override</H2>
        <Text tone="secondary">
          What happens when a tenant admin changes <Code>ium.mfa.enforcement_stage</Code> from
          <Text as="span"> </Text><Code>AdminsOnly</Code> to <Code>EmployeesOptOut</Code>.
        </Text>
        <OverrideLifecycle />
      </Stack>

      <Callout tone="info" title="Where this lives in code">
        PolicyService → new <Code>policy-service</Code> repo. SDK → internal NuGet.
        Frontend client + admin component → internal npm packages.
        ADRs are alongside this site under <Code>docs/adr/</Code>.
      </Callout>
    </Stack>
  );
}

// ─── Header & stats ──────────────────────────────────────────────────────────

function Header() {
  return (
    <Stack gap={6}>
      <H1>Policies — Integration Design</H1>
      <Text tone="secondary">
        Centralized policy management with a four-level override hierarchy (L0 → L1 → L2 → L3),
        event-driven cache invalidation, and a distributed audit pipeline.
      </Text>
    </Stack>
  );
}

function SummaryStats() {
  return (
    <Grid columns={4} gap={16}>
      <Stat value="4" label="Override levels" />
      <Stat value="5+" label="Apps integrated via SDK" />
      <Stat value="7" label="ADRs" />
      <Stat value="~5s" label="Change propagation" tone="info" />
    </Grid>
  );
}

// ─── Architecture diagram (hand-laid SVG) ────────────────────────────────────

type Node = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sub: string;
  accent?: boolean;
};

function ArchitectureDiagram() {
  const theme = useHostTheme();
  const stroke = theme.stroke.primary;
  const surface = theme.bg.elevated;
  const accentSurface = theme.fill.tertiary;
  const text = theme.text.primary;
  const sub = theme.text.secondary;
  const arrow = theme.text.tertiary;
  const accent = theme.accent.primary;
  const subtle = theme.stroke.secondary;

  const nodes: Node[] = [
    { id: 'central',   x:  40, y:  24, w: 230, h: 60, label: 'Central Policy Admin', sub: 'standalone web app' },
    { id: 'mfe',       x: 300, y:  24, w: 290, h: 60, label: 'MFE policy-panel',     sub: 'embedded in host apps' },
    { id: 'policySvc', x: 110, y: 150, w: 230, h: 72, label: 'PolicyService',         sub: '.NET 10 / Postgres-backed', accent: true },
    { id: 'pg',        x: 360, y: 150, w: 130, h: 72, label: 'PostgreSQL',            sub: 'policy DB' },
    { id: 'sb',        x: 520, y: 150, w: 250, h: 72, label: 'Azure ServiceBus',      sub: 'policy-changes (SQL filters)' },
    { id: 'app1',      x:  20, y: 300, w: 160, h: 62, label: 'mfa-service',          sub: 'PolicyFramework SDK' },
    { id: 'app2',      x: 200, y: 300, w: 160, h: 62, label: 'token-service',        sub: 'PolicyFramework SDK' },
    { id: 'app3',      x: 380, y: 300, w: 180, h: 62, label: 'identity-service',     sub: 'PolicyFramework SDK' },
    { id: 'app4',      x: 580, y: 300, w: 190, h: 62, label: 'monolith',             sub: 'policy-client (TS)' },
    { id: 'kafka',     x:  20, y: 410, w: 750, h: 58, label: 'Apache Kafka  ·  policy-audit-events', sub: 'partitioned by tenantId — eval + audit stream' },
    { id: 'sink',      x: 100, y: 510, w: 180, h: 60, label: 'Audit Sink',            sub: 'worker service' },
    { id: 'es',        x: 310, y: 510, w: 160, h: 60, label: 'Elasticsearch',         sub: 'policy-audit-*' },
    { id: 'dash',      x: 500, y: 510, w: 220, h: 60, label: 'Dashboard API',         sub: 'aggregations + queries' },
  ];
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n] as const));

  type Edge = { from: string; to: string; label?: string; dashed?: boolean };
  const edges: Edge[] = [
    { from: 'central',   to: 'policySvc', label: 'writes' },
    { from: 'mfe',       to: 'policySvc', label: 'tenant writes' },
    { from: 'policySvc', to: 'pg',        label: 'persist' },
    { from: 'policySvc', to: 'sb',        label: 'change events' },
    { from: 'sb',        to: 'app4',      label: 'cache invalidation', dashed: true },
    { from: 'app1',      to: 'policySvc', label: 'SDK read' },
    { from: 'app2',      to: 'policySvc' },
    { from: 'app3',      to: 'policySvc' },
    { from: 'app4',      to: 'policySvc' },
    { from: 'app1',      to: 'kafka' },
    { from: 'app2',      to: 'kafka' },
    { from: 'app3',      to: 'kafka' },
    { from: 'app4',      to: 'kafka',     label: 'eval events' },
    { from: 'sb',        to: 'sink',      label: 'changes', dashed: true },
    { from: 'kafka',     to: 'sink',      label: 'consume' },
    { from: 'sink',      to: 'es',        label: 'index' },
    { from: 'es',        to: 'dash',      label: 'query' },
  ];

  const W = 800;
  const H = 600;

  function side(n: Node) {
    return {
      cx: n.x + n.w / 2,
      cy: n.y + n.h / 2,
      top:    { x: n.x + n.w / 2, y: n.y },
      bottom: { x: n.x + n.w / 2, y: n.y + n.h },
      left:   { x: n.x,           y: n.y + n.h / 2 },
      right:  { x: n.x + n.w,     y: n.y + n.h / 2 },
    };
  }

  function anchor(from: Node, to: Node) {
    const a = side(from), b = side(to);
    const dx = b.cx - a.cx;
    const dy = b.cy - a.cy;
    if (Math.abs(dy) > Math.abs(dx)) {
      return dy > 0
        ? { p1: a.bottom, p2: b.top }
        : { p1: a.top,    p2: b.bottom };
    }
    return dx > 0
      ? { p1: a.right, p2: b.left }
      : { p1: a.left,  p2: b.right };
  }

  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${subtle}`, borderRadius: 8, background: theme.bg.editor }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Policy service architecture">
        <defs>
          <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={arrow} />
          </marker>
          <marker id="ah-accent" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={accent} />
          </marker>
        </defs>

        <text x={4}  y={14}  fontSize={10} fill={sub}>Management</text>
        <text x={4}  y={140} fontSize={10} fill={sub}>Core + ServiceBus</text>
        <text x={4}  y={290} fontSize={10} fill={sub}>Consumers</text>
        <text x={4}  y={400} fontSize={10} fill={sub}>Kafka</text>
        <text x={4}  y={500} fontSize={10} fill={sub}>Audit</text>

        {edges.map((e, i) => {
          const { p1, p2 } = anchor(byId[e.from], byId[e.to]);
          const mx = (p1.x + p2.x) / 2;
          const my = (p1.y + p2.y) / 2;
          const isChangeEvent = e.from === 'policySvc' && e.to === 'sb';
          const color = isChangeEvent ? accent : arrow;
          const marker = isChangeEvent ? 'url(#ah-accent)' : 'url(#ah)';
          return (
            <g key={i}>
              <line
                x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                stroke={color}
                strokeWidth={1.4}
                strokeDasharray={e.dashed ? '4 3' : undefined}
                markerEnd={marker}
              />
              {e.label && (
                <text x={mx + 6} y={my - 4} fontSize={10} fill={sub}>{e.label}</text>
              )}
            </g>
          );
        })}

        {nodes.map((n) => (
          <g key={n.id}>
            <rect
              x={n.x} y={n.y} width={n.w} height={n.h}
              rx={6} ry={6}
              fill={n.accent ? accentSurface : surface}
              stroke={n.accent ? accent : stroke}
              strokeWidth={n.accent ? 1.5 : 1}
            />
            <text x={n.x + n.w / 2} y={n.y + 25} fontSize={13} fontWeight={590} textAnchor="middle" fill={text}>
              {n.label}
            </text>
            <text x={n.x + n.w / 2} y={n.y + 44} fontSize={11} textAnchor="middle" fill={sub}>
              {n.sub}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─── Simulator ───────────────────────────────────────────────────────────────

function Simulator() {
  const [l0,       setL0]       = useCanvasState<StageKey>      ('sim.l0',       'Disabled');
  const [l1,       setL1]       = useCanvasState<StageKey | ''> ('sim.l1',       'EmployeesOptOut');
  const [l2,       setL2]       = useCanvasState<StageKey | ''> ('sim.l2',       '');
  const [userType, setUserType] = useCanvasState<UserType>      ('sim.userType', 'Employee');
  const [optedOut, setOptedOut] = useCanvasState<boolean>       ('sim.optedOut', false);

  const resolved   = resolveStage(l0, l1, l2);
  const userStatus = affected(resolved.value, userType);
  const optOutAvailable = userStatus === 'required' && OPT_OUT_ELIGIBLE.includes(resolved.value);
  const effectiveStatus: 'required' | 'optional' | 'none' =
    optedOut && optOutAvailable ? 'none' : userStatus;
  const finalValue: StageKey = optedOut && optOutAvailable ? 'Disabled' : resolved.value;
  const finalLevel = optedOut && optOutAvailable ? 'L3 (opt-out)' : resolved.level;

  const stageOptions = STAGES.map((s) => ({ value: s.value, label: s.short }));
  const stageOptionsNullable = [{ value: '', label: 'None — inherit' }, ...stageOptions];
  const userOptions = USER_TYPES.map((u) => ({ value: u.value, label: u.label }));

  const statusTone: 'success' | 'warning' | 'danger' | 'info' =
    effectiveStatus === 'required' ? 'warning'
    : effectiveStatus === 'optional' ? 'info'
    : 'success';
  const statusLabel =
    effectiveStatus === 'required' ? 'User is REQUIRED to do MFA'
    : effectiveStatus === 'optional' ? 'MFA is OPTIONAL for this user'
    : 'MFA is NOT REQUIRED for this user';

  return (
    <Card>
      <CardHeader>ium.mfa.enforcement_stage</CardHeader>
      <CardBody>
        <Grid columns="minmax(0, 1fr) minmax(0, 1fr)" gap={24}>
          <Stack gap={14}>
            <Stack gap={4}>
              <Text size="small" tone="secondary">Platform default (L0)</Text>
              <Select value={l0} onChange={(v) => setL0(v as StageKey)} options={stageOptions} />
            </Stack>
            <Stack gap={4}>
              <Text size="small" tone="secondary">Tenant override (L1)</Text>
              <Select value={l1} onChange={(v) => setL1(v as StageKey | '')} options={stageOptionsNullable} />
            </Stack>
            <Stack gap={4}>
              <Text size="small" tone="secondary">App floor (L2 — code or DB)</Text>
              <Select value={l2} onChange={(v) => setL2(v as StageKey | '')} options={stageOptionsNullable} />
            </Stack>
            <Stack gap={4}>
              <Text size="small" tone="secondary">Evaluating user type</Text>
              <Select value={userType} onChange={(v) => setUserType(v as UserType)} options={userOptions} />
            </Stack>
            <Divider />
            <Row align="center" gap={12}>
              <Toggle checked={optedOut} onChange={setOptedOut} disabled={!optOutAvailable} />
              <Stack gap={2}>
                <Text size="small" weight="semibold">User L3 opt-out</Text>
                <Text size="small" tone="tertiary">
                  {optOutAvailable
                    ? 'Eligible at this resolved stage'
                    : 'Not eligible — stage must be 4–6 and user must be affected'}
                </Text>
              </Stack>
            </Row>
          </Stack>

          <Stack gap={14}>
            <Stack gap={4}>
              <Text size="small" tone="secondary">Resolved stage</Text>
              <Row gap={8} align="center" wrap>
                <Pill tone="info" active>{STAGES.find((s) => s.value === finalValue)!.short}</Pill>
                <Pill tone="neutral">Resolved at {finalLevel}</Pill>
              </Row>
              <Text size="small" tone="tertiary">
                {STAGES.find((s) => s.value === finalValue)!.full}
              </Text>
            </Stack>

            <Stack gap={4}>
              <Text size="small" tone="secondary">Effect on this user</Text>
              <Pill tone={statusTone} active>{statusLabel}</Pill>
            </Stack>

            <Stack gap={4}>
              <Text size="small" tone="secondary">Audit event the SDK emits</Text>
              <pre style={{ margin: 0, fontSize: 11.5, lineHeight: '17px', whiteSpace: 'pre-wrap' }}>
{`{
  "eventType":     "PolicyEvaluated",
  "policyKey":     "ium.mfa.enforcement_stage",
  "resolvedValue": "${finalValue}",
  "resolvedLevel": "${finalLevel}",
  "tenantId":      12345,
  "appId":         "mfa-service",
  "userId":        99887,
  "userType":      "${userType}",
  "cacheHit":      true
}`}
              </pre>
            </Stack>
          </Stack>
        </Grid>
      </CardBody>
    </Card>
  );
}

// ─── Hierarchy ───────────────────────────────────────────────────────────────

function HierarchyTable() {
  return (
    <Table
      headers={['Level', 'Owner', 'Where it lives', 'Can do', 'Example']}
      columnAlign={['left', 'left', 'left', 'left', 'left']}
      rows={[
        ['L0', 'Platform Ops',  'PolicyService (Postgres)',           'Set platform-wide default and ceiling',          'Platform default = AdminsOnly'],
        ['L1', 'Tenant Admin',  'PolicyService (Postgres, per-tenant)', 'Tighten within L0 ceiling',                    'Tenant ACME → EmployeesOptOut'],
        ['L2', 'Application',   'Code-registered or PolicyService DB','Tighten further for this app',                  'mfa-service floor = AdminsAndPrivileged'],
        ['L3', 'User / Operator','PolicyService (per user, expiring)', 'Opt-out (when allowed) or emergency exception', 'User opt-out for 90 days'],
      ]}
    />
  );
}

// ─── MFA stage matrix ────────────────────────────────────────────────────────

function StageMatrix() {
  const cell = (stage: StageKey, user: UserType) => {
    const status = affected(stage, user);
    const optOut = status === 'required' && OPT_OUT_ELIGIBLE.includes(stage);
    if (status === 'none') return <Text tone="quaternary">—</Text>;
    if (status === 'optional') return <Pill tone="info" size="sm">Optional</Pill>;
    return (
      <Row gap={4} wrap>
        <Pill tone="warning" size="sm" active>Required</Pill>
        {optOut && <Pill tone="neutral" size="sm">opt-out</Pill>}
      </Row>
    );
  };

  const rows = STAGES.map((s) => [
    <Text weight="medium">{s.short}</Text>,
    cell(s.value, 'Admin'),
    cell(s.value, 'PrivilegedUser'),
    cell(s.value, 'Employee'),
    cell(s.value, 'Technician'),
    cell(s.value, 'Other'),
  ]);

  return (
    <Table
      headers={['Stage', 'Admin', 'Privileged', 'Employee', 'Technician', 'Other user']}
      columnAlign={['left', 'center', 'center', 'center', 'center', 'center']}
      rows={rows}
      striped
    />
  );
}

// ─── Override lifecycle ──────────────────────────────────────────────────────

function OverrideLifecycle() {
  const theme = useHostTheme();
  const stepBorder = theme.stroke.secondary;
  const stepBg = theme.bg.elevated;
  const numBg = theme.fill.secondary;

  const steps: { actor: string; tone: 'info' | 'neutral' | 'success'; title: string; detail: ReactNode }[] = [
    { actor: 'Tenant Admin', tone: 'info', title: 'Submit override via MFE',
      detail: <Text size="small">Picks a new stage in the embedded <Code>policy-panel</Code>, clicks Save.</Text> },
    { actor: 'PolicyService', tone: 'neutral', title: 'Validate + persist',
      detail: <Text size="small">Checks the new value against L0 bounds, atomically revokes old L1 row, inserts new <Code>PolicyInstance</Code>.</Text> },
    { actor: 'PolicyService', tone: 'neutral', title: 'Publish change event',
      detail: <Text size="small">Emits <Code>PolicyInstanceChanged</Code> to ServiceBus topic <Code>policy-changes</Code> with routing key <Code>(tenantId=12345, policyKey=...)</Code>.</Text> },
    { actor: 'SDK', tone: 'neutral', title: 'Invalidate caches across apps',
      detail: <Text size="small">All app SDKs subscribed for this (tenant, policy) receive the event and evict their local cache entry.</Text> },
    { actor: 'Audit Sink', tone: 'neutral', title: 'Index audit record',
      detail: <Text size="small">Consumes the same event from a separate subscription, enriches with tenant name, bulk-indexes to <Code>policy-changes-YYYY.MM</Code>.</Text> },
    { actor: 'Dashboard', tone: 'success', title: 'New state visible',
      detail: <Text size="small">Central Admin and tenant dashboards reflect the change on the next query (typically &lt;5 seconds after the save).</Text> },
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
          <Stack gap={4} style={{ flex: 1, minWidth: 0, padding: 12, border: `1px solid ${stepBorder}`, borderRadius: 6, background: stepBg }}>
            <Row gap={8} align="center" wrap>
              <Text weight="semibold">{s.title}</Text>
              <Pill tone={s.tone} size="sm">{s.actor}</Pill>
            </Row>
            {s.detail}
          </Stack>
        </Row>
      ))}
    </Stack>
  );
}
