# Context Generation V1 En DemoCRM

Fecha: `2026-08-05`

Estado: `source preparado; flag apagado`

DemoCRM adopta la generation opaca que Directory añade de forma compatible a
su decision v2. El valor se guarda junto a contextVersion y las cinco
decisiones del contexto interactivo.

Con `PYROSA_CRM_TENANT_CONTEXT_GENERATION_V1_ENABLED=true`, cada request
funcional recompone IAM, Directory, Store, Platform y permiso CRM, compara la
generation actual antes de abrir repositorios CRM y falla con
`crm.tenant_context.stale` ante divergencia. Switch y renewal recargan el
estado despues de owner calls y aplican CAS sobre identidad, tenant,
contextVersion y generation previa.

La generation también acompaña el TenantWorkContext cuando existe, pero no
autoriza trabajo ni reemplaza la decision owner. El flag permanece apagado
hasta que Directory tenga diccionarios aplicados, grants y canary aceptados.
No se promovio runtime ni se modificaron datos CRM.
