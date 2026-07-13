# Anexo Local De Secretos De Pyrosa CRM

Fecha de consolidacion: `2026-07-13`
Estado: `vigente`

Este anexo aplica la
[politica transversal de secretos Pyrosa](https://github.com/JuanDePena/pyrosa-docs/blob/main/ops/secrets-management.md)
a `pyrosa-democrm`. Solo conserva decisiones, variables y operaciones propias
de CRM; la criptografia, el modelo inline y las prohibiciones globales no se
duplican aqui.

## Estado Y Alcance Local

CRM todavia no persiste secretos funcionales administrados desde su UI. Cuando
incorpore tokens de integraciones, API keys, secretos de webhooks o credenciales
de conectores por tenant, debe usar el modelo inline gobernado por la politica
transversal y registrar antes la llave, `key_id`, custodia y recuperacion.

`config_json` permanece reservado para configuracion no sensible. CRM no guarda
passwords, client secrets ni tokens privados pertenecientes a Platform, IAM o
Accounts.

## Secretos Bootstrap

El runtime actual consume estas variables sensibles, documentadas solo por
nombre:

- `PYROSA_CRM_DB_PASSWORD`;
- `PYROSA_CRM_DB_DSN`;
- `PYROSA_CRM_IAM_CLIENT_SECRET`.

La plantilla versionada
`runtime/env/app-pyrosa-democrm.env.example` conserva placeholders. El archivo
real se administra fuera de Git con permisos restrictivos; su contenido no se
imprime en logs, pruebas, evidencia ni documentacion.

Tambien permanecen fuera de la persistencia funcional los bearer tokens
backend-to-backend, certificados TLS y material privado del host.

## AAD De CRM

Cuando exista un secreto funcional, la AAD deterministica local usa el formato:

```text
pyrosa-crm:tenant:<tenant_id>:integration:<provider>:secret
```

Los nombres de columnas, algoritmo, IV, tag, ciphertext, `key_id` y timestamps
siguen el modelo inline del documento transversal. El descifrado ocurre solo
server-side durante la operacion que consume la credencial.

## Limites Entre Apps

- `pyrosa-platform` mantiene catalogo y contexto operativo;
- `pyrosa-iam` administra autenticacion, sesiones compartidas y el cliente
  `crm`;
- `pyrosa-accounts` mantiene cuentas y perfiles compartidos.

CRM conserva solo referencias funcionales, como `platform_tenant_id`,
`accounts_organization_id` y el actor o sujeto emitido por IAM. No copia
credenciales privadas de esas apps.

## UI, API Y Auditoria

Los futuros campos de secretos CRM son write-only: un valor vacio durante una
edicion conserva el existente y las respuestas exponen estado y fecha de
actualizacion, nunca plaintext ni ciphertext.

La auditoria local registra sin credenciales:

- creacion o actualizacion de integracion;
- rotacion de credencial;
- activacion, desactivacion o prueba de conector;
- fallos de validacion externa.

El contexto puede incluir tenant, organizacion, proveedor, actor IAM y estado
de la operacion. Logs, eventos, traces y errores siguen la misma prohibicion de
valores sensibles.

## Rotacion

Para un secreto funcional:

1. abrir la integracion desde la UI administrativa;
2. escribir el nuevo secreto y guardar;
3. validar con dry-run o prueba controlada;
4. confirmar auditoria sin plaintext.

Para un secreto bootstrap:

1. crear el nuevo valor fuera de Git;
2. actualizar el archivo real de entorno del host;
3. reiniciar `app-pyrosa-democrm.service`;
4. validar health, migraciones pendientes y flujo IAM.

## Backup Y Restore

La recuperacion coordina la base CRM, incluidas futuras columnas cifradas, con
la custodia fuera de Git de secretos bootstrap y llaves/versiones requeridas.
Restaurar solo la DB puede dejar integraciones irrecuperables.

## Checklist Operativo

- El archivo real de entorno no esta versionado y tiene permisos restrictivos.
- `runtime/env/app-pyrosa-democrm.env.example` contiene solo placeholders.
- Los secretos persistidos, cuando existan, usan columnas cifradas inline.
- `config_json` no contiene secretos ni referencias runtime.
- UI y API no devuelven plaintext, ciphertext, IV ni tags.
- Logs, eventos y auditoria no contienen credenciales.
- La rotacion bootstrap valida `app-pyrosa-democrm.service`, health, migraciones
  y autenticacion IAM.
- Cualquier plaintext persistido requiere excepcion CRM documentada y aprobada.
