# Policy Design Site

A static, interactive web port of two Cursor IDE canvases that document a
hierarchical Policy Management framework (L0 → L1 → L2 → L3). Built with
**Vite + React + TypeScript**; deployable to GitHub Pages via a workflow.

## Pages

- **`#/`** — Overview / index
- **`#/integration`** — Service topology, hierarchy reference, MFA stage matrix,
  tenant-override lifecycle, and a live policy resolution simulator
- **`#/data-model`** — PolicyService data model: ER diagram, per-table columns,
  atomic upsert sequence, API surface, indexes, and an instance-scope browser
  with rejections, override flow, and exception path per level

State (selected level, simulator inputs) persists to `localStorage`.

## Local development

```bash
npm install
npm run dev     # http://localhost:5173/
npm run build   # static output in dist/
npm run preview # serve dist/ locally
```

The Vite `base` path is `/` by default (works for local dev and for user/org
Pages at `https://<user>.github.io/`). For **project Pages** at
`https://<user>.github.io/<repo>/`, set the environment variable
`VITE_BASE_PATH=/<repo>/` before building. The included GitHub Action does this
automatically from the repo name.

## Project structure

```
policy-design-site/
├── .github/workflows/deploy-pages.yml   # CI build + Pages deploy
├── public/                              # static assets (empty by default)
├── src/
│   ├── canvas-ui/                       # Cursor SDK shim (Stack, Card, Pill, ...)
│   │   ├── primitives.tsx   typography.tsx
│   │   ├── surfaces.tsx     controls.tsx
│   │   ├── data.tsx         theme.ts
│   │   ├── state.ts         index.ts
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── IntegrationDesign.tsx
│   │   └── PolicyServiceDataModel.tsx
│   ├── App.tsx                          # hash router
│   ├── main.tsx
│   └── styles.css                       # theme tokens (light + dark)
├── index.html
├── package.json   tsconfig.json   vite.config.ts
└── README.md
```

## Deploy to GitHub Pages

1. Create a new repository on your GitHub account (public, since GH Pages on
   private repos requires a paid plan).
2. Copy this folder's contents into the repo root (or move the folder out of
   this monorepo).
3. Initialize git, commit, push to `main`:
   ```bash
   git init
   git add .
   git commit -m "Initial commit — policy design site"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
4. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
5. The workflow under `.github/workflows/deploy-pages.yml` will run on push and
   publish to `https://<you>.github.io/<repo>/`.
6. Optional: set repo variable `VITE_BASE_PATH` if your URL differs from the
   default `/<repo>/` (e.g. for a custom domain, set it to `/`).

## Scrub checklist before publishing

The pages are mostly generic, but the ported content has a few company-specific
mentions to review before going public. Search and replace as appropriate for
your context:

- `mfa-service`, `token-service`, `identity-service`, `monolith` — example app
  identifiers in the SDK simulator and the topology diagram
- `policy.mfa.enforcement_stage` — sample policy key used in examples
- `admin@acme.com`, `ops-user@example.com`, `oncall@example.com`,
  `compliance@example.com` — sample identity strings
- `OPS-4521`, `OPS-5102`, `COMPL-218` — sample ticket references
- `tenantId: 12345`, `userId: 99887` — sample IDs

There are no real production secrets, URLs, or PII. All references are
illustrative.

## What is the `canvas-ui` shim?

The original canvases import from `cursor/canvas`, an SDK that only exists
inside Cursor's IDE. The `src/canvas-ui` directory re-implements the same
public surface (`Stack`, `Row`, `Grid`, `Card`, `Pill`, `Stat`, `Table`, `Text`,
`H1/H2/H3`, `Code`, `Link`, `Callout`, `Select`, `Toggle`, `Button`, `Divider`,
`useCanvasState`, `useHostTheme`) with plain React + CSS variables, so the
ported page code is nearly byte-identical to the canvas source.

If you update the original canvases, you can re-port by copying the file and
replacing the import path:

```diff
- } from 'cursor/canvas';
+ } from '@/canvas-ui';
```
