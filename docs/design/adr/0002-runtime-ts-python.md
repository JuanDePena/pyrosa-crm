# ADR 0002: TypeScript Primary Runtime With Optional Python Workers

Date: `2026-06-13`

## Transversal Baseline

This product decision adopts the
[Pyrosa architecture baseline](https://github.com/JuanDePena/pyrosa-docs/blob/main/design/architecture-baseline.md).
This ADR remains the CRM-local record of runtime scope and consequences.

## Status

Accepted for v2606 planning.

## Decision

TypeScript is the primary runtime for the Pyrosa CRM web/API product. Python may
be used for workers, connectors, fiscal automation, reporting, and migration
tasks when it is the better tool.

## Context

The ecosystem already includes TypeScript and Python services. The new CRM needs
a coherent main stack while leaving room for specialized background work.

## Consequences

- the initial app should not become two full web stacks
- Python code must have a clear runtime boundary
- worker contracts should be documented before production use
