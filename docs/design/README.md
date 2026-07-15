# Diseno De Pyrosa DemoCRM

Este directorio concentra documentos de analisis, arquitectura y diseno de
`pyrosa-democrm`.

## Contenido Esperado

- `analysis-*.md`: evaluaciones, alternativas, hallazgos y comparativas antes
  de convertirlas en plan.
- `architecture-*.md`: contratos estructurales, fronteras, modelos y decisiones
  de arquitectura vigentes.
- `design-*.md`: diseno funcional, UX, flujos, componentes y experiencia de
  operacion.

## Documentos Reubicados

- [Inventario visual y de SharedShell](analysis-shared-shell-visual-inventory.md)
- [Diseño de convergencia visual SharedShell](design-shared-shell-visual-convergence.md)
- [Architecture overview](architecture/overview.md)
- [Pyrosa ecosystem map](ecosystem/pyrosa-app-map.md)
- [Architecture decision records](adr/)
- [Brand assets](brand-assets.md)

## Fronteras

- Los planes activos viven en `../plans/`.
- Los planes cerrados y evidencias historicas viven en `../plans-completed/`
  cuando exista ese indice en el repo.
- Los runbooks operativos viven en `../ops/`.
- No mover documentos existentes a esta carpeta sin registrar el cambio en el
  indice de docs y conservar enlaces estables.
