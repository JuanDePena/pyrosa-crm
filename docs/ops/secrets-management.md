# Gestion de secretos

Este documento define el patron operativo de secretos para `pyrosa-democrm`.
CRM usa PostgreSQL propio y se apoya en `pyrosa-platform`, `pyrosa-iam` y
`pyrosa-accounts` sin copiar secretos de esas apps.

## Principio base

Los secretos de runtime se administran fuera de Git. Los secretos persistidos
por CRM, cuando existan, deben vivir cifrados en columnas inline de la tabla
funcional que los consume.

`config_json` queda reservado para configuracion no sensible. No debe contener
passwords, tokens, API keys, client secrets ni referencias runtime como
`passwordEnv`.

## Alcance

Aplica a secretos propios de CRM, por ejemplo:

- tokens de integraciones CRM por tenant;
- API keys de proveedores de ventas, marketing o soporte;
- credenciales que un administrador autorizado escriba desde la UI;
- secretos de webhooks o conectores externos.

Quedan excluidos de la persistencia en base de datos:

- `PYROSA_CRM_DB_PASSWORD`;
- `PYROSA_CRM_DB_DSN`;
- `PYROSA_CRM_IAM_CLIENT_SECRET`;
- archivos `.env`;
- bearer tokens backend-to-backend;
- certificados TLS y material privado del host.

Estos valores se gobiernan operacionalmente en el host, fuera de Git y fuera de
las respuestas API.

## Runtime actual

La instalacion `v2606` usa estos secretos bootstrap:

- password del rol PostgreSQL `app_pyrosa_democrm`;
- DSN PostgreSQL de CRM;
- client secret del cliente IAM `crm`.

El archivo versionado `runtime/env/app-pyrosa-democrm.env.example` conserva
solo placeholders. El archivo real instalado en el host debe mantenerse con
permisos restrictivos y no debe imprimirse en logs, pruebas ni documentacion.

## Modelo recomendado

Cuando CRM necesite guardar secretos persistidos, la tabla funcional debe
incluir metadatos de cifrado junto al ciphertext:

- `<campo>_key_id`;
- `<campo>_algorithm`;
- `<campo>_ciphertext_base64`;
- `<campo>_iv_base64`;
- `<campo>_auth_tag_base64`;
- `<campo>_aad`;
- `<campo>_updated_at`.

El cifrado recomendado usa `AES-256-GCM`.

Propiedades esperadas:

- IV aleatorio de 12 bytes por escritura;
- AAD deterministica por entidad, por ejemplo
  `pyrosa-crm:tenant:<tenant_id>:integration:<provider>:secret`;
- tag de autenticacion persistido junto al ciphertext;
- descifrado solo server-side y solo durante operaciones que realmente necesitan
  el secreto.

CRM nunca debe persistir plaintext ni derivados innecesarios del secreto.

## Contratos con apps de apoyo

`pyrosa-platform` mantiene el catalogo y contexto operativo del ecosistema.
`pyrosa-iam` administra autenticacion, sesiones compartidas y el cliente `crm`.
`pyrosa-accounts` mantiene organizaciones, cuentas y perfiles compartidos.

CRM debe guardar solo referencias funcionales a esos sistemas, por ejemplo:

- `platform_tenant_id`;
- `accounts_organization_id`;
- actor o sujeto emitido por IAM.

No debe guardar passwords, client secrets ni tokens privados pertenecientes a
Platform, IAM o Accounts.

## UI y API

Los secretos persistidos son write-only por defecto:

- crear o editar permite escribir o reemplazar un secreto;
- si el campo queda en blanco durante una edicion, se conserva el secreto
  existente;
- las respuestas API exponen solo estados como `secretConfigured` y
  `secretUpdatedAt`;
- la UI nunca muestra plaintext ni placeholders con valores reales.

## Auditoria

Las acciones administrativas se auditan sin plaintext:

- creacion o actualizacion de integracion;
- rotacion de credencial;
- activacion, desactivacion o prueba de conector;
- fallos de validacion externa.

El contexto puede incluir tenant, organizacion, proveedor, actor IAM y estado de
la operacion, pero no credenciales.

## Rotacion

Rotar un secreto funcional:

1. Abrir la integracion correspondiente desde UI administrativa.
2. Escribir el nuevo secreto.
3. Guardar.
4. Validar con dry-run o prueba controlada.
5. Confirmar que la auditoria registra la rotacion sin plaintext.

Rotar secretos bootstrap requiere una ventana operativa:

1. Crear el nuevo valor fuera de Git.
2. Actualizar el archivo real de entorno del host.
3. Reiniciar `app-pyrosa-democrm.service`.
4. Validar salud, migraciones pendientes y flujo IAM.

## Backup y restore

Un backup util debe incluir:

- base de datos CRM, incluyendo columnas cifradas inline;
- copia segura fuera de Git de los secretos bootstrap activos;
- identificador de version de llave si se implementa cifrado persistido.

Restaurar solo la DB sin las llaves o secretos operativos necesarios puede dejar
integraciones irrecuperables.

## Checklist operativo

- El archivo real de entorno no esta versionado y tiene permisos restrictivos.
- `runtime/env/app-pyrosa-democrm.env.example` contiene solo placeholders.
- Los secretos persistidos viven en columnas cifradas inline.
- `config_json` no contiene secretos ni referencias a secretos runtime.
- Los formularios de UI son write-only.
- Los endpoints nunca devuelven ciphertext ni plaintext.
- Logs, eventos y auditoria no contienen credenciales.
- Cualquier plaintext persistido queda documentado como excepcion de CRM.
