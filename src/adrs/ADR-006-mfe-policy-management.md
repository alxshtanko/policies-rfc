# ADR-006: MFE Policy Management Component Contract

**Status**: Proposed  
**Date**: 2026-05-11  
**Authors**: Identity Team  
**Relates to**: ADR-001 (SDK), ADR-002 (Override Flows), ADR-005 (PolicyService API)

---

## Context

Policy management surfaces exist in two places:

1. **Central Policy Admin** — a standalone web application owned by ST Ops / the team. It provides a global view across all tenants and all policies. It is the primary surface for ST Ops actions (L0 changes, emergency exceptions, definition management).

2. **App-embedded MFE** — each product team can embed a policy panel directly into their own settings UI (e.g., the MFA settings page inside the main ServiceTitan app), giving tenant admins an in-context way to manage policies relevant to that app without navigating to a separate admin portal.

The contract between these two surfaces and PolicyService must be consistent. Tenant admins interacting with an embedded MFE panel and ST Ops interacting with the Central Admin UI must see the same effective state.

---

## Decision

### MFE Integration Pattern

App-embedded MFE panels are implemented as independently deployed micro-frontends. They communicate with PolicyService directly (using the tenant admin's bearer token) and are embedded into the host app via a registered `policyPanel` extension point.

Two implementation models are supported:

#### Model A — Hosted iframe panel (fastest to ship)

PolicyService ships a pre-built HTML panel at:

```
https://policy.ium.servicetitan.com/panels/{policyKey}?tenantId=12345&locale=en-US
```

The host app embeds this URL in an `<iframe>` inside its settings page. The panel uses `window.postMessage` to communicate events (saved, cancelled) back to the host.

**Pros**: No integration code required from the host app; panel is always up-to-date with PolicyService.  
**Cons**: Limited styling customization; iframe isolation prevents native focus management.

#### Model B — JS Component (recommended for new MFEs)

PolicyService ships `policy-panel` as an npm package. Host apps import and render the component directly:

```tsx
import { PolicyPanel } from 'policy-panel';

function MfaSettingsPage() {
  return (
    <PolicyPanel
      policyKey="policy.mfa.enforcement_stage"
      tenantId={window.App.TenantId}
      accessToken={currentUserToken}
      onSaved={(instance) => showSuccess(`Stage updated to ${instance.value}`)}
      theme="light"
    />
  );
}
```

The component internally calls PolicyService using the provided `accessToken`. It renders the appropriate controls based on the definition's `valueType`, `allowedValues`, and `overridability` rules.

---

## `policy-panel` Component Contract

### `PolicyPanel` props

```typescript
interface PolicyPanelProps {
  /** The policy to manage. Controls what UI is rendered. */
  policyKey: string;

  /** Tenant context. The panel only shows the L1 override for this tenant. */
  tenantId: number;

  /**
   * Bearer token for the current user. Must have policy:write:l1 scope for
   * editable mode; policy:read for read-only display.
   */
  accessToken: string;

  /** Called after a successful save. */
  onSaved?: (instance: PolicyInstance) => void;

  /** Called if the user cancels without saving. */
  onCancelled?: () => void;

  /** Called on unrecoverable error (e.g. 403, network failure). */
  onError?: (error: PolicyPanelError) => void;

  /** 'light' | 'dark' | 'system'. Defaults to 'system'. */
  theme?: 'light' | 'dark' | 'system';

  /** If true, renders read-only (no save button). Defaults to false. */
  readOnly?: boolean;

  /**
   * Override the PolicyService URL. Defaults to window.App.Config.PolicyServiceUrl
   * if defined, otherwise falls back to the package's built-in default.
   */
  policyServiceUrl?: string;
}
```

### `PolicyInstance` type (returned in `onSaved`)

```typescript
interface PolicyInstance {
  instanceId:        string;
  policyKey:         string;
  level:             'L0' | 'L1' | 'L2' | 'L3';
  value:             string;
  effectiveAt:       string;    // ISO 8601
  expiresAt:         string | null;
  status:            'Active' | 'Revoked' | 'Expired';
  reason:            string | null;
  createdBy:         string;
  createdAt:         string;
}
```

### Rendered UI per value type

| `valueType` | Rendered control |
|-------------|-----------------|
| `Enum` (ordered) | Vertical stepper or segmented control with labels and descriptions |
| `Bool` | Toggle switch with label |
| `Int` | Number input with min/max from `allowedValues` |
| `String` | Text input |

For `Enum` policies, the panel also renders:
- The L0 platform default (read-only indicator)
- The currently active L1 value (editable)
- Which values permit L3 opt-out (annotated with an "opt-out available" badge)

### Lifecycle

```
Mount:
  1. GET /definitions/{policyKey} → load definition (valueType, allowedValues, overridability)
  2. GET /tenants/{tenantId}/policies/{policyKey} → load current L1 instance (or undefined)
  3. Render appropriate control pre-populated with current value (or L0 default if no L1)

Save:
  1. Validate: value in allowedValues, not looser than L0 constraint
  2. PUT /tenants/{tenantId}/policies/{policyKey}
  3. On 200: call onSaved(instance)
  4. On 403: render "You don't have permission to change this policy"
  5. On 422: render constraint violation message from error.details

Reset to default:
  1. DELETE /tenants/{tenantId}/policies/{policyKey}
  2. On 200: display L0 default, call onSaved with the effective L0 instance

Unmount:
  1. Abort any in-flight requests
  2. Clean up PolicyService change listener (if real-time updates were subscribed)
```

---

## Central Policy Admin UI

The Central Policy Admin (`ium-policy-admin`) is a standalone React app deployed at `https://policy-admin.ium.servicetitan.com`. It reuses the same `policy-panel` component but wraps it in a full administrative shell.

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  Policy Administration                    [ST Ops only]  │
├──────────────┬───────────────────────────────────────────────┤
│              │                                               │
│  Navigation  │  Main content area                            │
│              │                                               │
│  Definitions │  ┌─ Tenant: ACME Corp ─────────────────────┐ │
│  Tenants     │  │                                          │ │
│  Exceptions  │  │  policy.mfa.enforcement_stage               │ │
│  Audit Log   │  │  [PolicyPanel component — editable]      │ │
│  Dashboard   │  │                                          │ │
│              │  │  policy.session.timeout_minutes             │ │
│              │  │  [PolicyPanel component — editable]      │ │
│              │  └──────────────────────────────────────────┘ │
└──────────────┴───────────────────────────────────────────────┘
```

### Pages

| Page | Route | Scope Required |
|------|-------|----------------|
| Dashboard | `/` | `policy:read` |
| All Definitions | `/definitions` | `policy:read` |
| Definition Detail | `/definitions/{key}` | `policy:read` |
| Tenant List | `/tenants` | `policy:admin` |
| Tenant Policy Detail | `/tenants/{id}/policies` | `policy:admin` |
| Active Exceptions | `/exceptions` | `policy:admin` |
| Create Exception | `/exceptions/new` | `policy:admin` |
| Audit Log | `/audit` | `policy:read` |

---

## Extension Point Registration (for host apps embedding MFE panels)

Host applications declare which policy panels they embed in a static manifest loaded at runtime. This manifest is served from the host app and consumed by the Central Admin UI to show "this policy is also configurable in App X."

### Manifest format (`policy-manifest.json`)

Each app publishes this file at a well-known URL:

```
https://<app-host>/.well-known/policy-manifest.json
```

```json
{
  "appId":    "enterprise-hub",
  "appName":  "Enterprise Hub",
  "panels": [
    {
      "policyKey":  "policy.mfa.enforcement_stage",
      "label":      "MFA Enforcement",
      "route":      "/settings/security/mfa",
      "description": "Controls which user types are required to complete MFA at login"
    },
    {
      "policyKey":  "policy.session.timeout_minutes",
      "label":      "Session Timeout",
      "route":      "/settings/security/session",
      "description": "Idle session timeout in minutes"
    }
  ]
}
```

The Central Admin UI fetches these manifests and displays deep-links next to each policy:

> "This policy can also be configured in **Enterprise Hub → Settings → Security → MFA**."

---

## Real-Time Policy Change Reflection in Embedded Panels

When a tenant admin is viewing the embedded MFE panel and the policy changes from another session (e.g., ST Ops applied an emergency exception), the panel must reflect the new state within a reasonable time.

The `policy-panel` component uses long-polling with a 30-second interval as the baseline. When the host app provides `window.App.Config.PolicyServiceWsUrl`, the component upgrades to WebSocket subscription for instant updates:

```typescript
// Host app config (optional)
window.App.Config = {
  PolicyServiceUrl:   'https://policy.ium.servicetitan.com/v1',
  PolicyServiceWsUrl: 'wss://policy.ium.servicetitan.com/v1/ws'   // optional
};
```

The WebSocket endpoint on PolicyService sends `PolicyInstanceChanged` events filtered to the tenant of the connected user.

---

## Opt-Out Panel for End Users

In addition to the admin-facing `PolicyPanel`, the `policy-panel` package also exports an `OptOutPanel` component for rendering the user-facing opt-out toggle:

```tsx
import { OptOutPanel } from 'policy-panel';

function UserSecuritySettings() {
  return (
    <OptOutPanel
      policyKey="policy.mfa.enforcement_stage"
      accessToken={currentUserToken}
      onOptOut={(instance) => refreshMfaStatus()}
      onOptIn={(instance)  => refreshMfaStatus()}
    />
  );
}
```

The component:
1. Calls `GET /me/policies/{key}` to determine if the user has an active L3 opt-out.
2. Calls `GET /evaluate` to check `canOptOut` for the current user context.
3. Renders a toggle if `canOptOut === true`; renders read-only status if `canOptOut === false`.
4. On toggle: calls `POST /me/policies/{key}/opt-out` or `DELETE /me/policies/{key}/opt-out`.

---

## Consequences

**Positive**
- Tenant admins can manage policies in context (within the app they're using) without navigating to a separate admin portal.
- Central Admin UI and app-embedded panels share the same `PolicyPanel` component — single implementation, consistent UX.
- Manifest-based registration means new apps register their panels without changes to the Central Admin codebase.
- Real-time WebSocket updates ensure admin views don't go stale after ST Ops makes an emergency change.

**Negative / Risks**
- Model B (JS component) requires each host app to install and update `policy-panel`. Version drift is a risk — mitigated by publishing `policy-panel` with a locked peer dependency on the PolicyService API version it targets.
- Manifest fetching from host apps creates a cross-origin dependency; host apps must serve `policy-manifest.json` with appropriate CORS headers.
- The WebSocket endpoint adds operational complexity to PolicyService; can be deferred to Phase 2 (use long-polling initially).
