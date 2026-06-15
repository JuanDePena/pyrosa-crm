# pyrosa-crm

<p align="left">
  <img src="https://democrm.pyrosa.com.do/public/assets/brand/crm-logo.png" alt="PYROSA CRM" width="96" />
</p>

`PYROSA CRM` es el producto CRM transaccional del ecosistema Pyrosa. Su linea
inicial es `v2606` y su proposito es concentrar procesos operativos de clientes
sin duplicar servicios de plataforma ya servidos por las demas aplicaciones de
Pyrosa.

Este repositorio es la fuente canonica del nuevo producto CRM. El desarrollo
activo se realiza desde la superficie demo y la promocion a produccion debe
salir solo desde tags aprobados.

## Fuente de verdad

La fuente canonica para producto, arquitectura, fronteras de plataforma,
ambientes, runtime y release flow esta distribuida en:

- indice de docs: `docs/README.md`
- vision de producto: `docs/product/vision-v2606.md`
- modulos iniciales: `docs/product/modules-v2606.md`
- mapa del ecosistema: `docs/ecosystem/pyrosa-app-map.md`
- arquitectura: `docs/architecture/overview.md`
- ambientes: `docs/ops/environments.md`
- runtime SimpleHostMan: `docs/ops/runtime-simplehostman.md`
- gestion de secretos: `docs/ops/secrets-management.md`
- flujo de releases: `docs/ops/release-flow.md`
- roadmap: `docs/roadmap/v2606.md`

## Branding

- nombre visible: `PYROSA CRM`
- dominio demo: `https://democrm.pyrosa.com.do`
- dominio canonico: `https://crm.pyrosa.com.do`
- logo estandar:
  - `ui/public/public/assets/brand/crm-logo.png`
- favicons y app icons:
  - `ui/public/public/assets/brand/crm-logo-*.png`
  - `ui/public/public/favicon.ico`
- contrato tecnico:
  - `docs/brand-assets.md`

## Superficie y ambientes

La raiz activa de desarrollo es:

```text
/srv/containers/apps/pyrosa-democrm/app
```

La raiz reservada para produccion es:

```text
/srv/containers/apps/pyrosa-crm/app
```

`pyrosa-democrm` sirve el entorno de desarrollo/demo en
`democrm.pyrosa.com.do`. `pyrosa-crm` queda reservado para el producto
canonico en `crm.pyrosa.com.do`, promovido desde cortes aprobados.

## Fronteras de plataforma

`pyrosa-crm` gobierna comportamiento transaccional CRM. No administra servicios
de plataforma:

- catalogo de apps, gobierno visual, contratos runtime y estado operativo:
  servidos por `pyrosa-platform`;
- autenticacion, MFA, sesiones globales y tickets `ui-auth`: servidos por
  `pyrosa-iam`;
- centro de cuenta, perfil de usuario, preferencias y autoservicio: servidos
  por `pyrosa-accounts`.

El runtime demo delega el login UI en `pyrosa-iam` mediante el cliente `crm`.
CRM conserva solo una cookie local firmada para la sesion delegada de IAM y expone
`/api/crm/session` para la shell de aplicacion.

## Estado actual

Incluye:

- scaffold inicial Node/TypeScript + React;
- shell privada con autenticacion delegada hacia `pyrosa-iam`;
- sesion local firmada de CRM;
- endpoint publico de health;
- base PostgreSQL demo y primera migracion SQL;
- assets de marca, favicons y web manifest;
- templates de Quadlet, env y Apache;
- documentacion inicial de producto, arquitectura, ambientes y releases.

## Sistema visual

`pyrosa-democrm` / `pyrosa-crm` es consumidor futuro de `pyrosa-ui` con perfil
`business-ops`. El siguiente corte es inventario visual de listas comerciales,
formularios, pipeline y estados antes de activar paquetes compartidos.

Siguientes cortes previstos:

- completar el dominio funcional inicial de CRM v2606;
- integrar contratos operativos con Platform, IAM y Accounts;
- definir el primer slice transaccional de cuentas/contactos/oportunidades;
- preparar el primer release promovible hacia `crm.pyrosa.com.do`.

## Estructura

```text
database/
  migrations/
docs/
runtime/
ui/
  scripts/
  server/
  src/
```

## Arranque local esperado

```bash
cd /srv/containers/apps/pyrosa-democrm/app/ui
npm install
npm run db:migrate
npm run build
npm run start
```

Las variables de entorno del contenedor y las credenciales de base de datos se
gestionan desde el runtime SimpleHostMan. Un arranque fuera del contenedor puede
requerir variables equivalentes al entorno demo.

## Documentacion relacionada

- indice de docs: `docs/README.md`
- vision de producto: `docs/product/vision-v2606.md`
- modulos iniciales: `docs/product/modules-v2606.md`
- mapa del ecosistema: `docs/ecosystem/pyrosa-app-map.md`
- arquitectura: `docs/architecture/overview.md`
- ambientes: `docs/ops/environments.md`
- runtime SimpleHostMan: `docs/ops/runtime-simplehostman.md`
- gestion de secretos: `docs/ops/secrets-management.md`
- release flow: `docs/ops/release-flow.md`
- roadmap: `docs/roadmap/v2606.md`
- contrato de marca: `docs/brand-assets.md`
- adopcion visual: `docs/pyrosa-ui-adoption.md`
- decisiones de arquitectura: `docs/adr/`
