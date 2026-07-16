# Runtime templates

Templates para instalar `pyrosa-democrm` como carril demo del nuevo
`PYROSA CRM`.

## Destinos

- `containers/app-pyrosa-democrm.container` ->
  `/etc/containers/systemd/app-pyrosa-democrm.container`
- `env/app-pyrosa-democrm.env.example` ->
  `/etc/containers/systemd/env/app-pyrosa-democrm.env`
- `httpd/pyrosa-democrm.conf` ->
  `/etc/httpd/conf.d/pyrosa-democrm.conf`

## Convenciones

- El proceso Node escucha dentro del contenedor en
  `PYROSA_CRM_UI_HOST=0.0.0.0` y `PYROSA_CRM_UI_PORT=10166`.
- Podman publica solo contra loopback del host:
  `127.0.0.1:10166:10166`.
- Apache es el unico punto publico para `democrm.pyrosa.com.do`.
- Las variables propias del CRM usan `PYROSA_CRM_*`.
- El logo de marca vive en
  `ui/public/public/assets/brand/crm-logo.png` y se sirve como
  `/public/assets/brand/crm-logo.png` despues del build.
- La autenticacion UI es delegada hacia `pyrosa-iam` usando el cliente
  `crm`, callback `/auth/callback` y cookie local `PYROSA_CRM_SESSION`.
- Mientras los servicios plataforma publiquen sus puertos solo en loopback del
  host, el demo consume sus endpoints internos por HTTPS publico controlado.
- Los servicios plataforma se consumen por contrato:
  - Platform: catalogo de apps, gobierno visual, runtime y estado operativo.
  - IAM: autenticacion, MFA, sesiones globales y tickets `ui-auth`.
  - Accounts: centro de cuenta, perfil de usuario y preferencias.

## Configuracion no secreta del canary v2607

El template demo fija `PYROSA_CRM_VERSION=v2607`,
`PYROSA_CRM_BRANCH=main` y el tenant transversal candidato `1`. Directory,
Store y Platform conservan URLs internas separadas y obtienen tokens en el
issuer IAM mediante estos contratos exactos:

| Owner | Client ID | Audience | Scope |
| --- | --- | --- | --- |
| Directory | `client-pyrosa-democrm` | `pyrosa-directory` | `directory:crm-access:decide` |
| Store | `client-pyrosa-democrm-store-entitlements` | `pyrosa-store` | `store.entitlement.decide` |
| Platform | `client-pyrosa-crm` | `pyrosa-platform` | `platform.provisioning.readiness.consume` |

Los tres client secrets permanecen vacios en el template y se inyectan solo
desde el env host-managed. El tenant `1` es candidato, no autorizacion: cada
solicitud sigue exigiendo las tres decisiones positivas. Antes de reutilizar el
template para una cohorte multitenant o para `pyrosa-crm`, se debe retirar
`PYROSA_CRM_DEFAULT_TENANT_ID` y habilitar el selector gobernado por Directory.

## Coherencia de release

El build genera `ui/build/release-manifest.json` con commit, version,
`releaseId` y hashes exactos del cliente, BFF y launcher. `server.mjs` verifica
el conjunto antes de importar el BFF y no abre el listener ante source sucio,
version/branch distinta, archivo faltante o hash divergente.

Mientras el proceso esta activo, el BFF vuelve a comprobar el manifiesto en
cada solicitud y valida el hash del archivo estatico antes de servirlo. Esto
impide que un `npm run build` sobre el bind mount entregue un cliente nuevo con
un BFF anterior en memoria. Consultar el
[runbook de coherencia](../docs/ops/release-artifact-coherence.md).

No construir dentro del checkout servido durante una ventana abierta. Cliente,
BFF y manifiesto se promueven como una sola unidad y el servicio se reinicia
para cargarla.

## Validacion minima

```bash
npm --prefix ui run test:release-manifest
npm --prefix ui run build
systemctl daemon-reload
systemctl restart app-pyrosa-democrm.service
curl --fail http://127.0.0.1:10166/__pyrosa_crm_health
curl --head https://democrm.pyrosa.com.do/auth/login
curl --head https://democrm.pyrosa.com.do/public/assets/brand/crm-logo.png
```

El health aceptado debe reportar `artifact.ok=true`, el `releaseId` esperado y
el mismo commit/version del artefacto promovido.
