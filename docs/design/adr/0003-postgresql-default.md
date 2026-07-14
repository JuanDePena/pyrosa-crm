# ADR 0003: PostgreSQL By Default

Date: `2026-06-13`

## Transversal Baseline

This product decision adopts the
[Pyrosa architecture baseline](https://github.com/JuanDePena/pyrosa-docs/blob/main/design/architecture-baseline.md).
This ADR remains the CRM-local record of data-engine adoption.

## Status

Accepted for v2606 planning.

## Decision

New Pyrosa CRM state will use PostgreSQL by default.

## Context

SimpleHostMan already provides a PostgreSQL apps cluster, and the new CRM should
favor explicit relational modeling, migrations, auditability, and operational
consistency.

## Consequences

- CRM owns its schema intent, versioned dictionary, compatibility artifacts and
  functional validation
- physical DDL is generated from the approved dictionary and applied only by
  Pyrosa Platform; the CRM runtime role does not receive DDL privileges
- MariaDB is reserved for compatibility cases, not new CRM defaults
