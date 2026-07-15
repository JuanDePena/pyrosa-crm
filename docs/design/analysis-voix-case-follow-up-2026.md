# Analisis Seguro Del Seguimiento De Casos VOIX 2026

Fecha del analisis: `2026-07-15`

Estado: `fuente local clasificada; no publicable`

## Proposito

Este documento registra estructura y requisitos inferidos del workbook local
`Listado-seguimiento-casos-VOIX-CALL-CENTERS-SRL-2026.xlsx`. No reproduce
personas, identificadores, fechas individuales, notas ni capturas.

El archivo parece contener informacion operacional real y sensible. Permanece
fuera de Git. No es fixture, contrato, fuente de verdad productiva ni artefacto
apto para adjuntar a issues, CI, screenshots o evidencia.

## Inventario Estructural

- 8 hojas: portada, catalogos, dos lotes operativos, consolidado por formulas,
  resumen, historico y base oculta;
- 100 posiciones en los dos lotes recientes, de las cuales 48 contienen el
  conjunto principal de identificacion y cobertura;
- 103 registros historicos distribuidos en cinco bloques;
- formulas de lookup, validaciones de lista, formato condicional, tabla
  dinamica, cache y hoja oculta;
- sin macros ni enlaces externos observados.

Las caches y hojas ocultas pueden conservar informacion aunque una celda visible
se borre. No se considera anonimizado un workbook por limpiar solamente las
hojas principales.

## Campos Observados

| Grupo | Campos estructurales observados |
| --- | --- |
| asignacion | fila/lote, agente responsable y fecha de trabajo |
| persona | apellidos/nombres y fecha de nacimiento |
| cobertura | identificador, aseguradora/pagador y nota de seguro |
| elegibilidad | indicador o estado de verificacion |
| referido/autorizacion | requerido, disponible, enviado o pendiente |
| servicio/cita | tipo de cita, procedimiento o combinacion de servicios |
| seguimiento | nota libre y estado operacional |

El campo rotulado `ID Seguro` parece actuar en los lotes recientes como clave
del catalogo de aseguradoras debido al lookup observado. En el historico,
`ID` puede tener otra semantica. No se debe mapear como poliza, miembro ni
pagador hasta que VOIX confirme definicion, unicidad y vigencia por hoja.

## Categorias Y Calidad

Catalogos configurados:

- pendiente referido/autorizacion;
- pendiente referido/procedimiento;
- caso en proceso;
- caso cerrado;
- elegibilidad si/no.

El historico contiene variantes adicionales para listo, pendiente, inactivo,
no requerido, disponible, requerido, enviado y requiere autorizacion. Los
tipos de cita mezclan seguimiento, paciente nuevo, estudios, procedimientos y
combinaciones en una sola celda.

Riesgos de calidad:

- estados y vocabulario no normalizados;
- una nota puede mezclar hecho, accion y resultado;
- fechas separadas y redundantes;
- posiciones vacias producen errores de lookup;
- identificadores con semantica ambigua;
- al menos dos grupos de duplicados exactos en el historico bajo una clave
  compuesta de analisis;
- ausencia de identificador estable demostrado para paciente, caso y cita.

## Workflow Inferido

```text
recepcion de lote o llamada
  -> asignacion a agente
  -> identificar persona y cobertura
  -> verificar elegibilidad
  -> revisar referido/autorizacion
  -> coordinar servicio, procedimiento o cita
  -> registrar llamadas, tareas y notas
  -> resolver y cerrar
```

Antes de automatizar, VOIX debe validar estados, transiciones, owners,
condiciones de cierre, SLA y significado de cada identificador.

## Mapeo Al Dominio CRM

| Fuente conceptual | Destino propuesto |
| --- | --- |
| agente | subject IAM con membresia/asiento Directory y asignacion CRM |
| paciente | contacto CRM con rol `patient` y extension sensible |
| clinica/practica | cuenta CRM de tipo organizacion |
| medico | contacto/recurso asociado a una o varias cuentas |
| aseguradora/pagador | cuenta o catalogo externo segun contrato confirmado |
| registro de seguimiento | caso CRM |
| llamada/seguimiento/nota | actividad CRM |
| elegibilidad | verificacion versionada relacionada al caso/cobertura |
| referido/autorizacion | entidad propia con lifecycle e historial |
| procedimiento | service request con items normalizados |
| cita | appointment con participantes, recurso, estado y referencia externa |

Una oportunidad CRM no sustituye el caso. Solo se usa para la relacion
comercial B2B de VOIX con clinicas, grupos o clientes potenciales.

## Reglas Para Un Fixture Seguro

El fixture futuro debe:

- generarse desde cero con identidades ficticias no derivadas;
- conservar solo estructura, categorias y distribuciones utiles;
- incluir deliberadamente vacios, duplicados y estados invalidos para QA;
- eliminar imagen, autor, propiedades, caches, pivots y hojas ocultas heredadas;
- pasar revision automatizada y humana de nombres, fechas, ids y notas;
- llevar sufijo `-synthetic.xlsx` y un manifiesto de generacion reproducible.

## Importacion Controlada

La fuente real solo puede entrar por un proceso autorizado:

1. custodia cifrada y acceso minimo;
2. copia de trabajo read-only con hash y batch id;
3. staging aislado por tenant;
4. normalizacion de estados, fechas y catalogos;
5. validacion del significado de identificadores;
6. deduplicacion automatica y cola de revision humana;
7. cuarentena de filas incompletas o ambiguas;
8. dry-run y conciliacion de totales por hoja/lote;
9. importacion idempotente con source row fingerprint;
10. evidencia agregada, rollback y eliminacion segura de temporales.

Las notas libres no se migran hasta clasificar contenido, permisos, retencion y
uso. Ningun dato fuente se registra en logs o errores tecnicos.

## Preguntas Abiertas Para VOIX

- Que representa cada identificador y puede cambiar con la cobertura?
- Como se identifica de forma estable a paciente, caso, clinica, medico y cita?
- Cuales son los estados oficiales y transiciones permitidas?
- Que condiciones cierran o reabren un caso?
- Que SLA aplica por tipo, pagador, clinica o prioridad?
- Que sistema confirma finalmente la cita?
- Que campos son obligatorios, opcionales, historicos o derivados?
- Que datos pueden mostrarse a agente, supervisor, reporte y exportacion?
- Cual es la retencion y el proceso autorizado de correccion/eliminacion?
