# ADR 0001: Single Repository

Date: `2026-06-13`

## Status

Accepted for v2606 planning.

## Decision

Pyrosa CRM will use one Git repository as the canonical source for the product.

## Context

The CRM needs coordinated changes across UI, API, migrations, workers,
contracts, and operational docs. Splitting those too early would slow product
formation and make deployment boundaries harder to see.

## Consequences

- product docs, code, migrations, and operational notes live together
- platform services remain separate repositories/apps
- shared contracts must be explicit when crossing app boundaries

