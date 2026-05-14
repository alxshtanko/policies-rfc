# ADR-004: Policy Audit and Dashboard

**Status**: Proposed  
**Date**: 2026-05-11  
**Authors**: Identity Team  
**Relates to**: ADR-001 (SDK), ADR-002 (Override Flows), ADR-003 (Storage)

---

## Context

Policy data is inherently distributed:

- PolicyService owns L0–L3 instance changes.
- Each consuming app (`mfa-service`, `host-api`, `identity-service`, monolith, etc.) evaluates policies locally and may have code-registered L2 overrides that never touch PolicyService.
- User opt-outs happen via API but their effect is evaluated per-app.

Without centralized audit and reporting, the following questions are unanswerable:

- "What MFA enforcement stage is tenant X currently on, and who changed it last?"
- "How many users have opted out of MFA across all apps?"
- "Which tenants are still on the platform default, having never configured their own policy?"
- "Show me every policy change in the last 30 days across all tenants."
- "Did the emergency exception for tenant Y expire, and did the policy correctly revert?"

The audit and dashboard system must aggregate data from **distributed app-level evaluations** and **centralized PolicyService writes**, without requiring cross-database joins or app-to-app API calls.

---

## Decision

Use an **event-driven audit pipeline** that intentionally splits across two buses by event class:

- **Write-path events** (low volume, 100% sampled, need broker-side filtering for cache invalidation) → **Azure ServiceBus** topic `policy-changes`, produced by PolicyService.
- **Evaluation/audit events** (high volume, fan-in to one consumer, benefit from replay) → **Kafka** topic `policy-audit-events`, produced by every SDK client and partitioned by `tenantId`.

A dedicated **Audit Sink Service** consumes from both — a ServiceBus subscription on `policy-changes` and a Kafka consumer group on `policy-audit-events` — and indexes everything into Elasticsearch. A **Dashboard API** queries Elasticsearch to serve the Central Policy Admin UI.

---

## Event Taxonomy

All events share a common envelope:

```json
{
  "eventId":      "uuid",
  "eventType":    "<see below>",
  "schemaVersion": 1,
  "tenantId":     12345,
  "appId":        "mfa-service",
  "timestamp":    "2026-05-11T19:00:00Z",
  "correlationId": "request-trace-id",
  "payload":      { /* event-specific */ }
}
```

### Write-path events (emitted by PolicyService)

| Event Type | Trigger | Sampling |
|------------|---------|----------|
| `PolicyDefinitionCreated` | New definition registered | 100% |
| `PolicyDefinitionUpdated` | Non-breaking update (e.g. new allowed value) | 100% |
| `PolicyDefinitionSuperseded` | Breaking change, new version created | 100% |
| `PolicyInstanceChanged` | L0/L1/L2/L3 instance created or updated | 100% |
| `PolicyInstanceRevoked` | Instance superseded or manually revoked | 100% |
| `PolicyInstanceExpired` | expires_at passed, background job ran | 100% |
| `PolicyOverrideGranted` | Emergency exception created by ST Ops | 100% |
| `PolicyOverrideRevoked` | Exception removed or expired | 100% |
| `PolicyOptOutRequested` | User submits opt-out (L3 created) | 100% |
| `PolicyOptOutCancelled` | User reverts opt-out (L3 revoked) | 100% |

### Evaluation-path events (emitted by SDK, per-app)

| Event Type | Trigger | Sampling |
|------------|---------|----------|
| `PolicyEvaluated` | `IPolicyEvaluator.EvaluateAsync()` called | Configurable (default 1%) |
| `PolicyCacheMiss` | SDK fetched from PolicyService on cache miss | 100% (low volume) |
| `PolicyCacheInvalidated` | ServiceBus change event received | 100% |

**Sampling rationale for `PolicyEvaluated`**: at scale, evaluations happen on every authenticated request. At 50k req/s across all apps, 100% sampling would generate ~4B events/day. 1% sampling (configurable per app via `AuditSampleRate` in SDK options) yields ~40M events/day — sufficient for trend analysis. For specific investigations, the sample rate can be raised temporarily per-tenant or per-policy via PolicyService config.

---

## Payload Schemas

### `PolicyInstanceChanged`

```json
{
  "instanceId":         "uuid",
  "policyKey":          "policy.mfa.enforcement_stage",
  "definitionVersion":  1,
  "level":              "L1",
  "tenantId":           12345,
  "appId":              null,
  "userId":             null,
  "previousValue":      "AdminsOnly",
  "newValue":           "EmployeesOptOut",
  "reason":             "Company MFA rollout Phase 2",
  "approvedBy":         null,
  "ticketRef":          null,
  "effectiveAt":        "2026-06-01T00:00:00Z",
  "expiresAt":          null,
  "changedBy":          "admin@acme.com"
}
```

### `PolicyEvaluated`

```json
{
  "policyKey":      "policy.mfa.enforcement_stage",
  "resolvedValue":  "EmployeesOptOut",
  "resolvedLevel":  "L1",
  "instanceId":     "uuid",
  "tenantId":       12345,
  "appId":          "mfa-service",
  "userId":         99887,
  "userType":       "Employee",
  "requestId":      "trace-id-abc",
  "evaluatedAt":    "2026-05-11T19:00:00Z",
  "cacheHit":       true
}
```

### `PolicyOptOutRequested`

```json
{
  "instanceId":  "uuid",
  "policyKey":   "policy.mfa.enforcement_stage",
  "tenantId":    12345,
  "userId":      99887,
  "userType":    "Employee",
  "previousValue": "EmployeesOptOut",
  "optOutValue": "Disabled",
  "expiresAt":   "2026-08-11T19:00:00Z",
  "requestedAt": "2026-05-11T19:00:00Z"
}
```

---

## Bus Topology

```
PolicyService  ──▶  Azure ServiceBus  Topic: policy-changes
                    Subscriptions:
                      audit-sink                 (all write-path events, no filter)
                      sdk-cache-invalidation-*   (PolicyInstanceChanged only,
                                                  SQL filter per (tenantId, policyKey))

SDK (each app) ──▶  Kafka  Topic: policy-audit-events
                    (partitioned by tenantId, ~24 partitions)
                    Consumer group:
                      audit-sink                 (parallel consumers, replay supported)
```

Why split:

| Concern                              | ServiceBus (changes) | Kafka (audit/eval) |
|--------------------------------------|----------------------|--------------------|
| Volume                               | <1k events/day total | >40M events/day (1% sampled) |
| Need for broker-side per-tenant filtering | Yes (SDK cache invalidation) | No (single consumer) |
| Need for replay / index rebuild      | No                   | Yes                |
| Per-message cost at scale            | Negligible           | Would be prohibitive on ServiceBus |
| Existing infrastructure          | Available            | Already running for Debezium/CDC |

The Audit Sink Service runs both consumers in the same process and merges the streams into Elasticsearch. No cross-app fan-out is needed because the SDK emits independently.

---

## Audit Sink Service

A lightweight .NET worker service (`policy-audit-sink`):

```
Startup:
  - Open ServiceBus subscription on `policy-changes` (write-path events)
  - Open Kafka consumer group on `policy-audit-events` (evaluation events, partition-aware)
  - Open Elasticsearch bulk indexing channel

Per-batch (every 5s or 500 events):
  1. Deserialize events
  2. Enrich: resolve tenant name from cache (tenantId → name lookup, TTL 10 min)
  3. Bulk-index to Elasticsearch:
       policy-changes-YYYY.MM    (write-path events)
       policy-evals-YYYY.MM      (evaluation events, sampled)
  4. Acknowledge ServiceBus messages and commit Kafka consumer offsets
```

**Dead-letter handling**: failed events (malformed, schema mismatch) go to a dedicated dead-letter queue. An alert fires if DLQ depth > 100. Manual reprocessing is supported via a `policy-audit-sink --reprocess-dlq` CLI flag.

---

## Elasticsearch Index Design

### `policy-changes-*` (write-path, 100% events)

```json
{
  "mappings": {
    "properties": {
      "eventId":           { "type": "keyword" },
      "eventType":         { "type": "keyword" },
      "policyKey":         { "type": "keyword" },
      "tenantId":          { "type": "integer" },
      "tenantName":        { "type": "keyword" },
      "appId":             { "type": "keyword" },
      "userId":            { "type": "integer" },
      "level":             { "type": "keyword" },
      "previousValue":     { "type": "keyword" },
      "newValue":          { "type": "keyword" },
      "changedBy":         { "type": "keyword" },
      "reason":            { "type": "text", "fields": { "raw": { "type": "keyword" } } },
      "ticketRef":         { "type": "keyword" },
      "timestamp":         { "type": "date" },
      "effectiveAt":       { "type": "date" },
      "expiresAt":         { "type": "date" }
    }
  }
}
```

ILM policy: hot for 30 days, warm for 12 months, cold for 7 years, then delete.

### `policy-evals-*` (evaluation events, sampled)

```json
{
  "mappings": {
    "properties": {
      "policyKey":     { "type": "keyword" },
      "resolvedValue": { "type": "keyword" },
      "resolvedLevel": { "type": "keyword" },
      "tenantId":      { "type": "integer" },
      "appId":         { "type": "keyword" },
      "userId":        { "type": "integer" },
      "userType":      { "type": "keyword" },
      "evaluatedAt":   { "type": "date" },
      "cacheHit":      { "type": "boolean" }
    }
  }
}
```

ILM policy: hot for 7 days, warm for 90 days, then delete.

---

## Cross-App Aggregation

Because the SDK emits evaluation events **per-app**, the Audit Sink receives evaluation data from all apps without any inter-app queries or coordination. Aggregation happens in Elasticsearch at query time:

```json
// "How many users have opted out of MFA across all apps?"
{
  "query": {
    "bool": {
      "must": [
        { "term": { "eventType": "PolicyOptOutRequested" } },
        { "term": { "policyKey": "policy.mfa.enforcement_stage" } },
        { "range": { "timestamp": { "gte": "now-30d" } } }
      ]
    }
  },
  "aggs": {
    "by_app":    { "terms": { "field": "appId",   "size": 20 } },
    "by_tenant": { "terms": { "field": "tenantId", "size": 100 } },
    "total_unique_users": { "cardinality": { "field": "userId" } }
  }
}
```

```json
// "Policy adoption: what % of tenants are at each MFA stage?"
{
  "query": {
    "bool": {
      "must": [
        { "term": { "eventType": "PolicyInstanceChanged" } },
        { "term": { "policyKey": "policy.mfa.enforcement_stage" } },
        { "term": { "level": "L1" } }
      ]
    }
  },
  "aggs": {
    "latest_per_tenant": {
      "terms": { "field": "tenantId", "size": 10000 },
      "aggs": {
        "most_recent": { "top_hits": { "sort": [{ "timestamp": "desc" }], "size": 1 } }
      }
    }
  }
}
```

For the adoption query, the Dashboard API post-processes the aggregation to compute the current effective stage per tenant (using the latest `PolicyInstanceChanged` for each tenantId).

---

## Dashboard API

A REST API (`ium-policy-dashboard-api`) backed by Elasticsearch. Consumed by the Central Policy Admin UI and by Grafana for alerting.

### Endpoints

```
GET  /dashboard/policies/{key}/adoption
     → Distribution of current L1 values across all tenants
     → Response: { values: { "AdminsOnly": 120, "EmployeesOptOut": 450, ... }, total: 1200 }

GET  /dashboard/policies/{key}/opt-outs
     → Count and trend of L3 opt-outs over time
     → Query params: tenantId?, appId?, from, to

GET  /dashboard/tenants/{tenantId}/policy-summary
     → All L1 overrides for a tenant (current active instances)
     → All active L3 instances (user opt-outs) for the tenant

GET  /dashboard/audit-log
     → Paginated change log: who changed what, when
     → Query params: policyKey?, tenantId?, level?, from, to, changedBy?

GET  /dashboard/exceptions/active
     → All currently active emergency exceptions (non-null ticketRef, not expired)

GET  /dashboard/exceptions/expired-soon
     → Exceptions expiring in the next 7 days (alert surface)

GET  /dashboard/metrics/cache-miss-rate
     → Cache miss rate by app and policy key (from PolicyCacheMiss events)
```

### Authorization

- `policy:read` scope → all read endpoints
- `policy:admin` scope → includes `/exceptions/*` write operations (see ADR-002)
- Tenant-scoped access: tenant admins can only query their own `tenantId`; ST ops see all tenants

---

## Dashboard UI Capabilities

The Central Policy Admin UI consumes the Dashboard API and renders:

| View | Data Source | Key Metrics |
|------|-------------|-------------|
| **Policy Adoption** | `/adoption` | Donut chart: % of tenants per stage |
| **Tenant Policy Matrix** | `/policy-summary` per tenant | Grid: tenant × policy → current value |
| **Change Audit Log** | `/audit-log` | Searchable table with filters |
| **Opt-Out Trends** | `/opt-outs` | Time-series chart: opt-outs per day |
| **Active Exceptions** | `/exceptions/active` | List with expiry countdown |
| **Expiring Exceptions** | `/exceptions/expired-soon` | Alert banner + list |
| **Cache Health** | `/metrics/cache-miss-rate` | Cache miss rate by app (ops view) |

---

## Alerting (Grafana)

The Dashboard API exposes a Prometheus-compatible `/metrics` endpoint. Grafana alerts are configured for:

| Alert | Condition | Severity |
|-------|-----------|----------|
| Exception about to expire | `expires_at < now + 24h` AND `status = Active` | Warning |
| Exception expired without revert | Policy still at exception value 1h after expiry | Critical |
| High DLQ depth | Audit Sink DLQ > 100 | Warning |
| Unusual opt-out spike | Opt-outs > 10× rolling 7d average | Warning |
| PolicyService write latency | p95 > 500ms | Warning |

---

## Consequences

**Positive**
- Complete audit trail for all policy changes and opt-outs, across every app, with no inter-app query coupling.
- Elasticsearch supports both operational queries (recent changes) and analytical queries (adoption rates) without a separate data warehouse.
- Dashboard exposes previously invisible state: which tenants are on platform defaults, who has exceptions, opt-out rates.
- Sampling at 1% for evaluation events keeps Elasticsearch costs proportional while preserving trend visibility.

**Negative / Risks**
- Eventual consistency: the audit trail may lag real-time by a few seconds (ServiceBus delivery + Kafka producer flush + Sink batch interval). Not suitable for real-time enforcement decisions — use PolicyService directly for those.
- Operating two buses means two sets of monitoring, IaC, and incident response. Justified by the workload split, but worth revisiting if Kafka coverage in the platform expands enough to make ServiceBus the outlier.
- Adoption query (current stage per tenant) requires a post-processing step in the Dashboard API because Elasticsearch aggregations return the history, not a materialized current view. At >10k tenants, consider materializing a `tenant_policy_state` table in the Dashboard API's own DB.
- `cardinality` aggregations on `userId` are approximate in Elasticsearch (HyperLogLog). Acceptable for trend analysis; not acceptable for precise unique-user counts. Precise counts require a dedicated counter in PolicyService's PostgreSQL.
