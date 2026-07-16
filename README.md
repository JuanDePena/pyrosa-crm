# pyrosa-crm

<p align="left">
  <img src="https://democrm.pyrosa.com.do/public/assets/brand/crm-logo.png" alt="PYROSA CRM" width="96" />
</p>

`PYROSA CRM` es el producto CRM transaccional del ecosistema Pyrosa. La linea de
diseno activa es `v2607`: un core multiindustria configurable para cuentas,
contactos, casos, actividades, agenda, oportunidades y reportes. El runtime
demo ya ejecuta el canario owner de `v2607` para el tenant interno `1`; la
promocion de una cohorte general y la operacion VOIX permanecen separadas y
bloqueadas por sus gates.

Este repositorio es la fuente canonica del nuevo producto CRM. El desarrollo
activo se realiza desde la superficie demo y la promocion a produccion debe
salir solo desde tags aprobados.

## Fuente de verdad

Las fuentes para producto, arquitectura, fronteras de plataforma y operacion
estan distribuidas en:

- indice de docs: `docs/README.md`
- vision de producto: `docs/product/vision-v2607.md`
- modulos: `docs/product/modules-v2607.md`
- diseno funcional y tecnico: `docs/design/design-democrm-v2607.md`
- perfil inicial VOIX: `docs/design/design-voix-call-center-profile-v2607.md`
- contrato API: `docs/api/crm-v1.md`
- mapa del ecosistema: `docs/design/ecosystem/pyrosa-app-map.md`
- arquitectura: `docs/design/architecture/overview.md`
- ambientes: `docs/ops/environments.md`
- runtime SimpleHostMan: `docs/ops/runtime-simplehostman.md`
- gestion de secretos:
  [politica transversal](https://github.com/JuanDePena/pyrosa-docs/blob/main/ops/secrets-management.md)
  y [anexo CRM](docs/ops/secrets-management-local.md)
- flujo de releases:
  [politica transversal](https://github.com/JuanDePena/pyrosa-docs/blob/main/ops/release-flow.md)
- plan v2607 cerrado: `docs/plans-completed/plan-democrm-v2607.md`
- promocion operativa pendiente: `docs/ops/democrm-v2607-promotion.md`
- evidencia saneada del canario owner:
  `docs/evidence/democrm-v2607-owner-canary-2026-07-16.md`

## Gobierno De Releases

El flujo comun para commit, push y releases remotos se mantiene en la
[politica transversal de releases Pyrosa](https://github.com/JuanDePena/pyrosa-docs/blob/main/ops/release-flow.md).
CRM conserva localmente sus validaciones de build/test, el runtime demo, la
promocion hacia el checkout estable desde un tag publicado y aprobado, y
cualquier excepcion propia. El despliegue sigue siendo una operacion separada.

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
  - `docs/design/brand-assets.md`

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
  por `pyrosa-accounts`;
- organizaciones, membresias, aplicaciones, asientos, conexiones y contexto
  tenant: servidos por `pyrosa-directory`;
- cliente comercial, suscripcion, cantidad, vigencia y entitlement: servidos
  por `pyrosa-store`;
- schemas, diccionarios, DDL gobernado y readiness: servidos por
  `pyrosa-platform`;
- componentes, layouts, templates, tema y accesibilidad: servidos por
  `pyrosa-ui`;
- provider engines y sincronizacion externa: servidos por `pyrosa-newsync` o
  el runtime owner declarado.

CRM decide sus workflows y conserva cuentas CRM, contactos, casos,
actividades, citas, oportunidades, reportes y permisos funcionales. Directory
entrega notificaciones mediante el contrato compartido; CRM decide cuando una
notificacion corresponde.

El runtime demo delega el login UI en `pyrosa-iam` mediante el cliente `crm`.
CRM conserva solo una cookie local firmada para la sesion delegada de IAM y
expone `/api/crm/session` para la shell de aplicacion. La sesion privada guarda
el issuer y subject canonicos recibidos desde IAM; no fabrica un subject desde
el id numerico del usuario y no publica esa identidad en session/bootstrap.

## Estado actual

El runtime demo ejecuta `v2607` con un artefacto frontend/BFF coherente. Para el
tenant canary `1`, Platform reporta ready los diccionarios global `2.0.0` y
tenant `2.0.1`; Store termino la saga y proyecta entitlement efectivo;
Directory conserva un asiento activo de capacidad `1/1`; IAM mantiene frescos
los bindings `tenant_admin` y `billing_admin`; y estan habilitadas las tres
decisiones owner OAuth de Directory, Store y Platform.

La correccion posterior al fatal `crm.bootstrap.csrf_missing` conserva en la
sesion browser la identidad IAM canonica privada, acepta subjects opacos de
`1..200` caracteres, rechaza cookies anteriores sin esa identidad y redacta el
issuer/subject del payload publico. El smoke owner E2E con la identidad de la
asignacion activa obtuvo Directory + Store + Platform `3/3 allow`, resolvio el
schema tenant `pyrosa_democrm_8ef427da9f0e`, el diccionario `2.0.1`, el perfil
`core` y la capability `crm.cases.read`, sin exponer el subject.

Este canario no equivale a promocion general. El SLO historico de Store en su
ventana de 24 horas permanece `critical` y `/canaryz` responde `503`; por ello
no se abre una cohorte general ni VOIX. El piloto funcional anterior fue solo
sintetico y no uso el XLSX ni PII de VOIX.

## Sistema visual

`pyrosa-democrm` / `pyrosa-crm` consume `pyrosa-ui` con perfil `business-ops` y
el contrato coordinado `0.2.3`. Esta release extrae la landing fatal hacia
`InternalErrorLanding` de `@pyrosa/ui-templates`; DemoCRM conserva solamente
logo, copy, clasificacion y recuperacion. El contrato source esta `ready`, sin
fallback productivo silencioso, y Dashboard/workareas consumen la API CRM v1.
El runtime demo ya sirve el canario v2607; la promocion hacia
`crm.pyrosa.com.do` permanece separada.

Siguientes gates operativos:

- esperar que el SLO movil de Store salga de `critical` y que `/canaryz`
  recupere readiness antes de ampliar la cohorte;
- completar workshop, autorizacion de PII, dry-run e import VOIX;
- pilotar una cohorte aprobada de agentes/supervisores con rollback;
- decidir separadamente la promocion hacia `crm.pyrosa.com.do`.

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
npm run build
npm run start
```

`npm run db:migrate` esta retirado y falla de forma explicita. Los cambios
fisicos se derivan de un diccionario publicado, se planifican/aplican desde
Platform y se cierran con fingerprint y drift.

Las variables de entorno del contenedor y las credenciales de base de datos se
gestionan desde el runtime SimpleHostMan. Un arranque fuera del contenedor puede
requerir variables equivalentes al entorno demo.

## Documentacion relacionada

- indice de docs: `docs/README.md`
- vision de producto: `docs/product/vision-v2607.md`
- modulos: `docs/product/modules-v2607.md`
- diseno v2607: `docs/design/design-democrm-v2607.md`
- perfil VOIX: `docs/design/design-voix-call-center-profile-v2607.md`
- analisis seguro de la fuente VOIX:
  `docs/design/analysis-voix-case-follow-up-2026.md`
- API CRM v1: `docs/api/crm-v1.md`
- mapa del ecosistema: `docs/design/ecosystem/pyrosa-app-map.md`
- arquitectura: `docs/design/architecture/overview.md`
- ambientes: `docs/ops/environments.md`
- runtime SimpleHostMan: `docs/ops/runtime-simplehostman.md`
- gestion de secretos:
  [politica transversal](https://github.com/JuanDePena/pyrosa-docs/blob/main/ops/secrets-management.md)
  y [anexo CRM](docs/ops/secrets-management-local.md)
- release flow:
  [politica transversal](https://github.com/JuanDePena/pyrosa-docs/blob/main/ops/release-flow.md)
- convergencia de schema: `docs/ops/app-schema-convergence.md`
- plan v2607 cerrado: `docs/plans-completed/plan-democrm-v2607.md`
- promocion operativa pendiente: `docs/ops/democrm-v2607-promotion.md`
- evidencia saneada del canario owner:
  `docs/evidence/democrm-v2607-owner-canary-2026-07-16.md`
- contrato de marca: `docs/design/brand-assets.md`
- adopcion visual completada: `docs/plans-completed/plan-pyrosa-ui-adoption.md`
- convergencia SharedShell completada:
  `docs/plans-completed/plan-democrm-shared-shell-visual-convergence.md`
- decisiones de arquitectura: `docs/design/adr/`
