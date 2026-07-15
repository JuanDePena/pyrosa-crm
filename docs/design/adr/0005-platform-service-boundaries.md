# ADR 0005: Platform Service Boundaries

Date: `2026-06-13`

## Transversal Baseline

This product decision adopts the
[Pyrosa architecture baseline](https://github.com/JuanDePena/pyrosa-docs/blob/main/design/architecture-baseline.md).
This ADR remains the CRM-local record of concrete service relationships.

## Status

Historical v2606 baseline. Expanded for v2607 by
[ADR 0006](0006-multiindustry-core-and-industry-profiles.md).

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
- account-center, profile, preferences and account self-service integrate with
  `pyrosa-accounts`; authentication authority remains in `pyrosa-iam`
- direct cross-app database coupling requires a documented exception
