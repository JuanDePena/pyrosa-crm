# Piloto sintetico DemoCRM v2607

Fecha de evidencia: `2026-07-15T20:31:28.845Z`

Estado: `passed`

Clasificacion: `isolated-synthetic`

## Alcance

Este piloto ejecuta las capas CRM v1 sobre `MemoryCrmV1Store`, usando exclusivamente `database/seeds/v2607-synthetic.json`. No lee el XLSX de VOIX, no abre red o PostgreSQL, no despliega runtime y no muta tenants live.

Seed SHA-256: `601211ca015fdfe925577d2e3eff2e11cc68fe0885dc916daa78cdc395cf574b`.

## Resultado agregado

| Dominio | Tenant primario | Tenant control |
| --- | ---: | ---: |
| accounts | 1 | 0 |
| contacts | 1 | 0 |
| cases | 1 | 0 |
| activities | 1 | 0 |
| appointments | 1 | 0 |
| opportunities | 1 | 0 |

- reportes disponibles: `6`;
- audit aceptado/rechazado: `17/1`;
- eventos outbox con payload minimo: `17`;
- import duplicados/quarantine/commit/rollback: `2/2/1/1`.

## Asserts

- `PASS` **input.synthetic_seed:** El runner acepto exclusivamente el seed JSON sintetico v1.
- `PASS` **idempotency.replay:** Un retry con igual llave y checksum devolvio el mismo agregado.
- `PASS` **idempotency.payload_conflict:** La misma llave con un payload diferente fue rechazada.
- `PASS` **privacy.masking:** La proyeccion ordinaria omitio sensitive y la capability separada habilito la lectura controlada.
- `PASS` **cases.lifecycle:** El caso avanzo new -> triaged -> in_progress con version optimista.
- `PASS` **concurrency.optimistic:** Un update con version stale fue rechazado sin alterar la version vigente.
- `PASS` **cases.invalid_transition_audited:** Una transicion no permitida fue rechazada y quedo en auditoria.
- `PASS` **activities.linked:** La actividad sintetica quedo ligada al caso, cuenta y contacto del mismo tenant.
- `PASS` **appointments.lifecycle:** La cita avanzo requested -> scheduled con rango y timezone sinteticos.
- `PASS` **opportunities.pipeline:** La oportunidad avanzo lead -> qualified en el pipeline default.
- `PASS` **dashboard.versioned:** Dashboard summary reporto contrato, metric set, perfil y agregados versionados.
- `PASS` **reports.catalog_and_job:** El catalogo expuso reportes operativos/comerciales y acepto un report-run sintetico.
- `PASS` **imports.duplicate_quarantine:** El preflight detecto duplicados, dry-run valido el lote y commit fallo cerrado por quarantine.
- `PASS` **imports.commit_and_rollback:** Un lote limpio paso staged -> validated -> committed -> rolled_back.
- `PASS` **tenant.isolation:** El tenant control no pudo listar ni resolver recursos del tenant primario.
- `PASS` **audit.accepted_and_rejected:** La evidencia operacional contiene resultados aceptados y rechazados.
- `PASS` **outbox.minimal_payload:** Los eventos internos del outbox no contienen campos sensibles del contacto.
- `PASS` **aggregate.counts:** Los seis dominios CRM quedaron representados una vez en el tenant sintetico.

## Privacidad, rollback y cleanup

La evidencia contiene solo conteos y resultados agregados. Se verifico masking por defecto, lectura sensible con capability separada y ausencia de campos sensibles en outbox. El lote limpio ejercito rollback y el store completo se descarta al salir del proceso; no existen efectos externos que limpiar.

## Canary y limites

El estado es `synthetic_passed` con alcance `source-only`. No representa promocion live ni readiness productivo.

- El piloto no sustituye pruebas PostgreSQL, load tests ni canary de runtime.
- Los conflictos de version e idempotencia se rechazan, pero esta capa in-memory no registra esos rechazos en audit; la transicion invalida si queda auditada.
- No se ejercitaron dependencias IAM, Directory, Store o Platform live ni feature flags productivos.

## Reproduccion

```bash
cd /srv/containers/apps/pyrosa-democrm/app
npm --prefix ui run pilot:synthetic
```

El JSON hermano conserva el resultado machine-readable saneado.
