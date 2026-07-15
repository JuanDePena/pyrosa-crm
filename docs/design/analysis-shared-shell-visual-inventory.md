# Inventario visual y de SharedShell de DemoCRM

Fecha de levantamiento: `2026-07-15`

Baseline: `936652b`

Estado: `convergencia implementada`

## Propósito

Este inventario registra el punto de partida y el destino verificado de la
adopción visual de `pyrosa-democrm`. El contrato transversal sigue viviendo en
[SharedShell](https://github.com/JuanDePena/pyrosa-docs/blob/main/design/shared-shell.md)
y en
[navegación y teclado de SharedShell](https://github.com/JuanDePena/pyrosa-docs/blob/main/design/shared-shell-navigation-keyboard.md).
DemoCRM conserva aquí únicamente decisiones de dominio, excepciones y
evidencia local.

## Superficies inspeccionadas

- [`ui/src/main.tsx`](../../ui/src/main.tsx): composición del shell, vistas,
  datos contract-first y sesión delegada.
- [`ui/src/routeRegistry.tsx`](../../ui/src/routeRegistry.tsx): metadata única
  de rutas y adaptador a `SidebarItem[]`.
- [`ui/src/styles.css`](../../ui/src/styles.css): estilos de dominio y shims
  locales.
- [`ui/package.json`](../../ui/package.json): dependencias y gates.
- [`ui/scripts/qa-visual-smoke.mjs`](../../ui/scripts/qa-visual-smoke.mjs):
  harness de screenshots autenticados.
- [`ui/scripts/pyrosa-ui-adoption-contract.json`](../../ui/scripts/pyrosa-ui-adoption-contract.json)
  y [`check-pyrosa-ui-adoption.mjs`](../../ui/scripts/check-pyrosa-ui-adoption.mjs):
  contrato ejecutable y guard durable de adopción.
- [`docs/ops/shared-shell-scaffold.md`](../ops/shared-shell-scaffold.md):
  operación, QA y rollback.

## Baseline antes de la convergencia

| Área | Estado observado | Brecha |
| --- | --- | --- |
| Shell | `AppShell`, `Sidebar` y `Topbar` se componían directamente en `main.tsx`. | La app duplicaba wiring ya resuelto por `BusinessOpsShellTemplate`. |
| Marca y sesión | `.crm-brand*` y `.crm-session-summary*` componían marca, identidad y logout dentro del sidebar. | Duplicaban el lockup, las acciones y el drawer del shell compartido. |
| Navegación | Diez rutas hash estaban declaradas dentro de `main.tsx` con dos grupos generales. | Faltaban `badge`, `keywords` y los cinco grupos funcionales acordados. |
| Dashboard | Ya usaba `MetricGrid`, `MetricCard`, `Panel` y no renderizaba tablas. | Mezclaba accesos y módulos; no expresaba un score ejecutivo ni los cinco dominios de lectura. |
| Vistas operativas | Cuentas, contactos, oportunidades, actividades, reportes y configuración usaban filtros, tabs, tabla y detalle compartidos. | No requerían rediseño para cerrar el shell; siguen siendo contract-first y read-only. |
| Cuenta | La sesión IAM se resumía en el sidebar y en Runtime; el logout estaba duplicado. | No existía `UserDrawer` ni acceso claro a las fachadas de Accounts. |
| QA visual | El smoke capturaba Dashboard, Cuentas, Oportunidades, Plataforma y Dashboard móvil. | No abría `UserDrawer` ni comprobaba explícitamente shell y drawer en viewport estrecho. |
| Paquetes | Todos los paquetes `@pyrosa/*` se consumían mediante dependencias `file:`. | La adopción solo puede declararse `pilot`, aunque los gates locales pasen. |

## Inventario compartido después de la convergencia

| Responsabilidad | Componente o contrato compartido | Uso en DemoCRM |
| --- | --- | --- |
| Shell operacional | `BusinessOpsShellTemplate` | Única composición del sidebar y topbar; recibe metadata de ruta, marca, ambiente, branch y acciones. |
| Navegación | `NavigationRoute`, `SidebarItem` | El registry CRM mantiene tipos de dominio y un helper produce `SidebarItem[]`. |
| Persistencia del shell | `sidebarPersistKey`, `contentScrollPersistKey` | El estado del sidebar y el scroll quedan aislados por app y por ruta. |
| Regreso lógico | `navigationBack` | Toda ruta distinta de Dashboard vuelve a `dashboard`; botón y `Escape` comparten destino cuando no hay una capa superior abierta. |
| Cuenta | `UserDrawer`, `UserDrawerUser`, `UserDrawerSection` | Presenta identidad delegada y enlaces a Accounts sin almacenar autoridad IAM. |
| Detalle operativo | `DetailDrawer` y primitivas de tabla/filtro | Conservan la inspección read-only y los previews no mutantes del dominio CRM. |
| Layout y analítica | `WorkspaceLayout`, `MetricGrid`, `MetricCard`, `Panel`, `ViewGrid`, `StatusStrip` | Componen Dashboard y vistas de trabajo; Dashboard no usa `DataTable`. |
| Feedback | `ViewNotice`, `StatusBadge`, `EmptyState` | Explican fallbacks, estados y ausencia de datos sin crear variantes locales del sistema visual. |

## Registry y propiedad de rutas

El registry contiene exactamente diez rutas. El shell solo consume metadata;
la resolución hash y la lógica de cada vista permanecen dentro de DemoCRM.

| Grupo | Rutas | Propiedad |
| --- | --- | --- |
| Gestión | Dashboard | Lectura ejecutiva y punto de retorno del CRM. |
| Relación | Cuentas, Contactos, Oportunidades | Relaciones comerciales y pipeline CRM-owned. |
| Operación | Actividades, Reportes | Seguimiento y analítica operativa. |
| Gobierno | Configuración, Plataforma, Marca | Fronteras de integración, configuración y activos visuales. |
| Runtime | Runtime | Sesión delegada y estado técnico read-only. |

Cada entrada declara `id`, `hash`, `label`, `title`, `description`, `icon`,
`groupId`, `groupLabel`, `groupOrder`, `itemOrder`, `badge` y `keywords`. El
helper `createCrmSidebarItems` agrega el estado activo, la lectura de estado y
el callback de selección; el shell no conoce reglas de negocio CRM.

## Matriz CSS

La clasificación describe el destino de las familias observadas en el
baseline. Ninguna regla local debe redefinir tokens del shell compartido.

| Familia | Clasificación | Decisión |
| --- | --- | --- |
| `.crm-shell .py-sidebar*`, `.crm-shell__content` | `cleanup` | Retirada al adoptar el template; colores, selección y superficie pertenecen a `@pyrosa/ui`. |
| `.crm-brand*`, `.crm-session-summary*` | `cleanup` | Retirada; marca, metadata, usuario y logout los componen el template y `UserDrawer`. |
| `:root`, `body`, `#root` y resets tipográficos | `shim` | Mantener solo lo indispensable para montar la app; no introducir nuevos tokens de shell. |
| `.crm-workspace`, `.crm-overview-*`, `.crm-route-*` | `keep` | Layout y tarjetas propios del Dashboard CRM, sin reemplazar primitivas compartidas. |
| `.crm-field`, `.crm-search-control`, `.crm-tabs`, `.crm-inventory-layout` | `keep` | Adaptadores de disposición para filtros y vistas operativas. |
| `.crm-detail-*`, `.crm-readonly-actions` | `keep` | Presentación de contratos CRM read-only y previews no mutantes. |
| `.crm-module-*`, `.crm-service-*`, `.crm-domain-*`, `.crm-facts` | `keep` | Lecturas de dominio que no existen como componente transversal autónomo. |
| `.crm-brand-manager`, `.crm-brand-preview`, `.crm-mono` | `keep` | Vista CRM-owned de marca y valores técnicos. |
| Selectores locales sobre internals `.py-*` | `blocker` | No deben existir para declarar el cierre; cualquier necesidad nueva se eleva a `pyrosa-ui`. |

## Hallazgos de QA

- El harness crea una cookie de sesión efímera firmada y nunca persiste
  credenciales en el repositorio.
- Las capturas se escriben bajo `ui/tmp/qa-visual`, ruta efímera e ignorada.
- Cada escenario valida textos esperados, ausencia de redirección a login,
  ausencia de fallback de contratos, ausencia de error runtime y overflow
  horizontal.
- La convergencia agrega evidencia de Dashboard, Cuentas, `UserDrawer` y
  viewport estrecho; el manifiesto operativo es la fuente de verdad de cada
  corrida.

La corrida de cierre y sus resultados resumidos se registran en
[`shared-shell-visual-convergence-2026-07-15.md`](../evidence/shared-shell-visual-convergence-2026-07-15.md).

## Riesgos residuales

1. Las dependencias `file:` impiden promover la adopción por encima de
   `pilot`; no impiden usar el shell en el runtime demo.
2. Las filas de trabajo continúan siendo contract-first. Una convergencia
   visual no autoriza mutaciones ni cambia ownership de datos.
3. Accounts sigue siendo la fachada de perfil, preferencias, MFA y sesiones;
   IAM conserva autenticación y autoridad. DemoCRM solo presenta enlaces y
   contexto read-only.
4. La promoción de `pyrosa-democrm` a una identidad productiva
   `pyrosa-crm` requiere un checklist separado de release, paquetes publicados
   y contratos de dominio productivos.
