# Extension CRM De Contexto Tenant

Fecha: `2026-07-30`

Estado: `baseline aceptado; convergencia freshness/recovery implementada en source y no promovida`

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

## Sucesor Source: Frescura Y Recuperacion

El corte source del `2026-07-30` adopta el
[canon transversal de frescura y recuperacion](https://github.com/JuanDePena/pyrosa-docs/blob/main/design/tenant-access-freshness-and-recovery.md)
sin reescribir la evidencia historica anterior:

- el bootstrap pide una pagina Directory acotada y solo compone owners para
  la seleccion concreta; deja de ejecutar decisiones sobre todos los
  candidatos;
- `GET /api/ui/v1/tenant-context/options` pagina y busca el catalogo visual con
  cache `30 s/120 s`, maximo `128`, siempre acotado por `ownerExpiresAt`;
- IAM se consulta directamente para `crm.dashboard.read`;
- Directory v2 decide solo mapping, membership, proyeccion, asiento y frescura;
- Store y Platform conservan decisiones directas;
- `InteractiveTenantContext` guarda referencias, versiones y expiraciones
  reales de los cinco owners, y vence por el minimo de esas fechas y la sesion;
- `POST /api/ui/v1/tenant-context/renew` renueva `15 s` antes del minimo;
- al vencer durante un outage, la SPA elimina el header funcional, desmonta
  SharedShell y datos y recupera con backoff con jitter de `2 s` a `30 s`, sin
  recarga de documento ni reseleccion.
- el estado tenant server-side se serializa por sesion durante bootstrap,
  switch y renovacion; la búsqueda visual espera el mismo lock y fusiona sobre
  el estado mas reciente, por lo que una respuesta tardia no sobrescribe el
  contexto activo;
- si un switch recibe `409` por version stale, bootstrap ausente o drift de
  placement, la SPA retira el header anterior y recompone bootstrap en vez de
  conservar una alerta operativa persistente.

El modo canonico se fija con
`PYROSA_CRM_DIRECTORY_DECISION_MODE=v2`. El adaptador v1 queda como rollback
temporal con `v1`; su ventana local de compatibilidad es de `15 s` porque el
contrato historico no publica expiracion owner. Con v2 activo,
`PYROSA_CRM_DIRECTORY_V1_SHADOW_ENABLED=1` compara allow/deny, mapping,
membership y asiento, pero el resultado shadow nunca concede acceso ni entra
al contexto.

Esta entrega no aprovisiona tokens, clientes, scopes o secretos; no cambia
flags live; no despliega ni reinicia el runtime. Su promocion exige primero
materializar por owner las credenciales dedicadas declaradas en
`runtime/env/app-pyrosa-democrm.env.example`, verificar Directory v2 y ejecutar
las fixtures/canary del plan transversal.

### Pendientes Del Corte Transversal

La vertical no declara cerrado el Corte 4 live:

- el resource server IAM aun debe autorizar source/live el token de integracion
  de `pyrosa-democrm`;
- el carril bearer CRM v1 conserva el adaptador compuesto historico; migrarlo a
  los mismos owners exige una entrega separada y fixtures de equivalencia;
- las metricas transversales de switch, renewal, safe-state, recovery y cache
  aun no tienen un exporter runtime; los logs source solo registran el
  resultado sanitizado del shadow;
- faltan canary coordinado, burn-in y rollback ejercitado con Store, Directory,
  IAM y Platform desplegados;
- no se ha retirado el adaptador v1 ni su excepcion temporal de expiracion.
