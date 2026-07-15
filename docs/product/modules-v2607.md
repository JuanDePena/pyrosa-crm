# Modulos De Pyrosa CRM v2607

Fecha: `2026-07-15`

Estado: `definido`

## Nucleo Funcional

### Cuentas

- organizaciones, clientes, prospectos, partners y hogares cuando el perfil lo
  permita;
- nombre, tipo, estado, owner, segmento, territorio y etiquetas;
- relaciones jerarquicas y referencias externas;
- contactos, casos, oportunidades, actividades y citas relacionados;
- merge asistido, archivo y auditoria.

Una cuenta CRM representa una relacion de negocio dentro del tenant. No es una
cuenta de login, un cliente de facturacion Store ni una organizacion Directory,
aunque pueda guardar referencias opacas a esas entidades.

### Contactos

- personas y roles respecto de una o varias cuentas;
- canales, preferencias, consentimiento y restricciones de contacto;
- identificadores externos controlados;
- timeline de relacion;
- extensiones sensibles habilitadas por perfil y permiso.

Un contacto puede ser paciente, medico, empleado de clinica, comprador o
referidor. Solo se vincula a un subject IAM mediante una asociacion explicita;
no se crea identidad por registrar un contacto.

### Casos

- tipo, canal, prioridad, estado, cola, owner y SLA;
- participantes y entidades relacionadas;
- hitos, bloqueos, resolucion, reapertura y cierre;
- asignacion manual o por reglas versionadas;
- historial inmutable de cambios;
- relacion con actividades, citas y servicios solicitados.

Caso es una capacidad de servicio multiindustria. No comparte lifecycle con la
oportunidad comercial.

### Actividades

- llamadas entrantes y salientes;
- tareas, seguimientos, correos, reuniones y notas;
- actor, owner, participantes, resultado, vencimiento y completado;
- enlaces tipados hacia cuenta, contacto, caso, cita u oportunidad;
- recordatorios mediante el servicio compartido de notificaciones.

### Agenda Y Citas

- zona horaria, inicio, fin, estado y origen;
- participantes, clinica, medico, recurso y servicio solicitado;
- solicitud, confirmacion, reprogramacion, cancelacion, no-show y completado;
- conflicto, disponibilidad externa y referencias de sincronizacion;
- historial y actividades de coordinacion.

La agenda CRM conserva el proceso operacional. Cuando exista un sistema
externo autoritativo, la cita mantiene estado de sincronizacion y referencia,
sin asumir ownership clinico.

### Oportunidades

- pipeline, etapa, probabilidad, moneda, monto y fecha esperada;
- cuenta, contactos, owner, productos y competidores;
- stage history, next action, forecast y cierre ganado/perdido;
- pipelines configurables por perfil y tenant.

Para VOIX, oportunidades cubre la venta B2B de servicios a clinicas o grupos;
no representa pacientes ni casos de atencion.

### Reportes Y Dashboard

- resumen ejecutivo tenant-aware;
- metricas de relacion, pipeline, casos, actividades, agenda y riesgo;
- aging, SLA, productividad, calidad y completitud;
- saved filters y vistas autorizadas;
- exportaciones asincronas, auditadas y con minimizacion de datos;
- definiciones versionadas de numerador, denominador, zona horaria y ventana.

## Perfil `healthcare-call-center`

El perfil inicial agrega semantica, no un fork:

- clinicas/practicas como cuentas;
- pacientes, medicos y personal como contactos con roles distintos;
- coberturas y pagadores;
- verificacion de elegibilidad;
- referido y autorizacion;
- solicitudes de servicios/procedimientos;
- coordinacion de citas y agendas;
- colas, SLA y disposiciones de llamada;
- dashboards VOIX.

Extensiones sensibles propuestas:

| Extension | Proposito |
| --- | --- |
| patient profile | atributos minimos que no pertenecen al contacto generico |
| coverage | pagador, identificador protegido, vigencia y estado |
| eligibility verification | resultado, fuente, fecha y ventana de validez |
| referral/authorization | requerido, estado, envio, recepcion y expiracion |
| service request | uno o varios servicios/procedimientos normalizados |
| appointment resource | medico, clinica, agenda o referencia externa |

Estas extensiones se habilitan por perfil, tenant y permiso. No viajan en logs,
URLs, eventos generales ni notificaciones sin una variable autorizada.

## Dashboard v2607

La composicion sigue la gramatica ejecutiva compartida de Platform/Directory,
implementada mediante `pyrosa-ui`, con contenido CRM:

1. status strip de tenant, freshness, SLA y riesgo;
2. hero con score operacional y periodo;
3. indicadores de progreso/readiness;
4. dominios CRM y carga por area;
5. riesgos e insights accionables;
6. accesos a inventarios, nunca tablas completas dentro del overview.

Metricas core:

- cuentas y contactos activos;
- oportunidades abiertas y pipeline ponderado;
- casos abiertos, nuevos, resueltos y vencidos;
- actividades pendientes y atrasadas;
- citas proximas y excepciones;
- calidad/completitud y freshness del read model.

Metricas VOIX iniciales:

- casos recibidos, en proceso, bloqueados y cerrados;
- aging y vencimiento por SLA;
- elegibilidades pendientes y verificadas;
- referidos/autorizaciones requeridos, enviados y pendientes;
- citas solicitadas, programadas, confirmadas, reprogramadas y canceladas;
- seguimientos vencidos por agente, equipo, clinica o medico;
- resolucion en primer contacto cuando la evidencia disponible permita una
  definicion reproducible.

No se mostrara duracion promedio de llamada hasta disponer de un contrato de
telefonia que entregue inicio/fin confiables.

## Capacidades Transversales

- contexto tenant validado;
- autorizacion por capability y recurso;
- auditoria funcional y outbox;
- idempotencia y concurrencia optimista;
- busqueda, filtros, paginacion y orden allowlisted;
- importaciones por lotes y cuarentena;
- configuracion de perfiles, catalogos y reglas;
- notificaciones e integraciones mediante contratos compartidos;
- backups, drift, observabilidad y recovery.

## Prioridad De Entrega

1. contexto tenant, permisos, diccionario y auditoria;
2. cuentas y contactos;
3. casos y actividades;
4. agenda y citas;
5. dashboard/reportes operativos VOIX;
6. oportunidades y pipeline;
7. configuracion multiindustria, integraciones y promocion.
