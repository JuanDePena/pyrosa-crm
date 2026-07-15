# Ejemplos Y Fuentes Controladas

Este directorio no es un repositorio de datos de clientes. Los archivos con
personas, contactos, cobertura, citas, notas u otra informacion operacional
real permanecen fuera de Git y bajo custodia autorizada.

## Reglas

- Los `.xlsx` reales estan ignorados por defecto.
- Solo se puede versionar un workbook con sufijo `-synthetic.xlsx` despues de
  demostrar que fue generado desde cero y no contiene valores derivados que
  permitan reidentificacion.
- La documentacion conserva estructura, categorias y conteos agregados, nunca
  filas, nombres, fechas de nacimiento, identificadores, notas o capturas.
- Una fuente real para importacion requiere owner, proposito, acceso minimo,
  retencion, cifrado, checksum operativo y eliminacion segura.
- Abrir y guardar un original con una libreria que no preserve validaciones,
  formatos o caches puede corromperlo; el analisis ordinario debe ser read-only.

El analisis seguro del reporte inicial de VOIX se encuentra en
[Analisis del seguimiento de casos VOIX](../design/analysis-voix-case-follow-up-2026.md).
