# Contrato API Pyrosa CRM v1

Fecha: `2026-07-15`

Estado: `implementado en source; promocion live pendiente`

Base path: `/api/crm/v1`

## Proposito

Definir la superficie tenant-aware para UI, servicios autorizados e
integraciones de Pyrosa CRM. Este documento fija la semantica implementada y
los tipos/contract tests TypeScript ejecutables del release candidate. El repo
todavia no publica artefactos OpenAPI ni JSON Schema; generarlos y comprobar
compatibilidad cliente/servidor es un gate explicito de promocion.

## Contexto Y Autorizacion

- Browser: sesion local opaca derivada de IAM.
- Mutaciones browser: `Content-Type: application/json` y `X-CSRF-Token`
  emitido en la sesion same-origin; el BFF compara el token exacto.
- API: bearer IAM con issuer, audience, tipo, expiracion y scope exactos.
- Tenant: referencia solicitada y validada server-side contra IAM, Directory,
  Store y Platform; nunca se confia solo en un header o parametro.
- Permiso: CRM aplica capability funcional despues del predicado transversal.

Scopes iniciales:

- `crm.accounts.read|write`;
- `crm.contacts.read|write`;
- `crm.cases.read|write|assign`;
- `crm.activities.read|write`;
- `crm.appointments.read|write`;
- `crm.opportunities.read|write`;
- `crm.dashboard.read`;
- `crm.reports.read`;
- `crm.exports.create`;
- `crm.config.read|manage`;
- `crm.imports.read|manage`;
- `crm.sensitive.read` como capability separada, no implicita en `crm.read`.

IAM registra scopes/clientes y politicas. CRM decide permisos de recursos y
acciones. El legacy `crm.read` puede mapearse temporalmente a endpoints
read-only explicitamente allowlisted, con fecha de retiro. Su allowlist cerrada
es `crm.accounts.read`, `crm.contacts.read`, `crm.cases.read`,
`crm.activities.read`, `crm.appointments.read`, `crm.opportunities.read`,
`crm.dashboard.read`, `crm.reports.read`, `crm.config.read` y
`crm.imports.read`. Una capability futura terminada en `.read`, lectura
sensible o escritura no se hereda automaticamente desde `crm.read`.

### Decisiones transversales de acceso

Antes de resolver un schema o ejecutar dominio, CRM compone tres decisiones
owner `v1.0.0`, todas por `POST`, cuerpo exacto `snake_case` y
`application_slug=pyrosa-democrm`:

| Owner | Endpoint | Cliente machine | Audience | Scope unico |
| --- | --- | --- | --- | --- |
| Directory | `/internal/directory/v1/crm-access-decision` | `client-pyrosa-democrm` | `pyrosa-directory` | `directory:crm-access:decide` |
| Store | `/internal/store/v1/entitlement-decision` | `client-pyrosa-democrm-store-entitlements` | `pyrosa-store` | `store.entitlement.decide` |
| Platform | `/internal/platform/v1/application-readiness-decision` | `client-pyrosa-crm` | `pyrosa-platform` | `platform.provisioning.readiness.consume` |

Cada owner recibe su propio grant OAuth2 `client_credentials`, client secret,
audience, scope y cache de access token. No existe bearer estatico, token
compartido ni fallback. Un `401` invalida solo el token del owner afectado y
reintenta exactamente una vez.

El request comun contiene solamente `contract_version`, `request_id`,
`correlation_id`, `tenant_id`, `application_slug`, `identity` con
`issuer|subject|kind` y `requested_capability`. CRM valida el echo y la forma
exacta de cada respuesta. El acceso exige simultaneamente membresia y asiento
Directory activos, `allowed=true` y entitlement Store `effective`, y readiness
Platform `allowed=true`, `ready=true`, `readiness_status=ready`. Solo Directory
entrega `tenant_key`; Platform entrega `schema_name` y `dictionary_version`, y
CRM comprueba que el schema termina en ese tenant key.

`request_id` y `correlation_id` se normalizan una sola vez al crear el contexto
HTTP. Los tres owners reciben exactamente esos mismos valores y deben
devolverlos sin cambios; CRM no genera un segundo identificador durante la
decision de acceso.

Esta integracion queda source-ready y fail-closed. Activarla en runtime exige
aprovisionar los tres clientes/secrets en IAM y habilitar las rutas owner; este
documento no autoriza ni ejecuta esa promocion.

## Recursos

| Recurso | Endpoints base |
| --- | --- |
| dashboard | `GET /dashboard-summary` |
| accounts | `GET/POST /accounts`, `GET/PATCH /accounts/{id}` |
| contacts | `GET/POST /contacts`, `GET/PATCH /contacts/{id}` |
| cases | `GET/POST /cases`, `GET/PATCH /cases/{id}`, acciones tipadas |
| activities | `GET/POST /activities`, `GET/PATCH /activities/{id}` |
| appointments | `GET/POST /appointments`, acciones de lifecycle |
| opportunities | `GET/POST /opportunities`, stage transitions |
| reports | `GET /reports`, `GET /reports/{id}`, `POST /report-runs` |
| exports | `POST /exports`, `GET /exports/{id}` |
| profile/config | lectura efectiva y mutaciones administrativas versionadas |
| imports | preflight, dry-run, commit, status/quarantine y rollback protegido |

Las transiciones con semantica propia usan comandos idempotentes, por ejemplo
`POST /cases/{id}/assign` o `POST /appointments/{id}/reschedule`; no se ocultan
como patches arbitrarios.

## Listas

Parametros comunes:

- `limit` con maximo definido;
- cursor u offset segun recurso;
- `sort` allowlisted y direccion;
- filtros tipados por status, owner, queue, account, contact, fechas y tags;
- `q` con campos de busqueda declarados;
- includes limitados y autorizados.

Respuesta:

```json
{
  "data": [],
  "page": {
    "limit": 25,
    "nextCursor": null,
    "total": 0
  },
  "meta": {
    "requestId": "opaque-request-id",
    "tenantId": "opaque-tenant-id",
    "asOf": "2026-07-15T12:00:00.000Z"
  }
}
```

`total` puede omitirse cuando su costo no este justificado. Ningun endpoint
carga toda la tabla para paginar en memoria.

## Escrituras

- `Idempotency-Key` es obligatorio para creaciones y efectos externos.
- La llave es unica por tenant para toda la API CRM v1; reutilizarla en otra
  operacion o payload produce conflicto en vez de un segundo efecto.
- `If-Match` o version equivalente evita lost updates.
- Mutaciones validan transicion, tenant, capability y estado relacionado.
- Respuestas incluyen nueva version y request id.
- Audit/outbox se escriben en la misma transaccion que el agregado.
- Una respuesta aceptada para un job no implica que la integracion termino.

`PATCH /config` admite solo `profileKey`, `profileVersion`, `timezone`,
`locale`, `slaPolicy`, `featureFlags` y `labels`. Los objetos anidados tienen
schema y keys allowlisted; cualquier key que contenga `secret`, `token` o
`password` se rechaza recursivamente. `version` y `updatedAt` son server-owned.
La validacion y el replay sin segundo efecto estan cubiertos en el store de
memoria y en el adapter PostgreSQL. Este ultimo serializa una misma llave con
advisory lock transaccional y conserva checksum/respuesta para replay. La
validacion de concurrencia bajo carga y recovery real permanece como gate de
promocion.

`POST /report-runs` acepta exactamente un `reportKey|reportId` del catalogo
efectivo, `format=json|csv` y un periodo opcional validado. `POST /exports`
acepta exactamente un recurso CRM o reporte catalogado, formato, periodo y
filtros allowlisted. `includeSensitive=true` se rechaza en este release
candidate; aceptar el job no implica que exista un worker materializador.

El preflight de import deduplica el mismo `sourceFingerprint` y detecta
`externalId` repetido dentro del lote. No reconcilia todavia entidades contra
la base existente. El rollback se bloquea si cualquier target importado fue
editado o archivado despues del commit; no elimina trabajo humano.

## Error Envelope

```json
{
  "error": {
    "code": "crm.case.transition_invalid",
    "message": "La transicion solicitada no esta permitida.",
    "requestId": "opaque-request-id",
    "occurredAt": "2026-07-15T12:00:00.000Z",
    "retryable": false,
    "fields": []
  }
}
```

No incluye `Error.message`, stack, SQL, DSN, schema, URL completa, tokens,
datos de persona ni payload crudo. El request id coincide con header y log
saneado.

Codigos distinguen autenticacion, tenant, entitlement, readiness, permiso,
validacion, conflicto/version, transicion, idempotencia, dependencia y error
interno.

Los errores OAuth o de sesion producidos antes de entrar al handler CRM v1
usan este mismo envelope anidado; no regresan al formato legacy plano.

## Dashboard Summary

`GET /dashboard-summary` requiere periodo, perfil efectivo y tenant autorizado.
Devuelve:

- `contractVersion`, `metricSetVersion`, `profileVersion`;
- `period`, `timezone`, `asOf`, `freshness`;
- `score` con dimensiones y formula versionada;
- `metrics` con key, label, value, unit, tone y target opcional;
- `risks`, `domains` e `insights` con rutas allowlisted;
- estado `live|empty|stale|unavailable`.

No devuelve filas operativas ni calcula desde fixtures del cliente.
Los conteos de dominios reflejan actividad actualizada dentro del periodo; los
riesgos, SLA, follow-up y excepciones son stock operacional al `asOf`. Los
enlaces de riesgos aplican `attention=overdue|exception` y el insight de
seguimiento aplica `attention=pending`, por lo que cada contador y el inventario
enlazado comparten la misma semantica de stock.

Fechas editables se envian como ISO 8601 con offset explicito; la UI no
interpreta `datetime-local` usando la zona del navegador. Citas se renderizan
con la zona IANA del agregado.

En actividades, `completedAt` es un campo derivado y de solo lectura: se fija
al cambiar a `completed`, se preserva durante ediciones posteriores y vuelve a
`null` si la actividad se reabre. PostgreSQL lo persiste en `completed_at` para
que throughput y periodos sean reproducibles.

## Campos Sensibles

- Se omiten por defecto de listas, busqueda, eventos y exports.
- Un campo sensible requiere capability, purpose y audit aplicables.
- Masked y absent son estados distintos.
- Fechas de nacimiento, cobertura y notas no viajan en URLs.
- `crm.sensitive.read` no autoriza automaticamente exportacion.

## Eventos

Envelope publico objetivo, todavia diferido:

```json
{
  "eventId": "opaque-event-id",
  "eventType": "crm.cases.transition",
  "contractVersion": "1",
  "tenantId": "opaque-tenant-id",
  "occurredAt": "2026-07-15T12:00:00.000Z",
  "correlationId": "opaque-correlation-id",
  "causationId": "opaque-causation-id",
  "actor": { "type": "human", "subject": "opaque-subject" },
  "payload": {}
}
```

El outbox interno se almacena dentro del schema tenant y por eso no duplica
`tenantId`; persiste `actor_subject`, mientras el tipo de actor corresponde al
mapper/publicador futuro. Sus payloads son minimos, versionados y sin notas o
datos sensibles. Los futuros consumidores deberan ser idempotentes por
`eventId`.

El outbox source usa actualmente tipos internos como `crm.cases.transition`,
`crm.appointments.schedule` y `crm.import.commit`. El mapping hacia eventos
publicos semanticos (`crm.case.status_changed`, `crm.appointment.scheduled`,
etc.), la composicion del envelope anterior y su compatibilidad de
consumidores son gates de integracion; no se declaran publicados en v2607.

## Compatibilidad Y Retiro

- `/api/crm/contracts` y acciones preview pertenecen al scaffold v2606.
- Se mantienen durante la migracion de vistas, claramente marcados como demo.
- No se agregan mutaciones al contrato legacy.
- Su retiro exige cero consumidores, guard actualizado y evidencia de QA.
- Cambios incompatibles del API v1 requieren nueva version o periodo de
  compatibilidad documentado.

## Gates De Promocion

Ya cubierto en source/tests: auth negativa, aislamiento tenant, paginacion,
filtros/orden allowlisted, idempotencia funcional, concurrencia optimista,
redaccion de errores, masking y audit/outbox transaccional.

Pendiente antes de promocion live: artefactos OpenAPI/JSON Schema, contract
tests HTTP cliente/BFF, carga y concurrencia PostgreSQL, workers reales de
report/export, backward compatibility y observabilidad runtime.
