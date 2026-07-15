# Perfil VOIX Healthcare Call Center v2607

Fecha: `2026-07-15`

Estado: `diseno inicial; requiere validacion funcional con VOIX`

Perfil: `healthcare-call-center@1`

## Objetivo

Adaptar Pyrosa CRM a la operacion de VOIX CALL CENTERS sin crear un fork ni un
expediente clinico. El perfil organiza seguimiento de casos, cobertura,
elegibilidad, referidos/autorizaciones, actividades y coordinacion de citas.

La fuente inicial fue analizada de forma agregada en
[Analisis del seguimiento de casos](analysis-voix-case-follow-up-2026.md).

## Roles Del Dominio

| Concepto VOIX | Modelo CRM |
| --- | --- |
| clinica o practica | cuenta CRM `organization` |
| medico | contacto con rol `provider` y recurso de agenda opcional |
| paciente | contacto con rol `patient` y extension sensible |
| aseguradora/pagador | cuenta/catalogo externo segun contrato confirmado |
| agente | usuario IAM/Directory con rol funcional CRM |
| supervisor | usuario IAM/Directory con capacidades de cola y reportes |
| seguimiento | caso CRM |
| llamada o tarea | actividad CRM |
| procedimiento solicitado | service request e items normalizados |
| cita | appointment operacional con referencia externa opcional |

## Flujo Propuesto

1. Recepcion manual, por archivo o por integracion.
2. Deteccion de posible duplicado y seleccion/creacion de contacto.
3. Apertura de caso con tipo, canal, prioridad, cola, owner y SLA.
4. Asociacion de clinica, medico, cobertura y servicio solicitado.
5. Verificacion de elegibilidad con fuente, fecha, resultado y vigencia.
6. Determinacion y gestion de referido/autorizacion.
7. Actividades de llamada, seguimiento, escalamiento y documentacion.
8. Solicitud y coordinacion de cita o procedimiento.
9. Confirmacion del resultado operacional.
10. Resolucion, cierre o reapertura con motivo y auditoria.

## Estados Iniciales

Los estados definitivos requieren workshop con VOIX. Baseline propuesto:

### Caso

`new -> triaged -> in_progress -> waiting_external -> resolved -> closed`

Transiciones adicionales controladas: `cancelled`, `reopened` y estados de
bloqueo expresados mediante reason codes, no mediante nuevos estados libres.

### Elegibilidad

`not_checked`, `pending`, `eligible`, `ineligible`, `expired`, `unknown`.

### Referido/Autorizacion

`not_required`, `required`, `requested`, `received`, `rejected`, `expired`,
`cancelled`.

### Cita

`requested`, `scheduled`, `confirmed`, `rescheduled`, `cancelled`, `completed`,
`no_show`, `sync_failed`.

Cada cambio registra actor, timestamp, motivo, source y version. Las
transiciones no se infieren desde texto libre.

## Colas Y SLA

El perfil admite colas por tenant, equipo, clinica, servicio o prioridad. Una
politica SLA versionada define:

- tiempo a primera accion;
- proximo seguimiento requerido;
- tiempo maximo en espera externa;
- vencimiento de autorizacion o elegibilidad;
- escalamiento y horario laboral;
- pausa/reanudacion y reason codes.

Todos los timestamps se almacenan en UTC y se presentan en la zona horaria del
tenant. El dashboard declara la ventana y el calendario usados.

## Agenda

- Una cita puede involucrar paciente, medico, clinica y uno o varios servicios.
- La disponibilidad externa se consulta mediante provider engine cuando
  exista integracion.
- Un hold local no se presenta como cita confirmada.
- Reintentos usan idempotency key y no duplican citas.
- El sistema externo autoritativo se conserva como `external_system` y
  `external_ref` opacos.
- Los cambios externos entran como eventos normalizados y pasan por
  reconciliacion.

## Dashboard VOIX

### Status Strip

- tenant y equipo activos;
- freshness del resumen;
- casos vencidos;
- citas con excepcion;
- integraciones degradadas.

### Score Operacional

El score no es una suma arbitraria. Se versiona y combina dimensiones
declaradas, por ejemplo:

- cumplimiento de primera accion;
- seguimiento dentro de SLA;
- casos sin bloqueo vencido;
- citas sin excepcion;
- completitud minima de datos.

### Dominios

- casos y carga;
- elegibilidad/cobertura;
- referidos/autorizaciones;
- agenda y citas;
- actividad por equipo;
- riesgo y calidad.

## Privacidad Y Seguridad

- Minimizar fecha de nacimiento, identificadores de cobertura y notas.
- Separar extension sensible de la ficha generica del contacto.
- Enmascarar listados y exportaciones segun capability.
- Auditar lectura sensible, cambios, merge, exportacion y acceso a notas.
- No incluir datos sensibles en URL, logs, eventos generales, notificaciones o
  screenshots.
- Aplicar retencion, archivo y eliminacion definidos por el tenant y revisados
  antes del piloto.
- Restringir notas libres y ofrecer reason codes/campos estructurados.

## Reportes Iniciales

- backlog por estado, aging, prioridad, cola y agente;
- SLA de primera accion y seguimiento;
- elegibilidades y autorizaciones pendientes;
- citas por estado, clinica, medico y servicio;
- casos resueltos, cerrados, reabiertos y vencidos;
- productividad y carga, sin convertir volumen en unica medida de calidad;
- completitud, duplicados y excepciones de importacion.

## Gates De Validacion Con VOIX

- glosario e identificadores confirmados;
- estados/transiciones y condiciones de cierre firmados;
- matriz de campos requeridos y sensibles;
- roles/capabilities por agente y supervisor;
- SLA, horario, zona y escalamiento;
- sistema autoritativo para citas y cobertura;
- metricas y formulas aceptadas;
- muestra sintetica aprobada;
- importacion dry-run conciliada;
- politica de retencion, exportacion y soporte definida.
