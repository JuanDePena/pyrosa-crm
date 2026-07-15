# Evidencia de cierre SharedShell y Pyrosa UI

Fecha: `2026-07-15`

Aplicación: `pyrosa-democrm`

Branch: `main`

Estado objetivo: `v2607 source-ready`; promocion runtime diferida

## Alcance

Esta evidencia consolida los seis cortes de convergencia visual y los
pendientes locales de adopción de Pyrosa UI. Los planes fuente son:

- [Plan DemoCRM SharedShell Visual Convergence](../plans-completed/plan-democrm-shared-shell-visual-convergence.md);
- [Plan de adopción Pyrosa UI](../plans-completed/plan-pyrosa-ui-adoption.md).

Al cerrar, ambos documentos se archivan en `plans-completed` y los índices se
actualizan en el mismo corte; este archivo no duplica el estado de los planes.

## Evidencia por corte

| Corte | Resultado implementado | Evidencia durable |
| --- | --- | --- |
| 1. Inventario y reuso | Baseline histórico `936652b`, componentes compartidos, CSS y rollback clasificados. | [`analysis-shared-shell-visual-inventory.md`](../design/analysis-shared-shell-visual-inventory.md) y [`design-shared-shell-visual-convergence.md`](../design/design-shared-shell-visual-convergence.md). |
| 2. Metadata y navegación | Registry único vigente de nueve rutas, cinco grupos, keywords, resolución hash y adaptador `SidebarItem[]`; los badges no forman parte de la metadata de ruta. | [`routeRegistry.tsx`](../../ui/src/routeRegistry.tsx). |
| 3. Dashboard analítico | Score ejecutivo y cinco dominios de lectura; no usa `DataTable`. | [`DashboardView.tsx`](../../ui/src/DashboardView.tsx). |
| 4. Shell compartido | `BusinessOpsShellTemplate` gobierna marca, metadata, sidebar, topbar, persistencia y regreso lógico. | Composición en [`CrmApp.tsx`](../../ui/src/CrmApp.tsx). |
| 5. Cuenta y contexto | `UserDrawer` expone identidad y alcance read-only, fachadas Accounts y logout; la app no persiste autoridad IAM. | Composición del drawer en [`CrmApp.tsx`](../../ui/src/CrmApp.tsx). |
| 6. QA y handoff | Contrato ejecutable, harness desktop/móvil, runbook, matriz CSS, rollback y límite `pilot`. | [`check-pyrosa-ui-adoption.mjs`](../../ui/scripts/check-pyrosa-ui-adoption.mjs), [`qa-visual-smoke.mjs`](../../ui/scripts/qa-visual-smoke.mjs) y [`shared-shell-scaffold.md`](../ops/shared-shell-scaffold.md). |

## Contrato de adopción resultante

| Capacidad | Estado |
| --- | --- |
| Proveedor | `pyrosa-ui` |
| Perfil | `business-ops` |
| Tema objetivo | `pyrosa-base@1.0.0` |
| Shell compartido | Activo mediante `BusinessOpsShellTemplate` |
| Navegación compartida | Activa mediante `SidebarItem[]` |
| Layouts/primitivas | Activos mediante `@pyrosa/ui` y `@pyrosa/ui-layouts` |
| UserDrawer | Activo |
| Autenticación | Delegada a `pyrosa-iam` |
| Perfil, MFA y sesiones | Fachadas de autoservicio en Accounts; autoridad en IAM |
| Mutaciones CRM | API v1 implementada con autorizacion compuesta, ETag, idempotencia, audit y outbox |
| Modo de paquete | Publicacion HTTP inmutable `0.2.1` con hashes verificados |
| Promoción | Release candidate en source; runtime y propietarios externos permanecen apagados hasta el runbook de promocion |

## Gates de cierre

Los comandos se ejecutan desde la raíz del repositorio.

| Gate | Comando | Resultado de cierre |
| --- | --- | --- |
| Contrato Pyrosa UI y adopcion | `npm --prefix ui run check:pyrosa-ui` | `PASS`, 185 verificaciones. |
| TypeScript cliente y servidor | `npm --prefix ui run typecheck` | `PASS`. |
| OAuth API | `npm --prefix ui run test:oauth-api` | `PASS`, 16 pruebas. |
| Dominio CRM v1 | `npm --prefix ui run test:crm-v1` | `PASS`, 19 pruebas. |
| Artefacto cliente y servidor | `npm --prefix ui run build` | `PASS`, cliente Vite y servidor TypeScript. |
| Piloto sintetico | `npm --prefix ui run pilot:synthetic` | `PASS`, 18 aserciones; los casos de import usaron únicamente el seed JSON sintético y nunca abrieron, parsearon ni importaron el XLSX VOIX; sin PII, red ni PostgreSQL. |
| QA visual contract-first | `npm --prefix ui run qa:visual` | `PASS`: manifiesto schema v2, modo `synthetic-contract`, 11 capturas y 0 fallos. |
| Higiene del diff | `git diff --check` | `PASS`. |

## Matriz de QA visual

El harness debe escribir `ui/tmp/qa-visual/manifest.json` y declarar
`ok: true`. Ningún artefacto de `ui/tmp` se versiona.

| Escenario | Viewport | Aserciones |
| --- | --- | --- |
| Dashboard | Desktop | Marca, Overview CRM, score ejecutivo, dominios y ausencia de fallback/error. |
| Cuentas | Desktop | Inventario operativo, selección y detalle; las mutaciones implementadas se validan mediante los contratos funcionales, no por esta captura. |
| Casos | Desktop | Inventario operativo, estado, prioridad y detalle. |
| Agenda | Desktop | Citas, estado y rango temporal sin overflow. |
| UserDrawer | Desktop | Identidad delegada, accesos Accounts, alcance DemoCRM y logout. |
| Dashboard estrecho | `390x844` | Header y contenido sin overflow horizontal. |
| Cuentas estrecho | `390x844` | Navegación, tabla read-only y contenido sin overflow horizontal. |
| Casos estrecho | `390x844` | Inventario y navegacion utilizables sin overflow horizontal. |
| Agenda estrecha | `390x844` | Citas y navegacion utilizables sin overflow horizontal. |
| UserDrawer estrecho | `390x844` | Drawer utilizable, cierre disponible y sin capas superpuestas. |
| Error fatal | Desktop | Landing independiente del SharedShell, mensaje informativo y detalle tecnico colapsable. |

Cada escenario inspecciona también:

- ausencia de redirección a login;
- ausencia de fallback local de contratos;
- ausencia del mensaje de error runtime;
- presencia de los textos esperados;
- ancho del documento no mayor que el viewport más 12 px.

## CSS y rollback

Los overrides del shell local y la marca/sesión duplicadas se retiran. Los
estilos restantes se limitan a layouts y semántica del dominio CRM. Reintroducir
selectores sobre internals `.py-*` vuelve a ser un `blocker`.

El rollback es atómico por commit y no incluye DDL ni transformación de datos.
Después de cualquier reversión se repiten typecheck, build, health y QA visual;
el runtime permanece sin promocionar hasta cerrar la regresión y repetir el
runbook operativo.

## Límites de la evidencia

- Esta validación cubre shell, navegación y presentación con respuestas
  sinteticas conformes al contrato; no certifica datos productivos.
- No habilita por si misma los flags de Directory, Store o Platform ni crea
  clientes/secrets OAuth en IAM.
- No promueve ni reinicia el runtime de `democrm.pyrosa.com.do`.
- Los screenshots contienen una identidad sintética de QA y no constituyen
  evidencia de autorización de un usuario real.
- Los diccionarios, persistencia y endpoints de dominio se cerraron en el
  [plan DemoCRM v2607](../plans-completed/plan-democrm-v2607.md); su promocion
  operacional se rige por el runbook y no se deduce de esta evidencia visual.
