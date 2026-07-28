# Extension CRM De Contexto Tenant

Fecha: `2026-07-26`

Estado: `completed-accepted-development`

## Canonico Adoptado

Esta extension aplica al producto Pyrosa CRM el
[contrato transversal de contexto tenant y aislamiento de runtime](https://github.com/JuanDePena/pyrosa-docs/blob/main/design/tenant-context-runtime-isolation.md).
El checkout `pyrosa-democrm` es el carril de desarrollo; `pyrosa-crm` es el
producto y su promocion estable posterior. Los slugs y schemas de ambos carriles
no se mezclan.

Tambien permanecen vigentes:

- el [diseno CRM v2607](design-democrm-v2607.md);
- el [contrato API CRM v1](../api/crm-v1.md);
- el [contrato OAuth consumidor](oauth-api-consumer.md).

## Baseline Y Gap

CRM ya documenta autorizacion compuesta:

```text
IAM policy/capability
AND Directory membership/seat
AND Store entitlement
AND Platform readiness/schema
AND CRM functional permission
```

La API valida que Platform entregue un schema cuyo sufijo coincida con el
`tenantKey` resuelto por Directory. El corte del `2026-07-28` cerró la sesión
interactiva versionada, el switch idempotente común, el binding por request y
el aislamiento de las superficies implementadas. Las superficies asíncronas
todavía no materializadas permanecen deshabilitadas y no operan sin contexto.

El tenant canario historico no puede convertirse en default, fallback o
autoridad para nuevas sesiones.

## Target Local

- sesion BFF opaca con `contextVersion`;
- selector SharedShell alimentado por opciones server-side;
- switch canonico con CSRF, idempotencia y expected version;
- header `X-Pyrosa-Tenant-Context-Version`;
- resolver transaccional desde placement Platform;
- paths:

  ```text
  development global: pg_catalog, pyrosa_democrm
  development tenant: pg_catalog, pyrosa_democrm_<tenant_key>, pyrosa_democrm
  product global:     pg_catalog, pyrosa_crm
  product tenant:     pg_catalog, pyrosa_crm_<tenant_key>, pyrosa_crm
  ```

- cero `public` y cero schema recibido del navegador;
- `TenantWorkContext` en imports, outbox, reportes y actividades asincronas;
- caches, locks, archivos e idempotencia prefijados por tenant validado.

## Ownership Funcional

Permanecen tenant-aware:

- cuentas, contactos y relaciones;
- oportunidades, pipelines y actividades;
- casos, agendas, seguimientos y perfil VOIX;
- configuracion funcional y campos permitidos por perfil;
- reportes, snapshots, imports, outbox y auditoria CRM;
- referencias opacas a documentos o integraciones.

CRM no duplica identidades IAM, memberships/asientos Directory, suscripciones
Store, placements Platform ni conexiones NewSync. Los consume mediante
contratos.

## Entrega Local

### C1 — Inventario Y Contrato

- [x] inventariar routes, queries, pool, imports, outbox, reports, jobs y storage;
- [x] clasificar global/tenant;
- [x] adoptar fixtures y codigos transversales;
- [x] sellar baseline sin mutaciones live.

### C2 — Contexto Interactivo

- [x] implementar sesion, bootstrap, selector y switch;
- [x] agregar binding y stale context;
- [x] resolver schema por transaccion;
- [x] retirar cualquier default canario.

### C3 — Dominio Y Background

- [x] ligar API CRM v1 al contexto;
- [x] propagar `TenantWorkContext` a imports, reportes y outbox implementados;
- [x] separar cache, locks, archivos e idempotencia implementados;
- [x] probar revocacion durante trabajo.

### C4 — Cambios Fisicos Gobernados

- [x] demostrar que el inventario no exige un sucesor físico para este corte;
- [x] conservar `migration.execute` como única vía para schemas existentes;
- [x] acreditar rollback lógico y residuales vacíos;
- [x] no aplicar DDL desde CRM.

### C5 — Canary Y Promocion

- [x] dos tenants y subjects owner exactos;
- [x] A -> B -> A sobre el pool;
- [x] stale tabs, switch concurrente, replay/conflict;
- [x] tenant manipulado y owner outage;
- [x] suspension, entitlement y readiness;
- [x] jobs, archivos y caches implementados sin fuga;
- [x] logout, revocacion y rollback.

## Gate De Cierre

- piloto NewSync aceptado como prerequisito;
- cero endpoint o job sin contexto;
- DemoCRM y CRM conservan manifests y slugs separados;
- canary de dos tenants aceptado;
- drift cero, `public=0` y rollback probado;
- evidencia no incluye datos VOIX ni secretos.

## Cierre Transversal

La matriz live PYROSA→CMT→PYROSA quedó aceptada con blockers vacíos, rollback
de sentinels y cero fallback global o al tenant anterior. El Corte 8 volvió a
validar el fixture transversal byte-exacto (`1/1`) y `public=0`. La aceptación
es exclusiva de `development`; DemoCRM y CRM conservan slugs, manifests y
promociones separados.
