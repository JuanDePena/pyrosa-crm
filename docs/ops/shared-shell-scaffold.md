# SharedShell Scaffold Handoff

Date: `2026-07-07`
Status: `scaffold-ready`

## Canonical Contracts

The transversal shell and interaction rules live in:

- [SharedShell](https://github.com/JuanDePena/pyrosa-docs/blob/main/design/shared-shell.md);
- [SharedShell navigation and keyboard](https://github.com/JuanDePena/pyrosa-docs/blob/main/design/shared-shell-navigation-keyboard.md).

This handoff remains local because it records the delivered CRM routes, auth,
contracts, runtime and QA evidence.

## Scope

`pyrosa-democrm` now has a functional React/Node scaffold for the CRM demo
surface. It consumes the shared Pyrosa UI shell and keeps the runtime compatible
with SimpleHostMan.

## Delivered Surface

| Area | Current contract |
| --- | --- |
| Shell | `AppShell`, `Sidebar`, `Topbar`, `WorkspaceLayout`, `StatusStrip` and shared table primitives from `@pyrosa/ui`. |
| Routes | Hash routes for dashboard, cuentas, contactos, oportunidades, actividades, reportes, configuracion, plataforma, marca and runtime. |
| Auth | Delegated UI auth through `pyrosa-iam` client `crm`; protected `/ui` and `/api/crm/*` surfaces use `PYROSA_CRM_SESSION`. |
| Contracts | `/api/crm/contracts` exposes `democrm-contract-v0.4` with CRM workbench rows, platform services, modules and session context. |
| Actions | `/api/crm/contracts/action-preview` supports `inspect` and `prepare`; both are `GET`, `preview-only` and `mutates=false`. |
| Runtime | `npm run build` produces client chunks and `build/server`; `server.mjs` loads `build/server/index.js`. |
| Visual QA | `npm run qa:visual -- --base-url http://127.0.0.1:10166` captures smoke screenshots into `ui/tmp/qa-visual`. |

## Domain Handoff

Next domain work should connect real CRM endpoints in this order:

1. Define dictionary-backed tables for CRM-owned customer, contact, pipeline and
   activity data.
2. Replace contract-first rows with read-only account, contact, opportunity and
   activity endpoints.
3. Add write commands only after validation gates and audit events exist.
4. Keep IAM, Accounts and Platform as external owners for identity, account
   center and runtime governance.
5. Promote `inspect` and `prepare` actions from preview to command handlers one
   action at a time.

## Guardrails

- Do not implement local authentication or bypass delegated UI auth.
- Do not store platform-owned identity, MFA or account authority inside CRM.
- Keep new mutations behind explicit API contracts, validation and audit.
- Keep screenshots and local smoke artifacts under ignored `ui/tmp/`.
