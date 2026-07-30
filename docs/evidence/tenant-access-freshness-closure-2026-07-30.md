# Cierre Operativo De Acceso Tenant — 2026-07-30

Estado: `accepted-development`.

DemoCRM desplegó el artefacto limpio de `c3b0518` y mantuvo el contrato
transversal de catálogo lazy, decisión Directory v2 owner-local y composición
directa de IAM, Store y Platform. El servicio terminó activo, con health
correcto y `NRestarts=0`.

## Canary Y Rollback

El canario oficial ejecutó la ruta `A -> B -> A` sobre el mismo pool:

- los cuatro owners permitieron cada selección;
- el binding Platform permaneció listo;
- los sentinels de cada tenant fueron invisibles desde el otro;
- la transacción de prueba terminó en `ROLLBACK` y no dejó residuales.

El rollback operativo cambió temporalmente
`PYROSA_CRM_DIRECTORY_DECISION_MODE` de `v2` a `v1`, reinició el runtime y
repitió el mismo canario con resultado `accepted`. Inmediatamente después se
restauró `v2`, se reinició el servicio y el canario volvió a quedar
`accepted`. El adaptador v1 no concedió acceso fuera de la composición owner ni
se convirtió en fallback de datos locales.

## Límites

- Ambiente y cohorte: `development`, tenants internos ya autorizados.
- Cero DDL, provisioning, backfill o ampliación comercial.
- No se versionaron subjects, tenant keys, schemas, DSN, cookies ni secretos.
- El runtime productivo `pyrosa-crm`, preproducción y nuevas cohortes requieren
  autorización y release separados.
