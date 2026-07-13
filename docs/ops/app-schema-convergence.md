# Convergencia De Schema De Aplicacion

Fecha de evidencia: `2026-07-06`
Estado: `completado`

## Gobierno Transversal

Este runbook conserva el resultado y rollback propios del canary CRM. La regla
comun vive en el
[gobierno transversal de schemas de aplicacion](https://github.com/JuanDePena/pyrosa-docs/blob/main/design/app-schema-governance.md)
(`/srv/docs/design/app-schema-governance.md`).

## Estado Actual

| Campo | Valor |
| --- | --- |
| App | `pyrosa-democrm` |
| Base | `app_pyrosa_democrm` |
| Rol | `app_pyrosa_democrm` |
| Schema tecnico/global | `pyrosa_democrm` |
| `search_path` | `pyrosa_democrm, public` |
| Objetos en `public` | `0` app-owned |
| Objetos en `pyrosa_democrm` | 4 tablas, 3 secuencias y 8 indices |
| Tabla de migraciones | `pyrosa_democrm.crm_schema_migrations` |

La primera transaccion forward intento mover manualmente secuencias que
PostgreSQL ya habia trasladado junto con sus tablas owned. Esa transaccion
aborto antes de `COMMIT`; se comprobo que el estado previo seguia intacto. La
segunda ejecucion retiro esos movimientos redundantes y finalizo con `COMMIT`.

## Rollback

Ejecutar en ventana controlada antes de aceptar nuevas escrituras posteriores
al canary. Si ya hubo escrituras, verificar primero que ningun proceso dependa
del schema objetivo mediante nombres calificados.

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER ROLE app_pyrosa_democrm RESET search_path;

ALTER TABLE IF EXISTS pyrosa_democrm.crm_audit_events SET SCHEMA public;
ALTER TABLE IF EXISTS pyrosa_democrm.crm_platform_links SET SCHEMA public;
ALTER TABLE IF EXISTS pyrosa_democrm.crm_operating_contexts SET SCHEMA public;
ALTER TABLE IF EXISTS pyrosa_democrm.crm_schema_migrations SET SCHEMA public;

ALTER SEQUENCE IF EXISTS pyrosa_democrm.crm_audit_events_audit_event_id_seq SET SCHEMA public;
ALTER SEQUENCE IF EXISTS pyrosa_democrm.crm_platform_links_link_id_seq SET SCHEMA public;
ALTER SEQUENCE IF EXISTS pyrosa_democrm.crm_operating_contexts_context_id_seq SET SCHEMA public;

DROP SCHEMA IF EXISTS pyrosa_democrm;

COMMIT;
```

Las secuencias `bigserial` owned se mueven junto con sus tablas. No se deben
mover otra vez manualmente en la transaccion forward.

## Validacion Ejecutada

- `SHOW search_path`: `pyrosa_democrm, public`.
- `current_schema()`: `pyrosa_democrm`.
- `SELECT count(*) FROM crm_schema_migrations`: `1`.
- `rolconfig`: `search_path=pyrosa_democrm, public`.
- `public`: 0 objetos app-owned.
- `pyrosa_democrm`: 4 tablas, 3 secuencias y 8 indices.
- `node ui/scripts/apply-migration.mjs`: migracion `0001_crm_core.sql` ya
  aplicada.
- `app-pyrosa-democrm.service`: `active/running` despues del restart.
- `http://127.0.0.1:10166/__pyrosa_crm_health`: `ok: true`.

## Evidencia En Platform

- [Canary de pyrosa-democrm](https://github.com/JuanDePena/pyrosa-platform/blob/main/docs/plans-completed/app-schema-canary-democrm-2026-07-06.md).
- [Inventario posterior al canary](https://github.com/JuanDePena/pyrosa-platform/blob/main/docs/plans-completed/app-schema-inventory-after-democrm-canary-2026-07-06.md).
