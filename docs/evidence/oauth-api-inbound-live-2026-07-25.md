# Promoción Parcial OAuth Inbound De CRM

Fecha: `2026-07-25`

Estado: bearer e introspección promovidos; positivo tenant service retenido.

IAM materializó el introspector `pyrosa-crm-resource-server`, el productor
dedicado `client-pyrosa-crm-api-canary` y el grant exacto `crm.read`. DemoCRM
carga su credencial desde `/etc/pyrosa-democrm/secrets/oauth-api.env`,
root-only `0600`, y ejecuta con `PYROSA_CRM_OAUTH_API_ENABLED=1`.

El canario obtuvo un token service válido y atravesó la introspección CRM. La
lectura `GET /api/crm/v1/dashboard-summary`, tenant `1`, respondió
`403 crm.tenant.membership_required`. Este resultado confirma que el bearer
no cayó a cookie ni a datos locales y que la solicitud llegó a las decisiones
owner tenant-aware.

No se creó una fila `directory_users` falsa para representar al service
principal. La política tenant IAM y las memberships Directory actuales sólo
reconocen identidades autoritativas humanas; el siguiente corte debe modelar
un binding tenant explícito para `client:pyrosa-crm-api-canary`, con asiento,
capability y auditoría propios, antes de declarar el positivo de dominio.
