# Inventario Visual Pyrosa UI

Fecha: `2026-07-07`
Estado: `completado`
Plan transversal: `pyrosa-platform/docs/plans/plan-platform-visual-adoption.md` corrida 3
Branch: `main`

## Snapshot

`pyrosa-democrm` ya esta en estado `scaffold-ready` y consume `@pyrosa/ui*`
por dependencias locales. La superficie actual esta concentrada en
`ui/src/main.tsx` y `ui/src/styles.css`.

## Superficie Inventariada

| Bloque | Estado | Observacion |
| --- | --- | --- |
| Shell | compartido | `AppShell`, `Sidebar`, `Topbar`, `WorkspaceLayout` y estilos de `@pyrosa/ui`. |
| Rutas | compartidas + dominio | Hash routes para `dashboard`, `cuentas`, `contactos`, `oportunidades`, `actividades`, `reportes`, `configuracion`, `plataforma`, `marca` y `runtime`. |
| Tablas/filtros | compartido | `DataTable`, `DataTableInline`, `FilterPanel`, acciones no mutantes y detalle de registros. |
| Datos | contract-first | Filas fallback y `/api/crm/contracts` hasta conectar diccionarios/tablas CRM-owned. |
| QA | disponible | `npm run qa:visual`, `typecheck` y `build`. |

## Primer Target Recomendado

La primera vista operativa debe ser `cuentas` con datos read-only reales:

- permite validar account/contact/opportunity ownership sin mutaciones;
- ya usa tabla compacta, filtro y `RecordDetail`;
- conserva acciones como `inspect`/`prepare` hasta tener auditoria;
- mantiene IAM, Accounts y Platform como owners externos.

`contactos` y `oportunidades` quedan como segundo bloque, despues de fijar el
diccionario CRM y relaciones entre cuenta, contacto y pipeline.

## Guardrails

- No implementar auth local.
- No persistir autoridad IAM, MFA ni cuenta de usuario en CRM.
- No promover acciones mutantes sin contrato, validacion y auditoria.
- Mantener el sandbox `pyrosa-democrm` separado de la identidad productiva
  `pyrosa-crm`.

## Siguiente Corte

1. Definir diccionario/contratos CRM-owned para cuentas.
2. Sustituir filas contract-first por endpoint read-only.
3. Ejecutar `npm run typecheck`, `npm run build` y `npm run qa:visual`.
4. Registrar screenshots y rollback antes de cualquier accion mutable.
