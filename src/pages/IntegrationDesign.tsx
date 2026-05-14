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
import { AdrLink } from '@/components/AdrLink';
import { SectionHeading } from '@/components/SectionHeading';

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

type Role = 'admin' | 'manager' | 'employee' | 'technician' | 'other';
const ROLES: { value: Role; label: string }[] = [
  { value: 'admin',      label: 'admin' },
  { value: 'manager',    label: 'manager' },
  { value: 'employee',   label: 'employee' },
  { value: 'technician', label: 'technician' },
  { value: 'other',      label: 'other' },
];

type Environment = 'Monolith' | 'EnterpriseHub' | 'Mobile' | 'AdminPortal';
const ENVIRONMENTS: { value: Environment; label: string }[] = [
  { value: 'Monolith',      label: 'Monolith (Go)' },
  { value: 'EnterpriseHub', label: 'Enterprise Hub' },
  { value: 'Mobile',        label: 'Mobile' },
  { value: 'AdminPortal',   label: 'Admin Portal' },
];

type TenantRoleFilter = 'any' | 'admin' | 'employee';
const TENANT_ROLE_FILTERS: { value: TenantRoleFilter; label: string }[] = [
  { value: 'any',      label: 'any role' },
  { value: 'admin',    label: 'admins only' },
  { value: 'employee', label: 'employees only' },
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

type ResolvedLevel = 'Platform' | 'Org' | 'Tenant' | 'App' | 'Group';

interface ResolveInput {
  platform: StageKey;
  org:      StageKey | '';
  tenant:   StageKey | '';
  tenantFilter: TenantRoleFilter;
  app:      StageKey | '';
  group:    StageKey | '';
  inGroup:  boolean;
  role:     Role;
}

function resolveStage(input: ResolveInput): { value: StageKey; level: ResolvedLevel } {
  let value: StageKey = input.platform;
  let level: ResolvedLevel = 'Platform';
  // Org tightens Platform
  if (input.org && stageIdx(input.org as StageKey) > stageIdx(value)) {
    value = input.org as StageKey;
    level = 'Org';
  }
  // Tenant tightens Org (subject to role filter)
  if (input.tenant && stageIdx(input.tenant as StageKey) > stageIdx(value)) {
    const matchesRole =
      input.tenantFilter === 'any' ||
      (input.tenantFilter === 'admin'    && input.role === 'admin') ||
      (input.tenantFilter === 'employee' && input.role === 'employee');
    if (matchesRole) {
      value = input.tenant as StageKey;
      level = 'Tenant';
    }
  }
  // App tightens Tenant
  if (input.app && stageIdx(input.app as StageKey) > stageIdx(value)) {
    value = input.app as StageKey;
    level = 'App';
  }
  // Group applies only when the user is in the group
  if (input.group && input.inGroup && stageIdx(input.group as StageKey) > stageIdx(value)) {
    value = input.group as StageKey;
    level = 'Group';
  }
  return { value, level };
}

// ─── Page root ────────────────────────────────────────────────────────────────

export default function IntegrationDesign() {
  return (
    <Stack gap={28} style={{ padding: 24 }}>
      <Header />
      <SummaryStats />

      <Stack gap={12}>
        <SectionHeading
          term="integration:topology"
          title="Service topology"
          subtitle="Integration design"
        >
          Service topology
        </SectionHeading>
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
        <SectionHeading
          term="integration:simulator"
          title="Policy resolution simulator"
          subtitle="Integration design"
        >
          Policy resolution simulator
        </SectionHeading>
        <Text tone="secondary">
          Try the <Code>policy.mfa.enforcement_stage</Code> policy. Pick values at each of the six levels
          plus role/environment context. The right pane shows which level wins, the role-filter behavior,
          whether the user is required, and the exact <Code>PolicyEvaluated</Code> audit event emitted.
        </Text>
        <Simulator />
      </Stack>

      <Stack gap={12}>
        <SectionHeading
          term="integration:hierarchy"
          title="Hierarchy at a glance"
          subtitle="Integration design"
        >
          Hierarchy at a glance
        </SectionHeading>
        <HierarchyTable />
      </Stack>

      <Stack gap={12}>
        <SectionHeading
          term="integration:stage-matrix"
          title="MFA enforcement stages"
          subtitle="Integration design"
        >
          MFA enforcement stages
        </SectionHeading>
        <Text tone="secondary">
          Each stage covers a strictly larger set of user types than the one below. Stages 4–6 permit
          per-user opt-out.
        </Text>
        <StageMatrix />
      </Stack>

      <Stack gap={12}>
        <SectionHeading
          term="integration:lifecycle"
          title="Lifecycle of a tenant override"
          subtitle="Integration design"
        >
          Lifecycle of a tenant override
        </SectionHeading>
        <Text tone="secondary">
          What happens when a tenant admin changes <Code>policy.mfa.enforcement_stage</Code> from
          <Text as="span"> </Text><Code>AdminsOnly</Code> to <Code>EmployeesOptOut</Code>.
        </Text>
        <OverrideLifecycle />
      </Stack>

      <Callout tone="info" title="Where this lives in code">
        PolicyService → new <Code>policy-service</Code> repo. SDK → internal NuGet
        (<Code>PolicyFramework</Code>). Frontend client + admin component → internal npm packages
        (<Code>policy-client</Code>, <Code>policy-panel</Code>). The full architecture is captured
        in <a href="#/adrs" className="adr-inline-link">ten ADRs</a>: foundational design
        (<AdrLink id="001" /> through <AdrLink id="007" />) and PRD-driven extensions
        (<AdrLink id="008">ADR-008 scope hierarchy</AdrLink>,
        <Text as="span"> </Text><AdrLink id="009">ADR-009 composition + side effects</AdrLink>,
        <Text as="span"> </Text><AdrLink id="010">ADR-010 drafts + exemptions</AdrLink>).
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
        Centralized policy management with a six-level hierarchy
        (Platform → Org → Tenant → App → Group → User), role + environment + action
        targeting, event-driven cache invalidation, and a distributed audit pipeline.
      </Text>
    </Stack>
  );
}

function SummaryStats() {
  return (
    <Grid columns={4} gap={16}>
      <Stat value="6"  label="Scope levels" tone="info" />
      <Stat value="5+" label="Apps integrated via SDK" />
      <Stat value="10" label="ADRs" />
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
  const [platform,     setPlatform]     = useCanvasState<StageKey>      ('sim.platform',     'Disabled');
  const [org,          setOrg]          = useCanvasState<StageKey | ''> ('sim.org',          '');
  const [tenant,       setTenant]       = useCanvasState<StageKey | ''> ('sim.tenant',       'EmployeesOptOut');
  const [tenantFilter, setTenantFilter] = useCanvasState<TenantRoleFilter>('sim.tenantFilter','any');
  const [app,          setApp]          = useCanvasState<StageKey | ''> ('sim.app',          '');
  const [group,        setGroup]        = useCanvasState<StageKey | ''> ('sim.group',        '');
  const [inGroup,      setInGroup]      = useCanvasState<boolean>       ('sim.inGroup',      false);
  const [optedOut,     setOptedOut]     = useCanvasState<boolean>       ('sim.optedOut',     false);
  const [userType,     setUserType]     = useCanvasState<UserType>      ('sim.userType',     'Employee');
  const [role,         setRole]         = useCanvasState<Role>          ('sim.role',         'employee');
  const [environment,  setEnvironment]  = useCanvasState<Environment>   ('sim.env',          'Monolith');

  const resolved = resolveStage({
    platform, org, tenant, tenantFilter, app, group, inGroup, role,
  });
  const userStatus = affected(resolved.value, userType);
  const optOutAvailable = userStatus === 'required' && OPT_OUT_ELIGIBLE.includes(resolved.value);
  const effectiveStatus: 'required' | 'optional' | 'none' =
    optedOut && optOutAvailable ? 'none' : userStatus;
  const finalValue: StageKey = optedOut && optOutAvailable ? 'Disabled' : resolved.value;
  const finalLevel: string = optedOut && optOutAvailable ? 'User (opt-out)' : resolved.level;

  const stageOptions = STAGES.map((s) => ({ value: s.value, label: s.short }));
  const stageOptionsNullable = [{ value: '', label: 'None — inherit' }, ...stageOptions];
  const userOptions = USER_TYPES.map((u) => ({ value: u.value, label: u.label }));
  const roleOptions = ROLES.map((r) => ({ value: r.value, label: r.label }));
  const envOptions  = ENVIRONMENTS.map((e) => ({ value: e.value, label: e.label }));
  const tenantFilterOptions = TENANT_ROLE_FILTERS.map((f) => ({ value: f.value, label: f.label }));

  const statusTone: 'success' | 'warning' | 'danger' | 'info' =
    effectiveStatus === 'required' ? 'warning'
    : effectiveStatus === 'optional' ? 'info'
    : 'success';
  const statusLabel =
    effectiveStatus === 'required' ? 'User is REQUIRED to do MFA'
    : effectiveStatus === 'optional' ? 'MFA is OPTIONAL for this user'
    : 'MFA is NOT REQUIRED for this user';

  // Was the Tenant override skipped because of the role filter? Useful UX cue.
  const tenantSkippedByRole =
    tenant !== '' &&
    stageIdx(tenant as StageKey) > stageIdx(platform) &&
    !(tenantFilter === 'any' ||
      (tenantFilter === 'admin' && role === 'admin') ||
      (tenantFilter === 'employee' && role === 'employee'));

  return (
    <Card>
      <CardHeader>policy.mfa.enforcement_stage</CardHeader>
      <CardBody>
        <Grid columns="minmax(0, 1.1fr) minmax(0, 1fr)" gap={24}>
          {/* ── Controls ─────────────────────────────────────────────────── */}
          <Stack gap={14}>
            <Text size="small" tone="secondary" weight="semibold">Hierarchy (most general → most specific)</Text>

            <Stack gap={4}>
              <Text size="small" tone="secondary">Platform default</Text>
              <Select value={platform} onChange={(v) => setPlatform(v as StageKey)} options={stageOptions} />
            </Stack>

            <Stack gap={4}>
              <Text size="small" tone="secondary">Org override</Text>
              <Select value={org} onChange={(v) => setOrg(v as StageKey | '')} options={stageOptionsNullable} />
            </Stack>

            <Stack gap={4}>
              <Text size="small" tone="secondary">Tenant override</Text>
              <Select value={tenant} onChange={(v) => setTenant(v as StageKey | '')} options={stageOptionsNullable} />
              <Row align="center" gap={8}>
                <Text size="small" tone="tertiary">applies_to_roles =</Text>
                <Select
                  value={tenantFilter}
                  onChange={(v) => setTenantFilter(v as TenantRoleFilter)}
                  options={tenantFilterOptions}
                  style={{ width: 160 }}
                />
              </Row>
            </Stack>

            <Stack gap={4}>
              <Text size="small" tone="secondary">App floor (code or DB)</Text>
              <Select value={app} onChange={(v) => setApp(v as StageKey | '')} options={stageOptionsNullable} />
            </Stack>

            <Stack gap={4}>
              <Text size="small" tone="secondary">Group exemption / floor</Text>
              <Select value={group} onChange={(v) => setGroup(v as StageKey | '')} options={stageOptionsNullable} />
              <Row align="center" gap={8}>
                <Toggle checked={inGroup} onChange={setInGroup} />
                <Text size="small" tone="tertiary">User is in target group</Text>
              </Row>
            </Stack>

            <Divider />

            <Text size="small" tone="secondary" weight="semibold">Evaluation context</Text>

            <Row gap={8} wrap>
              <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                <Text size="small" tone="secondary">User type</Text>
                <Select value={userType} onChange={(v) => setUserType(v as UserType)} options={userOptions} />
              </Stack>
              <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                <Text size="small" tone="secondary">Role</Text>
                <Select value={role} onChange={(v) => setRole(v as Role)} options={roleOptions} />
              </Stack>
            </Row>

            <Stack gap={4}>
              <Text size="small" tone="secondary">Environment</Text>
              <Select value={environment} onChange={(v) => setEnvironment(v as Environment)} options={envOptions} />
            </Stack>

            <Divider />

            <Row align="center" gap={12}>
              <Toggle checked={optedOut} onChange={setOptedOut} disabled={!optOutAvailable} />
              <Stack gap={2}>
                <Text size="small" weight="semibold">User opt-out</Text>
                <Text size="small" tone="tertiary">
                  {optOutAvailable
                    ? 'Eligible at this resolved stage'
                    : 'Not eligible — stage must be 4–6 and user must be affected'}
                </Text>
              </Stack>
            </Row>
          </Stack>

          {/* ── Result ───────────────────────────────────────────────────── */}
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

            {tenantSkippedByRole && (
              <Stack gap={2}>
                <Text size="small" tone="secondary">Note</Text>
                <Pill tone="warning" size="sm">Tenant override skipped — role filter didn&rsquo;t match</Pill>
              </Stack>
            )}

            <Stack gap={4}>
              <Text size="small" tone="secondary">Effect on this user</Text>
              <Pill tone={statusTone} active>{statusLabel}</Pill>
            </Stack>

            <Stack gap={4}>
              <Text size="small" tone="secondary">Audit event the SDK emits</Text>
              <pre style={{ margin: 0, fontSize: 11.5, lineHeight: '17px', whiteSpace: 'pre-wrap' }}>
{`{
  "eventType":     "PolicyEvaluated",
  "policyKey":     "policy.mfa.enforcement_stage",
  "resolvedValue": "${finalValue}",
  "resolvedLevel": "${finalLevel}",
  "context": {
    "orgId":       ${org ? '42' : 'null'},
    "tenantId":    12345,
    "appId":       "mfa-service",
    "userId":      99887,
    "userType":    "${userType}",
    "roles":       ["${role}"],
    "environment": "${environment}",
    "inGroup":     ${inGroup}
  },
  "cacheHit": true
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
        ['Platform', 'Platform Ops',  'PolicyService (Postgres) — seeded via Flyway', 'Set platform-wide default and ceiling',                      'Platform default = AdminsOnly'],
        ['Org',      'Org Admin',     'PolicyService (per-org)',                       'Tighten across all tenants in a franchise',                  'NorthRegion org → AdminsAndPrivileged'],
        ['Tenant',   'Tenant Admin',  'PolicyService (per-tenant)',                    'Tighten within Org / Platform ceiling',                      'Tenant ACME → EmployeesOptOut'],
        ['App',      'Application',   'Code-registered or PolicyService DB',           'Tighten further for this app; code floors win over DB',      'mfa-service floor = AdminsAndPrivileged'],
        ['Group',    'Tenant Admin / Approver', 'PolicyService (per-group, expiring)', 'Grant group-scoped exemption (via approved request)',        'Sales team exemption from MFA stage 5 for 90 days'],
        ['User',     'User / Operator', 'PolicyService (per-user, expiring)',          'Opt-out (when allowed) or emergency operator exception',     'User opt-out for 90 days'],
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
      detail: <Text size="small">Picks a new stage in the embedded <Code>policy-panel</Code>. May save as Draft first, then activate (<AdrLink id="010" />).</Text> },
    { actor: 'PolicyService', tone: 'neutral', title: 'Validate + persist',
      detail: <Text size="small">Checks against Platform/Org bounds and definition flags (<Code>tenant_allowed</Code>, <Code>relaxation_allowed_at</Code>), atomically revokes prior Tenant row, inserts the new <Code>PolicyInstance</Code> at level <Code>Tenant</Code>.</Text> },
    { actor: 'PolicyService', tone: 'neutral', title: 'Publish change event',
      detail: <Text size="small">Emits <Code>PolicyInstanceChanged</Code> to ServiceBus topic <Code>policy-changes</Code> with routing key <Code>(tenantId=12345, policyKey=...)</Code>.</Text> },
    { actor: 'SDK', tone: 'neutral', title: 'Invalidate caches across apps',
      detail: <Text size="small">All app SDKs subscribed for this <Code>(tenant, policy)</Code> receive the event and evict their local cache entry. Any registered <Code>IPolicyChangeHandler</Code> also runs (<AdrLink id="009">ADR-009 side effects</AdrLink>).</Text> },
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
