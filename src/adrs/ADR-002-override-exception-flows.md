# ADR-002: Policy Override and Exception Flows

**Status**: Proposed  
**Date**: 2026-05-11  
**Authors**: Identity Team  
**Relates to**: ADR-001 (SDK), ADR-003 (Storage), ADR-004 (Audit)

---

## Context

The policy hierarchy (L0 â†’ L1 â†’ L2 â†’ L3) is deliberately layered: higher levels constrain lower ones. However, the real world requires escape hatches:

- A tenant admin needs to set a company-wide MFA enforcement stage that is stricter or looser than the platform default (within allowed bounds).
- A specific application (e.g., the Admin module) must be able to enforce a minimum security floor regardless of the tenant-level setting.
- Individual users need an opt-out path when their tenant's stage permits it (e.g., stages 4â€“6 of MFA enforcement).
- ServiceTitan operations staff must be able to grant time-bounded exceptions for specific tenants or users without a production code change.

Without explicit override and exception flows, any deviation from the platform default requires a support ticket, a code deployment, or an undocumented config change â€” all of which are slow, unaudited, and unrecoverable.

---

## Decision

Define four explicit override flows. Each flow is authenticated, validated against the definition's `overridability` rules, persisted as a `PolicyInstance`, and recorded in the audit trail.

---

## Override Levels and Actors

| Level | Who Sets It           | Where               | Validated Against |
|-------|-----------------------|---------------------|-------------------|
| L0    | ST Ops (platform)     | Central Policy Admin | Definition schema |
| L1    | Tenant Admin          | Central UI or MFE   | L0 constraints    |
| L2    | App / MFE             | App registration or PolicyService API | L1 constraints |
| L3    | User (opt-in/opt-out) | In-app toggle or API | L2 + definition `optOutAllowed` |

An override at level N can only **tighten** the effective policy unless the definition explicitly allows relaxation at that level (`relaxationAllowed: true` on `overridability`).

---

## Flow 1 â€” Tenant Override (L1)

A tenant admin raises the MFA enforcement stage for their company. This is the most common override.

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    POST /tenants/{tenantId}/policies/{key}    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Tenant Adminâ”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¶  â”‚  PolicyService   â”‚
â”‚  (Central UI â”‚                                               â”‚                  â”‚
â”‚   or MFE)    â”‚ â—€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ 200 OK (PolicyInstance) â”€â”€ â”‚  1. Authenticate â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                                               â”‚  2. Load L0      â”‚
                                                               â”‚  3. Validate     â”‚
                                                               â”‚     bounds       â”‚
                                                               â”‚  4. Persist L1   â”‚
                                                               â”‚  5. Publish      â”‚
                                                               â”‚  PolicyInstance  â”‚
                                                               â”‚  Changed event   â”‚
                                                               â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                                                                        â”‚
                                                               ServiceBus topic
                                                                        â”‚
                                                                        â–¼
                                                               SDK in each app
                                                               invalidates cache
                                                               for (tenantId, key)
```

**Validation rules**:
- `value` must be in `definition.allowedValues`
- For ordered enums: `value` must be within `[definition.minValue, l0.value]` â€” tenants cannot exceed the platform ceiling (unless `l1RelaxationAllowed` is set)
- If `definition.l1Allowed == false`, the request is rejected with 403

**Request body**:
```json
{
  "value": "EmployeesOptOut",
  "effectiveAt": "2026-06-01T00:00:00Z",
  "expiresAt": null,
  "reason": "Company-wide MFA rollout Phase 2"
}
```

---

## Flow 2 â€” Application / Module Override (L2)

L2 overrides come in two forms:

### 2a. Code-registered override (preferred for permanent, app-owned floors)

The app implements `IPolicyOverrideProvider<T>` (see ADR-001). This is not persisted in the DB â€” it is baked into the app's deployment. Appropriate for: "the Admin module always enforces at least `AdminsAndPrivileged`."

Pros: no API call required, no race conditions, survives PolicyService outages.  
Cons: requires a deployment to change; not visible in the Central Policy Admin UI.

To make code-registered L2 overrides _visible_ in the audit trail, the SDK emits a `PolicyEvaluated` event tagging the resolved level as `L2-code`.

### 2b. DB-stored L2 override (for runtime-configurable app-specific settings)

App calls `PolicyService` under its own service account:

```
POST /apps/{appId}/tenants/{tenantId}/policies/{key}
Authorization: Bearer <service-account-token>

{
  "value": "AllUsersOptOut",
  "reason": "High-risk module â€” all users must verify"
}
```

- `appId` must match the token's `sub` claim.
- Value must be at least as restrictive as L1.
- Stored as `PolicyInstance(level=L2, scopeKey=appId+tenantId)`.

---

## Flow 3 â€” User Opt-Out / Opt-In (L3)

Users can opt out of a policy _only_ if:

1. `definition.overridability.l3Allowed == true`
2. `definition.overridability.optOutAllowed == true`
3. The resolved L2 value is in the set of `optOutEligibleValues` (e.g., `EmployeesOptOut`, `EmployeesAndTechsOptOut`, `AllUsersOptOut` for MFA stages)
4. The user's `UserType` is in `definition.applicableUserTypes` for the opt-out gate

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  POST /me/policies/{key}/opt-out   â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚     User     â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¶ â”‚  PolicyService   â”‚
â”‚   (via MFE)  â”‚                                    â”‚                  â”‚
â”‚              â”‚                                    â”‚  1. Auth user    â”‚
â”‚              â”‚ â—€â”€â”€ 200 OK or 403 (not eligible) â”€ â”‚  2. Resolve L2   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                                    â”‚  3. Check gates  â”‚
                                                    â”‚  4. Persist L3   â”‚
                                                    â”‚     (with expiry)â”‚
                                                    â”‚  5. Audit event  â”‚
                                                    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

**L3 instance created**:
```json
{
  "level": "L3",
  "scopeKey": "userId:99887",
  "value": "Disabled",
  "effectiveAt": "2026-05-11T19:00:00Z",
  "expiresAt": "2026-08-11T19:00:00Z",
  "optOutReason": "User-initiated",
  "approvedBy": "self"
}
```

**Opt-in** (user voluntarily increases their own enforcement):
- Always allowed if the result is more restrictive than L2.
- Stored as L3 instance with `optInReason`.

**Revocation**:  
`DELETE /me/policies/{key}/opt-out` removes the L3 instance; the user reverts to the L2-resolved value. The SDK receives a `PolicyInstanceChanged` event and updates the local cache within seconds.

---

## Flow 4 â€” Emergency / Operator Exception (Cross-Level)

ST Ops staff (with `policy:admin` scope) can grant a time-bounded exception at any level, bypassing normal constraint validation.

```
POST /admin/tenants/{tenantId}/policy-exceptions
Authorization: Bearer <ops-token>   (requires policy:admin scope)

{
  "policyKey": "policy.mfa.enforcement_stage",
  "targetLevel": "L1",
  "value": "Disabled",
  "reason": "Tenant migration â€” MFA temporarily suspended",
  "expiresAt": "2026-05-18T23:59:59Z",
  "approvedBy": "ops-user@example.com",
  "ticketRef": "OPS-4521"
}
```

- Requires two-factor confirmation from the API caller.
- `ticketRef` is mandatory for audit traceability.
- `expiresAt` is mandatory â€” exceptions never persist indefinitely.
- PolicyService sets a background job to automatically clean up expired exceptions and re-evaluate affected users.

**Expiry handling**:
```
ExpiryJob (runs every minute):
  1. SELECT * FROM policy_instances WHERE expires_at <= NOW() AND expired = false
  2. For each expired instance:
     a. Mark as expired (soft delete, not hard delete â€” preserves audit history)
     b. Publish PolicyInstanceExpired event
     c. SDK invalidates cache for (tenantId/userId, policyKey)
```

---

## Constraint Enforcement Matrix

| Override | Who | Can Tighten | Can Relax | Requires Approval |
|----------|-----|-------------|-----------|-------------------|
| L0 â†’ L1  | Tenant Admin | Yes | Only if `l1RelaxationAllowed` | No (self-service) |
| L1 â†’ L2  | App (code)   | Yes | No                            | No (code-owned)   |
| L1 â†’ L2  | App (API)    | Yes | No                            | No (service acct) |
| L2 â†’ L3  | User         | Yes | Only if `optOutAllowed`       | No (self-service) |
| Any â†’ Any| ST Ops       | Yes | Yes (with `policy:admin` scope) | Yes (ticketRef)  |

---

## Per-Tenant / Per-User / Per-App Flexibility

The combination of L1, L2, and L3 instances supports all required granularity:

| Need | Mechanism |
|------|-----------|
| Different MFA stage per tenant | L1 instance per `tenantId` |
| Stricter enforcement in Admin module | L2 code override in `mfa-service` |
| User opt-out from MFA (when permitted) | L3 instance per `userId` |
| Tenant-wide emergency suspension | L1 exception by ST Ops (Flow 4) |
| Per-app temporary relaxation | L2 exception by ST Ops (Flow 4) |
| Group-level exceptions (e.g., all Admins in tenant X) | Future: L3 group policy instance (scoped to `roleId+tenantId`) |

---

## Lifecycle State Machine for PolicyInstance

```
          â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”
          â”‚ Draft  â”‚ (optional staging)
          â””â”€â”€â”€â”¬â”€â”€â”€â”€â”˜
              â”‚ activate
              â–¼
          â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”      expires_at reached      â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”
          â”‚ Active â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¶  â”‚ Expired â”‚
          â””â”€â”€â”€â”¬â”€â”€â”€â”€â”˜                              â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
              â”‚ manual revoke / superseded
              â–¼
          â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
          â”‚ Revoked  â”‚
          â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

All state transitions emit an audit event. No instances are hard-deleted; they are soft-archived to preserve the full history of what was in effect when.

---

## Idempotency

Creating an L1 override when one already exists **replaces** the existing instance (upsert by `(level, policyKey, scopeKey)`). The old instance is marked `Revoked` with `supersededBy` pointing to the new `id`. This ensures history is preserved while enforcing single-active-instance per scope.

---

## Consequences

**Positive**
- All deviations from default policy are explicit, audited, and time-bounded.
- Tenant self-service removes ST Ops from routine configuration changes.
- Emergency exceptions have a mandatory expiry â€” no forgotten overrides.
- The opt-out/opt-in flows give users agency while maintaining an audit trail.

**Negative / Risks**
- Complexity: four distinct flows increase the surface area of PolicyService.
- Expiry background job introduces operational dependency; must be monitored.
- Emergency override requiring `policy:admin` scope means ST Ops needs proper RBAC provisioning before go-live.
