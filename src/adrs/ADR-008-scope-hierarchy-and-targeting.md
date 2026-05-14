# ADR-008: Scope Hierarchy & Targeting Expansion

**Status**: Proposed
**Date**: 2026-05-13
**Authors**: Identity Team
**Supersedes parts of**: ADR-001 (`PolicyContext`), ADR-002 (override flows), ADR-003 (scope columns), ADR-007 (DDL)
**Relates to**: ADR-009 (Value Composition), ADR-010 (Lifecycle)

---

## Context

The hierarchy in ADR-001 (L0 platform → L1 tenant → L2 app → L3 user) is sufficient for tenant-scoped MFA but **cannot express several first-class requirements from the PRD**:

1. **Org-level (franchise / parent company) targeting.** A franchise owning many tenants needs a single place to set policy across all of them, distinct from platform-wide L0 and from per-tenant L1.
2. **Role-based targeting.** "Slow-roll SSO by role" can't be expressed when the only user-level scope is per-user opt-out.
3. **Group exceptions.** Tenants must be able to grant exemptions to a group ("Sales team can keep SMS MFA") without writing per-user rows.
4. **Environment / routing context.** Customers asked to "block Next" or "force Enterprise Hub" — that's a runtime context axis, not a scope.
5. **Context-aware evaluation** for future use (auth method, location, session risk, step-up action).

These cannot be retrofitted as a single new column or one extra level; they require a coordinated reshape of the hierarchy, the scope columns, and `PolicyContext`.

---

## Decision

### 1. Six-level named hierarchy

Replace the numeric `L0..L3` levels with **named levels** that match the org chart. The names become the canonical identifier in DB and code; numeric labels are kept only as documentation hints.

```
Platform   ─ ST Ops; the floor and (usually) the ceiling
   │
   ├── Org      ─ Franchise / parent company; spans multiple tenants
   │     │
   │     └── Tenant ─ Single tenant (most common config level)
   │            │
   │            ├── App    ─ Per-(app, tenant) overrides
   │            │
   │            └── Group  ─ Per-(group, tenant) exemptions
   │                   │
   │                   └── User ─ Individual opt-in/opt-out
   │
   └── (Tenant directly under Platform — when not part of an Org)
```

A `Tenant` does not require an `Org`. When a tenant has no parent org, its parent is `Platform` directly.

| Level    | Scope keys present       | Owner            | Typical use |
|----------|--------------------------|------------------|-------------|
| Platform | none                     | ST Ops           | Default + ceiling |
| Org      | `org_id`                 | Org Admin        | Franchise-wide rollout |
| Tenant   | `tenant_id` (and optionally `org_id` for resolution context) | Tenant Admin | The common case |
| App      | `tenant_id` + `app_id`   | App owner / code | App-specific floors |
| Group    | `tenant_id` + `group_id` | Tenant Admin     | Team-level exemptions |
| User     | `user_id` (and optionally `tenant_id`) | User / operator | Individual opt-out |

### 2. Resolution order (most specific wins, within bounds)

```
User  ▶  Group  ▶  App  ▶  Tenant  ▶  Org  ▶  Platform
```

Each level may only **tighten** the level above unless the definition explicitly permits relaxation at that level (`relaxation_allowed_at_<level>` flags). This is the same rule as ADR-002 — extended to the new levels.

Resolution algorithm (pseudo, ordered enums):
```
effective = Platform.value
for level in [Org, Tenant, App, Group, User]:
    instance = lookup(level, context)
    if instance == null:                continue
    if not targeting_matches(instance, context):  continue
    if relaxation_not_allowed_at(level) and instance.value < effective:
        clamp(instance, to=effective)        # log a PolicyResolutionClamped event
        continue
    effective = instance.value
    resolved_level = level
return (effective, resolved_level)
```

### 3. Role-based targeting (orthogonal to scope)

Roles do **not** become a hierarchy level. Instead, every PolicyInstance can carry an `applies_to_roles JSONB` filter:

- `null` (default) — applies to every user in the scope
- `["admin", "manager"]` — only matches when `context.roles ∩ applies_to_roles ≠ ∅`

This lets a tenant write *one* L2-Tenant instance "SSO required for admin role only" instead of constructing N per-role policy keys.

`policy_definitions.applicable_roles` is the schema-level restriction: a list of roles the policy can ever target, or `null` for unrestricted. The MFE/UI uses it to populate the role-picker.

### 4. Environment as runtime context, not scope

Environment is a property of the *request* (which app surface served it), not of *who* the policy is written for. It belongs in `PolicyContext`, not in `policy_instances` keys.

```ts
type Environment =
  | 'Monolith'          // legacy local-tenant UI
  | 'EnterpriseHub'
  | 'Mobile'
  | 'AdminPortal'
  | 'PublicApi'
  | string;             // forward-compatible

interface PolicyContext {
  // ...existing fields
  environment: Environment;
  routing?: { entryPoint: string; surface: string };   // optional richer context
}
```

Each instance can carry an `applies_to_environments JSONB` filter, same shape and semantics as `applies_to_roles`.

This is what enables policies like:
- "Force Enterprise Hub for tenant ACME" → an L2-Tenant policy `access.allowed_environments` whose value is `["EnterpriseHub", "Mobile"]`.
- "Block Next for tenants on plan X" → an L1-Org policy with `applies_to_environments: ["Next"]` and value `Block`.

### 5. Group entity (lightweight, not a full IDP group)

A Group is a tenant-scoped collection of users used **only for policy targeting**. The minimal model:

```
policy_group:
  id            UUID PK
  tenant_id     INT
  name          TEXT
  description   TEXT
  source        TEXT   -- 'manual' | 'role-derived' | 'sync:azure-ad' | 'sync:okta'
  external_id   TEXT   -- when sourced from a directory
  created_*     audit columns

policy_group_member:
  group_id      UUID FK
  user_id       INT
  added_at      TIMESTAMPTZ
  added_by      TEXT
  PK (group_id, user_id)
```

PolicyService doesn't manage *all* groups in the platform — only those used for policy. When `source != 'manual'`, membership is read from the upstream directory via a sync job. Apps that already have richer group/role data (e.g. identity-service) expose it; PolicyService maintains its cache.

### 6. Expanded `PolicyContext`

```csharp
public sealed record PolicyContext(
    // Identity
    int     TenantId,
    int?    OrgId          = null,
    int?    UserId         = null,
    string? UserType       = null,      // legacy; see Deprecation below
    IReadOnlyList<string>? Roles = null, // canonical role list for the user

    // App / surface
    string AppId,
    string Environment     = "Monolith",
    string? Action         = null,      // for step-up MFA (see ADR-009)

    // Auth context (optional, used by SSO/MFA policies)
    string? AuthMethod     = null,      // 'password' | 'sso:<provider>' | 'passkey' | ...

    // Risk / location (optional, future)
    string? CountryCode    = null,
    string? IpAddress      = null,
    int?    SessionRiskScore = null,

    // Correlation
    string? RequestId      = null);
```

### 7. Deprecation of `userType` as a first-class concept

`userType` (`Admin`, `PrivilegedUser`, `Employee`, `Technician`, `Other`) is preserved in `PolicyContext` for transition compatibility but is no longer the primary targeting axis. New policy definitions must target by `Roles` and `Group`; `applies_to_user_types` is marked deprecated on the definition schema. A migration pass converts existing user-type-based definitions to equivalent role expressions (see `Migration` below).

---

## Schema deltas to ADR-007

### `policy_instances` — additions

```sql
ALTER TABLE policy.policy_instances
  ADD COLUMN org_id   INT,
  ADD COLUMN group_id UUID REFERENCES policy.policy_group(id),
  ADD COLUMN applies_to_roles        JSONB,
  ADD COLUMN applies_to_environments JSONB,
  ADD COLUMN applies_to_user_types   JSONB;   -- deprecated; see ADR-008 §7

-- Replace ADR-007's chk_l0..chk_l3 scope constraints with named-level versions:
ALTER TABLE policy.policy_instances
  DROP CONSTRAINT chk_l0_scope,
  DROP CONSTRAINT chk_l1_scope,
  DROP CONSTRAINT chk_l2_scope,
  DROP CONSTRAINT chk_l3_scope;

ALTER TABLE policy.policy_instances
  ADD CONSTRAINT chk_level_scope CHECK (
    (level = 'Platform' AND org_id IS NULL AND tenant_id IS NULL
                         AND app_id IS NULL AND group_id IS NULL AND user_id IS NULL)
 OR (level = 'Org'      AND org_id IS NOT NULL AND tenant_id IS NULL
                         AND app_id IS NULL AND group_id IS NULL AND user_id IS NULL)
 OR (level = 'Tenant'   AND tenant_id IS NOT NULL
                         AND app_id IS NULL AND group_id IS NULL AND user_id IS NULL)
 OR (level = 'App'      AND tenant_id IS NOT NULL AND app_id IS NOT NULL
                         AND group_id IS NULL AND user_id IS NULL)
 OR (level = 'Group'    AND tenant_id IS NOT NULL AND group_id IS NOT NULL
                         AND app_id IS NULL AND user_id IS NULL)
 OR (level = 'User'     AND user_id IS NOT NULL
                         AND app_id IS NULL AND group_id IS NULL)
  );

ALTER TABLE policy.policy_instances
  DROP CONSTRAINT IF EXISTS chk_l2_scope CASCADE;   -- old name
```

Index additions:
```sql
CREATE INDEX idx_pi_org_lookup
    ON policy.policy_instances(policy_definition_id, org_id)
    WHERE status = 'Active' AND level = 'Org';

CREATE INDEX idx_pi_group_lookup
    ON policy.policy_instances(policy_definition_id, tenant_id, group_id)
    WHERE status = 'Active' AND level = 'Group';
```

### `policy_definitions` — additions

```sql
ALTER TABLE policy.policy_definitions
  ADD COLUMN org_allowed                  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN tenant_allowed               BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN app_allowed                  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN group_allowed                BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN user_allowed                 BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN relaxation_allowed_at        JSONB,     -- list of levels that may relax: ["Org","Tenant"]
  ADD COLUMN applicable_roles             JSONB,     -- null = any role
  ADD COLUMN applicable_environments      JSONB;     -- null = any env

-- The old l1_allowed / l2_allowed / l3_allowed columns are kept as-is but
-- mapped into the new ones during the migration and then dropped in a later
-- version once no code references them. See `Migration` below.
```

### `policy_group` and `policy_group_member` — new tables

```sql
CREATE TABLE policy.policy_group (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   INT NOT NULL,
    name        TEXT NOT NULL,
    description TEXT,
    source      TEXT NOT NULL DEFAULT 'manual'
                   CHECK (source IN ('manual','role-derived','sync:azure-ad','sync:okta','sync:google')),
    external_id TEXT,
    created_by  TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, name)
);

CREATE TABLE policy.policy_group_member (
    group_id UUID NOT NULL REFERENCES policy.policy_group(id) ON DELETE CASCADE,
    user_id  INT  NOT NULL,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    added_by TEXT NOT NULL,
    PRIMARY KEY (group_id, user_id)
);

CREATE INDEX idx_group_member_user ON policy.policy_group_member(user_id);
```

### `org_tenant` — new mapping table

PolicyService needs to know which org a tenant belongs to in order to resolve Org-level instances during evaluation.

```sql
CREATE TABLE policy.org_tenant (
    org_id    INT NOT NULL,
    tenant_id INT NOT NULL PRIMARY KEY,   -- one tenant ↔ one org
    added_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_org_tenant_org ON policy.org_tenant(org_id);
```

This is a **read-only mirror** — the source of truth for org structure lives in the platform's tenant directory (host-api / identity-service). PolicyService maintains its copy via change events; if the upstream emits `TenantAddedToOrg` / `TenantRemovedFromOrg` events, PolicyService consumes them. Until that integration ships, the mapping is bootstrapped via Flyway and manually maintained.

---

## API deltas

### Reads / writes per level

The REST surface from ADR-005 extends symmetrically:

```
# Org
GET    /orgs/{orgId}/policies
PUT    /orgs/{orgId}/policies/{key}
DELETE /orgs/{orgId}/policies/{key}

# Group (tenant-scoped)
GET    /tenants/{tenantId}/groups/{groupId}/policies
PUT    /tenants/{tenantId}/groups/{groupId}/policies/{key}
DELETE /tenants/{tenantId}/groups/{groupId}/policies/{key}

# Group management
GET    /tenants/{tenantId}/groups
POST   /tenants/{tenantId}/groups
GET    /tenants/{tenantId}/groups/{groupId}/members
POST   /tenants/{tenantId}/groups/{groupId}/members
DELETE /tenants/{tenantId}/groups/{groupId}/members/{userId}
```

Auth scopes (additions):
- `policy:write:org` — Org Admin
- `policy:write:group` — Tenant Admin (same as `policy:write:tenant`)
- `policy:groups:manage` — Tenant Admin

### Targeting on PUT bodies

```json
PUT /tenants/123/policies/auth.method
{
  "value":                  "SsoOnly",
  "applies_to_roles":       ["admin"],
  "applies_to_environments": ["EnterpriseHub", "Mobile"],
  "effective_at":           "2026-07-01T00:00:00Z",
  "reason":                 "Phase 1: admin-only SSO enforcement"
}
```

### Evaluation request

```json
POST /evaluate
{
  "policyKey": "auth.method",
  "context": {
    "tenantId":   12345,
    "orgId":      78,
    "appId":      "monolith",
    "userId":     99887,
    "roles":      ["admin", "tenant_owner"],
    "environment": "Monolith",
    "authMethod":  "password"
  }
}
```

---

## SDK changes (delta on ADR-001)

### `PolicyContext` — see §6 above.

### `IPolicyEvaluator` — unchanged signature, expanded internals to walk the six levels.

### `IPolicyGroupSource` — new interface for apps that resolve group membership locally (avoiding a roundtrip to PolicyService on every eval):

```csharp
public interface IPolicyGroupSource
{
    /// Return the group IDs the given user belongs to in this tenant.
    /// Implementations are expected to cache aggressively; the SDK caches the
    /// returned list per (tenantId, userId) for the configured TTL.
    Task<IReadOnlyList<Guid>> GetGroupsAsync(int tenantId, int userId, CancellationToken ct);
}
```

If no implementation is registered, the SDK falls back to `GET /tenants/{tenantId}/users/{userId}/groups` on PolicyService.

### `IPolicyRoleSource` — same pattern for roles, registered by apps that have an in-process role cache (host-api, monolith).

---

## Migration

This is a coordinated, multi-step migration. Production goes through three Flyway versions:

1. **V010** — additive: add new columns, new tables, new indexes; backfill `policy_definitions.tenant_allowed = l1_allowed`, etc. New code starts writing both old and new columns. CHECK constraint is replaced atomically.

2. **V011** — rename instance levels: `UPDATE policy.policy_instances SET level = CASE level WHEN 'L0' THEN 'Platform' WHEN 'L1' THEN 'Tenant' WHEN 'L2' THEN 'App' WHEN 'L3' THEN 'User' END;` plus the equivalent for `policy_instance_lock`. SDK readers accept both old and new for one release.

3. **V012** — drop legacy columns: `l1_allowed`, `l2_allowed`, `l3_allowed`, `applies_to_user_types`. Only after every consumer reports it has upgraded its SDK.

A monitoring dashboard tracks per-app SDK version + which scope columns it reads, so we can verify safety before V012 runs.

---

## Coverage of PRD critical bullets

| Critical gap                                                | Addressed by                       |
|-------------------------------------------------------------|------------------------------------|
| Configure rules before enabling them                        | See ADR-010 (Draft state)          |
| Future org/root-level policy management                     | §1 Org level                       |
| Role-based targeting                                        | §3 `applies_to_roles`              |
| Group exceptions                                            | §1 Group level, §5 `policy_group`  |
| Environment/routing context                                 | §4 Environment in PolicyContext    |
| Multi-level opt-out (org/role/group/app)                    | §1 levels + §3/§5 targeting        |
| Context-aware evaluation (role, env, auth method, location) | §6 expanded `PolicyContext`        |
| Slow-roll SSO by role                                       | §3 (`applies_to_roles`)            |
| Restrict access to apps/environments                        | §4 `applies_to_environments` + policy `access.allowed_environments` |
| Block Next / force Enterprise Hub                           | §4 (concrete example above)        |
| Cross-tenant linking control                                | §1 Org level + ADR-009 deps        |
| (Step-up MFA action context, factor catalog,                | ADR-009                            |
|  multi-provider SSO, session-revoke cascade)                |                                    |
| (Exemption workflow, draft state)                           | ADR-010                            |

---

## Consequences

**Positive**
- The hierarchy now matches the org chart instead of being numbered abstractly.
- A single Org-level write affects all child tenants — eliminates per-tenant copy-paste at franchises.
- Role and environment are first-class filters: most targeting needs can be expressed as a single PolicyInstance plus filters, instead of an explosion of definitions.
- The Group level provides the missing "exempt the sales team from MFA stage 5" capability without per-user opt-out spam.

**Negative / risks**
- Six levels make resolution more expensive — eight DB lookups in the worst case (Platform/Org/Tenant/App, plus Group/User, plus role/env filter checks). Mitigation: SDK bulk-fetch pre-loads all relevant instances at startup; per-request eval is in-memory.
- The Tenant ↔ Org mapping introduces a foreign data dependency PolicyService doesn't currently own. Stale mapping = wrong Org-level resolution. Mitigation: change-event subscription from the tenant directory.
- Role data is heterogeneous across apps (monolith has one role set, EH has another). Apps must implement `IPolicyRoleSource` consistently or fall back to the canonical role list from identity-service.
- Group membership at high scale (10k+ users per tenant) makes per-user evaluation expensive without a local group cache. The `IPolicyGroupSource` interface is mandatory for apps with high QPS.
