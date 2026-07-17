# Diccionarios CRM

Esta carpeta publica los contratos estructurales owner de la familia
`pyrosa-crm`. El repositorio es compartido por los carriles de aplicacion, pero
las identidades catalogales no son aliases:

- `pyrosa-democrm` conserva sus scopes `global-app` y `tenant-product`;
- `pyrosa-crm` publica por ahora solamente `tenant-product`;
- cada binding tiene `appSlug`, `owner`, slug, key, release y checksum propios.

## Base Genesis Tenant

[`crm-tenant-product.genesis-v2607.json`](crm-tenant-product.genesis-v2607.json)
es la fuente logica target-neutral de los `413` objetos tenant CRM. No contiene
app slug, base, schema fisico, tenant concreto, lineage legacy ni hashes de una
introspeccion fisica. Desde esa unica fuente se generan:

- [`pyrosa-democrm-tenant-product.owner-v2.json`](pyrosa-democrm-tenant-product.owner-v2.json);
- [`pyrosa-crm-tenant-product.owner-v2.json`](pyrosa-crm-tenant-product.owner-v2.json).

El
[`manifest.genesis-v2607.json`](manifest.genesis-v2607.json)
fija `epoch=1`, fuente, bindings y hashes de archivo. Solo cubre
`tenant-product`: el contrato `global-app` de DemoCRM permanece independiente y
no se infiere un scope global para `pyrosa-crm` mientras no exista ese diseño y
schema.

## Invariante `public`

Ningun objeto de aplicacion puede declararse en `public` ni usarlo como target
de respaldo. Los objetos viven en un schema tecnico/global de la aplicacion o
en el schema tenant resuelto por Platform. Los schemas
`pyrosa_governance` y `pyrosa_bootstrap_governance` pertenecen al carril de
gobierno Platform y no forman parte del desired state funcional CRM.

El preflight live del genesis debe comprobar cero objetos no-extension en
`public`; el bundle expresa ese requisito, pero no ejecuta DDL, DML, deploy ni
refresh.

## Reproduccion

```bash
cd /srv/containers/apps/pyrosa-democrm/app
node ui/scripts/generate-crm-genesis-owner-v2.mjs --check
npm --prefix ui run test:dictionary-owner-v2
```

La opcion `--bootstrap-source` existe solo para reconstruir mecanicamente la
primera fuente logica desde el candidato owner revisado. No forma parte del
flujo ordinario: los cambios posteriores se realizan sobre la fuente logica,
exigen una version calendario nueva y regeneran ambos bindings.
