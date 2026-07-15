# Initial Module Map v2606

Date: `2026-06-13`

Status: `historical baseline; superseded by` [Modules v2607](modules-v2607.md)

This is an initial map, not a frozen backlog. It defines the areas that should
shape the first technical design conversations.

## Foundation

- application shell
- authentication handoff to `pyrosa-iam`
- authorization primitives based on platform identity and CRM roles
- audit events
- local operating context references to Platform tenants and Accounts profiles
- common record ownership and activity timeline

## Accounts And Contacts

- clients
- prospects
- contacts
- related companies
- addresses and communication preferences
- account-center references from `pyrosa-accounts`

Expected integration: `pyrosa-accounts`.

Accounts remains the user-facing account center. CRM should keep only
transactional references, relationship metadata, or cached display labels needed
for sales and service workflows.

## Pipeline

- leads
- opportunities
- stages
- proposals
- next actions

## Activities

- tasks
- notes
- meetings
- reminders
- relationship timeline

Expected integration: `pyrosa-platform` for app metadata and governance, and
`pyrosa-iam` for identity context.

CRM should not create local authentication or platform governance paths.

## Service Handoff

The first product pass must decide whether CRM stops at sales handoff or also
tracks lightweight post-sale service activity.

Possible capabilities:

- onboarding status
- customer requests
- service owners
- operational tasks
- document generation

## Integrations

- `pyrosa-platform`
- `pyrosa-iam`
- `pyrosa-accounts`
- external CRMs, ERPs or appointment systems where a later integration owner is
  defined

## Reporting

- pipeline dashboards
- activity exports
- account/contact quality checks
- audit and exception reports

## Deferred Until Needed

- payroll
- manufacturing/MRP
- complex warehouse management
- multi-company consolidation
- automated accounting journal generation
