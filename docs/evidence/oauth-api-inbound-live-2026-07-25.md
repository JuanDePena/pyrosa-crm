# Promoción OAuth Inbound De CRM

Fecha: `2026-07-25`

Estado: bearer, introspección y positivo tenant-service promovidos en
development.

## Cierre De Lifecycle Y Degradación

La matriz terminal ejecutada entre `2026-07-25T19:26:42Z` y
`2026-07-25T19:28:01Z` cerró todos los gates inbound de CRM:

| Prueba | HTTP | Código/contrato |
| --- | ---: | --- |
| Token activo | `200` | `crm-api-v1` |
| Expiración controlada | `401` | `bearer_token_inactive` |
| Revocación | `401` | `bearer_token_inactive` |
| Endpoint IAM no disponible | `503` | `iam_introspection_unavailable` |
| Recuperación de introspección | `200` | `crm-api-v1` |
| Rollback `PYROSA_CRM_OAUTH_API_ENABLED=0` | `503` | `oauth_api_disabled` |
| Recuperación posterior al rollback | `200` | `crm-api-v1` |

La degradación se limitó al endpoint de introspección configurado en DemoCRM;
IAM no fue detenido. El runtime terminó con el endpoint canónico restaurado,
flag `1` y servicio `active/running`. Los artefactos privados sanitizados no
contienen tokens, secretos, subjects ni valores de headers tenant. Sus SHA-256
son `6d8fc13f6e66fb8b1acc796a95ccfe0e4f7b4de345de969752dd243c962e4514`
(lifecycle compartido), `0165fd537bb5fc9aaed28c6a99f6081bd81b429fd0ddbb7578f6a39bc73ddb8c`
(outage), `07196764654cd02cbb56a256d1d464649496201775af2c0ac64d03afb91d3fd6`
(recovery), `1e3c514cae90f6a63fcca51e9b586ef8158d25306baa68a4a4e620ded470e815`
(rollback) y `be9393809d7df5e3add606a8075c90cb8dae28d7601f4a7bdcaf065582acad45`
(recovery final).

## Actualización Terminal

IAM, Directory, Store y Platform materializaron el binding service canónico
para `client:pyrosa-crm-api-canary` en el tenant `1/000000000001`, sin crear
una fila de usuario humano. DemoCRM propaga la identidad service hacia las
decisiones owner y mantiene un timeout de acceso de `8000 ms`, suficiente para
la cadena owner live sin reinterpretar una demora como sesión local.

El canario final obtuvo `200` en `/api/crm/v1`, contrato `crm-api-v1`. El token
CRM usado contra ERP fue rechazado con `401 bearer_token_inactive`. El código
fuente queda fijado por `90b5b12`.

Este positivo cierra el binding tenant-service y el aislamiento cruzado en
development. La matriz posterior cerró expiración, revocación, degradación IAM,
recuperación y rollback; no quedan gates OAuth inbound abiertos para CRM en
development.

IAM materializó el introspector `pyrosa-crm-resource-server`, el productor
dedicado `client-pyrosa-crm-api-canary` y el grant exacto `crm.read`. DemoCRM
carga su credencial desde `/etc/pyrosa-democrm/secrets/oauth-api.env`,
root-only `0600`, y ejecuta con `PYROSA_CRM_OAUTH_API_ENABLED=1`.

El canario obtuvo un token service válido y atravesó la introspección CRM. La
lectura `GET /api/crm/v1/dashboard-summary`, tenant `1`, respondió
`403 crm.tenant.membership_required`. Este resultado confirma que el bearer
no cayó a cookie ni a datos locales y que la solicitud llegó a las decisiones
owner tenant-aware.

La retención descrita en el párrafo anterior corresponde a la primera
observación histórica y quedó superada por la actualización terminal. Se
conserva para explicar por qué el diseño adoptó un binding service explícito.
