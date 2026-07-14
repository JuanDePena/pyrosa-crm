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

El scaffold aún no expone datos tenant-aware ni escrituras: no se inventa un
claim tenant. Antes de abrir dominio productivo deberá resolver el contexto
organizacional en Directory y añadir scopes por acción.
