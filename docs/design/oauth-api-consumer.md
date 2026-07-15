# Contrato OAuth2 De La API CRM

Estado: implementado, deshabilitado hasta aprovisionamiento y QA live.

El plan transversal y su matriz de consumidores se mantienen en
[OAuth2 API auth](https://github.com/JuanDePena/pyrosa-docs/blob/main/plans/plan-oauth2-api-auth.md).

CRM conserva el login browser delegado y añade un resource server opt-in para
sus endpoints read-only de contratos. IAM es dueño del registro; este repo no
crea clientes live ni persiste secretos.

Contrato local: issuer `https://iam.pyrosa.com.do`, audience `pyrosa-crm` y
scope exacto `crm.read`. El introspector se configura mediante
`PYROSA_CRM_OAUTH_API_CLIENT_ID`; su secret sólo entra por
`PYROSA_CRM_OAUTH_API_CLIENT_SECRET`. El flag reversible es
`PYROSA_CRM_OAUTH_API_ENABLED=1`.

Cada bearer se introspecta sin cache y exige token activo de tipo
`access_token`, issuer/audience exactos, `exp`, `iat`, `sub`, client y principal
`human|service`; CRM aplica después `crm.read` localmente. Bearer inválido,
revocado o IAM degradado fallan cerrado y nunca caen a cookie. El rollback con
flag `0` vuelve a UI-session-only.
El secret Basic sólo se envía a un endpoint HTTPS sin userinfo, query ni
fragment y del mismo origin que el issuer IAM.

La API CRM v1 ya expone dominio tenant-aware y escrituras en source. Antes de
abrirlo en runtime debe resolver el contexto compuesto mediante Directory,
Store y Platform con grants owner-specific y scopes por accion; no se inventa
un claim tenant ni se habilita un fallback local.

La evolucion concreta se define en el
[contrato API CRM v1](../api/crm-v1.md) y el
[plan v2607 cerrado](../plans-completed/plan-democrm-v2607.md) y el
[runbook de promocion](../ops/democrm-v2607-promotion.md). Este documento
conserva el resource server baseline y el compatibility scope `crm.read`.
