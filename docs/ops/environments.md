# Environments

Date: `2026-06-13`

## Intended Environment Roles

| Environment | Slug | Hostname | Purpose |
| --- | --- | --- | --- |
| Production | `pyrosa-crm` | `crm.pyrosa.com.do` | production CRM product surface |
| Development/demo | `pyrosa-democrm` | `democrm.pyrosa.com.do` | new CRM development and demo surface |

## Current State

As of `2026-06-13`:

- `pyrosa-crm` exists as a placeholder at `crm.pyrosa.com.do` on port `10104`
- `pyrosa-democrm` serves the new CRM demo checkout at
  `democrm.pyrosa.com.do` on port `10166`
- `pyrosa-democrm` now runs a Node/TypeScript + React scaffold
- `pyrosa-democrm` delegates UI authentication to `pyrosa-iam` through
  auth client `crm`
- the CRM demo database is PostgreSQL `app_pyrosa_democrm`

## Database Policy

New Pyrosa CRM data should use PostgreSQL databases and roles managed through
the platform runtime.

Current/proposed names:

- production: `app_pyrosa_crm`
- development/demo: `app_pyrosa_democrm`

## Demo Runtime

Active as of `2026-06-13`.

- new demo checkout:
  `/srv/containers/apps/pyrosa-democrm/app`
- new demo uploads directory:
  `/srv/containers/apps/pyrosa-democrm/uploads`
- runtime image:
  `docker.io/library/node:22-bookworm-slim`
- service:
  `app-pyrosa-democrm.service`

The demo runtime is the active development surface. It should receive active CRM
changes before production promotion to `pyrosa-crm`.

## Secrets

Runtime secrets belong in host-managed env files and must not be committed.

Documentation may name env vars, but not values.
