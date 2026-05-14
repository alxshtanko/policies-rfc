# ADR-007: PolicyService Data Models and PostgreSQL Schema

**Status**: Proposed  
**Date**: 2026-05-11  
**Authors**: Identity Team  
**Relates to**: ADR-003 (Storage Strategy), ADR-005 (PolicyService API)
**Extended by**: ADR-008 (named-level scope + new scope columns), ADR-009 (`value_schema`, catalog tables, dependencies), ADR-010 (`status` extensions, plans, exemption requests)

> **Forward-reference**: this ADR captures the original (numeric) Platform/Tenant/App/User
> hierarchy and its three tables. ADR-008 renames levels and adds Org + Group; ADR-009
> introduces `mfa_factor`, `auth_provider`, `policy_action`, and `policy_dependency`;
> ADR-010 expands `policy_instances.status` and adds `policy_plan` + `exemption_request`.
> All deltas land via Flyway migrations V010+ in a coordinated rollout.

---

## Context

This document provides the authoritative, deployment-ready data model for PolicyService. It supplements ADR-003 (which discusses the *why*) with precise DDL, index strategy, and migration sequencing.

All tables live in the `policy` schema inside the `ium-policy` PostgreSQL database, consistent with the `ium-*` microservice database naming convention.

---

## Full DDL

### Bootstrap

```sql
CREATE SCHEMA IF NOT EXISTS policy;
SET search_path = policy;

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

### Table: `policy_definitions`

```sql
CREATE TABLE policy.policy_definitions (
    id                      UUID        NOT NULL DEFAULT gen_random_uuid(),
    key                     TEXT        NOT NULL,
    version                 INT         NOT NULL DEFAULT 1,
    name                    TEXT        NOT NULL,
    description             TEXT,

    -- Value contract
    value_type              TEXT        NOT NULL
        CHECK (value_type IN ('Enum', 'Bool', 'Int', 'String', 'Json')),
    allowed_values          JSONB,          -- null = unconstrained
    default_value           TEXT        NOT NULL,

    -- Scoping
    scope                   TEXT        NOT NULL
        CHECK (scope IN ('Global', 'PerTenant', 'PerApp', 'PerUser')),

    -- Overridability flags
    l1_allowed              BOOLEAN     NOT NULL DEFAULT TRUE,
    l1_relaxation_allowed   BOOLEAN     NOT NULL DEFAULT FALSE,
    l2_allowed              BOOLEAN     NOT NULL DEFAULT TRUE,
    l3_allowed              BOOLEAN     NOT NULL DEFAULT FALSE,
    opt_in_allowed          BOOLEAN     NOT NULL DEFAULT FALSE,
    opt_out_allowed         BOOLEAN     NOT NULL DEFAULT FALSE,
    opt_out_eligible_values JSONB,          -- array of enum values; null = none
    applicable_user_types   JSONB,          -- array of user type strings; null = all

    -- Ordering hint for ordered enums (true = higher ordinal = more restrictive)
    is_ordered_enum         BOOLEAN     NOT NULL DEFAULT FALSE,

    -- Lifecycle
    is_active               BOOLEAN     NOT NULL DEFAULT TRUE,
    superseded_by           UUID        REFERENCES policy.policy_definitions(id),
    deprecated_at           TIMESTAMPTZ,
    created_by              TEXT        NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_policy_definitions PRIMARY KEY (id),
    CONSTRAINT uq_policy_def_key_version UNIQUE (key, version)
);

-- Active definition lookup by key (SDK and API hot path)
CREATE INDEX idx_pd_active_key
    ON policy.policy_definitions(key)
    WHERE is_active = TRUE;

-- History queries (all versions of a key)
CREATE INDEX idx_pd_key_version
    ON policy.policy_definitions(key, version DESC);

COMMENT ON TABLE policy.policy_definitions IS
    'Immutable-when-active schema definitions for each policy. '
    'Breaking changes create a new row (version+1); old row is deactivated.';
```

### Table: `policy_instances`

```sql
CREATE TABLE policy.policy_instances (
    id                      UUID        NOT NULL DEFAULT gen_random_uuid(),

    -- Definition reference
    policy_definition_id    UUID        NOT NULL
        REFERENCES policy.policy_definitions(id),
    definition_version      INT         NOT NULL,

    -- Hierarchy level
    level                   TEXT        NOT NULL
        CHECK (level IN ('L0', 'L1', 'L2', 'L3')),

    -- Scope (one set of columns populated per level)
    tenant_id               INT,
    app_id                  TEXT,
    user_id                 INT,

    -- Value
    value                   TEXT        NOT NULL,

    -- Validity window
    effective_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at              TIMESTAMPTZ,

    -- Override / exception metadata
    override_reason         TEXT,
    approved_by             TEXT,
    approved_at             TIMESTAMPTZ,
    ticket_ref              TEXT,

    -- Lifecycle
    status                  TEXT        NOT NULL DEFAULT 'Active'
        CHECK (status IN ('Active', 'Revoked', 'Expired')),
    superseded_by           UUID        REFERENCES policy.policy_instances(id),
    revoked_at              TIMESTAMPTZ,
    revoked_by              TEXT,

    -- Audit
    created_by              TEXT        NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_policy_instances PRIMARY KEY (id),

    -- Scope integrity: exactly the right columns non-null per level
    CONSTRAINT chk_l0_scope CHECK (
        level != 'L0' OR (tenant_id IS NULL AND app_id IS NULL AND user_id IS NULL)
    ),
    CONSTRAINT chk_l1_scope CHECK (
        level != 'L1' OR (tenant_id IS NOT NULL AND app_id IS NULL AND user_id IS NULL)
    ),
    CONSTRAINT chk_l2_scope CHECK (
        level != 'L2' OR (tenant_id IS NOT NULL AND app_id IS NOT NULL AND user_id IS NULL)
    ),
    CONSTRAINT chk_l3_scope CHECK (
        level != 'L3' OR (user_id IS NOT NULL)
    ),

    -- Emergency exceptions require a ticket reference
    CONSTRAINT chk_exception_ticket CHECK (
        approved_by IS NULL OR ticket_ref IS NOT NULL
    )
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

-- Primary hot path: SDK bulk fetch and evaluate (L0 + L1 per tenant)
CREATE INDEX idx_pi_l0_l1_lookup
    ON policy.policy_instances(policy_definition_id, level, tenant_id)
    WHERE status = 'Active'
      AND level IN ('L0', 'L1');

-- L2 lookup (app+tenant scoped)
CREATE INDEX idx_pi_l2_lookup
    ON policy.policy_instances(policy_definition_id, app_id, tenant_id)
    WHERE status = 'Active'
      AND level = 'L2';

-- L3 lookup (user scoped — separate because user_id nullable in most rows)
CREATE INDEX idx_pi_l3_lookup
    ON policy.policy_instances(policy_definition_id, user_id)
    WHERE status = 'Active'
      AND level = 'L3';

-- Expiry background job scan
CREATE INDEX idx_pi_expiry_scan
    ON policy.policy_instances(expires_at)
    WHERE status = 'Active'
      AND expires_at IS NOT NULL;

-- Tenant-scoped admin queries (history view, audit)
CREATE INDEX idx_pi_tenant_history
    ON policy.policy_instances(tenant_id, policy_definition_id, created_at DESC)
    WHERE tenant_id IS NOT NULL;

-- User history
CREATE INDEX idx_pi_user_history
    ON policy.policy_instances(user_id, policy_definition_id, created_at DESC)
    WHERE user_id IS NOT NULL;

COMMENT ON TABLE policy.policy_instances IS
    'Runtime values for each policy at each scope level (L0–L3). '
    'Rows are never hard-deleted; lifecycle is managed via the status column.';
```

### Table: `policy_instance_lock` (for optimistic concurrency)

```sql
-- ETag support: tracks the last-write version per active instance slot.
-- Used by the upsert procedure to detect concurrent modifications.
CREATE TABLE policy.policy_instance_lock (
    policy_definition_id    UUID    NOT NULL,
    level                   TEXT    NOT NULL,
    tenant_id               INT,
    app_id                  TEXT,
    user_id                 INT,
    current_instance_id     UUID    NOT NULL,
    version                 BIGINT  NOT NULL DEFAULT 1,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_policy_instance_lock
        PRIMARY KEY (policy_definition_id, level,
                     COALESCE(tenant_id, -1),
                     COALESCE(app_id, ''),
                     COALESCE(user_id, -1))
);
```

### Stored Procedure: atomic upsert

```sql
-- Atomically revoke the old active instance and insert the new one.
-- Returns the new instance id, or raises an exception on ETag conflict.
CREATE OR REPLACE FUNCTION policy.upsert_policy_instance(
    p_definition_id     UUID,
    p_definition_ver    INT,
    p_level             TEXT,
    p_tenant_id         INT,
    p_app_id            TEXT,
    p_user_id           INT,
    p_value             TEXT,
    p_effective_at      TIMESTAMPTZ,
    p_expires_at        TIMESTAMPTZ,
    p_reason            TEXT,
    p_approved_by       TEXT,
    p_approved_at       TIMESTAMPTZ,
    p_ticket_ref        TEXT,
    p_created_by        TEXT,
    p_expected_version  BIGINT DEFAULT NULL   -- null = no concurrency check
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_new_id        UUID := gen_random_uuid();
    v_old_id        UUID;
    v_lock_version  BIGINT;
BEGIN
    -- 1. Lock the slot row (or create it)
    INSERT INTO policy.policy_instance_lock
        (policy_definition_id, level, tenant_id, app_id, user_id,
         current_instance_id, version, updated_at)
    VALUES
        (p_definition_id, p_level,
         p_tenant_id, p_app_id, p_user_id,
         v_new_id, 1, NOW())
    ON CONFLICT ON CONSTRAINT pk_policy_instance_lock
    DO UPDATE
        SET current_instance_id = v_new_id,
            version             = policy_instance_lock.version + 1,
            updated_at          = NOW()
    RETURNING version INTO v_lock_version;

    -- 2. Optimistic concurrency check
    IF p_expected_version IS NOT NULL
       AND v_lock_version != p_expected_version + 1 THEN
        RAISE EXCEPTION 'Concurrent modification: expected version %, got %',
            p_expected_version, v_lock_version - 1
            USING ERRCODE = 'serialization_failure';
    END IF;

    -- 3. Revoke previous active instance if it exists
    UPDATE policy.policy_instances
       SET status       = 'Revoked',
           superseded_by = v_new_id,
           revoked_at   = NOW(),
           revoked_by   = p_created_by,
           updated_at   = NOW()
     WHERE policy_definition_id = p_definition_id
       AND level = p_level
       AND tenant_id IS NOT DISTINCT FROM p_tenant_id
       AND app_id    IS NOT DISTINCT FROM p_app_id
       AND user_id   IS NOT DISTINCT FROM p_user_id
       AND status    = 'Active'
    RETURNING id INTO v_old_id;

    -- 4. Insert the new instance
    INSERT INTO policy.policy_instances (
        id, policy_definition_id, definition_version,
        level, tenant_id, app_id, user_id,
        value, effective_at, expires_at,
        override_reason, approved_by, approved_at, ticket_ref,
        status, created_by, created_at, updated_at
    ) VALUES (
        v_new_id, p_definition_id, p_definition_ver,
        p_level, p_tenant_id, p_app_id, p_user_id,
        p_value, p_effective_at, p_expires_at,
        p_reason, p_approved_by, p_approved_at, p_ticket_ref,
        'Active', p_created_by, NOW(), NOW()
    );

    RETURN v_new_id;
END;
$$;
```

### Table: `policy_definition_seeds` (bootstrap / initial L0 values)

```sql
-- Seed data managed via Flyway migrations; not runtime-writable.
-- PolicyService reads this table on first run to bootstrap L0 instances
-- if no L0 instance exists for a given definition.
CREATE TABLE policy.policy_definition_seeds (
    policy_key      TEXT    NOT NULL,
    l0_value        TEXT    NOT NULL,
    seeded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT pk_policy_seeds PRIMARY KEY (policy_key)
);
```

---

## Seed Migration: MFA Enforcement Policy

```sql
-- Migration: V001__policy_mfa_enforcement_stage.sql

BEGIN;

-- 1. Insert definition
INSERT INTO policy.policy_definitions (
    key, version, name, description,
    value_type, allowed_values, default_value,
    scope,
    l1_allowed, l1_relaxation_allowed,
    l2_allowed, l3_allowed,
    opt_in_allowed, opt_out_allowed,
    opt_out_eligible_values,
    is_ordered_enum, is_active,
    created_by
) VALUES (
    'policy.mfa.enforcement_stage', 1,
    'MFA Enforcement Stage',
    'Controls which user types are required to complete MFA at login. '
    'Higher stages cover more user types. Stages 4-6 allow user opt-out.',
    'Enum',
    '["Disabled","EnabledAll","AdminsOnly","AdminsAndPrivileged",'
    '"EmployeesOptOut","EmployeesAndTechsOptOut","AllUsersOptOut"]'::jsonb,
    'Disabled',
    'PerTenant',
    TRUE,   -- l1_allowed
    FALSE,  -- l1_relaxation_allowed (tenants cannot go below platform default)
    TRUE,   -- l2_allowed
    TRUE,   -- l3_allowed
    TRUE,   -- opt_in_allowed
    TRUE,   -- opt_out_allowed
    '["EmployeesOptOut","EmployeesAndTechsOptOut","AllUsersOptOut"]'::jsonb,
    TRUE,   -- is_ordered_enum (Disabled < EnabledAll < AdminsOnly < ...)
    TRUE,
    'system-seed'
);

-- 2. Bootstrap L0 instance (platform default = Disabled)
SELECT policy.upsert_policy_instance(
    (SELECT id FROM policy.policy_definitions
      WHERE key = 'policy.mfa.enforcement_stage' AND version = 1),
    1,          -- definition_version
    'L0',       -- level
    NULL,       -- tenant_id
    NULL,       -- app_id
    NULL,       -- user_id
    'Disabled', -- value
    NOW(),      -- effective_at
    NULL,       -- expires_at
    'Platform default', NULL, NULL, NULL,
    'system-seed'
);

-- 3. Seed record for PolicyService bootstrap check
INSERT INTO policy.policy_definition_seeds (policy_key, l0_value)
VALUES ('policy.mfa.enforcement_stage', 'Disabled')
ON CONFLICT DO NOTHING;

COMMIT;
```

---

## Index Strategy Summary

| Index | Covers | Notes |
|-------|--------|-------|
| `idx_pd_active_key` | Definition lookup by key | Partial (active only); SDK hot path |
| `idx_pd_key_version` | Version history | For admin/audit queries |
| `idx_pi_l0_l1_lookup` | L0 + L1 evaluation | Partial (active); SDK cache-fill hot path |
| `idx_pi_l2_lookup` | L2 evaluation | Partial (active); app+tenant scope |
| `idx_pi_l3_lookup` | L3 user opt-out lookup | Partial (active); user scope |
| `idx_pi_expiry_scan` | Expiry background job | Partial (active + has expiry) |
| `idx_pi_tenant_history` | Tenant audit / admin UI | Full history including revoked |
| `idx_pi_user_history` | User audit / opt-out history | Full history |

---

## Partition Readiness

The `policy_instances` table is designed for future declarative partitioning by `tenant_id`. When tenant count exceeds ~10,000:

```sql
-- Future migration (non-breaking, requires maintenance window):
-- 1. Rename current table to policy_instances_v1
-- 2. Create partitioned table policy_instances PARTITION BY LIST (tenant_id)
-- 3. Create DEFAULT partition for L0 rows (tenant_id IS NULL)
-- 4. Migrate data in batches
-- 5. All existing indexes are recreated on the partitioned table
```

The `COALESCE(tenant_id, -1)` used in `pk_policy_instance_lock` ensures the L0 slot (`tenant_id IS NULL`) maps to a deterministic key (`-1`) that survives partitioning.

---

## Migration Tooling

Flyway is used for all schema migrations, consistent with other `ium-*` microservices:

```
policy-service/
  src/
    migrations/
      V001__initial_schema.sql               ← Creates schema, tables, indexes
      V002__policy_mfa_enforcement_stage.sql ← Seeds MFA definition + L0 instance
      V003__policy_session_timeout.sql       ← Adds session timeout definition
      ...
```

Migrations run on `PolicyService` startup via the standard `ium-migrations` Kubernetes init-container pattern used across the fleet.
