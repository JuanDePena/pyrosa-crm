# ADR 0006: Core Multiindustria Y Perfiles De Industria

Fecha: `2026-07-15`

Estado: `aceptado para planificacion v2607`

## Contexto

El scaffold v2606 definio modulos CRM generales, pero no un modelo real ni una
estrategia de adaptacion por industria. VOIX CALL CENTERS aporta el primer caso
operativo: seguimiento de pacientes, cobertura, elegibilidad, referidos,
autorizaciones, llamadas y coordinacion de citas.

Codificar este proceso como una variante unica impediria reutilizar el CRM y
mezclaria datos de servicio con oportunidades comerciales. Un modelo EAV libre
o DDL por cliente tambien debilitaria integridad, busqueda y gobierno.

## Decision

1. Pyrosa CRM mantiene un core multiindustria de cuentas, contactos, casos,
   actividades, citas, oportunidades y reportes.
2. Las adaptaciones se publican como perfiles versionados de industria con
   vocabulario, campos tipados, estados, transiciones, SLAs, vistas, metricas y
   capacidades.
3. La configuracion de tenant solo selecciona opciones permitidas por el perfil;
   no ejecuta DDL ni crea forks.
4. Los campos core permanecen explicitos. Las extensiones usan definiciones
   tipadas y valores validados contra version/hash del perfil; un campo que
   requiera indexacion o integridad fuerte se promueve mediante un nuevo
   diccionario gobernado.
5. `healthcare-call-center` es el primer perfil. Un caso sigue siendo
   operacional y no constituye expediente clinico.
6. Paciente, medico y clinica son roles/entidades CRM. No crean por si mismos
   identidades IAM, organizaciones Directory ni clientes Store.
7. Todo dato tenant-aware se provisiona mediante diccionario y Platform.

## Consecuencias

- VOIX se implementa sin condicionales por nombre de cliente.
- La misma aplicacion puede habilitar un perfil generico, comercial o de
  servicio con distintos catalogos.
- Los reportes declaran perfil y version para interpretar metricas.
- El cambio de perfil requiere preflight, compatibilidad, evidencia y rollback.
- Se agrega complejidad de gobierno de metadata, pero se evita EAV sin control y
  drift de schemas por tenant.
- Integraciones clinicas permanecen externas y explicitas.

## Alternativas Rechazadas

- fork VOIX separado;
- usar oportunidad como caso;
- una sola tabla generica de entidades/campos/valores;
- crear columnas o tablas directamente desde configuracion del tenant;
- convertir CRM en expediente clinico o sistema de agenda autoritativo sin
  contrato externo.

## Relacion Con ADRs Previos

Este ADR amplia para v2607 las fronteras de
[ADR 0005](0005-platform-service-boundaries.md). Las decisiones historicas de
runtime, PostgreSQL e IAM se mantienen; las relaciones con Directory, Store,
UI, NewSync y notificaciones quedan explicitadas en el
[diseno v2607](../design-democrm-v2607.md).
