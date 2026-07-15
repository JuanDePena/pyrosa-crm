# Adopcion Pyrosa UI

Fecha: `2026-07-07`
Fecha de cierre: `2026-07-15`
Estado: `completado en piloto`
Plan transversal: [Adopcion Pyrosa UI](https://github.com/JuanDePena/pyrosa-docs/blob/main/plans/plan-pyrosa-ui-adoption.md)

`pyrosa-democrm` / `pyrosa-crm` consume `pyrosa-ui` con perfil
`business-ops` para el scaffold CRM demo.

Los contratos transversales viven en
[SharedShell](https://github.com/JuanDePena/pyrosa-docs/blob/main/design/shared-shell.md)
y
[navegacion y teclado SharedShell](https://github.com/JuanDePena/pyrosa-docs/blob/main/design/shared-shell-navigation-keyboard.md).
Este plan conserva la adopcion, prioridades y evidencia propias de CRM.

## Estado

- proveedor visual: `pyrosa-ui`
- tema objetivo: `pyrosa-base@1.0.0`
- perfil: `business-ops`
- autenticacion: delegada a `pyrosa-iam`
- estado actual: `pilot` sobre `BusinessOpsShellTemplate`

CRM debe consumir la capa visual compartida sin mover leads, cuentas,
contactos, oportunidades, pipeline ni actividades fuera del dominio CRM.

## Entregado

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

## Proximo Corte De Dominio

Este trabajo es un handoff al
[roadmap v2606](../plans/plan-roadmap-v2606.md); no es un pendiente de la
adopcion visual cerrada.

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

La corrida del `2026-07-15` aprobo `check:pyrosa-ui`, `typecheck`, pruebas
OAuth API, `build`, health y seis escenarios visuales desktop/estrechos. El
resumen durable queda en
[`shared-shell-visual-convergence-2026-07-15.md`](../evidence/shared-shell-visual-convergence-2026-07-15.md).

El estado no se promueve a `ready` mientras los paquetes compartidos sigan
declarados mediante `file:`. Esta restriccion de distribucion no deja tareas
visuales abiertas en DemoCRM.
