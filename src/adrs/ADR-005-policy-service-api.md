# ADR-005: PolicyService API Surface

**Status**: Proposed  
**Date**: 2026-05-11  
**Authors**: Identity Team  
**Relates to**: ADR-001 (SDK), ADR-002 (Override Flows), ADR-003 (Storage), ADR-004 (Audit)

---

## Context

`PolicyService` is the authoritative backend for all policy definitions and instances. Its API must serve three distinct consumer types:

1. **SDK clients** (internal services and MFEs) â€” read-heavy: fetch instances for cache population, submit L3 opt-out/opt-in, receive change notifications.
2. **Management UIs** (Central Policy Admin, app-embedded MFEs) â€” write-heavy for L1/L2 overrides, read for display.
3. **ST Ops tooling** â€” emergency exceptions, definition management, administrative queries.

---

## Authentication and Authorization

All requests require a JWT bearer token issued by the token server.

| Scope | Granted To | Capabilities |
|-------|------------|--------------|
| `policy:read` | All internal services (via service account), tenant users | Read definitions, read their own tenant's instances |
| `policy:write:l1` | Tenant admin role | Create/update L1 instances for their tenant |
| `policy:write:l2` | Service accounts with `appId` claim | Create/update L2 instances for their app+tenant |
| `policy:write:l3` | Authenticated end users | Opt-in/opt-out for themselves only |
| `policy:admin` | ST Ops service accounts | All write operations, emergency exceptions, definition management |
| `policy:definitions:write` | ST Ops only | Create/update PolicyDefinitions |

Tenant isolation is enforced server-side: a token with `tenantId=12345` claim cannot read or write instances scoped to a different `tenantId`, regardless of scope grants.

---

## Base URL

```
https://policy.ium.servicetitan.com/v1
```

Versioning is in the URL path. `v1` is the initial release. Future incompatible changes produce a `v2` prefix; `v1` is supported for 12 months after `v2` GA.

---

## API Endpoints

### Policy Definitions

```
GET    /definitions
       â†’ List all active definitions
       â†’ Query: ?key=&valueType=&page=&pageSize=
       â†’ Scope required: policy:read

GET    /definitions/{key}
       â†’ Get the active definition for a policy key
       â†’ Returns definition with current version, allowed values, overridability

GET    /definitions/{key}/versions
       â†’ Full version history for a policy key
       â†’ Scope required: policy:admin

POST   /definitions
       â†’ Register a new policy definition or a new version of an existing key
       â†’ Scope required: policy:definitions:write
       â†’ Body: PolicyDefinitionCreateRequest

PUT    /definitions/{key}
       â†’ Non-breaking update (e.g. add an allowed value)
       â†’ Scope required: policy:definitions:write
       â†’ Body: PolicyDefinitionPatchRequest
```

**`PolicyDefinitionCreateRequest`**:
```json
{
  "key":           "policy.mfa.enforcement_stage",
  "name":          "MFA Enforcement Stage",
  "description":   "Controls which user types are required to complete MFA",
  "valueType":     "Enum",
  "allowedValues": ["Disabled","EnabledAll","AdminsOnly","AdminsAndPrivileged",
                    "EmployeesOptOut","EmployeesAndTechsOptOut","AllUsersOptOut"],
  "defaultValue":  "Disabled",
  "scope":         "PerTenant",
  "overridability": {
    "l1Allowed":            true,
    "l1RelaxationAllowed":  false,
    "l2Allowed":            true,
    "l3Allowed":            true,
    "optInAllowed":         true,
    "optOutAllowed":        true,
    "optOutEligibleValues": ["EmployeesOptOut","EmployeesAndTechsOptOut","AllUsersOptOut"]
  },
  "applicableUserTypes": null
}
```

---

### Policy Instances â€” Tenant Level (L1)

```
GET    /tenants/{tenantId}/policies
       â†’ All active L1 instances for a tenant
       â†’ Scope required: policy:read (tenantId must match token claim)

GET    /tenants/{tenantId}/policies/{key}
       â†’ Single L1 instance (or 404 if no override â€” use L0 default)
       â†’ Scope required: policy:read

PUT    /tenants/{tenantId}/policies/{key}
       â†’ Create or replace the L1 override for a tenant
       â†’ Scope required: policy:write:l1
       â†’ Body: PolicyInstanceWriteRequest
       â†’ Returns: PolicyInstance (with instanceId)

DELETE /tenants/{tenantId}/policies/{key}
       â†’ Remove the L1 override (tenant reverts to L0 default)
       â†’ Scope required: policy:write:l1

GET    /tenants/{tenantId}/policies/{key}/history
       â†’ Paginated history of all instances (Active + Revoked + Expired)
       â†’ Scope required: policy:read
```

**`PolicyInstanceWriteRequest`**:
```json
{
  "value":       "EmployeesOptOut",
  "effectiveAt": "2026-06-01T00:00:00Z",
  "expiresAt":   null,
  "reason":      "Company MFA rollout Phase 2"
}
```

**`PolicyInstance` response**:
```json
{
  "instanceId":         "3f2a1b4c-...",
  "policyKey":          "policy.mfa.enforcement_stage",
  "definitionVersion":  1,
  "level":              "L1",
  "tenantId":           12345,
  "value":              "EmployeesOptOut",
  "effectiveAt":        "2026-06-01T00:00:00Z",
  "expiresAt":          null,
  "status":             "Active",
  "reason":             "Company MFA rollout Phase 2",
  "approvedBy":         null,
  "createdBy":          "admin@acme.com",
  "createdAt":          "2026-05-11T19:00:00Z"
}
```

---

### Policy Instances â€” Application Level (L2)

```
GET    /apps/{appId}/tenants/{tenantId}/policies
       â†’ All active L2 instances for an app+tenant
       â†’ Scope required: policy:read

GET    /apps/{appId}/tenants/{tenantId}/policies/{key}
       â†’ Single L2 DB instance (code-registered overrides not returned here)

PUT    /apps/{appId}/tenants/{tenantId}/policies/{key}
       â†’ Create or replace an L2 override
       â†’ Scope required: policy:write:l2 (appId must match token sub claim)
       â†’ Body: PolicyInstanceWriteRequest

DELETE /apps/{appId}/tenants/{tenantId}/policies/{key}
       â†’ Remove L2 DB override (code-registered overrides unaffected)
       â†’ Scope required: policy:write:l2
```

---

### Policy Instances â€” User Level (L3) â€” Opt-Out/Opt-In

```
GET    /me/policies
       â†’ All active L3 instances for the current user
       â†’ Scope required: policy:read (user identity from token)

GET    /me/policies/{key}
       â†’ Current L3 instance for this user and policy

POST   /me/policies/{key}/opt-out
       â†’ Request opt-out (creates L3 instance if eligible)
       â†’ Scope required: policy:write:l3
       â†’ Body: { "reason": "..." }
       â†’ Returns: PolicyInstance or 403 (not eligible)

DELETE /me/policies/{key}/opt-out
       â†’ Cancel opt-out (revokes L3 instance)
       â†’ Scope required: policy:write:l3

POST   /me/policies/{key}/opt-in
       â†’ User chooses to be MORE restricted than L2 default
       â†’ Body: { "value": "AllUsersOptOut" }
       â†’ Returns: PolicyInstance
```

---

### Policy Evaluation

```
POST   /evaluate
       â†’ Resolve the effective policy value for a given context
       â†’ Used by SDK on cache miss; can also be called directly for real-time checks
       â†’ Scope required: policy:read

POST   /evaluate/batch
       â†’ Resolve multiple policies for the same context in one round-trip
       â†’ Returns map of policyKey â†’ PolicyResult
```

**`/evaluate` request**:
```json
{
  "policyKey": "policy.mfa.enforcement_stage",
  "context": {
    "tenantId": 12345,
    "appId":    "mfa-service",
    "userId":   99887,
    "userType": "Employee"
  }
}
```

**`/evaluate` response**:
```json
{
  "policyKey":     "policy.mfa.enforcement_stage",
  "resolvedValue": "EmployeesOptOut",
  "resolvedLevel": "L1",
  "instanceId":    "3f2a1b4c-...",
  "canOptOut":     true,
  "canOptIn":      false,
  "evaluatedAt":   "2026-05-11T19:00:00Z"
}
```

---

### Emergency Exceptions (ST Ops)

```
POST   /admin/exceptions
       â†’ Create a time-bounded exception at any level
       â†’ Scope required: policy:admin
       â†’ Body: PolicyExceptionRequest

GET    /admin/exceptions
       â†’ List all active exceptions
       â†’ Query: ?policyKey=&tenantId=&expiresWithin=7d

DELETE /admin/exceptions/{exceptionId}
       â†’ Revoke an exception before it expires
       â†’ Scope required: policy:admin
```

**`PolicyExceptionRequest`**:
```json
{
  "policyKey":   "policy.mfa.enforcement_stage",
  "targetLevel": "L1",
  "tenantId":    12345,
  "userId":      null,
  "appId":       null,
  "value":       "Disabled",
  "reason":      "Tenant migration â€” MFA temporarily suspended",
  "expiresAt":   "2026-05-18T23:59:59Z",
  "approvedBy":  "ops-user@example.com",
  "ticketRef":   "OPS-4521"
}
```

---

### SDK Bulk Fetch (Cache Population)

```
POST   /sdk/instances/bulk
       â†’ Fetch all instances relevant to an SDK client in one call
       â†’ Used on startup and after cache invalidation
       â†’ Scope required: policy:read

Body:
{
  "appId":      "mfa-service",
  "tenantIds":  [12345, 12346],
  "policyKeys": ["policy.mfa.enforcement_stage", "policy.session.timeout_minutes"]
}

Response:
{
  "instances": [
    { "level": "L0", "policyKey": "...", "value": "...", ... },
    { "level": "L1", "tenantId": 12345, "policyKey": "...", "value": "...", ... }
  ],
  "fetchedAt": "2026-05-11T19:00:00Z"
}
```

This single endpoint replaces N Ã— M individual GET calls during SDK startup.

---

## Event Contracts

PolicyService and SDK clients publish to two distinct buses based on event class. See ADR-004 for the rationale.

### Azure ServiceBus â€” Topic: `policy-changes`

**Producer**: PolicyService, on every successful write.
**Consumers**: Audit Sink (full stream) and every SDK instance (filtered).

Routing properties on the BrokeredMessage:

| Property    | Value                                |
|-------------|--------------------------------------|
| `EventType` | e.g. `PolicyInstanceChanged`         |
| `PolicyKey` | e.g. `policy.mfa.enforcement_stage`     |
| `TenantId`  | integer string (null for L0 events)  |
| `Level`     | `L0` / `L1` / `L2` / `L3`            |

SDK subscriptions use broker-side SQL filters so each consumer only sees relevant events:
```sql
PolicyKey = 'policy.mfa.enforcement_stage' AND (TenantId = '12345' OR TenantId IS NULL)
```

Message body: the event JSON described in ADR-004.

**Message size limit**: 256 KB. Change events are small (<2 KB) so no compression is required.

### Kafka â€” Topic: `policy-audit-events`

**Producer**: every SDK instance (via the `IPolicyAuditEmitter` background channel).
**Consumer**: Audit Sink consumer group only.

Partitioning: `key = tenantId` so all events for a tenant land on the same partition, preserving per-tenant ordering and natural tenant isolation for backfill/replay scenarios.

Headers:

| Header      | Value                       |
|-------------|-----------------------------|
| `EventType` | e.g. `PolicyEvaluated`      |
| `AppId`     | Publishing app's ID         |
| `Schema`    | `policy-audit-event-v1`     |

**Message size**: typical event <1 KB. Kafka broker max set to 1 MB to accommodate burst-batched payloads.
**Retention**: 14 days hot (covers DR + index rebuild windows); compaction not used (events are append-only history).
**Replay**: the Audit Sink supports resetting its consumer group offset for backfilling Elasticsearch after schema migrations.

---

## Error Responses

All errors follow the standard error envelope:

```json
{
  "error": {
    "code":    "policy_constraint_violation",
    "message": "Requested value 'Disabled' exceeds L0 minimum 'AdminsOnly' for policy 'policy.mfa.enforcement_stage'",
    "details": {
      "requestedValue": "Disabled",
      "allowedMinimum": "AdminsOnly",
      "level":          "L1"
    }
  }
}
```

| HTTP Code | Scenario |
|-----------|----------|
| 400 | Invalid request body, unknown policyKey, value not in allowedValues |
| 403 | Scope insufficient, tenantId mismatch, override not allowed by definition |
| 404 | No active instance at requested level (not an error â€” callers use L0 default) |
| 409 | Concurrent modification detected (include ETag support for PUT operations) |
| 422 | Business rule violation (e.g. L1 value looser than L0, opt-out not eligible) |

---

## Rate Limits

| Endpoint Group | Limit |
|----------------|-------|
| `GET /evaluate*` | 1000 req/s per service account |
| `PUT/DELETE /tenants/*/policies/*` | 100 req/s per tenant |
| `POST /me/policies/*/opt-out` | 10 req/min per user |
| `POST /admin/exceptions` | 50 req/min per ops account |
| `POST /sdk/instances/bulk` | 200 req/s per service account |

SDK bulk-fetch is preferred over repeated individual `GET /evaluate` calls to stay within rate limits during startup.

---

## Health and Observability

```
GET /health/live     â†’ Liveness probe (always 200 if process is up)
GET /health/ready    â†’ Readiness probe (checks DB, ServiceBus, and Kafka producer connectivity)
GET /metrics         â†’ Prometheus-compatible metrics:
                         policy_evaluations_total{policyKey, resolvedLevel}
                         policy_instance_writes_total{level, policyKey}
                         policy_cache_misses_total{appId, policyKey}
                         policy_exceptions_active{policyKey}
```
