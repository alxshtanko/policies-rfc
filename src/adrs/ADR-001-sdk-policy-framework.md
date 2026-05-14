# ADR-001: Policy Framework SDK / Library Design

**Status**: Proposed  
**Date**: 2026-05-11  
**Authors**: Identity Team  
**Relates to**: ADR-002 (Override Flows), ADR-003 (Storage), ADR-004 (Audit)

---

## Context

The platform enforces access rules across a growing set of services and micro-frontends: the monolith (`app/`), `host-api`, `identity-service`, `mfa-service`, `token-service`, and MFE-capable applications. Today, policy enforcement is scattered:

- `MfaEnforcementPolicy` is an integer enum rendered into `window.App.Features` at page load â€” no server-side enforcement, no hierarchy.
- `AuthenticationMethodPolicy` in `identity-service` is a 3-value integer with no documented semantics.
- `InitCooldownPolicy` in `mfa-service` is a hard-coded business rule, not a configurable policy.

There is no shared contract, no SDK, and no consistent way for a new service or MFE to read, override, or audit a policy.

---

## Decision

Provide a first-party .NET library **`PolicyFramework`** and a corresponding TypeScript package **`policy-client`** for MFEs. These packages encapsulate:

1. Fetching and caching policy instances from `PolicyService`
2. Local policy evaluation against the L0 â†’ L1 â†’ L2 â†’ L3 hierarchy
3. App-specific override registration
4. Audit event emission

### Non-Goals

- The SDK does **not** make authorization decisions in place of ASP.NET `IAuthorizationService`. It resolves _what the current policy value is_ for a given context; enforcement (block/allow) is the caller's responsibility.
- The SDK does **not** manage policy definitions (that is `PolicyService`'s role).

---

## .NET SDK â€” `PolicyFramework`

### Core Abstractions

```csharp
/// Resolved context for a single evaluation request.
public sealed record PolicyContext(
    int     TenantId,
    string  AppId,
    int?    UserId       = null,
    string? UserType     = null,   // "Admin", "Employee", "Technician", etc.
    string? RequestId    = null);

/// What came back from an evaluation.
public sealed record PolicyResult<T>(
    T      Value,
    string PolicyKey,
    string ResolvedLevel,   // "L0" | "L1" | "L2" | "L3"
    Guid   InstanceId);

/// Primary entry point for reading policy values.
public interface IPolicyEvaluator
{
    /// Resolve the effective value of <paramref name="policyKey"/> for the given context.
    /// Uses local cache; falls back to PolicyService on miss.
    Task<PolicyResult<T>> EvaluateAsync<T>(
        string        policyKey,
        PolicyContext context,
        CancellationToken ct = default);

    /// Batch resolution â€” single network round-trip when cache is cold.
    Task<IReadOnlyDictionary<string, PolicyResult<object>>> EvaluateManyAsync(
        IEnumerable<string> policyKeys,
        PolicyContext       context,
        CancellationToken   ct = default);
}

/// Low-level: fetch raw instances from PolicyService (used by the evaluator internally).
public interface IPolicyClient
{
    Task<IReadOnlyList<PolicyInstance>> GetInstancesAsync(
        string        policyKey,
        PolicyContext context,
        CancellationToken ct = default);

    Task<PolicyInstance?> GetL3InstanceAsync(
        string        policyKey,
        int           userId,
        CancellationToken ct = default);
}

/// Apps implement this to inject L2 logic that lives in code, not in the DB.
public interface IPolicyOverrideProvider<T>
{
    string PolicyKey { get; }

    /// Return true when this provider applies for the given context.
    bool CanOverride(PolicyContext context);

    /// Return a result or null to pass through to the next level.
    Task<PolicyOverrideResult<T>?> EvaluateAsync(
        PolicyContext context,
        T             inheritedValue,
        CancellationToken ct = default);
}

public sealed record PolicyOverrideResult<T>(
    T      Value,
    string Reason);
```

### Well-Known Policy Keys

A static class prevents magic strings and provides IDE discoverability:

```csharp
public static class WellKnownPolicies
{
    public const string MfaEnforcementStage   = "policy.mfa.enforcement_stage";
    public const string SessionTimeoutMinutes = "policy.session.timeout_minutes";
    public const string PasswordComplexity    = "policy.auth.password_complexity";
    public const string AllowedAuthMethods    = "policy.auth.allowed_methods";
    // New policies added here as definitions are registered in PolicyService.
}
```

### DI Registration

```csharp
// In Program.cs / Startup.cs
services.AddPolicyFramework(opts =>
{
    opts.AppId              = "mfa-service";           // identifies this app for L2 scoping
    opts.PolicyServiceUrl   = config["PolicyService:Url"];
    opts.CacheTtl           = TimeSpan.FromMinutes(5);
    opts.LocalEvalEnabled   = true;   // evaluate hierarchy locally; do not call PolicyService per request
    opts.AuditEmitEnabled        = true;   // emit PolicyEvaluated events to Kafka
    opts.ServiceBusChangesTopic  = config["ServiceBus:PolicyChangesTopic"];   // cache invalidation
    opts.KafkaAuditEventsTopic   = config["Kafka:PolicyAuditEventsTopic"];    // audit / eval stream
});

// Register an L2 code override (optional â€” only for apps with stricter local rules)
services.AddPolicyOverride<MfaModuleEnforcementOverride>();
```

### Local Evaluation Algorithm

```
EvaluateAsync(policyKey, context):
  1. instances â† cache.Get(policyKey, context.TenantId, context.AppId)
       if miss â†’ fetch from PolicyService, populate cache
  2. l0 â† instances.SingleOrDefault(i => i.Level == L0)
  3. l1 â† instances.SingleOrDefault(i => i.Level == L1 && i.TenantId == context.TenantId)
  4. l2 â† instances.SingleOrDefault(i => i.Level == L2 && i.AppId == context.AppId
                                       && i.TenantId == context.TenantId)
       if null â†’ check registered IPolicyOverrideProvider<T> for this app
  5. l3 â† if definition.l3Allowed
            â†’ fetch user instance (smaller TTL: 1 min, or real-time for opt-out)
  6. resolved â† first non-null of [l3, l2, l1, l0] that satisfies definition constraints
       (e.g. L2 cannot be looser than L1 â€” clamp if violated)
  7. emit PolicyEvaluated audit event (async, fire-and-forget)
  8. return PolicyResult(resolved.Value, resolvedLevel, instanceId)
```

Constraint enforcement on resolution (step 6):

```
For ordered enums (e.g. MfaEnforcementStage):
  effective = max(l3 ?? l0, l2 ?? l0, l1 ?? l0, l0)
  // "max" means most restrictive; an L2 can only increase, never decrease, the stage
  // L3 opt-out is allowed only if definition.optOutAllowed AND stage >= EmployeesOptOut
```

### Cache Invalidation

PolicyService publishes `PolicyInstanceChanged` events to the **Azure ServiceBus** topic `policy-changes`. The SDK subscribes using Azure ServiceBus topic subscriptions with SQL filter â€” chosen specifically for this use case because each SDK consumer only needs the slice of (tenant, policyKey) tuples that its cache currently holds:

```
policyKey = 'policy.mfa.enforcement_stage' AND tenantId = '12345'
```

On receipt, the SDK evicts the relevant cache entry. This bounds the staleness window even when `CacheTtl` is generous.

```csharp
// Handled inside the framework â€” no app code needed
internal class PolicyChangedEventHandler : IHostedService
{
    // Subscribes to ServiceBus on startup, evicts cache entries on message receipt
}
```

> **Bus split.** ServiceBus is used here because broker-side SQL filter subscriptions
> let each SDK consumer receive only the change events relevant to its cache without
> dragging the entire change stream over the wire. High-volume audit/eval events go
> to Kafka instead (see below) where throughput and replay matter more.

### Audit Emission

Evaluation events are emitted asynchronously in a background channel (no hot-path latency):

```csharp
// Emitted after every successful EvaluateAsync call
internal record PolicyEvaluatedEvent(
    string  PolicyKey,
    string  ResolvedValue,
    string  ResolvedLevel,
    Guid    InstanceId,
    int     TenantId,
    string  AppId,
    int?    UserId,
    string? UserType,
    string? RequestId,
    DateTimeOffset EvaluatedAt);
```

Events are batched (up to 100 per flush or 5-second interval) and published to the **Kafka** topic `policy-audit-events` keyed by `tenantId` for natural partitioning. Kafka is chosen here (over ServiceBus) because audit/eval events are high-volume, benefit from replay (Elasticsearch indices can be rebuilt from Kafka offsets), and align with the existing Debezium/KafkaConnect infrastructure.

---

## TypeScript SDK â€” `policy-client`

MFEs use this package to read and display policy state and to submit L3 opt-out/opt-in requests.

### API

```typescript
// Initialise once at MFE bootstrap
const policyClient = createPolicyClient({
  appId: 'employee-portal-mfe',
  policyServiceUrl: window.App.Config.PolicyServiceUrl,
  tenantId: window.App.TenantId,
  userId: window.AppUser.Id,
  userType: window.AppUser.Type,  // "Admin" | "Employee" | "Technician"
});

// Read a policy value (cached, re-fetches in background after TTL)
const stage = await policyClient.evaluate<MfaEnforcementStage>(
  'policy.mfa.enforcement_stage'
);
// stage.value, stage.resolvedLevel, stage.canOptOut

// Submit a user opt-out
await policyClient.optOut('policy.mfa.enforcement_stage', {
  reason: 'Temporary device restriction',
});

// Subscribe to changes (e.g. tenant admin changed the stage while user is online)
policyClient.onChange('policy.mfa.enforcement_stage', (newStage) => {
  refreshMfaBadge(newStage.value);
});
```

### React hook

```tsx
function MfaStatusBadge() {
  const { value: stage, canOptOut, loading } = usePolicyValue<MfaEnforcementStage>(
    'policy.mfa.enforcement_stage'
  );
  if (loading) return <Spinner />;
  return <Badge stage={stage} canOptOut={canOptOut} />;
}
```

The hook uses `React.useSyncExternalStore` to react to `onChange` events without extra re-renders.

---

## App Integration Patterns

### Pattern 1 â€” Read-only enforcement (most services)

```csharp
public class TokenLoginHandler(IPolicyEvaluator policies)
{
    public async Task<LoginResult> HandleAsync(LoginCommand cmd)
    {
        var ctx   = new PolicyContext(cmd.TenantId, "token-service", cmd.UserId, cmd.UserType);
        var stage = await policies.EvaluateAsync<MfaEnforcementStage>(
                        WellKnownPolicies.MfaEnforcementStage, ctx);

        if (stage.Value >= MfaEnforcementStage.AdminsOnly && cmd.UserType == "Admin")
            return await RequireMfaAsync(cmd);

        return await IssueTokenAsync(cmd);
    }
}
```

### Pattern 2 â€” App-specific L2 override (stricter local rules)

```csharp
// mfa-service registers this to enforce a minimum stage of Stage3 in its own API
public class MfaModuleEnforcementOverride : IPolicyOverrideProvider<MfaEnforcementStage>
{
    public string PolicyKey => WellKnownPolicies.MfaEnforcementStage;

    public bool CanOverride(PolicyContext ctx) => ctx.AppId == "mfa-service";

    public Task<PolicyOverrideResult<MfaEnforcementStage>?> EvaluateAsync(
        PolicyContext ctx,
        MfaEnforcementStage inherited,
        CancellationToken ct)
    {
        // MFA module always enforces at least AdminsAndPrivileged, regardless of L1
        var effective = inherited < MfaEnforcementStage.AdminsAndPrivileged
            ? MfaEnforcementStage.AdminsAndPrivileged
            : inherited;

        return Task.FromResult<PolicyOverrideResult<MfaEnforcementStage>?>(
            effective != inherited
                ? new(effective, "mfa-service minimum floor")
                : null);   // null = "I don't override this case"
    }
}
```

### Pattern 3 â€” Frontend conditional rendering

```tsx
// Show opt-out toggle only when the policy permits it and the user is subject to enforcement
function EmployeeRow({ employee }: { employee: Employee }) {
  const { value: stage, canOptOut } = usePolicyValue<MfaEnforcementStage>(
    'policy.mfa.enforcement_stage'
  );

  const isMfaRequired = stage !== MfaEnforcementStage.Disabled;
  const showOptOut    = isMfaRequired && canOptOut && employee.IsCurrentUser;

  return (
    <tr>
      {employee.AccountLocked && isMfaRequired && <AccountLockedBadge />}
      {showOptOut && <OptOutToggle policyKey="policy.mfa.enforcement_stage" />}
    </tr>
  );
}
```

---

## Versioning and Backward Compatibility

- Policy keys are stable strings. Adding a new key is non-breaking.
- If the value type or enum members change, a new `definitionVersion` is assigned and the old definition remains readable (no deletes).
- Apps register an `IPolicyValueMigrator<T>` to handle old enum ordinals when upgrading:

```csharp
services.AddPolicyValueMigrator<MfaEnforcementStage, MfaEnforcementStageV1Migrator>();
```

---

## Consequences

**Positive**
- Uniform policy contract across all .NET services and TypeScript MFEs.
- Policy changes propagate within seconds via ServiceBus invalidation; no deploy required.
- Local evaluation eliminates per-request latency on the hot path.
- Audit trail is automatic â€” apps get it without extra code.

**Negative / Risks**
- First-time SDK adoption requires migration of `window.App.Features.MfaEnforcementPolicy` usage sites in the monolith (scoped to Phase 1).
- ServiceBus per-app subscriptions on `policy-changes` are an additional operational surface, but volumes are low (a few hundred writes/day across all tenants) and SQL filters keep the per-consumer message rate trivial.
- Kafka producer in every SDK consumer adds a build-time dependency on the Kafka client (already present in most `ium-*` services via Debezium-related libraries). Greenfield apps must include the SDK's transitive `Confluent.Kafka` dependency.
- Local evaluation introduces a window of staleness bounded by `CacheTtl`; safety-critical checks should set a short TTL or use the direct `PolicyService` evaluate endpoint.
