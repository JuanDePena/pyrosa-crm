# Pyrosa CRM Workspace Guide

This file orients future agents and engineers working in this repository.

## Product Boundary

`pyrosa-crm` is the Pyrosa CRM product. Its local demo checkout is the source
for the v2607 design and implementation while the live runtime remains on its
last promoted version. The active development checkout is:

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

- `pyrosa-platform`: company/tenant catalog, schemas, dictionaries, governed
  DDL, readiness and operational status;
- `pyrosa-iam`: authentication, MFA, sessions, OAuth/OIDC, `ui-auth` and
  tenant policy;
- `pyrosa-accounts`: account center, user profile, preferences and self-service;
- `pyrosa-directory`: organizations, memberships, app assignments, seats,
  tenant context, connections and notification delivery;
- `pyrosa-store`: commercial customer, subscription, quantity, validity and
  entitlement;
- `pyrosa-ui`: shell, components, layouts, themes and accessibility;
- `pyrosa-newsync` or the declared provider engine: external integrations and
  synchronization.

CRM owns CRM accounts, contacts, cases, activities, appointments,
opportunities, reports and functional authorization. A CRM account is not a
user account, a Directory organization or a Store customer.

Physical schema changes follow dictionary -> Platform plan -> governed apply ->
drift evidence. The CRM runtime role must not run DDL; historical migration
files are not a production deployment path.

Direct cross-app database coupling requires a documented ADR exception.

Customer workbooks and operational datasets must not be committed. Only
synthetic fixtures that passed privacy review may enter the repository.

## Documentation Rules

When changing product direction, update the relevant document under `docs/` and
create or update an ADR when the choice affects architecture, runtime, data
model, or integration contracts.

Keep operational claims tied to observed SimpleHostMan state when possible.
