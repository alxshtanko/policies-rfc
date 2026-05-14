# Policies Infrastructure — Architecture Decision Records

This folder contains the design documentation for the Policy Management framework.

## Documents

### Foundational design

| ADR | Title | Summary |
|-----|-------|---------|
| [ADR-001](ADR-001-sdk-policy-framework.md) | SDK / Library Design | `PolicyFramework` (.NET) and `policy-client` (TypeScript) — local evaluation, caching, override registration, audit emission |
| [ADR-002](ADR-002-override-exception-flows.md) | Override and Exception Flows | Tenant overrides, app overrides, user opt-in/opt-out, emergency operator exceptions with mandatory expiry |
| [ADR-003](ADR-003-policy-data-storage.md) | Policy Data Storage | Centralized PostgreSQL in PolicyService, app-local cache pattern, schema evolution and versioning strategy |
| [ADR-004](ADR-004-audit-and-dashboard.md) | Audit and Dashboard | Event taxonomy, ServiceBus + Kafka pipeline, Elasticsearch storage, cross-app aggregation, sampling, dashboards, alerting |
| [ADR-005](ADR-005-policy-service-api.md) | PolicyService API Surface | Full REST API contract, auth scopes, ServiceBus + Kafka event contracts, rate limits, error codes |
| [ADR-006](ADR-006-mfe-policy-management.md) | MFE Policy Management | `policy-panel` component contract, Central Policy Admin UI, app manifest registration, opt-out panel for end users |
| [ADR-007](ADR-007-data-models-schema.md) | Data Models and Schema | PostgreSQL DDL, indexes, atomic upsert procedure, Flyway migration seed for MFA enforcement policy |

### PRD-driven extensions (cover the critical structural gaps)

| ADR | Title | Summary |
|-----|-------|---------|
| [ADR-008](ADR-008-scope-hierarchy-and-targeting.md) | Scope Hierarchy & Targeting | Six named levels (Platform / Org / Tenant / App / Group / User), role and environment filters, expanded `PolicyContext` |
| [ADR-009](ADR-009-policy-composition-and-side-effects.md) | Policy Value Composition & Side Effects | Structured JSON values + schemas, MFA factor catalog, multi-provider SSO model, policy dependencies, side-effect handlers, step-up MFA via action context |
| [ADR-010](ADR-010-lifecycle-drafts-and-exemptions.md) | Lifecycle, Drafts & Exemption Workflow | `Draft / PendingApproval / Active / Revoked / Expired` lifecycle, `policy_plan` for bulk preview + activation, `exemption_request` entity with approver routing, complementary to operator exceptions |

## Key Design Decisions

- **Four-level hierarchy** (L0 global → L1 tenant → L2 app → L3 user). Each level can only tighten, never loosen, the level above — unless the definition explicitly permits relaxation.
- **Local evaluation**: the SDK caches policy instances and evaluates the hierarchy in-process, eliminating per-request latency on the hot path. Cache invalidation is event-driven via **Azure ServiceBus** with broker-side SQL filters per (tenant, policy key).
- **Everything is audited**: write-path events (100% sampled) flow through **ServiceBus** to the audit pipeline; high-volume evaluation events (default 1% sampled) flow through **Kafka** for throughput and replay. Both streams land in the same Elasticsearch audit index. No app needs to instrument audit logging independently.
- **Tech stack**: .NET 10, ASP.NET Core 10, PostgreSQL 15, Flyway, Azure ServiceBus (low-volume change events), Apache Kafka (high-volume audit/eval events).
- **Override flows are explicit and bounded**: all exceptions require a reason; emergency overrides require a ticket reference and a mandatory expiry date.
- **Schema is append-only**: policy definitions are never mutated once active. Breaking changes produce a new version; apps register migrators to translate old stored values at read time.

## MFA Enforcement Policy — Canonical Example

```
PolicyDefinition key: policy.mfa.enforcement_stage
Stages (ordered, ascending restrictiveness):
  0 - Disabled
  1 - EnabledAll           (MFA available but not required)
  2 - AdminsOnly           (required for Admins)
  3 - AdminsAndPrivileged  (required for Admins + Privileged Users)
  4 - EmployeesOptOut      (required for all Employees; can opt-out)
  5 - EmployeesAndTechsOptOut  (Employees + Managed Technicians; can opt-out)
  6 - AllUsersOptOut       (all users required; can opt-out)

Tenant admin controls: L1 instance (can set any stage within L0 maximum)
App override: L2 code registration (can enforce a floor, e.g. always >= AdminsAndPrivileged)
User opt-out: L3 instance (only when resolved stage is 4, 5, or 6)
```

## Implementation Phases

| Phase | Scope |
|-------|-------|
| 1 | PolicyService core, SDK with Platform/Tenant evaluation, MFA enforcement policy migration |
| 2 | App-level overrides, `policy-panel`, Central Policy Admin UI, app manifest registration |
| 3 | Audit pipeline (Audit Sink, Elasticsearch indexing), Dashboard API and UI |
| 4 | User opt-in/opt-out, operator exception flow, expiry background job, Grafana alerting |
| 5 | **ADR-008** Org level, Group level, role + environment targeting |
| 6 | **ADR-009** Factor + provider catalogs, structured MFA + SSO policies, dependencies, side-effect handlers |
| 7 | **ADR-010** Drafts, plans, exemption requests, approver inbox UX |

---

## Coverage of PRD critical requirements

This matrix maps each PRD critical requirement to the ADR that delivers it.

| Critical requirement                                                | ADR  |
|---------------------------------------------------------------------|------|
| Configure rules before enabling them (Draft state)                  | 010  |
| Future org/root-level policy management                             | 008  |
| Role-based targeting                                                | 008  |
| Group exceptions                                                    | 008 + 010 |
| Environment / routing context (Go vs Next vs Enterprise Hub)        | 008  |
| Multi-level opt-out (org / role / group / app)                      | 008  |
| Exemption workflow (request → review → approve)                     | 010  |
| Context-aware evaluation (role, auth method, env, location, risk)   | 008  |
| Slow-roll SSO by role                                               | 008  |
| Required vs allowed vs disabled MFA factors                         | 009  |
| MFA factor catalog (SMS, TOTP, passkeys, future)                    | 009  |
| Multi-provider SSO (Entra, Google, Okta)                            | 009  |
| SSO ↔ account-linking dependency                                    | 009  |
| Step-up MFA for sensitive actions                                   | 009  |
| Session-revocation cascade on password rotation                     | 009  |
| Restrict access to apps / environments                              | 008 + 009 (`access.allowed_environments`) |
| Block Next / force Enterprise Hub                                   | 008  |
| Cross-tenant linking control                                        | 008 + 009 |
| Managed-identity ownership boundaries                               | 009  |
| UX consistency between opt-in and exemption flows                   | 010  |
