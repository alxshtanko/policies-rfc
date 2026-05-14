# ADR-009: Policy Value Composition & Side Effects

**Status**: Proposed
**Date**: 2026-05-13
**Authors**: Identity Team
**Relates to**: ADR-001 (SDK), ADR-005 (API), ADR-007 (schema), ADR-008 (scope), ADR-010 (lifecycle)

---

## Context

The current model treats every policy value as a single scalar — an enum, bool, int, or opaque JSON. That's fine for `mfa.enforcement_stage`, but the PRD requires policies that are inherently **composite** or **interdependent**:

1. **MFA factors** — "Allowed = SMS, TOTP, Passkey; Required = TOTP; Disabled = SMS-after-2027" can't be a single enum. Three concepts (`required`, `allowed`, `disabled`) over a factor catalog.
2. **Multi-provider SSO** — Authentication-method policy must reference one or more providers (Entra, Google, Okta) with provider-specific rules.
3. **Policy dependencies** — `SsoOnly` invalidates account-linking controls (no password to link); password rotation policy should revoke existing sessions; the framework needs to express both *read-time* dependency and *write-time* side effects.
4. **Step-up MFA for sensitive actions** — different policy outcome depending on which action the user is attempting (`payroll.approve_run` vs `report.view`). The context-axis `Action` introduced in ADR-008 §6 needs a way for policy values to *use* it.
5. **Cross-policy invalidation** — when a tenant flips `auth.method = SsoOnly`, the value of `auth.account_linking` should be auto-marked irrelevant; admins shouldn't see a stale "linking allowed" toggle.

This ADR introduces three coordinated mechanisms — **structured value schemas**, **policy dependencies**, and **side-effect handlers** — to cover these cases without exploding the policy catalog.

---

## Decision

### 1. Structured value schemas (`valueType = Json` with a `value_schema`)

`policy_definitions.value_type` already supports `Json`. Make it useful by storing the **JSON schema** of the value alongside the definition:

```sql
ALTER TABLE policy.policy_definitions
  ADD COLUMN value_schema JSONB;     -- JSON Schema draft-07, only required when value_type = 'Json'
```

The SDK validates writes and reads against this schema. `value_schema` is part of the definition's version: changing it requires a new definition version (per ADR-003 §"Schema evolution").

### 2. Canonical factor / provider catalogs

Two new tables hold the catalogs that composite policies reference:

```sql
CREATE TABLE policy.mfa_factor (
    id          TEXT PRIMARY KEY,             -- 'totp', 'sms', 'passkey', 'webauthn', 'email-otp', ...
    name        TEXT NOT NULL,
    family      TEXT NOT NULL,                -- 'otp' | 'phishing-resistant' | 'fallback' | 'custom'
    assurance   TEXT NOT NULL,                -- 'low' | 'medium' | 'high'
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    deprecated_at TIMESTAMPTZ,
    notes       TEXT
);

CREATE TABLE policy.auth_provider (
    id          TEXT PRIMARY KEY,             -- 'entra', 'google', 'okta', 'st-internal', ...
    name        TEXT NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('oidc','saml','oauth','password','passkey')),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    config      JSONB                         -- non-secret metadata; secrets stay in identity-service
);
```

These are platform-managed: managed via Flyway, surfaced to the UI as read-only menus. Tenants and apps **reference** entries; they don't create them. A new factor (e.g. passkey when it ships) is added by ST Ops via migration.

### 3. The canonical MFA policy, redone

Replace the single `policy.mfa.enforcement_stage` enum (kept as the *high-level rollout dial*) with three coordinated definitions:

| Key                       | `valueType` | Value shape                            | Source of truth |
|---------------------------|-------------|----------------------------------------|-----------------|
| `policy.mfa.enforcement_stage` | Enum  | `Disabled / Stage1 .. Stage6 / Required` | Tenant rollout dial (existing) |
| `policy.mfa.required_factors`  | Json  | `[ "totp", "passkey" ]`                | What the user MUST present, if MFA is in effect |
| `policy.mfa.allowed_factors`   | Json  | `[ "totp", "sms", "passkey" ]`         | What the user MAY enroll & use |
| `policy.mfa.disabled_factors`  | Json  | `[ "sms" ]`                            | What's explicitly forbidden (wins over allowed) |

Each factor list policy has the same `value_schema`:
```json
{
  "type": "array",
  "items": { "type": "string", "enum": ["totp","sms","passkey","webauthn","email-otp"] },
  "uniqueItems": true
}
```

Resolution semantics:
- `allowed_factors`: most permissive at top of hierarchy; each level may **remove** factors but not add.
- `required_factors`: most lenient at top; each level may **add** required factors but not remove.
- `disabled_factors`: union across levels — any level may add to the disabled set.

This produces the rules from the PRD ("which factors are allowed, which factors are required, which factors are disabled") with clear per-level write semantics.

### 4. The canonical SSO policy, with providers

```
policy.auth.method           value: Mixed | SsoIfLinked | SsoOnly
policy.auth.allowed_providers value: [ "entra", "google", "okta" ]
policy.auth.required_provider value: "entra"   (nullable; non-null forces a specific provider)
```

Same `applies_to_roles` + `applies_to_environments` filtering from ADR-008.

### 5. Policy dependencies (read-time)

A new lookup table records declarative dependencies between definitions:

```sql
CREATE TABLE policy.policy_dependency (
    parent_key      TEXT NOT NULL,    -- e.g. 'policy.auth.method'
    parent_version  INT  NOT NULL,
    parent_value    TEXT,             -- when parent equals this value...
    dependent_key   TEXT NOT NULL,    -- ...this policy becomes 'invalidates' / 'requires' / 'overrides'
    dependent_version INT NOT NULL,
    kind            TEXT NOT NULL CHECK (kind IN ('invalidates','requires','overrides')),
    PRIMARY KEY (parent_key, parent_version, dependent_key, dependent_version, parent_value)
);
```

Semantics:
- `invalidates`: when parent = `parent_value`, the dependent policy is ignored at evaluation time and shown as "managed by `parent_key`" in the admin UI.
- `requires`: when parent = `parent_value`, the dependent policy **must** also be configured (UI blocks save until it is).
- `overrides`: when both apply, the parent's value supersedes the dependent's — used for chained policies.

Example:
```
(policy.auth.method = 'SsoOnly')  invalidates  policy.auth.account_linking
(policy.password.complexity)      requires     policy.password.rotation_interval
```

`policy.account_linking` is therefore *displayed in the UI but greyed out* when SSO-only is in effect.

### 6. Side-effect handlers (write-time)

Side effects happen **out of band**, after a successful policy write. The framework dispatches them via the same ServiceBus `policy-changes` topic (already in use for cache invalidation), and apps register handlers via the SDK:

```csharp
public interface IPolicyChangeHandler
{
    string PolicyKey { get; }
    /// Optional: only run when value transitions across this set
    string[]? TriggerOnTransitionsTo { get; }
    Task HandleAsync(PolicyChangeEvent evt, CancellationToken ct);
}

// Example: revoke sessions when password rotation is enforced
public class RevokeSessionsOnPasswordRotation : IPolicyChangeHandler
{
    public string PolicyKey => "policy.password.rotation_enforced";
    public string[]? TriggerOnTransitionsTo => new[] { "true" };

    public async Task HandleAsync(PolicyChangeEvent evt, CancellationToken ct)
    {
        // Revoke all sessions for the scope that changed.
        if (evt.Scope.TenantId is int tid)
            await _sessions.RevokeAllForTenantAsync(tid, ct);
    }
}

// Startup
services.AddPolicyChangeHandler<RevokeSessionsOnPasswordRotation>();
```

The SDK already subscribes to `policy-changes` for cache invalidation; dispatching to registered handlers is the same subscription, additional code path.

**Idempotency**: each `PolicyChangeEvent` has a stable `eventId`; the SDK records "last handled event per handler-key" in a small `policy_handler_state` table the consuming app maintains, so a delivery retry doesn't double-revoke.

### 7. Step-up MFA via action-aware evaluation

The `Action` field added to `PolicyContext` in ADR-008 §6 lets policy values include action-specific rules. Two patterns:

**Pattern A — `applies_to_actions` filter on the instance** (preferred for narrow actions):

```json
PUT /tenants/12345/policies/policy.mfa.enforcement_stage
{
  "value": "Required",
  "applies_to_actions": ["payroll.approve_run", "payment.send_high_value"],
  "reason": "Step-up for sensitive payroll/payment actions"
}
```

**Pattern B — structured value with per-action overrides** (for cross-cutting policies):

```json
{
  "default": "AdminsAndPrivileged",
  "actions": {
    "payroll.approve_run":     "AllUsers",
    "payment.send_high_value": "AllUsers",
    "report.view":             "Disabled"
  }
}
```

Apps emit the `Action` field when calling `EvaluateAsync`; otherwise the default value is returned. A new well-known catalog `policy.action` (table `policy_action` similar to `mfa_factor`) enumerates the action identifiers — ST Ops adds new sensitive actions there.

### 8. Cross-tenant / org-level identity ownership

Identity ownership is **not** modeled inside the policy framework directly. The framework references an "owning org" via `policy_definitions.owner_org_required` (boolean) — when true, evaluation includes a check that the user's identity-owning org matches the policy's org scope. The actual ownership graph lives in identity-service; PolicyService consumes a read-only feed.

This keeps account-linking decisions (which are intrinsically identity-graph problems) out of the policy schema while still letting policies *reference* the resulting ownership state.

---

## Schema delta summary

```sql
-- ADR-009 additions
ALTER TABLE policy.policy_definitions
  ADD COLUMN value_schema       JSONB,
  ADD COLUMN owner_org_required BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE policy.policy_instances
  ADD COLUMN applies_to_actions JSONB;

CREATE TABLE policy.mfa_factor (...);
CREATE TABLE policy.auth_provider (...);
CREATE TABLE policy.policy_action (id TEXT PK, name TEXT, category TEXT, ...);
CREATE TABLE policy.policy_dependency (...);
```

The consuming app maintains:
```sql
CREATE TABLE policy.policy_handler_state (
    handler_key   TEXT NOT NULL,
    last_event_id UUID NOT NULL,
    handled_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (handler_key)
);
```

---

## API additions

```
GET    /factors                       — list MFA factors (read-only catalog)
GET    /providers                     — list auth providers (read-only catalog)
GET    /actions                       — list known step-up actions
GET    /definitions/{key}/dependencies — list resolved deps for UI rendering
POST   /definitions/{key}/dependencies — (admin) register a dependency
```

---

## SDK additions

```csharp
// Register side-effect handlers
services.AddPolicyChangeHandler<RevokeSessionsOnPasswordRotation>();

// Compose multiple structured policies into a domain-friendly object
public sealed record MfaSettings(
    MfaEnforcementStage Stage,
    IReadOnlySet<string> Required,
    IReadOnlySet<string> Allowed,
    IReadOnlySet<string> Disabled);

public interface IMfaPolicySnapshot
{
    Task<MfaSettings> ResolveAsync(PolicyContext ctx, CancellationToken ct);
}
// Implemented by the SDK; combines the three factor lists + enforcement stage.
```

For composite reads, the SDK exposes typed "snapshots" so apps don't have to combine three calls and three JSON parses each time:

```csharp
var mfa = await _mfa.ResolveAsync(ctx);
if (mfa.Disabled.Contains(presentedFactor.Id))   return Reject("factor disabled");
if (mfa.Required.Except(verifiedFactors).Any())  return Challenge(mfa.Required);
if (!mfa.Allowed.Contains(presentedFactor.Id))   return Reject("factor not allowed");
```

---

## Coverage of PRD critical bullets

| Critical gap                                                       | Addressed by              |
|--------------------------------------------------------------------|---------------------------|
| Distinguish required vs allowed vs disabled factors                | §3 three factor policies  |
| MFA factor catalog (SMS, TOTP, passkeys, future)                   | §2 `mfa_factor` table     |
| Multi-provider SSO (Entra, Google, Okta)                           | §2 `auth_provider` + §4   |
| SSO ↔ account-linking dependency                                   | §5 `policy_dependency`    |
| Step-up MFA for sensitive actions                                  | §7 `Action` + filter / structured value |
| Session-revocation cascade on password rotation                    | §6 `IPolicyChangeHandler` |
| Managed-identity ownership boundaries                              | §8 `owner_org_required`   |

---

## Consequences

**Positive**
- Composite policies (MFA factors, SSO providers) have a clean home — three small definitions instead of one bloated enum.
- Side effects are uniform: every "X changes therefore Y must happen" goes through the same handler pattern, with idempotency + audit baked in.
- Read-time dependencies let the admin UI explain *why* a control is greyed out — no more confused tenants toggling things that have no effect.
- The factor/provider/action catalogs are platform-versioned: introducing passkey-only enforcement is one Flyway migration plus a new row, no schema churn.

**Negative / risks**
- Three policies for MFA factors (required/allowed/disabled) means three writes for a "set our MFA factors" admin action. The UI must group them into one form and submit a batch (`POST /evaluate/batch` already supports reads; add `POST /policies:batch` for writes).
- `policy_dependency` table is operator-managed (Flyway), so dependency edges aren't user-extensible. Acceptable: dependencies are platform contracts, not tenant choices.
- Side-effect handlers can fan out to other systems (session store, identity store). Failure modes need a clear retry + DLQ story — folded into the existing `policy-audit-sink` infrastructure but with a dedicated `policy-handler-dlq` topic.
- Step-up MFA's per-action overrides at scale (thousands of actions) require a wildcard or category match (`payroll.*`) — a future extension.
