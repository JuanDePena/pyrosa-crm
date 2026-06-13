# SimpleHostMan Runtime

Date: `2026-06-13`

## Runtime Model

Pyrosa CRM follows the SimpleHostMan application model:

- one app slug per deployable runtime
- one Podman container managed by Quadlet for the web/API process
- optional worker containers for background jobs
- Apache reverse proxy on the host
- local backend ports in the Pyrosa block
- host-managed env files
- app storage under `/srv/containers/apps/<slug>`
- PostgreSQL apps cluster by default

## CRM Runtime Catalog

| Slug | Hostname | Port | Storage Root | State |
| --- | --- | ---: | --- | --- |
| `pyrosa-crm` | `crm.pyrosa.com.do` | `10104` | `/srv/containers/apps/pyrosa-crm` | placeholder |
| `pyrosa-democrm` | `democrm.pyrosa.com.do` | `10166` | `/srv/containers/apps/pyrosa-democrm` | Node/TypeScript CRM demo runtime |

## Promotion Target

| Slug | Hostname | Role |
| --- | --- | --- |
| `pyrosa-crm` | `crm.pyrosa.com.do` | production CRM |
| `pyrosa-democrm` | `democrm.pyrosa.com.do` | CRM development/demo |

## Worker Policy

Workers should be created only when a task needs independent retry, scheduling,
or operational ownership.

Initial worker candidates:

- fiscal synchronization
- external system imports
- report generation
- document rendering
- data import/export jobs

Workers should run on the primary node unless the workflow is proven safe for
active/active execution.

## Current Demo Runtime

`pyrosa-democrm` runs with:

- image: `docker.io/library/node:22-bookworm-slim`
- working directory:
  `/srv/containers/apps/pyrosa-democrm/app/ui`
- command:
  `node server.mjs`
- health:
  `GET /__pyrosa_crm_health`
- database:
  `app_pyrosa_democrm`
- delegated UI auth:
  `pyrosa-iam` client `crm`, callback
  `https://democrm.pyrosa.com.do/auth/callback`
- protected shell:
  `/ui`
- brand source asset:
  `ui/public/public/assets/brand/crm-logo.png`, exposed after build at
  `/public/assets/brand/crm-logo.png`

The versioned templates live under `runtime/`.

Because the current platform Quadlets publish their app ports only on host
loopback, sibling containers cannot reach those services through the Podman
gateway address. The demo env therefore uses
`PYROSA_CRM_IAM_INTERNAL_BASE_URL=https://iam.pyrosa.com.do` for the ticket
exchange and introspection calls until a private bridge listener is
standardized.

## Deployment Policy

Do not use ad-hoc `podman run` for persistent runtime. Use source-controlled
runtime definitions and SimpleHostMan reconciliation when operationally ready.

For early development, the repo may include local development scripts, but the
production path should remain compatible with the platform model.
