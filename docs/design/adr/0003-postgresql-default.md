# ADR 0003: PostgreSQL By Default

Date: `2026-06-13`

## Status

Accepted for v2606 planning.

## Decision

New Pyrosa CRM state will use PostgreSQL by default.

## Context

SimpleHostMan already provides a PostgreSQL apps cluster, and the new CRM should
favor explicit relational modeling, migrations, auditability, and operational
consistency.

## Consequences

- migrations belong in this repository once code begins
- MariaDB is reserved for compatibility cases, not new CRM defaults
