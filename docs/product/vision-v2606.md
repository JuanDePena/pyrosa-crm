# Product Vision v2606

Date: `2026-06-13`

## Summary

Pyrosa CRM is the new transactional product surface for Pyrosa operations and
client-facing business processes.

It will coexist with `pyrosa-platform`, `pyrosa-iam`, and `pyrosa-accounts`
instead of reimplementing shared platform, authentication, or account-center
capabilities inside the CRM itself.

## Product Position

The Pyrosa ecosystem contains two broad classes of applications:

- platform services, which provide app governance, identity, account center,
  repositories, and operational helpers
- transactional applications, which hold business workflows, client records,
  documents, financial activity, and operational decisions

Pyrosa CRM belongs to the second class, but it must be designed to consume the
first class cleanly.

## Initial Goals

- establish a first-class CRM product owned by a single repository
- free `democrm.pyrosa.com.do` for the new CRM development surface
- build on Pyrosa Platform, IAM, and Accounts services
- use PostgreSQL as the default persistence layer
- keep the runtime compatible with SimpleHostMan and the existing two-node
  Podman deployment model
- document decisions before committing the product to a framework or module
  shape

## Non-Goals For v2606

- create a generic CRM framework for unrelated customers
- merge platform services into the CRM repository
- introduce Kubernetes or a separate orchestration layer
- use Python as a second full application stack unless a specific worker or
  integration benefits from it

## Product Principles

- the CRM should compose Pyrosa services instead of duplicating them
- business data should be explicit, auditable, and PostgreSQL-native by default
- background work should be isolated into workers when it can fail or retry
  independently
- development and production hostnames should have clear roles
