# Roadmap v2606

Date: `2026-06-13`

## Phase 0: Documentation And Naming

- create initial product documentation
- define app/domain roles
- create initial ADRs
- verify current SimpleHostMan catalog state
- configure GitHub remote and release tag convention

Exit criteria:

- repository has a clear README and docs tree
- release tags use `vYYMM.DDHHmm`, for example `v2606.220844`

## Phase 1: New CRM Bootstrap

Status: completed on `2026-06-13`.

- choose concrete TS application framework
- add package manager and build scripts
- add health endpoint
- add minimal application shell
- add database migration tooling
- add local and container development instructions

Exit criteria:

- app builds
- typecheck runs
- health endpoint works locally and in container
- deployment shape matches SimpleHostMan expectations

## Phase 2: Identity And Shell

Status: in progress on `2026-06-13`.

- connect authentication/session model through `pyrosa-iam` ui-auth client
  `crm` (completed)
- define authorization primitives
- build initial admin shell
- integrate runtime contracts with `pyrosa-platform` and account context with
  `pyrosa-accounts`

Exit criteria:

- authenticated user can enter the app (completed for `/ui`)
- roles/permissions are documented
- first protected route is live (completed for `/ui` and `/api/crm/session`)

## Phase 3: First Transactional Slice

- select the first business workflow
- implement schema, API, UI, audit trail, and tests
- define integration hooks where needed

Exit criteria:

- one end-to-end business workflow works in `pyrosa-democrm`
- data model and audit behavior are reviewed
- implementation can be promoted later to `pyrosa-crm`

## Phase 4: Integration And Promotion Readiness

- connect any external integration/reporting paths that belong outside the web
  process
- define worker ownership
- harden backups and observability
- prepare production promotion checklist
- promote production only from approved release tags

Exit criteria:

- development/demo runtime is stable
- production placeholder can be replaced through a controlled release
