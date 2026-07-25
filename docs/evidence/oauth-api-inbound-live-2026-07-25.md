# Promoción OAuth Inbound De CRM

Fecha: `2026-07-25`

Estado: bearer, introspección y positivo tenant-service promovidos en
development.

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
development. Las matrices de expiración, revocación, degradación IAM,
recuperación y rollback siguen siendo gates separados del plan transversal.

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
