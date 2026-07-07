# ADR 0002: TypeScript Primary Runtime With Optional Python Workers

Date: `2026-06-13`

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

