# Adopcion Pyrosa UI

Fecha: `2026-06-15`

`pyrosa-democrm` / `pyrosa-crm` es consumidor futuro de `pyrosa-ui` con perfil
`business-ops`.

## Estado

- proveedor visual: `pyrosa-ui`
- tema objetivo: `pyrosa-base@1.0.0`
- perfil: `business-ops`
- autenticacion: delegada a `pyrosa-iam`
- estado actual: scaffold CRM v2606 en sandbox

CRM debe consumir la capa visual compartida sin mover leads, cuentas,
contactos, oportunidades, pipeline ni actividades fuera del dominio CRM.

## Proximo Corte

1. Inventariar shell, listas comerciales, formularios y estados de pipeline.
2. Agregar dependencias `@pyrosa/*` cuando el contrato de formularios cierre en
   Accounts/IAM.
3. Migrar primitives y tablas compactas.
4. Validar que el perfil `business-ops` sea suficiente para vistas comerciales.
5. Mantener autenticacion, MFA y claims en `pyrosa-iam`.

## Guardrails

- No implementar auth local nuevo.
- No copiar tokens como fuente primaria.
- No adoptar templates compartidos hasta que existan vistas CRM reales para
  validar densidad y ergonomia.
