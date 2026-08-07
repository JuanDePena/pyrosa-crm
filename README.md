# pyrosa-crm

<p align="left">
  <img src="https://democrm.pyrosa.com.do/public/assets/brand/crm-logo.png" alt="PYROSA CRM" width="96" />
</p>

`PYROSA CRM` es el producto CRM transaccional y tenant-aware del ecosistema
Pyrosa. `pyrosa-democrm` es su carril activo de desarrollo y canario; la
identidad productiva `pyrosa-crm` conserva contratos, releases y promoción
separados.

## Documentación

La documentación detallada vive en el repositorio coordinador
[`pyrosa-docs`](https://github.com/JuanDePena/pyrosa-docs).

- [Índice de DemoCRM](https://github.com/JuanDePena/pyrosa-docs/blob/main/apps/democrm/README.md)
- [Producto v2607](https://github.com/JuanDePena/pyrosa-docs/blob/main/apps/democrm/product/vision-v2607.md)
- [Arquitectura](https://github.com/JuanDePena/pyrosa-docs/blob/main/apps/democrm/architecture/overview.md)
- [API CRM v1](https://github.com/JuanDePena/pyrosa-docs/blob/main/apps/democrm/api/crm-v1.md)
- [Operación](https://github.com/JuanDePena/pyrosa-docs/blob/main/apps/democrm/operations/runtime-simplehostman.md)
- [Planes](https://github.com/JuanDePena/pyrosa-docs/blob/main/apps/democrm/plans/README.md)
- [Contexto para agentes](https://github.com/JuanDePena/pyrosa-docs/blob/main/context/apps/democrm.md)

Este repositorio no debe recrear un árbol `docs/` ni contener documentación
humana adicional. Las decisiones, runbooks, planes y evidencia se actualizan
en `pyrosa-docs`.

## Fronteras

CRM posee cuentas CRM, contactos, casos, actividades, citas, oportunidades,
reportes y autorización funcional. Consume contratos explícitos de Platform,
IAM, Accounts, Directory, Store, UI y los motores de integración declarados.

El acceso y el binding de schema fallan cerrado. La selección del navegador no
concede acceso ni elige un schema físico.

## Artefactos locales

Permanecen junto al código porque participan en validación, build o runtime:

- JSON Schemas y fixtures bajo `contracts/`;
- diccionarios, manifests, baselines y seeds bajo `database/`;
- templates de Quadlet, entorno y Apache bajo `runtime/`;
- source, scripts, pruebas, configuración y assets bajo `ui/`;
- workflow, lockfile y configuración Git.

Los workbooks de clientes permanecen fuera del checkout y de los artefactos de
QA. El piloto sintético sólo escribe evidencia en un directorio indicado de
forma explícita:

```bash
npm --prefix ui run pilot:synthetic -- --evidence-directory /ruta/segura
```

## Checkout

```text
/srv/containers/apps/pyrosa-democrm/app
```

## Validación mínima

```bash
npm --prefix ui run test:pilot:synthetic
npm --prefix ui run typecheck
npm --prefix ui run build
git diff --check
```

Las comprobaciones live y la promoción siguen el
[runbook DemoCRM](https://github.com/JuanDePena/pyrosa-docs/blob/main/apps/democrm/operations/democrm-v2607-promotion.md)
y el [flujo transversal de releases](https://github.com/JuanDePena/pyrosa-docs/blob/main/ops/release-flow.md).
