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

## Validacion minima

```bash
npm --prefix ui run build
systemctl daemon-reload
systemctl restart app-pyrosa-democrm.service
curl --fail http://127.0.0.1:10166/__pyrosa_crm_health
curl --head https://democrm.pyrosa.com.do/auth/login
curl --head https://democrm.pyrosa.com.do/public/assets/brand/crm-logo.png
```
