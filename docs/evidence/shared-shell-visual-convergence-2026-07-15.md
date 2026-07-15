# Evidencia de cierre SharedShell y Pyrosa UI

Fecha: `2026-07-15`

Aplicación: `pyrosa-democrm`

Branch: `main`

Estado objetivo: `pilot`

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
| 1. Inventario y reuso | Baseline `936652b`, componentes compartidos, CSS y rollback clasificados. | [`analysis-shared-shell-visual-inventory.md`](../design/analysis-shared-shell-visual-inventory.md) y [`design-shared-shell-visual-convergence.md`](../design/design-shared-shell-visual-convergence.md). |
| 2. Metadata y navegación | Registry único de 10 rutas, cinco grupos, badges, keywords, resolución hash y adaptador `SidebarItem[]`. | [`routeRegistry.tsx`](../../ui/src/routeRegistry.tsx). |
| 3. Dashboard analítico | Score ejecutivo y cinco dominios de lectura; no usa `DataTable`. | `DashboardRoute` en [`main.tsx`](../../ui/src/main.tsx). |
| 4. Shell compartido | `BusinessOpsShellTemplate` gobierna marca, metadata, sidebar, topbar, persistencia y regreso lógico. | Composición `App` en [`main.tsx`](../../ui/src/main.tsx). |
| 5. Cuenta y contexto | `UserDrawer` expone identidad y alcance read-only, fachadas Accounts y logout; la app no persiste autoridad IAM. | Builders y composición del drawer en [`main.tsx`](../../ui/src/main.tsx). |
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
| Mutaciones CRM | Bloqueadas; previews existentes siguen `GET`, `mutates=false` |
| Modo de paquete | `file-pilot` |
| Promoción | `pilot`; `ready` bloqueado hasta consumir paquetes publicados e inmutables |

## Gates de cierre

Los comandos se ejecutan desde la raíz del repositorio.

| Gate | Comando | Resultado de cierre |
| --- | --- | --- |
| Contrato Pyrosa UI | `npm --prefix ui run check:pyrosa-ui` | Pendiente de registrar al terminar la corrida. |
| Contrato de adopción | `npm --prefix ui run check:pyrosa-ui` | `PASS`, 140 verificaciones. |
| TypeScript cliente y servidor | `npm --prefix ui run typecheck` | `PASS`. |
| OAuth API | `npm --prefix ui run test:oauth-api` | `PASS`, 1 prueba. |
| Artefacto cliente y servidor | `npm --prefix ui run build` | `PASS`, cliente Vite y servidor TypeScript. |
| Health local | `curl -fsS http://127.0.0.1:10166/__pyrosa_crm_health` | `PASS`: servicio `pyrosa-crm`, version `v2606`, branch `main` y base de datos disponible. |
| QA visual autenticado | `npm --prefix ui run qa:visual -- --base-url http://127.0.0.1:10166` | `PASS`: manifiesto schema v2, 6 capturas y 0 fallos. |
| Documentación local y canónica | `validate_documentation.py --repo pyrosa-democrm --enforce-branches` | `PASS`: 2 alcances, 75 Markdown y 352 enlaces. |
| Higiene del diff | `git diff --check` | `PASS`. |

## Matriz de QA visual

El harness debe escribir `ui/tmp/qa-visual/manifest.json` y declarar
`ok: true`. Ningún artefacto de `ui/tmp` se versiona.

| Escenario | Viewport | Aserciones |
| --- | --- | --- |
| Dashboard | Desktop | Marca, Overview CRM, score ejecutivo, dominios y ausencia de fallback/error. |
| Cuentas | Desktop | Primera vista operativa read-only, tabla, selección y detalle. |
| UserDrawer | Desktop | Identidad delegada, accesos Accounts, alcance DemoCRM y logout. |
| Dashboard estrecho | `390x844` | Header y contenido sin overflow horizontal. |
| Cuentas estrecho | `390x844` | Navegación, tabla read-only y contenido sin overflow horizontal. |
| UserDrawer estrecho | `390x844` | Drawer utilizable, cierre disponible y sin capas superpuestas. |

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
la aplicación permanece en `pilot` hasta cerrar la regresión.

## Límites de la evidencia

- Esta validación cubre shell, navegación y presentación; no convierte filas
  contract-first en datos productivos.
- No habilita mutaciones de cuentas, contactos, oportunidades o actividades.
- No promueve `democrm.pyrosa.com.do` a identidad productiva `pyrosa-crm`.
- Los screenshots contienen una identidad sintética de QA y no constituyen
  evidencia de autorización de un usuario real.
- El siguiente corte de dominio —diccionarios, persistencia y endpoints reales
  para cuentas, contactos, oportunidades y actividades— es un handoff/roadmap
  independiente y no bloquea el cierre visual.
