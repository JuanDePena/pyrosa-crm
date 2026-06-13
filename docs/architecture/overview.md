# Architecture Overview

Date: `2026-06-13`

## Target Shape

Pyrosa CRM should be a single repository with clearly separated application
surfaces:

- web UI
- API/server runtime
- shared domain packages
- database migrations
- optional workers
- operational documentation

The first implementation should stay small enough to make deployment,
authentication, database access, and one real business workflow observable
before broad module expansion.

The active `v2606` scaffold uses:

- `ui/server`: Node.js/TypeScript BFF and API runtime
- `ui/src`: React/Vite UI shell
- `database/migrations`: PostgreSQL migrations
- `runtime`: Quadlet, env and Apache templates

## Language And Runtime

TypeScript is the default application language for:

- web application
- API routes
- shared contracts
- validation
- UI logic
- integration clients where Node is a natural fit

Python is allowed for:

- workers
- fiscal or reporting automation
- external connectors
- data import/export jobs
- tasks where existing Pyrosa Python code can be reused cleanly

Python should not become a second full web stack unless a later ADR accepts that
cost explicitly.

## Data

PostgreSQL is the default database engine for the new CRM.

The schema should favor:

- explicit foreign keys
- audit-friendly state transitions
- durable integration identifiers
- migrations in source control
- predictable local/demo/prod differences

## Integration Boundary

The CRM should integrate with Pyrosa platform apps through versioned APIs,
database views, events, or explicit worker contracts. Direct cross-app table
coupling should be avoided unless the owning service documents it as a supported
interface.

For `v2606`, the explicit boundary is:

- `pyrosa-platform` owns app catalog metadata, visual governance, runtime
  contracts, and operational status signals.
- `pyrosa-iam` owns authentication, MFA, global sessions, authorization
  posture, and delegated `ui-auth` ticket exchange.
- `pyrosa-accounts` owns the user-facing account center, profile preferences,
  and account self-service surfaces.

CRM may store local transactional references to Platform, IAM and Accounts
records, but those references are not the system of record for platform data.

## Authentication

The `v2606` demo shell delegates UI authentication to `pyrosa-iam`.

Runtime flow:

- unauthenticated users enter CRM through `/auth/login`
- CRM redirects to `pyrosa-iam` `/ui-auth/authorize` with client `crm`
- IAM validates the root session and MFA/AAL posture
- IAM returns a one-time ticket to `/auth/callback`
- CRM exchanges the ticket through `/internal/ui-auth/exchange-ticket`
- CRM stores a signed `PYROSA_CRM_SESSION` cookie with the delegated session id
- protected routes periodically call `/internal/ui-auth/introspect-session`

Operational note: the backchannel URL currently uses
`https://iam.pyrosa.com.do` while no private shared container URL is
standardized.

CRM does not store passwords, user profile authority, or account security
state. Authorization inside CRM should be layered later on top of the delegated
identity plus CRM-owned transactional roles.

## Deployment Boundary

The runtime target is SimpleHostMan:

- Apache public ingress
- local backend ports
- Podman + Quadlet app services
- env files under host control
- PostgreSQL apps cluster
- worker services on the primary node unless proven safe for active/active
