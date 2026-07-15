# Plan De Implementacion Pyrosa DemoCRM v2607

Fecha: `2026-07-15`

Estado: `completado con excepcion formal; release candidate no promocionado`

Cierre documental: `2026-07-15`

## Objetivo

Llevar DemoCRM desde el scaffold visual `pilot` v2606 a un CRM v2607
multiindustria, tenant-aware y listo para un piloto controlado con VOIX CALL
CENTERS. El plan adopta completamente `pyrosa-ui`, conecta datos reales,
implementa cuentas, contactos, casos, actividades, agenda, oportunidades y
reportes, y conserva fronteras con las demas aplicaciones Pyrosa.

## Fuentes De Diseno

- [Vision v2607](../product/vision-v2607.md)
- [Modulos v2607](../product/modules-v2607.md)
- [Diseno funcional y tecnico](../design/design-democrm-v2607.md)
- [Perfil VOIX](../design/design-voix-call-center-profile-v2607.md)
- [Analisis seguro del workbook](../design/analysis-voix-case-follow-up-2026.md)
- [API CRM v1](../api/crm-v1.md)
- [ADR multiindustria](../design/adr/0006-multiindustry-core-and-industry-profiles.md)

## Estado Inicial De Referencia

Esta seccion conserva el baseline `31da59b` contra el cual se ejecuto el plan;
no describe el estado final del release candidate.

- Branch `main`, baseline visual `31da59b`.
- `BusinessOpsShellTemplate`, registry, `WorkspaceLayout` y `UserDrawer`
  implementados.
- `check:pyrosa-ui` pasa 140 verificaciones; typecheck y OAuth tests pasan.
- Dependencias `@pyrosa/*` mediante `file:`; adopcion visual en `pilot`.
- Dashboard y workbenches usan contratos/fixtures, no datos CRM persistentes.
- Un fallo BFF puede activar fallback local y el catch raiz expone detalle crudo.
- Runtime/health reporta v2606.
- Schema global demo existe; no hay diccionario v2607 ni schema tenant-aware
  funcional.
- OAuth API es opt-in, `crm.read` y sin contexto tenant completo.
- Workbook VOIX real esta local, ignorado y fuera de Git.

## Fronteras Vinculantes

| Capacidad | Owner |
| --- | --- |
| cuentas, contactos, casos, actividades, citas, oportunidades, reportes y permisos funcionales | CRM |
| identidad, MFA, sesiones, OAuth y politicas tenant | IAM |
| perfil y autoservicio de la persona autenticada | Accounts |
| organizaciones, membresias, aplicaciones, asientos y contexto tenant | Directory |
| customer, oferta, suscripcion, cantidad, vigencia y entitlement | Store |
| company, tenant key, schemas, diccionarios, DDL, drift y readiness | Platform |
| shell, templates, componentes, tokens y accesibilidad | pyrosa-ui |
| conexiones tenant-owned y secretos de providers | Directory |
| provider engines, sincronizacion y workflows externos | NewSync/runtime owner |
| decision funcional de notificar | CRM |
| templates, canales y delivery de notificaciones | Directory |

## Gates Globales

Cada corte ejecutable debe cerrar con:

1. alcance y cambios preexistentes inventariados;
2. docs/evidencia local actualizadas;
3. `git diff --check`;
4. `npm --prefix ui run check:pyrosa-ui`;
5. `npm --prefix ui run typecheck`;
6. pruebas unitarias/contratos/integracion aplicables;
7. `npm --prefix ui run build`;
8. QA visual y accesibilidad de superficies cambiadas;
9. health/runtime cuando se despliegue;
10. rollback ensayado;
11. commit y push separados por repo y rama activa cuando el corte sea
    autorizado para publicacion.

Los cambios de DB agregan obligatoriamente diccionario, plan Platform, backup,
canary, fingerprint/drift y evidencia. El rol runtime no ejecuta DDL.

## Progreso

| Corte | Estado de cierre | Resultado entregado |
| --- | --- | --- |
| 0. Baseline documental y seguridad de fuente | completado | v2607 definido; roadmap v2606 retirado; workbook fuera de Git |
| 1. Adopcion completa de pyrosa-ui | completado | shell/workarea `ready`, `@pyrosa/*` `0.2.1`, landing fatal y guards |
| 2. Tenant, auth, diccionario y plataforma de dominio | completado en source/datos | acceso compuesto fail-closed; tres targets fisicos gobernados `ready` |
| 3. Cuentas y contactos | completado para baseline v1 | inventario/detalle/alta/edicion, masking, ETag, idempotencia, paginacion y audit/outbox |
| 4. Casos y actividades | completado para baseline v1 | workflow, asignacion, transiciones, actividades y auditoria |
| 5. Agenda, citas y notificaciones | completado para baseline v1 | lifecycle de citas, conflictos, retries idempotentes y audit/outbox |
| 6. Oportunidades y pipeline | completado para baseline v1 | CRUD y transiciones de pipeline separados del flujo asistencial |
| 7. Dashboard y reportes | completado para baseline v1 | overview con read models reales, catalogo y jobs versionados |
| 8. Perfiles, integraciones y administracion | completado para baseline v1 | `core@1` y `healthcare-call-center@1`, config versionada sin fork |
| 9. Importacion VOIX, piloto y release readiness | cerrado por excepcion formal | import pipeline probado solo con seed/piloto sintetico; live diferido |

## Auditoria De Cierre Por Corte

| Corte | Evidencia implementada | Capacidad no declarada como live |
| --- | --- | --- |
| 0 | vision/modulos/diseno/API/ADR v2607; XLSX ignorado; roadmap v2606 retirado | workshop y mapping VOIX requieren participacion del cliente |
| 1 | `BusinessOpsShellTemplate`, primitives ejecutivas, rutas CRM, estados de carga/error, landing fatal y paquetes HTTP inmutables `0.2.1` | no se afirma que el runtime activo ya consuma el nuevo build |
| 2 | diccionarios global `2.0.0` y tenant `2.0.1`; tres applies verificados; rol runtime sin DDL; decisiones Directory/Store/Platform y grants owner-specific implementados en source | clientes/secrets IAM, capabilities y flags siguen apagados; las tablas globales estan schema-ready pero su catalogo no fue poblado ni adoptado como autoridad runtime |
| 3 | API/servicio/PostgreSQL/UI para aggregates accounts/contacts; filtros allowlisted, cursor, ETag, idempotencia, estado de consentimiento y masking | links/preferencias dedicadas, archivo fisico, merge asistido y rollback de merge no forman parte del baseline v1 cerrado |
| 4 | cases y activities con referencias tenant, asignacion, lifecycle, reason codes, audit/outbox y rechazo de transiciones invalidas | status history/timeline dedicado, motor automatico de reglas/escalamiento y calendario SLA externo quedan como hardening previo a una cohorte que los requiera |
| 5 | appointments con request/schedule/confirm/reschedule/cancel/complete/no-show, conflicto, concurrencia y transiciones auditadas | status history dedicado, adapter Directory notifications, provider de agenda y reconciliacion externa no se activaron |
| 6 | opportunities con account/contact/pipeline/stage, monto, moneda, probabilidad, close reason y transiciones | forecast persistido/versionado y administracion completa del catalogo de pipelines quedan diferidos |
| 7 | `dashboard-summary`, metric/profile/formula versions, freshness, insights, catalogo source allowlisted y jobs validados de report/export | saved views, filas de catalogo globales, workers materializadores y pruebas de carga live quedan para promocion |
| 8 | resolver `core@1`/`healthcare-call-center@1`, campos declarativos, metric sets, reports y config optimista desde UI/API | historial/preflight/rollback de profile config, conexiones Directory, provider engines, secretos write-only y automatizaciones externas no se presentaron como completados |
| 9 | seed sintetico reproducible, preflight/dry-run/quarantine/commit/rollback protegido, dedupe de fingerprint/intra-lote, aislamiento, masking, audit y outbox; `18` asserts agregados | no hubo reconciliacion contra entidades existentes, XLSX real, PII, workshop, tenant VOIX, agentes/supervisores, fault/load live ni despliegue v2607 |

La evidencia durable se consulta en:

- [rollout de diccionarios v2607](../evidence/democrm-v2607-dictionary-rollout-2026-07-15.md);
- [piloto sintetico reproducible](../evidence/democrm-v2607-synthetic-pilot-2026-07-15.md);
- [contrato API CRM v1](../api/crm-v1.md);
- [promocion operativa v2607](../ops/democrm-v2607-promotion.md).

## Corte 0: Baseline Documental Y Seguridad De Fuente

### Tareas

- Retirar `docs/plans/plan-roadmap-v2606.md` y reparar referencias.
- Publicar vision, modulos, diseno, perfil VOIX, API y ADR v2607.
- Marcar vision/modulos v2606 como baseline historica sustituida.
- Clasificar el workbook real, ignorarlo y documentar reglas de ejemplos.
- Registrar solo estructura y conteos agregados, sin PII.
- Corregir docs que confunden cuenta CRM, Accounts y Directory.
- Retirar instrucciones de DDL directo del flujo recomendado.
- Congelar preguntas funcionales pendientes para workshop VOIX.

### Gate

- Indices y links validos.
- Workbook ausente de `git status` y `git ls-files`.
- Ninguna fila/dato personal en Markdown, tests o evidencia.
- Validadores documentales y diff-check correctos.

## Corte 1: Adopcion Completa De `pyrosa-ui`

### Tareas En Proveedor

- Diseñar primitives/templates neutrales para overview ejecutivo:
  - hero y score;
  - signals;
  - progress/readiness;
  - domains;
  - risks;
  - insights.
- Agregar canary Theme Studio, contratos, accesibilidad, responsive y tokens.
- Publicar release inmutable con checksum/provenance y rollback.

### Tareas En DemoCRM

- Sustituir dependencias `file:` por versiones publicadas fijas.
- Conservar `BusinessOpsShellTemplate`; no reintroducir AppShell local.
- Resolver duplicacion de version/ambiente/branch entre header y sidebar.
- Usar un solo badge/status vivo por ruta.
- Mover status strip y workspace al ownership de cada vista.
- Retirar selectores sobre internals `.py-*`, colores duplicados y CSS de
  primitives compartidas.
- Extender guard para rutas, package provenance, tokens, fallbacks y errores.
- Adoptar landing transversal para error fatal y sanear el BFF.

### Gate

- Estado local `ready`, no `file-pilot`.
- Cero composicion local de sidebar/header.
- Cero datos fallback activados por error productivo.
- QA de teclado, focus, zoom, mobile, overflow, dark/light y error states.
- Screenshots comparables con Platform/Directory sin copiar CSS.

## Corte 2: Tenant, Auth, Diccionario Y Plataforma De Dominio

### Tareas

- Definir diccionario global/tenant v2607 y hashes publicados.
- Modelar account, contact, case, activity, appointment, opportunity, profile,
  audit, outbox e import intent.
- Corregir `accounts_organization_id` mediante migracion gobernada hacia
  referencias Platform/Directory; no editar historia aplicada.
- Provisionar schema tenant-aware canary desde Platform.
- Retirar DDL del rol runtime y del carril productivo `db:migrate`.
- Implementar resolucion de tenant sin concatenacion desde navegador.
- Aplicar predicado IAM + Directory + Store + Platform + CRM.
- Definir scopes/capabilities v1 y compatibility de `crm.read`.
- Implementar request id, error envelope, audit y outbox transaccionales.
- Añadir storage de profile/config versionados y optimistic concurrency.

### Gate

- Diccionario activo/publicado y plan Platform aprobado.
- Backup, canary, apply, fingerprint y drift alineados.
- Runtime sin DDL.
- Tests negativos de otro tenant, asiento, entitlement, readiness y permiso.
- Browser y bearer separados; no auth fallback.

## Corte 3: Cuentas Y Contactos

### Tareas

- Implementar repositorios/servicios/API v1 paginados.
- Crear inventarios, detail/new/edit y rutas enlazables compartidas.
- Tipos de cuenta, relaciones, owners, tags y archivo.
- Contact roles, preferencias, consentimientos y canales.
- Links account-contact y referencias externas opacas.
- Deteccion/merge de duplicados con preview, confirmacion y auditoria.
- Masking y capability para atributos sensibles.
- Retirar fixtures de Cuentas/Contactos y adapters legacy asociados.

### Gate

- CRUD real tenant-isolated y auditado.
- Paginacion/orden/filtros backend allowlisted.
- ETag/version evita lost updates.
- Merge y rollback probados.
- QA visual desktop/mobile y empty/error/loading.

## Corte 4: Casos Y Actividades

### Tareas

- Agregar rutas `#casos` y workflow core.
- Implementar tipos, colas, prioridad, owner, asignacion y SLA.
- Parties y links a account/contact/service request.
- State machine versionada, reason codes, resolve/close/reopen.
- Actividades de llamada, tarea, seguimiento, correo, nota y resultado.
- Timeline unificado y status histories append-only.
- Reglas de asignacion y escalamiento idempotentes.
- Activar extensiones VOIX de cobertura, elegibilidad,
  referido/autorizacion y servicios solicitados.
- Evitar free text como unica fuente de estados.

### Gate

- Flujo ingreso -> asignacion -> seguimiento -> resolucion -> cierre.
- Transiciones invalidas fallan y quedan auditadas.
- SLA usa calendario/zone/version declarados.
- Agente y supervisor respetan capacidades distintas.
- Datos sensibles no aparecen en logs/eventos/screenshots.

## Corte 5: Agenda, Citas Y Notificaciones

### Tareas

- Agregar ruta `#agenda`, vistas calendario/lista y detalle enlazable.
- Implementar appointment, participants, resources y status history.
- Comandos request/schedule/confirm/reschedule/cancel/complete/no-show.
- Deteccion de conflicto y holds claramente no confirmados.
- Idempotencia para acciones e integraciones externas.
- Solicitar recordatorios mediante Directory notifications con templates
  versionados y variables minimas.
- Modelar references/sync state para agenda externa.
- Integrar provider connection/engine solo despues de probe/readiness.
- Implementar retries, reconciliation y errores saneados.

### Gate

- Ciclo de cita completo y sin duplicados por retry.
- Accepted, scheduled, delivered y confirmed no se confunden.
- CRM no recibe secretos de provider/notificacion.
- Fallo externo conserva caso/actividad y crea excepcion reconciliable.
- QA timezone/DST/overlap y rollback.

## Corte 6: Oportunidades Y Pipeline

### Tareas

- Implementar pipelines/stages versionados por perfil y tenant.
- CRUD de oportunidades con account/contact/product/owner.
- Stage transitions, probability, amount/currency y close reason.
- Pipeline board/list, detail/new/edit y next actions.
- Forecast versionado y auditado.
- Separar permisos comerciales de casos/agenda.
- Retirar fixtures de Oportunidades.

### Gate

- Pipeline generico funciona con perfil base y VOIX.
- Paciente/caso nunca aparece como oportunidad por defecto.
- Forecast reproducible por periodo/moneda/version.
- Concurrencia, transiciones y permisos negativos probados.

## Corte 7: Dashboard Y Reportes

### Tareas

- Implementar read models y `GET /api/crm/v1/dashboard-summary`.
- Definir metric sets core y VOIX con formulas versionadas.
- Adoptar primitives ejecutivas publicadas por `pyrosa-ui`.
- Construir status strip, hero/score, progress, risks, domains e insights.
- Enlazar cada insight a un inventario filtrado autorizado.
- Implementar report catalog, runs y saved views.
- Implementar exports asincronos con expiracion y auditoria.
- Mostrar freshness y estados live/empty/stale/unavailable.
- Retirar MetricCards/tiles/Runtime literal y contadores de fixtures.

### Gate

- Dashboard no contiene tablas ni datos client-calculated.
- Formulas y totales concilian contra queries controladas.
- Score declara version y dimensiones.
- Stale/unavailable no se presenta como live.
- Reports/export respetan masking, tenant y capabilities.
- QA visual compara gramatica con Platform/Directory.

## Corte 8: Perfiles, Integraciones Y Administracion

### Tareas

- Implementar catalogo/effective resolver de industry profiles.
- Publicar perfil base y `healthcare-call-center@1`.
- Configurar vocabulario, campos, estados, SLA, vistas, metricas y reports.
- Implementar tenant configuration con preflight/version/rollback.
- Demostrar dos configuraciones sin `if tenant === VOIX`.
- Construir UI administrativa con fields declarativos y write-only secrets.
- Integrar Directory connections y provider engines requeridos.
- Operar jobs mediante control plane cuando aplique.
- Añadir feature flags fail-closed y auditadas.

### Gate

- Core base y VOIX pasan el mismo contract suite.
- Ningun cambio de config ejecuta DDL.
- Profile upgrade/downgrade prueba compatibilidad y rollback.
- Secrets nunca vuelven al browser.
- Integraciones declaran probe, capability, timeout y errors estables.

## Corte 9: Importacion VOIX, Piloto Y Release Readiness

### Tareas

- Realizar workshop de glosario, ids, estados, SLA, agenda y retencion.
- Generar workbook sintetico reproducible y aprobarlo para tests.
- Custodiar el original fuera del checkout antes del piloto.
- Implementar import preflight/staging/normalizacion/dedupe/quarantine.
- Ejecutar dry-run y conciliar totales por hoja/lote sin PII en evidencia.
- Cargar tenant VOIX solo tras subscription, seat y schema readiness.
- Pilotar cohortes de agentes/supervisores con soporte y rollback.
- Validar privacidad, masking, audit, exports, backups y restore.
- Ejecutar fault injection, load/performance y observabilidad.
- Actualizar runtime a v2607 solo despues de gates funcionales.
- Preparar tag/release y promocion separada hacia `pyrosa-crm`.

### Gate De Cierre

- Operacion VOIX completa sin hoja paralela para la cohorte aprobada.
- Import conciliado, duplicados resueltos y errores en quarantine.
- Core generico y perfil VOIX demostrados sin fork.
- Dashboard/reportes usan datos reales y metricas aceptadas.
- Predicado de acceso, tenant isolation y lectura sensible probados.
- Diccionario/drift, backup/restore, health y observabilidad listos.
- Paquetes UI, artefactos y release tienen provenance reproducible.
- Rollback tecnico, de datos, perfil e importacion ensayado.
- Documentacion, evidencias, commits y push completos por repo.

## Evidencia Minima Por Corte

- commit/base y rama;
- decisiones y contratos afectados;
- comandos y resultados de checks;
- dictionary/profile/API versions;
- screenshots sin datos sensibles;
- requests/correlation ids saneados;
- conciliaciones agregadas;
- excepciones y blockers;
- rollback probado;
- estado `pending|canary|pilot|ready`.

## Excepcion Formal De Cierre

Identificador: `DEMOCRM-V2607-PROMOTION-EXCEPTION-2026-07-15`

Estado: `aceptada para cerrar la implementacion source/datos; no concede
readiness productivo`

### Motivo

El repositorio y los diccionarios pueden cerrarse y publicarse sin inventar una
promocion externa. Los pasos restantes requieren autoridad, secretos o
participacion que no pertenecen a este commit:

1. IAM debe registrar grants/clientes machine, capabilities `crm.*` y secrets;
2. Directory, Store y Platform deben desplegar sus endpoints y habilitar flags
   reversibles despues de QA live;
3. el runtime DemoCRM debe desplegarse por su gestor, validarse y observarse
   antes de promover `pyrosa-crm`;
4. VOIX debe aprobar workshop, tratamiento de PII, mapping, conciliacion y
   cohortes de agentes/supervisores;
5. las capacidades diferidas enumeradas en la auditoria por corte deben
   cerrarse o aceptarse por alcance antes de que una cohorte dependa de ellas;
6. el runtime aun no consume las tablas schema-ready
   `crm_account_contact_links`, `crm_contact_preferences`, `crm_case_parties`,
   `crm_case_status_history`, `crm_appointment_participants`,
   `crm_appointment_status_history` ni `crm_opportunity_stage_history`;
7. la persistencia PostgreSQL rechaza `sensitive` y `extensions` no vacios
   hasta disponer de cifrado, policy/keys y pruebas de masking; el piloto de
   privacidad que usa store efimero no autoriza PII persistida;
8. OpenAPI/JSON Schema, contract tests HTTP UI/BFF, saved views, filas de
   catalogo global, workers report/export y carga/concurrencia live siguen
   siendo gates, no entregables ocultamente completados.
9. profile config no tiene historial, preflight ni rollback de
   upgrade/downgrade; y el import no reconcilia entidades existentes ni aplica
   compensaciones despues de una edicion humana.
10. el mapping/compatibilidad de eventos publicos semanticos y la freshness o
    ultima corrida materializada de reportes requieren consumidores/workers
    que no forman parte del release candidate.

### Limite De La Excepcion

La excepcion permite mover este documento a `plans-completed` como cierre del
release candidate y de la aplicacion gobernada de schemas. No permite afirmar:

- `runtime ready`, `pilot live` o `production ready`;
- que el XLSX VOIX fue leido, transformado o importado;
- que hubo datos personales, usuarios reales o operacion sin hoja paralela;
- que OAuth, flags owner, notificaciones, providers o workers estan activos;
- que las tablas schema-ready anteriores tienen flujos de dominio activos;
- que `sensitive`/`extensions` pueden persistirse en PostgreSQL o que existe
  OpenAPI/JSON Schema ejecutable;
- que un push Git equivale a despliegue o promocion.

### Criterios De Salida

La excepcion se retira unicamente con la evidencia exigida por el
[runbook de promocion](../ops/democrm-v2607-promotion.md): matriz OAuth
allow/deny/revocacion, runtime v2607 verificado, workshop/PII autorizados,
import conciliado, cohorte VOIX aceptada, fault/load/observabilidad, y rollback
tecnico y de datos ensayados.

## Criterio Para Mover A Completados

El plan solo se mueve a `docs/plans-completed/` cuando los nueve cortes de
implementacion estan cerrados o existe una excepcion formal que no oculte una
capacidad faltante. Completar la documentacion del Corte 0 no declara v2607
implementado ni autoriza la promocion productiva.

Este cierre usa la segunda condicion. La excepcion formal anterior enumera las
capacidades faltantes y conserva su salida operativa; por tanto, el movimiento
a completados cierra el release candidate sin presentar esos gates como
ejecutados.
