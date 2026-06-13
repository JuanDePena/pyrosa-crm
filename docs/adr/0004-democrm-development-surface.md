# ADR 0004: democrm.pyrosa.com.do As The New CRM Development Surface

Date: `2026-06-13`

## Status

Accepted for v2606 planning.

## Decision

`democrm.pyrosa.com.do` will become the development/demo surface for the new
Pyrosa CRM.

## Context

The CRM needs a stable demo hostname where product, UI, authentication,
database, runtime, and release flow can be validated before production
promotion.

## Consequences

- `pyrosa-democrm` is the active development/demo runtime for CRM
- `pyrosa-crm` remains the production target
- production promotion should happen only from approved release tags
