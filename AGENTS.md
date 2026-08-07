# Pyrosa CRM Workspace Guide

This file orients future agents and engineers working in this repository.

## Product Boundary

`pyrosa-crm` is the Pyrosa CRM product. Its local demo checkout is the source
for the v2607 design and implementation while the live runtime remains on its
last promoted version. The active development checkout is:

- `/srv/containers/apps/pyrosa-democrm/app`

The reserved production checkout, not yet materialized on this host, is:

- `/srv/containers/apps/pyrosa-crm/app`

Application source changes should land in the demo checkout, be pushed to
GitHub, then be promoted to production by approved release tag.

The shared source repository does not make `pyrosa-democrm` and `pyrosa-crm`
catalog aliases. Owner manifests must bind each app slug explicitly and keep
database, schema, release, checksum, and promotion identities separate.

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

Detailed product, architecture, API, runtime, operations, plans and evidence
live under `/srv/docs/apps/democrm/` and are published from the `pyrosa-docs`
repository. The application root `README.md` only identifies the runtime,
routes readers to that central index and lists executable artifacts that remain
with the code.

Do not recreate an app-local `docs/` tree or add secondary human-documentation
READMEs. `AGENTS.md` remains a workspace instruction file, not product
documentation. JSON Schema, fixtures, dictionaries, manifests, migrations,
templates, source, tests and workflows remain beside the code.

When changing product direction, update the relevant central document and
create or update an ADR under
`/srv/docs/apps/democrm/architecture/decisions/` when the choice affects
architecture, runtime, data model or integration contracts. Preserve
superseded material through Git and the central relocation inventory.

Synthetic-pilot evidence must use an explicit output directory outside the
checkout. Never restore a default writer under `docs/`. Customer workbooks and
operational datasets remain outside the checkout and QA artifacts.

Keep operational claims tied to observed SimpleHostMan state when possible.

La adopcion source de `contextGeneration` usa la extension Directory v2 y el
flag `PYROSA_CRM_TENANT_CONTEXT_GENERATION_V1_ENABLED=false`. Cada request
funcional compara generation antes del repositorio CRM; switch y renewal usan
CAS posterior a owner calls. No activar sin proyeccion Directory, grants,
canary y rollback aceptados.
