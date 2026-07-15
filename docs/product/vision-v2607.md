# Vision De Producto Pyrosa CRM v2607

Fecha: `2026-07-15`

Estado: `definido`

## Proposito

Pyrosa CRM v2607 es una aplicacion CRM multiindustria, tenant-aware y
configurable para relaciones comerciales y operaciones de servicio. Mantiene
un nucleo estable de cuentas, contactos, oportunidades, casos, actividades,
agenda y reportes; cada industria activa vocabulario, campos, estados, SLAs,
vistas y metricas mediante perfiles versionados, sin forks por cliente.

El primer perfil es `healthcare-call-center`, validado inicialmente con VOIX
CALL CENTERS. Este perfil coordina llamadas, elegibilidad, referidos,
autorizaciones, seguimiento de casos y agenda para pacientes, medicos y
clinicas. No convierte el CRM en expediente clinico ni en sistema de decisiones
medicas.

## Decisiones De Producto

1. El core es multiindustria; VOIX es el primer perfil, no una variante de
   codigo separada.
2. Caso y oportunidad son entidades distintas:
   - una oportunidad representa una relacion comercial o venta;
   - un caso representa una solicitud o seguimiento de servicio.
3. Cuenta CRM, contacto CRM, identidad IAM, perfil Accounts, organizacion
   Directory y cliente comercial Store conservan ciclos e identificadores
   distintos.
4. La agenda CRM coordina citas, participantes, recursos y estados. Un sistema
   clinico externo puede continuar como autoridad de la cita definitiva.
5. Los datos operativos viven en schemas tenant-aware gobernados por
   diccionario; el runtime CRM no ejecuta DDL.
6. El producto usa `pyrosa-ui` como proveedor visual y conserva el perfil
   `business-ops`.
7. Los fixtures nunca sustituyen datos fallidos en runtime productivo.

## Usuarios Objetivo

| Perfil funcional | Necesidad principal |
| --- | --- |
| agente | recibir, documentar y resolver casos y actividades asignadas |
| supervisor | administrar colas, asignaciones, SLA, calidad y escalamiento |
| coordinador de agenda | programar, confirmar, reprogramar y cancelar citas |
| ejecutivo comercial | gestionar cuentas, contactos, oportunidades y pipeline |
| analista | consultar metricas, aging, calidad, productividad y exportaciones autorizadas |
| administrador CRM del tenant | configurar catalogos, perfiles, equipos, formularios y reglas CRM |

Los usuarios son identidades IAM con membresia y asiento Directory. Pacientes,
medicos y otros contactos CRM no se convierten automaticamente en usuarios de
la plataforma.

## Capas De Adaptacion

### Core CRM

Modelo y comportamientos comunes:

- cuentas y relaciones;
- contactos, roles y preferencias de comunicacion;
- casos, colas, asignaciones, SLA y resolucion;
- actividades, tareas, llamadas, notas y timeline;
- agenda y citas operacionales;
- oportunidades, pipelines y etapas;
- reportes, saved views, auditoria y exportaciones controladas.

### Perfil De Industria

Un perfil versionado declara:

- modulos y capacidades habilitadas;
- vocabulario y etiquetas;
- tipos, estados y transiciones;
- campos requeridos y validaciones;
- SLA, prioridades, colas y reglas de asignacion;
- formularios y secciones visibles;
- set de metricas, reportes y dashboards;
- templates de notificacion e integraciones admitidas.

### Configuracion Del Tenant

Cada tenant selecciona valores permitidos por el perfil: equipos, horarios,
clinicas, medicos, recursos, pipelines, owners, catalogos y reglas. La
configuracion no puede cambiar ownership, permisos, DDL ni transiciones fuera
del contrato publicado.

### Preferencias Personales

Filtros, columnas, densidad, tema y vistas guardadas pueden personalizar la
experiencia sin alterar el modelo del tenant ni conceder permisos. Accounts
conserva el autoservicio del perfil autenticado.

## Perfil Inicial VOIX

El flujo inicial es:

```text
ingreso o llamada
  -> identificar paciente, clinica, medico y cobertura aplicable
  -> crear o vincular caso
  -> verificar elegibilidad
  -> gestionar referido o autorizacion
  -> coordinar procedimiento y cita
  -> registrar llamadas, tareas, notas y resultados
  -> resolver y cerrar con evidencia operacional
```

El perfil debe permitir varios procedimientos, estados normalizados y una
historia auditable. No debe conservar en una sola nota libre la elegibilidad,
el referido, la autorizacion, la cita y el resultado.

## Objetivos v2607

- promover la adopcion visual de `pilot` a `ready` con paquetes inmutables;
- entregar Dashboard con metricas reales y patrones consistentes con Platform
  y Directory;
- habilitar CRUD tenant-aware para cuentas, contactos, casos, actividades,
  citas y oportunidades;
- ofrecer reportes operativos y comerciales con definiciones reproducibles;
- demostrar que el core generico y el perfil VOIX conviven sin fork;
- migrar el seguimiento manual mediante un piloto controlado y reversible;
- cerrar seguridad, privacidad, auditoria, observabilidad y release readiness.

## No Objetivos

- almacenar passwords, MFA, sesiones raiz o perfiles de acceso;
- administrar tenants, asientos, suscripciones o DDL;
- convertirse en expediente clinico, prescribir, diagnosticar o decidir
  tratamiento;
- sustituir por defecto la agenda o expediente de una clinica;
- implementar facturacion, claims de seguro o contabilidad clinica;
- hardcodear procesos VOIX en el core o crear un schema distinto por cliente;
- importar notas y datos sensibles sin clasificacion y controles previos.

## Indicadores De Exito

- agentes completan el flujo VOIX sin hojas manuales paralelas;
- todos los registros tienen tenant, owner, historia y fuente trazables;
- backlog, SLA y citas se calculan desde datos reales y definiciones
  versionadas;
- el perfil generico funciona sin campos VOIX obligatorios;
- no hay datos fallback con apariencia productiva;
- acceso, exportacion y lectura sensible quedan autorizados y auditados;
- el runtime usa diccionario activo, drift alineado y release reproducible.

## Documentos Relacionados

- [Mapa de modulos v2607](modules-v2607.md)
- [Diseno tecnico y funcional](../design/design-democrm-v2607.md)
- [Perfil VOIX](../design/design-voix-call-center-profile-v2607.md)
- [Plan de implementacion cerrado](../plans-completed/plan-democrm-v2607.md)
- [Runbook de promocion](../ops/democrm-v2607-promotion.md)
