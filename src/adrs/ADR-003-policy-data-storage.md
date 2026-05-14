# ADR-003: Policy Data Storage and Schema Management

**Status**: Proposed  
**Date**: 2026-05-11  
**Authors**: Identity Team  
**Relates to**: ADR-001 (SDK), ADR-002 (Override Flows), ADR-004 (Audit), ADR-007 (DDL)

---

## Context

The policy system introduces two new entity families:

1. **PolicyDefinition** — the schema/contract for a policy (what values are allowed, who can override it, what the default is). This is owned and versioned centrally.
2. **PolicyInstance** — a runtime value for a specific scope (L0 global, L1 tenant, L2 app, L3 user). These are written frequently (every tenant config change, every user opt-out).

The storage decisions must answer:
- Where are L0–L3 instances stored: **centrally in PolicyService**, or **app-local with sync**?
- How do we handle **schema evolution** when a policy definition changes incompatibly?
- How do we support **future requirement changes** without full database migrations?

---

## Decision

### Storage Topology

| Data | Location | Rationale |
|------|----------|-----------|
| PolicyDefinitions | PolicyService PostgreSQL | Single source of truth; only changes via deployment or operator action |
| L0 instances | PolicyService PostgreSQL | Platform-wide; must be strongly consistent with definitions |
| L1 instances | PolicyService PostgreSQL | Per-tenant; must be authoritative for SDK cache invalidation |
| L2 instances | PolicyService PostgreSQL (primary) + app-local optional copy | Central storage enables uniform audit; app-local copy allows resilience |
| L3 instances | PolicyService PostgreSQL | Cross-app consistency required: a user's opt-out must apply everywhere |
| Audit events | Elasticsearch `policy-audit-*` | Append-only, searchable, decoupled from operational DB |

**L2 split-brain concern**: Some applications (e.g. `mfa-service`) have policy logic baked into code via `IPolicyOverrideProvider<T>` (ADR-001). These code-registered L2 overrides are never written to the DB — they exist only at the app level and are visible in the audit trail via `PolicyEvaluated` events tagged `ResolvedLevel=L2-code`. For DB-backed L2 overrides (runtime-configurable), the app writes to PolicyService via the service account API.

---

## Schema Design

### `policy_definitions` table

```sql
CREATE TABLE policy_definitions (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    key             TEXT          NOT NULL,           -- e.g. 'policy.mfa.enforcement_stage'
    version         INT           NOT NULL DEFAULT 1,
    name            TEXT          NOT NULL,
    description     TEXT,
    value_type      TEXT          NOT NULL,           -- 'Enum' | 'Bool' | 'Int' | 'String' | 'Json'
    allowed_values  JSONB,                            -- null = unconstrained; array for enum/discrete
    default_value   TEXT          NOT NULL,
    scope           TEXT          NOT NULL,           -- 'Global' | 'PerTenant' | 'PerApp' | 'PerUser'
    -- Overridability flags
    l1_allowed          BOOLEAN NOT NULL DEFAULT true,
    l1_relaxation_allowed BOOLEAN NOT NULL DEFAULT false,
    l2_allowed          BOOLEAN NOT NULL DEFAULT true,
    l3_allowed          BOOLEAN NOT NULL DEFAULT false,
    opt_in_allowed      BOOLEAN NOT NULL DEFAULT false,
    opt_out_allowed     BOOLEAN NOT NULL DEFAULT false,
    opt_out_eligible_values JSONB,                   -- which enum values permit L3 opt-out
    applicable_user_types   JSONB,                   -- null = all
    -- Lifecycle
    is_active       BOOLEAN       NOT NULL DEFAULT true,
    superseded_by   UUID          REFERENCES policy_definitions(id),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_by      TEXT          NOT NULL,
    UNIQUE (key, version)
);

CREATE INDEX idx_policy_definitions_key ON policy_definitions(key) WHERE is_active;
```

**Immutability rule**: once a `policy_definitions` row is active and has instances referencing it, it is never modified. Breaking changes produce a new row with `version = old_version + 1` and the old row gets `is_active = false, superseded_by = new_id`.

### `policy_instances` table

```sql
CREATE TABLE policy_instances (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_definition_id UUID       NOT NULL REFERENCES policy_definitions(id),
    definition_version  INT         NOT NULL,
    level               TEXT        NOT NULL,   -- 'L0' | 'L1' | 'L2' | 'L3'
    -- Scope columns (exactly the set appropriate for the level is non-null)
    tenant_id           INT,
    app_id              TEXT,
    user_id             INT,
    -- Value
    value               TEXT        NOT NULL,
    -- Validity window
    effective_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ,
    -- Override metadata
    override_reason     TEXT,
    approved_by         TEXT,
    approved_at         TIMESTAMPTZ,
    ticket_ref          TEXT,
    -- Lifecycle
    status              TEXT        NOT NULL DEFAULT 'Active',  -- 'Active' | 'Revoked' | 'Expired'
    superseded_by       UUID        REFERENCES policy_instances(id),
    -- Audit
    created_by          TEXT        NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_level_scope CHECK (
        (level = 'L0' AND tenant_id IS NULL AND app_id IS NULL AND user_id IS NULL) OR
        (level = 'L1' AND tenant_id IS NOT NULL AND app_id IS NULL AND user_id IS NULL) OR
        (level = 'L2' AND tenant_id IS NOT NULL AND app_id IS NOT NULL AND user_id IS NULL) OR
        (level = 'L3' AND user_id IS NOT NULL)
    )
);

-- Primary lookup path for the SDK evaluator
CREATE INDEX idx_pi_lookup ON policy_instances(policy_definition_id, level, tenant_id, app_id)
    WHERE status = 'Active';

-- L3 user lookup (separate index because userId is nullable)
CREATE INDEX idx_pi_user ON policy_instances(policy_definition_id, user_id)
    WHERE level = 'L3' AND status = 'Active';

-- Expiry job scan
CREATE INDEX idx_pi_expiry ON policy_instances(expires_at)
    WHERE status = 'Active' AND expires_at IS NOT NULL;

-- Tenant partitioning for large-scale deployments (future)
-- PARTITION BY LIST (tenant_id) when tenant count exceeds 10k
```

### Single-active-instance constraint

Enforced at the application level (not DB constraint, to allow atomic supersession):

```sql
-- Before inserting a new Active instance, atomically revoke the old one:
BEGIN;
UPDATE policy_instances
   SET status = 'Revoked', superseded_by = :new_id, updated_at = NOW()
 WHERE policy_definition_id = :def_id
   AND level = :level
   AND tenant_id IS NOT DISTINCT FROM :tenant_id
   AND app_id IS NOT DISTINCT FROM :app_id
   AND user_id IS NOT DISTINCT FROM :user_id
   AND status = 'Active';

INSERT INTO policy_instances (...) VALUES (...);
COMMIT;
```

---

## App-Specific Policy Data (L2)

Applications that need their own local policy storage (for offline resilience or high-frequency reads) may maintain a **read replica** of their L2 instances. The recommended pattern:

1. On startup, the SDK fetches all L2 instances for `(appId, tenantId)` from PolicyService and writes them to a local in-process cache (TTL 5 min).
2. On `PolicyInstanceChanged` ServiceBus event, the cache is invalidated and re-fetched.
3. For apps that want DB-level durability, the app may persist the L2 snapshot to its own schema table `policy_instance_cache(policy_key, tenant_id, value, fetched_at)`. This cache is never the source of truth — it is always refreshed from PolicyService.

There is **no bidirectional sync** of L2 data. Apps write to PolicyService via the service account API; they never write to the local cache directly.

---

## Schema Evolution Strategy

### Case 1: Non-breaking change (new allowed value added to enum)

```sql
-- Update the definition's allowed_values in-place
-- (the only safe mutation on an active definition)
UPDATE policy_definitions
   SET allowed_values = allowed_values || '["NewStage"]'::jsonb
 WHERE key = 'policy.mfa.enforcement_stage' AND is_active = true;
```

Existing instances are unaffected. The SDK automatically accepts the new value once apps restart (or on next cache refresh).

### Case 2: Rename of an enum member (breaking)

```sql
-- 1. Insert new definition version
INSERT INTO policy_definitions (key, version, ..., default_value, ...)
VALUES ('policy.mfa.enforcement_stage', 2, ..., 'EmployeesCanOptOut', ...);

-- 2. Deactivate old definition
UPDATE policy_definitions
   SET is_active = false,
       superseded_by = :new_def_id
 WHERE key = 'policy.mfa.enforcement_stage' AND version = 1;
```

Apps register a migrator to translate old enum ordinals read from existing `policy_instances` rows:

```csharp
public class MfaStageV1ToV2Migrator : IPolicyValueMigrator<MfaEnforcementStage>
{
    public string PolicyKey        => WellKnownPolicies.MfaEnforcementStage;
    public int    FromVersion      => 1;
    public int    ToVersion        => 2;

    public MfaEnforcementStage Migrate(string rawValue) =>
        rawValue switch
        {
            "EmployeesOptOut"         => MfaEnforcementStage.EmployeesCanOptOut,
            "EmployeesAndTechsOptOut" => MfaEnforcementStage.EmployeesAndTechsCanOptOut,
            _                        => Enum.Parse<MfaEnforcementStage>(rawValue)
        };
}
```

Old `policy_instances` rows retain their original `value` text and `definition_version = 1`. The migrator is applied at read time by the SDK. Once all instances have been rewritten to the new values (background migration job), the migrator can be removed.

### Case 3: Entirely new policy

Simply insert a new `policy_definitions` row. No migration needed. The platform default (L0) is bootstrapped via a seed migration script when PolicyService is deployed.

### Case 4: Policy retirement

```sql
UPDATE policy_definitions SET is_active = false WHERE key = 'policy.legacy.feature_flag';
```

The SDK returns the definition's `default_value` for any evaluation after retirement. Existing L1/L2/L3 instances are archived (status = 'Expired') by a background cleanup job.

---

## Data Retention

| Data | Retention |
|------|-----------|
| Active `policy_instances` | Indefinite (until Revoked/Expired) |
| Revoked/Expired `policy_instances` | 7 years (compliance) |
| `policy_definitions` (all versions) | Indefinite |
| Audit events in Elasticsearch | 2 years hot, then cold tier |
| `PolicyEvaluated` sampled events | 90 days |

Data deletion must go through the standard data-retention pipeline, not ad hoc SQL.

---

## Future Schema Extensibility

The `policy_instances` table uses `value TEXT` (not a typed column) and `JSONB` for `allowed_values`. This is intentional: adding a new value type (e.g., a complex JSON policy document) requires no DDL change — only a new `policy_definitions` row with `value_type = 'Json'` and corresponding SDK serializer registration.

For multi-dimensional scoping (e.g., per-role within a tenant, per-feature-flag combination), the `scope_key` pattern can be extended with a `scope_extensions JSONB` column added to `policy_instances` without breaking existing rows:

```sql
ALTER TABLE policy_instances ADD COLUMN scope_extensions JSONB;
```

Existing instances have `scope_extensions = NULL`, treated as "no additional constraints."

---

## Operational Concerns

- **Backup**: PolicyService DB is backed up every 6 hours with PITR enabled (same policy as other microservice DBs).
- **Read replicas**: PolicyService exposes a read-only endpoint backed by a PostgreSQL read replica for SDK cache-refresh calls, to isolate read load from writes.
- **Partition readiness**: When tenant count exceeds ~10,000, add `PARTITION BY LIST (tenant_id)` on `policy_instances`. The index and constraint design is compatible with declarative partitioning; no schema change needed beyond the DDL migration.

---

## Consequences

**Positive**
- Single PostgreSQL database for all operational policy data is operationally simple and consistent.
- JSONB `allowed_values` and `value TEXT` provide flexibility without frequent DDL changes.
- Versioned definitions preserve history and allow rolling migration without downtime.
- Immutability of active definitions eliminates class of bugs where a definition change silently invalidates existing instances.

**Negative / Risks**
- All L3 writes (user opt-outs) flow through PolicyService — at scale (millions of users), this is the hot path. Mitigated by: read replica for evaluations, partitioning by `user_id` range on L3 rows, and batching opt-out writes.
- App-local L2 cache creates a dual-write path (app writes to PolicyService, then PolicyService change event refreshes app cache). Network partitions between app and PolicyService require the app to serve stale L2 values — acceptable given 5-minute TTL and non-safety-critical nature of L2 overrides.
