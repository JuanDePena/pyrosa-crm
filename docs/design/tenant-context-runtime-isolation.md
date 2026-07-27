# Extension CRM De Contexto Tenant

Fecha: `2026-07-26`

Estado: `definido para adopcion posterior al piloto NewSync`

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
`tenantKey` resuelto por Directory. Sin embargo, el contrato local aun no
define de extremo a extremo una sesion interactiva versionada, el switch
idempotente comun, el binding de cada request ni el aislamiento de workers,
caches y archivos.

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

- inventariar routes, queries, pool, imports, outbox, reports, jobs y storage;
- clasificar global/tenant;
- adoptar fixtures y codigos transversales;
- sellar baseline sin mutaciones live.

### C2 — Contexto Interactivo

- implementar sesion, bootstrap, selector y switch;
- agregar binding y stale context;
- resolver schema por transaccion;
- retirar cualquier default canario.

### C3 — Dominio Y Background

- ligar API CRM v1 al contexto;
- propagar `TenantWorkContext` a imports, reportes y outbox;
- separar cache, locks, archivos e idempotencia;
- probar revocacion durante trabajo.

### C4 — Cambios Fisicos Gobernados

- crear diccionarios sucesores solo si el inventario los exige;
- usar `migration.execute` para schemas existentes;
- preparar recovery, preview, backfill, rollback y residuales;
- no aplicar DDL desde CRM.

### C5 — Canary Y Promocion

- dos tenants y dos subjects;
- A -> B -> A sobre el pool;
- stale tabs, switch concurrente, replay/conflict;
- tenant manipulado y owner outage;
- suspension, entitlement y readiness;
- jobs, archivos y caches sin fuga;
- logout, revocacion y rollback.

## Gate De Cierre

- piloto NewSync aceptado como prerequisito;
- cero endpoint o job sin contexto;
- DemoCRM y CRM conservan manifests y slugs separados;
- canary de dos tenants aceptado;
- drift cero, `public=0` y rollback probado;
- evidencia no incluye datos VOIX ni secretos.
