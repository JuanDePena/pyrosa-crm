# Adopcion Pyrosa UI

Fecha: `2026-07-07`

`pyrosa-democrm` / `pyrosa-crm` consume `pyrosa-ui` con perfil
`business-ops` para el scaffold CRM demo.

## Estado

- proveedor visual: `pyrosa-ui`
- tema objetivo: `pyrosa-base@1.0.0`
- perfil: `business-ops`
- autenticacion: delegada a `pyrosa-iam`
- estado actual: `scaffold-ready` sobre SharedShell

CRM debe consumir la capa visual compartida sin mover leads, cuentas,
contactos, oportunidades, pipeline ni actividades fuera del dominio CRM.

## Entregado

- `@pyrosa/ui*` consumido como dependencias locales declaradas.
- Shell compartido con `AppShell`, `Sidebar`, `Topbar` y `WorkspaceLayout`.
- Rutas hash para dashboard, cuentas, contactos, oportunidades, actividades,
  reportes, configuracion, plataforma, marca y runtime.
- Tablas compactas, filtros, tabs, detalle y acciones no mutantes sobre
  contratos API iniciales.
- Smoke visual repetible con `npm run qa:visual`.

## Inventario 2026-07-07

El inventario de corrida 3 queda documentado en
[`pyrosa-ui-visual-inventory-2026-07-07.md`](./pyrosa-ui-visual-inventory-2026-07-07.md).

Resultado:

- primer target operativo: `cuentas` read-only con datos CRM reales;
- siguientes targets: `contactos` y `oportunidades`;
- no se habilitan mutaciones sin contrato, validacion y auditoria.

## Proximo Corte De Dominio

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
