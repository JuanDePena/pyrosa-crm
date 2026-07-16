# Diseno Funcional Y Tecnico De Pyrosa CRM v2607

Fecha: `2026-07-16`

Estado: `canario owner v2607 live; promocion general pendiente`

## Decision Central

DemoCRM v2607 evoluciona el scaffold contract-first hacia un CRM tenant-aware
con datos reales, perfiles de industria versionados y adopcion completa de
`pyrosa-ui`. El modelo funcional pertenece a CRM; identidad, tenant,
suscripcion, DDL, UI compartida, conexiones y entrega de notificaciones se
consumen desde sus owners mediante contratos.

El diseno implementa la
[vision v2607](../product/vision-v2607.md), el
[mapa de modulos](../product/modules-v2607.md) y
[ADR 0006](adr/0006-multiindustry-core-and-industry-profiles.md).

## Baseline Real

El commit de baseline `31da59b` ya entrega:

- `BusinessOpsShellTemplate` como shell unica;
- registry de rutas y `SidebarItem[]`;
- `WorkspaceLayout`, tablas, filtros, drawers y `UserDrawer` compartidos;
- Dashboard analitico sin tablas;
- sesion delegada IAM y resource server OAuth opt-in;
- PostgreSQL y schema global demo;
- guard de adopcion, typecheck, build y QA visual.

En ese baseline el estado seguia siendo `pilot` porque consumia paquetes
`file:`, usaba datos contract-first/fallback, mantenia estilos y composiciones
locales, no resolvia tenant autorizado y reportaba version runtime v2606. La
implementacion v2607 endurece esa base sin reconstruir una shell paralela. El
estado final y sus limites quedan en el
[plan cerrado](../plans-completed/plan-democrm-v2607.md).

## Estado Del Canario Owner

Al `2026-07-16`, el runtime demo sirve v2607 como una unidad frontend/BFF con
artefacto coherente. El tenant interno `1` tiene diccionarios global `2.0.0` y
tenant-aware `2.0.1` ready en Platform, entitlement Store efectivo, asiento
Directory activo con capacidad `1/1`, bindings IAM `tenant_admin` y
`billing_admin` frescos y las tres decisiones owner OAuth habilitadas.

La correccion posterior al fatal `crm.bootstrap.csrf_missing` mantiene el CSRF
same-origin y conserva la identidad IAM real en la parte privada de la sesion:
issuer HTTPS canonico y subject opaco de `1..200` caracteres. No fabrica
`iam-user-<id>`, rechaza cookies legacy que carecen de esa identidad y redacta
issuer/subject del payload publico. El smoke con la identidad de la asignacion
activa confirmo Directory + Store + Platform `3/3 allow`, schema
`pyrosa_democrm_8ef427da9f0e`, diccionario `2.0.1`, perfil `core` y capability
`crm.cases.read`, sin registrar el subject.

El canario owner queda verde, pero no habilita una cohorte general. El SLO movil
de 24 horas de Store permanece `critical` y `/canaryz` responde `503`;
workshop, datos y usuarios VOIX continuan fuera de alcance hasta cerrar ese y
los demas gates operativos.

## Terminologia Y Fronteras

| Termino | Owner | No equivale a |
| --- | --- | --- |
| cuenta CRM | CRM | identidad, perfil Accounts, customer Store u organizacion Directory |
| contacto CRM | CRM | usuario IAM, aunque pueda vincularse explicitamente |
| caso CRM | CRM | oportunidad, ticket de infraestructura o expediente clinico |
| oportunidad | CRM | caso de paciente o actividad |
| tenant | Platform/Directory segun plano | cuenta CRM o cliente comercial |
| customer comercial | Store | cuenta CRM |
| cita operacional | CRM | confirmacion clinica externa salvo contrato explicito |

## Arquitectura Objetivo

```text
navegador
  -> SharedShell / vistas @pyrosa-ui
  -> BFF CRM /api/crm/v1
       -> auth y politica IAM
       -> membresia/asiento/contexto Directory
       -> entitlement Store
       -> readiness/schema/diccionario Platform
       -> autorizacion funcional CRM
       -> schema tenant-aware CRM
       -> outbox / jobs / integraciones
            -> Directory notifications
            -> Directory connections + NewSync/provider engine
            -> Platform worker control plane
```

El navegador nunca selecciona un schema por concatenacion ni decide
autorizacion. El BFF resuelve tenant y capabilities antes de abrir una
transaccion.

## Predicado De Acceso

Una operacion tenant-aware requiere:

```text
IAM identity/session valid
AND IAM tenant policy/capability allows action
AND Directory membership is active
AND Directory seat is active when required
AND Store entitlement is effective
AND Platform app/schema readiness is ready
AND CRM functional permission allows resource/action
```

Si una dependencia aplicable no responde, la operacion falla cerrada. Cookie
browser y bearer API son carriles distintos. Un bearer invalido no cae a cookie.

Para browser, el ticket exchange o la introspeccion IAM debe entregar la
identidad canonica. CRM la verifica contra el issuer configurado, la conserva
solo en la cookie firmada privada y la usa sin transformacion en las decisiones
owner. El id numerico y el perfil visible del usuario no sustituyen al subject.

## Modelo Tenant-Aware

- Schema global demo: `pyrosa_democrm` para catalogos tecnicos globales,
  outbox/control y metadata app-owned que no contiene datos de cliente.
- Schema tenant demo: `pyrosa_democrm_<tenant_key>`.
- Schema producto futuro: `pyrosa_crm_<tenant_key>`, solo cuando Platform lo
  catalogue y provisione; no se infiere desde el sandbox.
- Tenant key y schema se resuelven desde Platform despues de validar Directory
  y Store.
- En el canario tenant `1`, Platform reporta los contratos activos global
  `2.0.0` y tenant-aware `2.0.1` como ready.
- CRM no duplica memberships, asientos, vigencias, perfiles o politicas.
- Toda fila de negocio queda dentro del schema tenant correspondiente.

La tabla historica `crm_operating_contexts.accounts_organization_id` no define
el modelo v2607. Su sustitucion se expresa en un diccionario nuevo y plan
gobernado; no se reescribe la migracion aplicada.

## Modelo De Dominio

### Agregados Principales

| Agregado | Responsabilidad | Relaciones clave |
| --- | --- | --- |
| account | relacion con organizacion/persona/household | contacts, cases, opportunities, activities |
| contact | persona y preferencias/roles | accounts, cases, appointments |
| case | solicitud de servicio, cola, SLA y resolucion | parties, activities, appointments, service requests |
| activity | accion o interaccion auditable | enlaces tipados a cualquier agregado permitido |
| appointment | coordinacion temporal y participantes | contact, account, case, resource, external ref |
| opportunity | venta y pipeline | account, contacts, stage history, activities |
| industry profile | contrato de adaptacion versionado | fields, states, SLA, views, metrics |
| import batch | trazabilidad e idempotencia de carga | source records, errors, reconciliation |

### Tablas Logicas Iniciales

Los nombres fisicos se fijan en el diccionario, no en este documento. La
intencion incluye:

- accounts y account relationships;
- contacts, contact roles, preferences y account-contact links;
- cases, parties, assignments, status history y SLA milestones;
- activities y activity links;
- appointments, participants, resources y status history;
- opportunities, pipelines, stages y stage history;
- tags, saved views y report definitions;
- industry profiles, field definitions, typed values y tenant configuration;
- audit events, outbox, import batches, source records y quarantine.

El diccionario v2607 prepara parte de esas estructuras, pero el baseline
ejecutable no activa todas. Links/preferencias/parties, historiales dedicados y
las filas de catalogo global permanecen schema-ready y diferidos; `saved views`
no forma parte del diccionario v2607 y queda como ampliacion futura. El runtime
actual usa aggregates para los flujos basicos y rechaza persistencia PostgreSQL
de `sensitive`/`extensions` hasta cerrar cifrado y policy de PII.

Reglas:

- ids publicos opacos y estables;
- timestamps UTC, actor y source en cambios;
- soft archive donde la retencion lo requiera;
- concurrencia optimista mediante version/ETag;
- histories append-only;
- free text separado de codigos estructurados;
- integridad por FK/check/unique desde el diccionario;
- custom values validados contra profile id, version y hash.

No se adopta una tabla EAV universal. Un campo repetidamente filtrado,
indexado o sujeto a integridad fuerte se promueve al diccionario fisico.

## Perfil Y Personalizacion

Resolucion efectiva:

```text
core release
  + industry profile@version
  + tenant configuration@version
  + role/capability projection
  + user presentation preferences
```

Cada capa tiene owner y limites. El perfil no concede permisos; la
configuracion no cambia transiciones no permitidas; las preferencias no cambian
datos ni SLA.

Un cambio de perfil requiere preflight, compatibilidad de campos/estados,
recalculo controlado de read models, evidencia y rollback. No se cambia el
perfil activo de un tenant por editar una etiqueta.

Ese es el contrato objetivo. El release candidate solo ofrece `GET/PATCH` del
singleton con version optimista; historial, preflight y rollback de
upgrade/downgrade permanecen diferidos y bloquean una promocion que cambie el
perfil efectivo.

## API Y Contratos

Los endpoints productivos viven bajo `/api/crm/v1`. El scaffold
`/api/crm/contracts` permanece como compatibilidad temporal y se retira cuando
todas las vistas usen recursos reales.

Capacidades del contrato:

- paginacion, orden y filtros allowlisted;
- detail/new/edit con identificadores opacos;
- idempotency key para creaciones y efectos externos;
- ETag/If-Match o version equivalente para escrituras;
- envelope de error estable y request id;
- audit actor derivado del contexto autenticado;
- tenant resuelto server-side;
- scopes y permisos por dominio/accion;
- exportacion asincrona y auditable.

El detalle vive en [Contrato API CRM v1](../api/crm-v1.md).

## Eventos, Jobs E Integraciones

Eventos publicos candidatos, aun no mapeados desde los tipos internos del
outbox:

- `crm.case.created|assigned|status_changed|resolved|closed|reopened`;
- `crm.activity.created|completed`;
- `crm.appointment.requested|scheduled|rescheduled|cancelled|completed|no_show`;
- `crm.opportunity.stage_changed|won|lost`;
- `crm.import.completed|rejected`.

El envelope incluye version, event id, tenant id, correlation/causation,
occurredAt, actor y payload minimo. No incluye notas libres, fechas de
nacimiento, ids de cobertura ni datos clinicos.

Fronteras:

- CRM decide el workflow y la necesidad de notificar.
- Directory conserva templates, canales, secretos, requests y deliveries.
- Directory conserva catalogo/conexion tenant-owned de providers.
- El provider engine/NewSync ejecuta y normaliza la integracion externa.
- Platform puede operar scheduling, leases, backoff y health del worker.
- CRM conserva idempotencia funcional, estado y reconciliacion.

## Experiencia Visual

### SharedShell

- Conservar `BusinessOpsShellTemplate` y el registry como fuentes unicas.
- Fijar una release publicada e inmutable de todos los paquetes `@pyrosa/*`.
- Eliminar duplicacion de metadata entre sidebar y header.
- Usar un solo badge/status por entrada, derivado de datos reales.
- Cada vista gobierna su `WorkspaceLayout`, status strip y scroll.
- Retirar selectores sobre internals `.py-*` y colores que deban ser tokens.
- Diferencias de marca, perfil y dominio permanecen app-locales.

### Dashboard

No se copia `platform-overview-*`. `pyrosa-ui` debe publicar primitivas o un
template neutral para hero/score, progress, domains, risks e insights. DemoCRM
lo configura con metricas CRM.

El endpoint `GET /api/crm/v1/dashboard-summary` entrega:

- tenant/profile/period/freshness;
- metric definitions y values;
- score versionado y dimensiones;
- riesgos e insights con rutas CRM;
- estados `live`, `empty`, `stale` o `unavailable` explicitos.

No se calculan contadores desde filas visibles ni fixtures. Dashboard no
contiene tablas operativas; enlaza a inventarios filtrados.

### Navegacion

Rutas core:

- `#dashboard`, `#cuentas`, `#contactos`, `#casos`, `#actividades`,
  `#agenda`, `#oportunidades`, `#reportes` y configuracion permitida.

Las vistas de registro adoptan rutas `new/view/edit` enlazables conforme al
estandar transversal. Perfil y permisos controlan visibilidad, no crean rutas
alternas por cliente.

## Errores Y Datos De Referencia

- Un error fatal de bootstrap/contrato muestra la landing transversal fuera de
  SharedShell mediante `InternalErrorLanding` de `@pyrosa/ui-templates`.
- DemoCRM solo aporta logo local, copy, metadata tecnica allowlisted y la
  accion de reintento; no conserva markup ni estilos `crm-fatal*` propios.
- La landing observada con `crm.bootstrap.csrf_missing` no habilita datos de
  respaldo. La correccion exige una sesion IAM canonica y CSRF valido; cookies
  anteriores sin identidad se descartan para forzar un login limpio.
- El detalle tecnico puede exponer un codigo saneado, nunca issuer, subject,
  cookie, token, stack ni URL interna.
- El BFF nunca devuelve `error.message` crudo.
- Un fallo regional usa feedback compartido y conserva solo datos confiables.
- Fixtures y previews requieren un modo de prueba explicito y visible.
- Un catch de red, `500`, timeout o payload invalido nunca activa datos locales
  con apariencia real.

## Seguridad Y Privacidad

El perfil VOIX requiere controles reforzados:

- minimizacion y clasificacion de campos;
- capabilities separadas para lectura sensible, notas y exportacion;
- masking en tablas, logs, screenshots y reportes;
- auditoria de lectura sensible, escrituras, merges y exports;
- busqueda e indices sin contenido sensible innecesario;
- retencion, archivo, correccion y eliminacion por politica de tenant;
- cifrado y backup conforme a politicas operativas;
- no enviar informacion sensible en eventos o notificaciones generales;
- rate limits, CSRF, OAuth scopes, headers y sesiones seguras;
- pruebas de tenant isolation y autorizacion negativa.

CRM coordina operaciones; no debe recopilar informacion clinica que no sea
necesaria para esa finalidad.

## Diccionario Y DDL

La entrega fisica sigue:

```text
modelo aprobado
  -> diccionario CRM versionado
  -> publicacion/activacion
  -> plan fisico Platform
  -> backup y canary
  -> apply gobernado
  -> fingerprint/drift/readiness
  -> promocion por cohorte
```

El rol runtime no recibe DDL. `database/migrations/0001_crm_core.sql` queda como
historia/compatibilidad y `npm run db:migrate` rechaza cualquier apply local.
Para el canario actual, Platform completo adopcion y readiness de los targets
global `2.0.0` y tenant-aware `2.0.1`; ello no autoriza cambios fisicos desde
CRM ni la apertura de otra cohorte.

## Importacion VOIX

El workbook real no se versiona. La migracion usa batch id, staging por tenant,
normalizacion, deduplicacion, quarantine, dry-run, conciliacion y source
fingerprint. El baseline deduplica el fingerprint y duplicados dentro del lote;
la reconciliacion contra entidades existentes queda para el mapping VOIX. Una
fila importada conserva source batch/record y solo puede revertirse mientras
todos sus targets conserven la version inicial y sigan sin archivar; una
edicion directa de cualquiera de esos targets bloquea el rollback. Detectar
nuevas referencias creadas despues del import y ejecutar operaciones
compensatorias posteriores quedan diferidos.

NewSync puede asumir la ejecucion repetible de una integracion futura. CRM
mantiene mapping funcional, aceptacion, estado y errores de dominio.

## Read Models Y Reportes

- Las metricas declaran version, zona, periodo, filtros y formula.
- Los resumentes pueden materializarse mediante jobs idempotentes.
- El catalogo source marca `freshness=catalog` y el job expone aceptacion; la
  ultima corrida/freshness materializada requiere el worker diferido.
- Un read model atrasado se marca `stale`; no se presenta como live.
- Exports son jobs con permiso, filtros, expiracion y auditoria.
- Reportes sensibles no se adjuntan a notificaciones ni evidencia de QA.

## Criterios De Aceptacion Del Diseno

- core y perfil VOIX no requieren forks ni DDL por tenant;
- ownership de todas las entidades y servicios esta explicito;
- caso, oportunidad y cita tienen lifecycles independientes;
- contexto tenant y autorizacion compuesta fallan cerrados;
- datos sensibles no cruzan logs, eventos o fallbacks;
- API, eventos, idempotencia, concurrencia y auditoria estan definidos;
- dashboard consume metricas reales y primitives compartidas;
- importacion y rollout son gobernados, conciliables y reversibles.
