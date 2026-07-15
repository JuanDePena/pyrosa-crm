# Rollout De Diccionarios DemoCRM v2607

Fecha: `2026-07-15`

Estado: `ready`

## Alcance

Platform catalogo, aplico y verifico los tres targets fisicos que corresponden
a la linea DemoCRM/CRM v2607. La verificacion final fue read-only, no leyo filas
de negocio y no expuso DSN, credenciales ni ubicaciones de backups.

Los snapshots bajo `database/dictionaries/physical-baselines/` son las bases
estructurales **pre-apply** inmutables con las que se catalogaron los
antecesores; no pretenden representar el estado live posterior. Sus hashes
publicados se conservan para no romper el lineage. El estado post-apply se
ancla separadamente en `manifest.v2607.json` mediante la evidencia canonica de
Platform (`3/3`, `ready=true`, SHA-256 indicado abajo).

| Target fisico | Diccionario activo/publicado | Objetos | Tablas | Apply | Fingerprint live | Estado |
| --- | --- | ---: | ---: | --- | --- | --- |
| `app_pyrosa_democrm/pyrosa_democrm` | `pyrosa-democrm-global@2.0.0` | 90 | 7/7 | `succeeded` | `sha256:78743d9821c...404b8f` | `ready` |
| `app_pyrosa_democrm/pyrosa_democrm_8ef427da9f0e` | `pyrosa-democrm-tenant-product@2.0.1` | 413 | 25/25 | `succeeded` | `sha256:524c2afeefc...830023` | `ready` |
| `app_pyrosa_crm/pyrosa_crm_8ef427da9f0e` | `pyrosa-crm-tenant-product@2.0.1` | 413 | 25/25 | `succeeded` | `sha256:94492d4d50b...50cedb` | `ready` |

En los tres casos:

- desired, applied y migration version coinciden;
- el estado fisico es `governed-applied` y el schema esta `verified`;
- plan y run terminaron `succeeded` en modo `ddl-applied`;
- backup, restore y attestation quedaron verificados;
- el fingerprint recalculado coincide con el post-apply registrado;
- el rol runtime no conserva DDL ni `TRUNCATE`, el ownership esta separado y
  el guard `dictionary-ddl-guard-v2` tiene cobertura exacta;
- la verificacion final reporto `3/3` targets, `ready=true` y cero blockers.

## Inmutabilidad Y Correccion

El primer sucesor tenant `2.0.0` fue rechazado antes de commit al redeclarar un
objeto fisico existente. La transaccion se revirtio y backup/restore siguieron
verificados. La correccion no altero esa version: se publico el sucesor
inmutable `2.0.1`, que fue el aplicado a ambos schemas tenant-aware.

## Fuentes Y Reproduccion

- Definiciones fuente:
  [`pyrosa-democrm-global.v2607.json`](../../database/dictionaries/pyrosa-democrm-global.v2607.json),
  [`pyrosa-democrm-tenant.v2607.json`](../../database/dictionaries/pyrosa-democrm-tenant.v2607.json)
  y [`manifest.v2607.json`](../../database/dictionaries/manifest.v2607.json).
- Evidencia canonica y verificador reproducible en Platform:
  [rollout DemoCRM v2607](https://github.com/JuanDePena/pyrosa-platform/blob/main/docs/evidence/democrm-v2607-dictionary-rollout-2026-07-15.md).
- SHA-256 de la evidencia machine-readable de Platform:
  `sha256:49ef97873a1c1b2a6bcc6ef7dc073d949767d05006b1d1209cc68c2e775c813d`.

Este resultado autoriza a considerar cerrado el gate fisico de diccionarios.
No autoriza por si solo el despliegue del runtime CRM, la activacion OAuth ni
la carga de datos de VOIX.
