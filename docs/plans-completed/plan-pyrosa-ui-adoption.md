# Adopcion Pyrosa UI

Fecha: `2026-07-07`
Fecha de cierre: `2026-07-15`
Estado: `snapshot historico completado; superado por DemoCRM v2607`
Plan transversal: [Adopcion Pyrosa UI](https://github.com/JuanDePena/pyrosa-docs/blob/main/plans/plan-pyrosa-ui-adoption.md)

`pyrosa-democrm` / `pyrosa-crm` consume `pyrosa-ui` con perfil
`business-ops` para el scaffold CRM demo.

Los contratos transversales viven en
[SharedShell](https://github.com/JuanDePena/pyrosa-docs/blob/main/design/shared-shell.md)
y
[navegacion y teclado SharedShell](https://github.com/JuanDePena/pyrosa-docs/blob/main/design/shared-shell-navigation-keyboard.md).
Este plan conserva la adopcion, prioridades y evidencia propias de CRM en el
snapshot inicial. El estado vigente está en el
[plan DemoCRM v2607](plan-democrm-v2607.md) y en su
[evidencia de convergencia](../evidence/shared-shell-visual-convergence-2026-07-15.md);
no se debe interpretar el inventario siguiente como el source actual.

## Estado

- proveedor visual: `pyrosa-ui`
- tema objetivo: `pyrosa-base@1.0.0`
- perfil: `business-ops`
- autenticacion: delegada a `pyrosa-iam`
- estado capturado por este snapshot: `pilot` sobre `BusinessOpsShellTemplate`
- estado sucesor: release candidate v2607 source-ready, con runtime sin promocionar

CRM debe consumir la capa visual compartida sin mover leads, cuentas,
contactos, oportunidades, pipeline ni actividades fuera del dominio CRM.

## Entregado En El Snapshot

- `@pyrosa/ui*` consumido como dependencias locales declaradas.
- Shell compartido mediante `BusinessOpsShellTemplate` y `WorkspaceLayout`,
  sin composicion local paralela de `AppShell`, `Sidebar` o `Topbar`.
- Registry unico de diez rutas con metadata completa y adaptador
  `SidebarItem[]`.
- Dashboard analitico sin tablas operativas.
- `UserDrawer` compartido con identidad delegada y fachadas de Accounts.
- Rutas hash para dashboard, cuentas, contactos, oportunidades, actividades,
  reportes, configuracion, plataforma, marca y runtime.
- Tablas compactas, filtros, tabs, detalle y acciones no mutantes sobre
  contratos API iniciales.
- Smoke visual repetible con `npm run qa:visual`.
- Guard durable `npm run check:pyrosa-ui` con contrato declarativo de adopcion.

## Inventario 2026-07-07

El inventario de corrida 3 queda documentado en
[`pyrosa-ui-visual-inventory-2026-07-07.md`](pyrosa-ui-visual-inventory-2026-07-07.md).

Resultado:

- primer target operativo: `cuentas` read-only con datos CRM reales;
- siguientes targets: `contactos` y `oportunidades`;
- no se habilitan mutaciones sin contrato, validacion y auditoria.

## Handoff Historico, Ya Superado

Este trabajo fue el handoff al
[plan DemoCRM v2607](plan-democrm-v2607.md). La lista conserva el alcance que
estaba pendiente al cerrar el snapshot; no describe pendientes actuales de la
adopcion visual.

1. Definir diccionarios y tablas CRM-owned para cuentas, contactos,
   oportunidades y actividades.
2. Sustituir filas contract-first por endpoints read-only reales.
3. Promover acciones `inspect`/`prepare` una por una, con validacion y
   auditoria.
4. Mantener autenticacion, MFA y claims en `pyrosa-iam`.

## Guardrails

- No implementar auth local nuevo.
- No copiar tokens como fuente primaria.
- No promover mutaciones CRM sin contrato, validacion y auditoria.

## Evidencia De Cierre

La corrida original del `2026-07-15` aprobo `check:pyrosa-ui`, `typecheck`,
pruebas OAuth API, `build`, health y seis escenarios visuales
desktop/estrechos. El cierre sucesor v2607 amplió el contrato a nueve rutas,
paquetes HTTP inmutables `0.2.1` y once escenarios visuales. El resumen durable
vigente queda en
[`shared-shell-visual-convergence-2026-07-15.md`](../evidence/shared-shell-visual-convergence-2026-07-15.md).

La restriccion histórica de dependencias `file:` fue superada por paquetes
HTTP inmutables `0.2.1` con provenance. Esto cierra el pendiente de distribución
del snapshot, pero no equivale a despliegue ni promocion del runtime DemoCRM.
