# Pyrosa CRM Workspace Guide

This file orients future agents and engineers working in this repository.

## Product Boundary

`pyrosa-crm` is the new Pyrosa CRM product. Its local demo checkout is the
source for the first v2606 sandbox surface. The active development checkout is:

- `/srv/containers/apps/pyrosa-democrm/app`

The stable production checkout is:

- `/srv/containers/apps/pyrosa-crm/app`

Changes should land in the demo checkout, be pushed to GitHub, then be promoted
to production by approved release tag.

## Runtime Boundary

This repo should target the SimpleHostMan app model:

- one app container per slug
- one env file per app
- Apache host reverse proxy
- Podman + Quadlet for long-lived services
- PostgreSQL by default
- workers only when background execution is needed

## Platform Service Boundaries

CRM must consume platform capabilities instead of reimplementing them:

- `pyrosa-platform`: app catalog, visual governance, runtime contracts, and
  operational status
- `pyrosa-iam`: authentication, MFA, global sessions, authorization posture,
  OAuth/OIDC, and `ui-auth`
- `pyrosa-accounts`: account center, user profile, preferences, and
  self-service account surfaces

Direct cross-app database coupling requires a documented ADR exception.

## Documentation Rules

When changing product direction, update the relevant document under `docs/` and
create or update an ADR when the choice affects architecture, runtime, data
model, or integration contracts.

Keep operational claims tied to observed SimpleHostMan state when possible.
