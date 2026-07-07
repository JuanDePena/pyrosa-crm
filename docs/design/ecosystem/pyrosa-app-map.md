# Pyrosa Ecosystem Map

Date: `2026-06-10`

This snapshot focuses on Pyrosa application surfaces that define the intended
CRM direction. Runtime details should be re-verified before operational
changes.

## CRM-Relevant App Catalog

| Slug | Hostname | Port | Role | Product Class |
| --- | --- | ---: | --- | --- |
| `pyrosa-wp` | `pyrosa.com.do` | `10101` | public WordPress site | public web |
| `pyrosa-portal` | `portal.pyrosa.com.do` | `10102` | placeholder portal | platform/client surface |
| `pyrosa-demoportal` | `demoportal.pyrosa.com.do` | `10103` | demo portal | demo/client surface |
| `pyrosa-crm` | `crm.pyrosa.com.do` | `10104` | production CRM placeholder | transactional |
| `pyrosa-democrm` | `democrm.pyrosa.com.do` | `10166` | new CRM demo runtime | transactional/demo |
| `pyrosa-api` | `api.pyrosa.com.do` | `10106` | API surface | platform |
| `pyrosa-accounts` | `accounts.pyrosa.com.do` | `10124` | account center and profile surface | platform/account |
| `pyrosa-iam` | `iam.pyrosa.com.do` | `10134` | authentication, MFA, OAuth/OIDC and ui-auth issuer | platform/security |
| `pyrosa-platform` | `platform.pyrosa.com.do` | `10165` | app catalog, visual governance and runtime status | platform/governance |
| `pyrosa-repos` | `repos.pyrosa.com.do` | `10141` | repository surface | platform |
| `pyrosa-ldap` | `ldap.pyrosa.com.do` | `10142` | LDAP/auth support | platform |
| `pyrosa-pgadmin` | `pgadmin.pyrosa.com.do` | `10143` | database administration | platform/internal |
| `pyrosa-helpers` | `helpers.pyrosa.com.do` | `10161` | helper services | platform/helpers |

Additional active app units exist for Sync, Directory and helper variants. They
are not part of this first CRM support boundary unless a later workflow chooses
them explicitly.

## CRM Relationship To Platform Apps

`pyrosa-crm` should depend on platform services through explicit contracts:

- `pyrosa-platform`: app catalog, visual governance, runtime status and
  operational contracts
- `pyrosa-iam`: authentication, MFA, sessions, OAuth/OIDC and `ui-auth`
- `pyrosa-accounts`: account center, user profile and account self-service
