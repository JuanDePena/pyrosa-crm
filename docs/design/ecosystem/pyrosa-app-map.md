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
  cuenta.

CRM conserva ownership de cuentas comerciales, contactos, oportunidades,
pipeline, actividades y autorizacion funcional. No persiste como autoridad los
datos que pertenecen a Platform, IAM o Accounts.

El acceso directo a tablas de otra app requiere una excepcion ADR documentada;
la integracion normal usa APIs, eventos, jobs o contratos publicados.
