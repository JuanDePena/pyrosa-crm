# Contrato OAuth2 De La API CRM

Fecha de evidencia: `2026-07-25`

Estado: decisiones owner browser E2E `3/3 allow`; bearer, binding tenant para
principal service y matriz de lifecycle/degradación aceptados en development.

El plan transversal y su matriz de consumidores se mantienen en
[OAuth2 API auth](https://github.com/JuanDePena/pyrosa-docs/blob/main/plans-completed/plan-oauth2-api-auth.md).

CRM conserva el login browser delegado, consume tres decisiones owner mediante
clientes confidenciales propios y mantiene un resource server opt-in para sus
endpoints read-only de contratos. IAM es dueño de los registros y secrets;
este repo no los persiste.

## Identidad Browser

El ticket exchange y la introspeccion de sesion deben entregar el issuer y
subject canonicos de IAM. CRM los valida contra el origin HTTPS configurado y
conserva esa identidad solo en la sesion firmada privada. No deriva un subject
como `iam-user-<id>` ni usa email, rol o id numerico como sustituto.

El subject es opaco, tiene longitud `1..200` y usa exclusivamente
`A-Za-z0-9._~-`. Una cookie anterior sin identidad canonica, con issuer
distinto, vacio, whitespace o caracteres fuera del contrato falla cerrada y se
elimina. El payload publico de session/bootstrap expone los datos necesarios
para la shell y CSRF, pero redacta issuer y subject.

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

El catálogo IAM `2607.25.0` congela
`client-pyrosa-crm-api-canary`/`pyrosa-crm-api-canary` como único productor
inbound inicial, principal `service`, sin reutilizar `client-crm` ni ninguno de
los tres clientes owner salientes. El apply del `2026-07-25` materializó el
cliente, el introspector y el grant, sin conceder un tenant por inferencia. La
[evidencia live](../evidence/oauth-api-inbound-live-2026-07-25.md) demuestra
el positivo tenant-aware, expiración, revocación, indisponibilidad de
introspección, recuperación y rollback del flag. Todos los rechazos permanecen
en el carril bearer y nunca caen a cookie, datos locales o un usuario humano
fabricado.

La API CRM v1 ya expone dominio tenant-aware y escrituras en source. Antes de
ampliar su acceso runtime mas alla del tenant canario debe resolver el contexto
compuesto mediante Directory, Store y Platform con grants owner-specific y
scopes por accion; no se inventa un claim tenant ni se habilita un fallback
local.

## Canario Owner Tenant 1

Las tres rutas de decision y sus carriles OAuth2 estan habilitados para el
tenant interno `1`: Directory decide membresia/asiento, Store entitlement y
Platform readiness/schema/diccionario. Sus prerequisitos observados son asiento
Directory `1/1`, entitlement Store efectivo, bindings IAM `tenant_admin` y
`billing_admin` frescos, y diccionarios Platform global `2.0.0` y tenant
`2.0.1` ready.

El runtime demo sirve v2607 con artefacto coherente. La correccion de
`crm.bootstrap.csrf_missing` y de la identidad browser se valido con la
asignacion activa: Directory, Store y Platform devolvieron `3/3 allow` para el
schema `pyrosa_democrm_8ef427da9f0e`, diccionario `2.0.1`, perfil `core` y
capability `crm.cases.read`. La evidencia no conserva ni expone el subject.

El canario saliente permanece separado del resource server bearer entrante. El
inbound queda aceptado solo en development; no certifica preproducción ni
amplía por sí mismo la cohorte comercial o VOIX. La degradación global de Store
por observaciones históricas sigue siendo un gate comercial independiente, no
un blocker del contrato OAuth de CRM.

La evolucion concreta se define en el
[contrato API CRM v1](../api/crm-v1.md) y el
[plan v2607 cerrado](../plans-completed/plan-democrm-v2607.md) y el
[runbook de promocion](../ops/democrm-v2607-promotion.md). Este documento
conserva el resource server baseline y el compatibility scope `crm.read`,
separados del canario owner de la sesion browser.
