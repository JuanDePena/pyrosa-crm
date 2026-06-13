# ADR 0005: Platform Service Boundaries

Date: `2026-06-13`

## Status

Accepted for v2606 planning.

## Decision

Pyrosa CRM will consume platform services through explicit contracts instead of
absorbing their responsibilities.

## Context

The Pyrosa ecosystem already includes platform governance, IAM, account-center,
helper, and operational services. The CRM should be transactional, not a
replacement for the entire platform.

## Consequences

- identity and session concerns integrate with `pyrosa-iam`; the `v2606` demo
  uses the `crm` ui-auth client and `/auth/callback`
- app governance, visual contracts, and runtime status integrate with
  `pyrosa-platform`
- account-center concerns integrate with `pyrosa-accounts` where applicable
- direct cross-app database coupling requires a documented exception
