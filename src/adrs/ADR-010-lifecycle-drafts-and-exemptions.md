# ADR-010: Lifecycle, Drafts & Exemption Workflow

**Status**: Proposed
**Date**: 2026-05-13
**Authors**: Identity Team
**Relates to**: ADR-002 (override flows), ADR-003 (storage), ADR-007 (DDL), ADR-008 (scope)

---

## Context

ADR-002 introduced four override flows (tenant, app, user, operator exception). What it did **not** introduce:

1. **A way to configure a policy before activating it.** Admins must be able to draft a new SSO rollout, review the wording, schedule the activation date â€” then flip it on. Today every PUT immediately becomes Active.
2. **An exemption *request* workflow.** ADR-002 treats exemptions as something only ST Ops can grant via `/admin/exceptions`. Real admins need a self-service flow where a user (or their manager) requests exemption â†’ an approver reviews â†’ approved exemptions become L4-Group or L5-User instances. The "approval" must be auditable and policy-scoped.
3. **Group-level exemption mechanics.** With L4-Group from ADR-008 in place, but no workflow to create a group exemption from a request â€” bridging that requires entity + state-machine design.

This ADR fills both: a richer `status` lifecycle for `policy_instances`, plus a separate `exemption_request` entity with its own state machine. They're closely related (an approved exemption *materializes* a Draft â†’ Active instance), so they're designed together.

---

## Decision

### 1. Expanded `policy_instances.status`

Replace ADR-007's three-state status with five:

```
Draft       â€” saved but not visible at evaluation
PendingApproval â€” submitted for approval (when definition.requires_approval)
Active      â€” in effect (today's only "live" state)
Revoked     â€” superseded or manually rescinded
Expired     â€” TTL elapsed
```

Allowed transitions:
```
Draft           â†’ PendingApproval (when approval required)
Draft           â†’ Active          (direct activation, when no approval required)
PendingApproval â†’ Active          (approver approves)
PendingApproval â†’ Revoked         (approver denies, with reason)
Active          â†’ Revoked
Active          â†’ Expired         (background job at expires_at)
Draft           â†’ Revoked         (admin discards before activation)
```

A Draft is invisible to evaluation. PolicyService still indexes it and the UI shows it in a "Drafts" tab. Activation has two flavors:

- **Activate now**: status â†’ `Active`, `effective_at = NOW()`
- **Schedule**: status stays `Draft` (or `PendingApproval`), `effective_at` set to future timestamp. A background job promotes it to `Active` at that time.

This is distinct from the existing `effective_at` field's role for Active rows (which delays propagation but the row is *Active* the moment it's written). Drafts are not Active even if `effective_at` is in the past â€” the activation transition is explicit.

### 2. Bulk preview + activation ("plans")

A `policy_plan` groups multiple Draft instances so an admin can review/activate them atomically:

```sql
CREATE TABLE policy.policy_plan (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    description  TEXT,
    scope_summary TEXT,        -- human-readable: "Tenant ACME, Org NorthRegion"
    status       TEXT NOT NULL CHECK (status IN ('Open','Submitted','Activated','Discarded')),
    created_by   TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    activated_at TIMESTAMPTZ
);

CREATE TABLE policy.policy_plan_item (
    plan_id     UUID NOT NULL REFERENCES policy.policy_plan(id) ON DELETE CASCADE,
    instance_id UUID NOT NULL REFERENCES policy.policy_instances(id),
    PRIMARY KEY (plan_id, instance_id)
);
```

Admin workflow:
1. Create plan "Q3 SSO rollout"
2. Add Draft instances to it (`policy.auth.method = SsoOnly` at Org level with `applies_to_roles: ['admin']`, plus three group exemption Drafts)
3. Preview: evaluation shows what each affected user would see if the plan were live (PolicyService offers a `POST /plans/{id}/dry-run` that takes a sample context and returns resolved values both before and after the plan)
4. Submit / Activate: all instances in the plan transition to `Active` atomically (or `PendingApproval` if any require approval)

### 3. Exemption request entity

Exemptions are conceptually different from override edits:
- An override edit is *I am the admin and I'm setting the value.*
- An exemption is *I am subject to a policy and I need not to be, please approve.*

The latter is a workflow, not a row update. New entity:

```sql
CREATE TABLE policy.exemption_request (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_key           TEXT NOT NULL,
    policy_version       INT  NOT NULL,

    -- Target: what scope the exemption would apply to if approved
    target_level         TEXT NOT NULL
                            CHECK (target_level IN ('User','Group')),
    target_tenant_id     INT,
    target_group_id      UUID REFERENCES policy.policy_group(id),
    target_user_id       INT,

    -- Requested value (what the requester wants to be exempted *to*)
    requested_value      TEXT NOT NULL,
    requested_expires_at TIMESTAMPTZ,

    -- Workflow
    status               TEXT NOT NULL DEFAULT 'Submitted'
                            CHECK (status IN ('Submitted','UnderReview','Approved','Denied','Withdrawn','Expired')),
    justification        TEXT NOT NULL,
    business_reason      TEXT,
    requested_by         TEXT NOT NULL,
    requested_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_by           TEXT,
    decided_at           TIMESTAMPTZ,
    decision_notes       TEXT,

    -- When approved, points at the PolicyInstance the request materialized
    instance_id          UUID REFERENCES policy.policy_instances(id),

    CONSTRAINT chk_exemption_target CHECK (
       (target_level = 'User'  AND target_user_id  IS NOT NULL) OR
       (target_level = 'Group' AND target_group_id IS NOT NULL AND target_tenant_id IS NOT NULL)
    )
);

CREATE INDEX idx_exemption_open ON policy.exemption_request(policy_key, status)
    WHERE status IN ('Submitted', 'UnderReview');

CREATE INDEX idx_exemption_target_user  ON policy.exemption_request(target_user_id)
    WHERE target_user_id IS NOT NULL;

CREATE INDEX idx_exemption_target_group ON policy.exemption_request(target_group_id)
    WHERE target_group_id IS NOT NULL;
```

### 4. Exemption state machine

```
            â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
            â”‚ Submitted  â”‚ â†â”€â”€â”€ user (or admin) submits request
            â””â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”˜
                  â”‚ approver picks it up
                  â–¼
            â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    withdraw     â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
            â”‚UnderReview â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¶  â”‚Withdrawn â”‚
            â””â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”˜                 â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                  â”‚
       approve    â”‚   deny
            â”Œâ”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”
            â–¼           â–¼
      â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”
      â”‚ Approved â”‚  â”‚ Denied â”‚
      â””â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”€â”€â”˜
           â”‚ creates PolicyInstance (Active, expires_at = requested)
           â”‚
           â–¼ background job at expires_at
      â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
      â”‚ Expired  â”‚  (the request itself; the instance is independently Expired)
      â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

Transitions in detail:

| From â†’ To       | Trigger                                  | Effect                                  |
|-----------------|------------------------------------------|-----------------------------------------|
| Submitted â†’ UnderReview | Approver claims request          | Audit event `ExemptionUnderReview`      |
| Submitted â†’ Withdrawn   | Requester cancels                | Audit event                             |
| UnderReview â†’ Approved  | Approver approves                | Creates `policy_instance` at level User/Group with `expires_at = requested_expires_at`. Links `instance_id`. Audit event `ExemptionApproved`. |
| UnderReview â†’ Denied    | Approver denies                  | No instance. Audit event with reason.   |
| Approved â†’ Expired      | Background job past `expires_at` | Linked instance also Expires. Audit event. |

### 5. Approver routing

`policy_definitions.approval_routing JSONB` describes who can approve exemptions for a given policy:

```json
{
  "rule": "any",
  "approvers": [
    { "kind": "role",  "value": "tenant_admin",  "scope": "tenant" },
    { "kind": "group", "value": "security-team", "scope": "org" }
  ]
}
```

Rule `any` = first valid approver decides. `all` = every group member must approve (rare). Approver identities are validated server-side against the same role/group sources used for policy evaluation (ADR-008 Â§3, Â§5).

If `approval_routing` is `null` for a definition, exemptions for that definition cannot be requested via this flow â€” only ST Ops can grant them via `/admin/exceptions`.

### 6. Differences from `/admin/exceptions` (ADR-002)

The pre-existing operator-exception endpoint stays. The two flows are complementary:

| Flow                       | Initiator | Approver       | Use case |
|----------------------------|-----------|----------------|----------|
| `/admin/exceptions` (ADR-002) | ST Ops | none (self-service for ops) | Emergency / regulator / outage |
| `/exemption_requests` (this ADR) | Any user with `policy:request:exemption` | Configured per definition | Routine business-justified exemptions |

Both produce `policy_instances` rows, both leave an audit trail. The difference is *who authorizes* â€” ops self-serve in the first, tenant-side governance in the second.

### 7. UX consistency between opt-in and exemption flows

Per the PRD requirement that opt-in / opt-out / exemption UX be consistent:

- The end-user `OptOutPanel` (ADR-006) detects when the policy has `requires_approval=true` and switches to "Request exemption" mode â€” same panel, two backend paths.
- The Central Admin UI exposes a unified "Open requests" view that lists both `/admin/exceptions` and `/exemption_requests` filtered by approver scope.
- Both surfaces use the same form fields: justification, business_reason, requested_expires_at.

### 8. Approval audit and notifications

Every state transition emits an event on the existing `policy-audit-events` Kafka topic with a distinct `event_type`:

```
ExemptionSubmitted | ExemptionUnderReview | ExemptionApproved
ExemptionDenied    | ExemptionWithdrawn   | ExemptionExpired
```

Notifications (email / Slack to approvers, email confirmation to requester) are emitted by a separate `policy-notifications` consumer reading the same stream. The notification consumer is not part of the policy service itself â€” it's a thin worker that translates events into the org's preferred notification channels.

---

## API additions

```
POST   /exemption-requests                     â€” create (any authenticated user)
GET    /exemption-requests/{id}                â€” read
GET    /me/exemption-requests                  â€” list mine
GET    /tenants/{tid}/exemption-requests       â€” approver inbox (tenant scope)
GET    /orgs/{oid}/exemption-requests          â€” approver inbox (org scope)
POST   /exemption-requests/{id}/claim          â€” approver picks it up
POST   /exemption-requests/{id}/approve        â€” approver approves (body: decision_notes)
POST   /exemption-requests/{id}/deny           â€” approver denies (body: decision_notes)
DELETE /exemption-requests/{id}                â€” requester withdraws

POST   /plans                                  â€” create plan
POST   /plans/{id}/items                       â€” add Draft instance to plan
POST   /plans/{id}/dry-run                     â€” evaluate scenarios with plan applied (body: contexts[])
POST   /plans/{id}/submit                      â€” submit for approval (if any item requires it)
POST   /plans/{id}/activate                    â€” atomic activation of all items
DELETE /plans/{id}                             â€” discard

PUT    /tenants/{tid}/policies/{key}?status=Draft   â€” write as Draft instead of Active
POST   /policies/{instance_id}/activate             â€” Draft â†’ Active transition
```

New auth scopes:
- `policy:request:exemption` â€” granted to authenticated users by default
- `policy:approve:exemption` â€” granted to roles/groups per definition's `approval_routing`
- `policy:plan:manage` â€” granted to anyone with `policy:write:*` at any level

---

## SDK additions

```csharp
public interface IPolicyDraftClient
{
    Task<PolicyInstance> SaveDraftAsync(WriteRequest req, CancellationToken ct);
    Task<PolicyInstance> ActivateAsync(Guid instanceId, CancellationToken ct);
}

public interface IExemptionClient
{
    Task<ExemptionRequest> SubmitAsync(ExemptionRequest req, CancellationToken ct);
    Task<ExemptionRequest> ApproveAsync(Guid requestId, string notes, CancellationToken ct);
    Task<ExemptionRequest> DenyAsync(Guid requestId, string notes, CancellationToken ct);
    Task<IReadOnlyList<ExemptionRequest>> ListMineAsync(CancellationToken ct);
}

public interface IPolicyPlanClient
{
    Task<PolicyPlan> CreateAsync(string name, string description, CancellationToken ct);
    Task<PolicyPlan> AddItemAsync(Guid planId, Guid draftInstanceId, CancellationToken ct);
    Task<DryRunResult> DryRunAsync(Guid planId, IEnumerable<PolicyContext> scenarios, CancellationToken ct);
    Task<PolicyPlan> ActivateAsync(Guid planId, CancellationToken ct);
}
```

Apps don't have to consume these; they're for admin tooling. The runtime SDK (`IPolicyEvaluator`) ignores Draft and PendingApproval rows entirely.

---

## Coverage of PRD critical bullets

| Critical gap                                              | Addressed by                  |
|-----------------------------------------------------------|-------------------------------|
| Configure rules before enabling them                      | Â§1 Draft state, Â§2 plans      |
| Exemption workflow (request â†’ review â†’ approve)           | Â§3, Â§4 state machine          |
| UX consistency between opt-in and exemption flows         | Â§7                            |
| Group exemptions (delivered via approved requests â†’ L4-Group instance) | Â§3 `target_level='Group'` |
| Decisions before single identity proceeds                 | partial â€” `approval_routing` allows policy-by-policy gating |

---

## Consequences

**Positive**
- Admins can now design a policy rollout, preview the impact, get approval, and activate atomically.
- Drafts give the admin UI a real "save without applying" mode â€” long-overdue for any non-trivial config.
- The exemption workflow eliminates the ops-ticket-as-policy anti-pattern: clear request artifact, approver routing, audit trail, automatic expiry.
- Plans (Â§2) compose well with the multi-level hierarchy from ADR-008: a single plan can edit Org + Tenant + Group + User instances together with one approval gate.

**Negative / risks**
- More state means more SQL surface and more UI states. Approvers need clear inboxes; without thoughtful UX this becomes another ticket queue that nobody reads.
- Approval routing is `JSONB` â€” flexible but complex to validate. Misconfigured routing could lock out approvals entirely. Mitigation: a `POST /definitions/{key}/approval-routing:validate` endpoint that simulates "who could approve this right now" and warns if the answer is empty.
- Exemption auto-expiry is essential â€” every exemption must have `requested_expires_at`. Without it, exemptions silently become permanent. The schema makes it nullable but the UI enforces a max of 180 days for self-service exemptions; longer require ST Ops.
- Background jobs proliferate: scheduled draft activation, exemption expiry, plan activation. Each is small but the operator must monitor them; consolidate into a single `policy_lifecycle_job` worker emitting Prometheus metrics.
