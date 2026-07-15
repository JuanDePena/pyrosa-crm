# Promocion Operativa DemoCRM v2607

Fecha: `2026-07-15`

Estado: `pendiente de ejecucion autorizada`

## Proposito

Promover de forma separada el release candidate v2607 hacia el runtime demo y,
despues de un canary aceptado, hacia `pyrosa-crm`. Este runbook no registra una
promocion ya realizada ni autoriza datos personales: fija el orden, la evidencia
y los rollback necesarios para ejecutarla en una ventana aprobada.

## Baseline Confirmado

- Los paquetes `@pyrosa/*` estan fijados a la release inmutable `0.2.1`.
- El BFF, API CRM v1, inventario/detalle/alta/edicion de seis recursos,
  dashboard, perfiles, import staging, audit/outbox y landing de error estan
  implementados en source.
- Los tres targets fisicos de diccionario estan aplicados y verificados; ver
  [evidencia del rollout](../evidence/democrm-v2607-dictionary-rollout-2026-07-15.md).
- El piloto ejecutado fue exclusivamente sintetico e in-memory; ver
  [evidencia del piloto sintetico](../evidence/democrm-v2607-synthetic-pilot-2026-07-15.md).
- No se ha documentado como ejecutado el despliegue v2607, el workshop VOIX,
  una importacion del XLSX real ni una cohorte humana.

## Gates De Promocion

### 1. Change Control Y Privacidad

Antes de tocar un runtime:

1. identificar ventana, responsables, tenant/cohorte y decision de rollback;
2. confirmar backup vigente y evidencia Platform `3/3 ready`;
3. aprobar por escrito proposito, minimizacion, campos, retencion, masking,
   exportacion y custodios para cualquier dato VOIX;
4. mantener el workbook original fuera del checkout y de los artefactos de QA;
5. prohibir PII en logs, screenshots, Markdown, fixtures, issues y commits.

Sin autorizacion de PII solo se permite continuar con datos sinteticos.

### 2. IAM Y OAuth Owner-Specific

IAM debe aprovisionar clientes confidenciales separados, grants de
`client_credentials`, secrets fuera de Git y capabilities `crm.*` sin
wildcards:

| Owner | Client exacto | Audience | Scope unico |
| --- | --- | --- | --- |
| Directory | `client-pyrosa-democrm` | `pyrosa-directory` | `directory:crm-access:decide` |
| Store | `client-pyrosa-democrm-store-entitlements` | `pyrosa-store` | `store.entitlement.decide` |
| Platform | `client-pyrosa-crm` | `pyrosa-platform` | `platform.provisioning.readiness.consume` |

Tambien se valida el resource server CRM (`pyrosa-crm`, scope compatibility
`crm.read`) solo si la cohorte abrira acceso bearer. Browser y bearer mantienen
carriles separados; ningun fallo OAuth cae a cookie, bearer estatico o headers
de confianza.

### 3. Endpoints Owner Y Feature Flags

Desplegar primero los productores y probarlos con sus flags apagados. Luego
habilitar un owner por vez:

- Directory: enforcement requerido y
  `PYROSA_DIRECTORY_OAUTH_RESOURCE_ACCESS_ENABLED=true`;
- Store: resource server interno y
  `PYROSA_STORE_CRM_ENTITLEMENT_DECISION_ENABLED=true`;
- Platform:
  `PYROSA_PLATFORM_APPLICATION_READINESS_DECISION_ENABLED=1`.

Cada paso exige un allow canary y denials para issuer, client, audience, scope,
tenant, app, capability, membresia, asiento, vigencia, entitlement y readiness.
Un `401`, `403`, `409` o `503` nunca se transforma en allow.

### 4. Configuracion Del Consumidor CRM

Inyectar mediante el env host-managed, sin imprimir valores:

- las tres URLs internas y token URL IAM;
- `PYROSA_CRM_DIRECTORY_OAUTH_CLIENT_SECRET`;
- `PYROSA_CRM_STORE_OAUTH_CLIENT_SECRET`;
- `PYROSA_CRM_PLATFORM_OAUTH_CLIENT_SECRET`;
- audience y scope exactos documentados en
  [`runtime/env/app-pyrosa-democrm.env.example`](../../runtime/env/app-pyrosa-democrm.env.example).

`PYROSA_CRM_OAUTH_API_ENABLED` permanece `false` salvo que se promueva tambien
el resource server bearer y se completen sus pruebas de revocacion. La ausencia
de cualquiera de los tres secrets owner mantiene CRM fail-closed.

Para un canary estrictamente single-tenant se puede fijar
`PYROSA_CRM_DEFAULT_TENANT_ID`. El BFF lo presenta en `publicSession` como
tenant candidato y lo usa cuando la solicitud no incluye
`X-Pyrosa-Tenant-Id`; no lo trata como autorizacion. Cada bootstrap y cada
operacion vuelven a exigir las decisiones positivas de Directory, Store y
Platform para ese mismo tenant.

Esta variable no es un selector multitenant ni debe usarse cuando el usuario
pueda operar mas de un tenant. La promocion multitenant mantiene como gate un
selector respaldado por el contexto autorizado de Directory; hasta entonces,
la cohorte debe tener un unico tenant documentado y la variable queda vacia
fuera de esa cohorte.

### 5. Preflight Funcional

Con un tenant sintetico/canary y sin PII:

1. resolver Directory + Store + Platform con el mismo `tenant_id`, app e
   identidad, verificando echoes y decision ids;
2. confirmar que el schema retornado termina en el `tenant_key` de Directory y
   que el diccionario es el activo esperado;
3. ejecutar CRUD, ETag, idempotencia, transiciones, aislamiento tenant,
   masking, dashboard, report job, import dry-run/quarantine y rollback;
4. ejecutar los checks de source, build, QA visual, teclado, mobile y landing
   fatal;
5. registrar solo ids opacos, conteos, estados y hashes saneados.

Antes de una cohorte real tambien deben cerrarse o aceptarse expresamente las
capacidades diferidas del plan: merge asistido, reglas automaticas de
asignacion/escalamiento, adapter de notificaciones Directory, provider de
agenda/reconciliacion, forecast, saved views, filas del catalogo global y
workers reales de report/export. Tambien deben existir OpenAPI/JSON Schema y
contract tests HTTP UI/BFF, y debe decidirse si las tablas schema-ready de
links/preferencias/parties/status history se activan o se aceptan fuera de la
cohorte.

La persistencia de `sensitive` o `extensions` no vacios esta cerrada por
defecto en PostgreSQL. Sólo puede habilitarse despues de aprobar cifrado,
custodia/rotacion de keys, purpose, retencion, masking y pruebas negativas; el
piloto efimero no satisface ese gate.

### 6. Despliegue Runtime

1. publicar los commits por repo y fijar el commit/artefacto exacto;
2. reconciliar el Quadlet y env versionados mediante el flujo operativo
   autorizado; no usar un `podman run` persistente ad hoc;
3. promover primero `pyrosa-democrm`, no `pyrosa-crm`;
4. verificar servicio/contenedor, health, version `v2607`, DB efectiva,
   dependencias y UI autenticada;
5. comprobar que el rol runtime no tiene DDL/`TRUNCATE` y que arrancar el
   servicio no intenta `db:migrate`;
6. observar logs saneados, latencia, errores owner y drift durante la ventana.

La promocion a `pyrosa-crm` requiere una segunda decision explicita despues del
canary demo; no se deriva automaticamente del push Git.

### 7. Workshop, Import Y Piloto VOIX

El workshop debe congelar glosario, identificadores, estados, responsables,
SLA/calendario/timezone, agenda, duplicados, quarantine, retencion y criterios
de conciliacion. Solo entonces:

1. custodiar y hashear el original en una ubicacion aprobada fuera de Git;
2. producir un mapping versionado y una copia de trabajo minimizada;
3. ejecutar preflight y dry-run, conciliando conteos agregados por lote;
4. resolver duplicados/quarantine antes de `commit`;
5. cargar primero una cohorte canary de datos y usuarios aprobada;
6. probar agente y supervisor, masking, audit, export, backup y restore;
7. expandir la cohorte solo si VOIX acepta las metricas y puede operar sin hoja
   paralela dentro del alcance acordado.

La evidencia real nunca incluye filas, nombres de pacientes, telefonos,
diagnosticos, member ids ni capturas con datos personales.

El baseline solo deduplica fingerprint y `externalId` dentro del lote. La
cohorte real requiere reconciliation contra entidades existentes acordada en
el mapping. Si un target importado cambia despues del commit, el rollback se
bloquea y la promocion debe detenerse para diseñar una compensacion auditada.

## Rollback

- Acceso compuesto: apagar el flag del owner afectado; CRM presenta
  indisponibilidad controlada y no activa fallback local.
- Resource server bearer: `PYROSA_CRM_OAUTH_API_ENABLED=false`.
- Runtime: volver al artefacto/commit anterior mediante el mismo gestor y
  verificar health; no se revierte el catalogo por copiar archivos viejos.
- Datos/diccionario: usar exclusivamente el recovery gobernado de Platform y
  sus backups/attestations. El rol CRM nunca ejecuta DDL de rollback.
- Import: detener nuevas escrituras, ejecutar el comando versionado de rollback
  del lote solo si todos los targets conservan version inicial; ante
  `crm.import.rollback_conflict`, no forzar archivo y preparar compensacion.
- Piloto: retirar la cohorte, revocar grants/asientos temporales y conservar la
  evidencia saneada de la decision.

## Stop Conditions

Detener la promocion ante drift, fingerprint distinto, secret ausente, scope
adicional, schema/tenant incongruente, decision owner ambigua, PII en logs,
quarantine sin resolver, rollback no ensayado, health degradado o necesidad de
usar un fallback local. Ninguno de esos estados se acepta como warning.

## Evidencia De Cierre Operativo

El gate se considera `ready` solo cuando existen:

- matriz allow/deny owner-specific y revocacion;
- commit, checksums de paquetes/diccionarios y artefacto desplegado;
- health/runtime y guard DDL post-deploy;
- conciliacion de import sin PII;
- aceptacion de la cohorte VOIX y metricas;
- backup/restore y rollback tecnico/de datos ensayados;
- decision separada para promover o no a `pyrosa-crm`.
