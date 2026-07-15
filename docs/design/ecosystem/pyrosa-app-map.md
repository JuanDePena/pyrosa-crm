# Extension CRM Del Mapa De Aplicaciones Pyrosa

Fecha de actualizacion: `2026-07-13`
Estado: `vigente`

El catalogo de checkouts, repositorios, runtimes y ownership del ecosistema
vive en el
[mapa canonico de aplicaciones Pyrosa](https://github.com/JuanDePena/pyrosa-docs/blob/main/design/pyrosa-app-map.md).
Este documento conserva solo las relaciones y decisiones propias de CRM.

## Carriles CRM

| Carril | Estado local | Contrato |
| --- | --- | --- |
| `pyrosa-democrm` | sandbox activo | `democrm.pyrosa.com.do`, puerto `10166`, health `/__pyrosa_crm_health` |
| `pyrosa-crm` | producto futuro | mismo repositorio GitHub; sin runtime productivo dedicado verificado en este corte |

El sandbox no autoriza a inferir puerto, base, env o servicio del carril
productivo. La promocion requiere un release aprobado y validacion propia.

## Relaciones CRM

CRM consume servicios compartidos mediante contratos explicitos:

- `pyrosa-platform`: catalogo, gobierno de schemas, runtime y estado
  operacional;
- `pyrosa-iam`: autenticacion, MFA, sesiones, OAuth/OIDC y `ui-auth`;
- `pyrosa-accounts`: Account Center, perfil, preferencias y autoservicio de
  cuenta;
- `pyrosa-directory`: tenant, organizaciones, membresias, aplicaciones,
  asientos, conexiones y entrega de notificaciones;
- `pyrosa-store`: customer comercial, suscripcion, cantidad, vigencia y
  entitlement;
- `pyrosa-ui`: shell, templates, componentes, tokens y accesibilidad;
- `pyrosa-newsync` o el provider engine declarado: integraciones y
  sincronizacion externa.

CRM conserva ownership de cuentas CRM, contactos, casos, actividades, citas,
oportunidades, pipeline, reportes y autorizacion funcional. Una cuenta CRM no
es un perfil Accounts, una organizacion Directory ni un customer Store. CRM no
persiste como autoridad los datos que pertenecen a otra aplicacion.

CRM decide la necesidad funcional de una notificacion; Directory gobierna
template, canal, secreto, request y delivery. Directory gobierna la conexion
tenant-owned; el engine ejecuta el provider y Platform puede operar el worker.

El acceso directo a tablas de otra app requiere una excepcion ADR documentada;
la integracion normal usa APIs, eventos, jobs o contratos publicados.
