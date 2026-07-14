# Plan DemoCRM SharedShell Visual Convergence

Fecha: `2026-07-08`
Estado: `definido`
Cortes estimados: `6`
Tareas estimadas: `40`

## Proposito

Llevar `pyrosa-democrm` desde scaffold SharedShell listo hacia una experiencia
visual convergente con Platform y Directory, preservando el dominio CRM y
preparando una futura promocion controlada a `pyrosa-crm`.

El plan toma como plantilla reusable el cierre de Directory:
`pyrosa-directory/docs/plans-completed/plan-directory-shared-shell-visual-convergence.md`.

## Fuentes

- [Contrato transversal SharedShell](https://github.com/JuanDePena/pyrosa-docs/blob/main/design/shared-shell.md)
- [Navegacion y teclado SharedShell](https://github.com/JuanDePena/pyrosa-docs/blob/main/design/shared-shell-navigation-keyboard.md)
- [`plan-pyrosa-ui-adoption.md`](plan-pyrosa-ui-adoption.md)
- [`pyrosa-ui-visual-inventory-2026-07-07.md`](../plans-completed/pyrosa-ui-visual-inventory-2026-07-07.md)
- [`../ops/shared-shell-scaffold.md`](../ops/shared-shell-scaffold.md)
- [`plan-roadmap-v2606.md`](plan-roadmap-v2606.md)
- `pyrosa-directory`: plantilla cerrada de SharedShell visual convergence
- `pyrosa-platform`: referencia de Overview analitico, sidebar, header y
  `UserDrawer`

Los canonicos gobiernan el contrato compartido. Este plan conserva el rollout,
las decisiones de dominio y la evidencia propia de DemoCRM.

## Alcance

Incluido:

- inventario visual ejecutable de DemoCRM;
- metadata de rutas y navegacion compatible con `SidebarItem[]`;
- Dashboard CRM analitico sin tablas operativas;
- convergencia del shell hacia el contrato Platform/Directory;
- `UserDrawer` compartido si el contrato de usuario esta disponible;
- QA visual con screenshots usando `npm run qa:visual`;
- evidencia por corte y actualizacion de documentacion;
- commit y push por corte.

Fuera de alcance:

- mover leads, cuentas, contactos, oportunidades, pipeline o actividades fuera
  del dominio CRM;
- implementar auth local, MFA o claims propios;
- promover mutaciones CRM sin contrato, validacion y auditoria;
- copiar tokens visuales como fuente primaria en vez de consumir `@pyrosa/ui`;
- promover `democrm.pyrosa.com.do` a identidad productiva sin checklist de
  `pyrosa-crm`.

## Estado Inicial

- `pyrosa-democrm` esta en `main`.
- El scaffold consume `@pyrosa/ui*` por dependencias `file:`.
- `ui/src/main.tsx` concentra shell, rutas y vistas.
- El shell actual usa `AppShell`, `Sidebar`, `Topbar` y `WorkspaceLayout`.
- `Dashboard`, `Cuentas`, `Contactos`, `Oportunidades`, `Actividades` y
  `Reportes` existen como rutas base.
- `npm run qa:visual` ya captura smoke visual en Chromium headless.
- Health local documentado: `GET /__pyrosa_crm_health` en puerto `10166`.

## Gates Globales

Cada corte debe cerrar con:

1. Actualizacion de documentacion del corte.
2. `npm --prefix ui run typecheck`.
3. `npm --prefix ui run build`.
4. `npm --prefix ui run qa:visual -- --base-url http://127.0.0.1:10166`
   cuando el runtime local este levantado.
5. `curl -fsS http://127.0.0.1:10166/__pyrosa_crm_health` cuando el runtime
   local este levantado.
6. `git status` limpio.
7. Commit con mensaje claro.
8. Push a `origin/main`.

## Progreso

| Corte | Estado | Evidencia | Notas |
| --- | --- | --- | --- |
| 1. Inventario ejecutable y contrato de reuso | pendiente | - | Baseline real de shell, Dashboard, rutas, CSS y QA visual. |
| 2. Metadata de rutas y navegacion | pendiente | - | Rutas CRM normalizadas para sidebar/header compartidos. |
| 3. Dashboard analitico sin tablas | pendiente | - | Dashboard orientado a lectura ejecutiva y estado de dominio CRM. |
| 4. Convergencia del shell principal | pendiente | - | Alinear AppShell/BusinessOpsShellTemplate con Platform/Directory. |
| 5. UserDrawer, preferencias y contexto CRM | pendiente | - | Cuenta compartida sin duplicar auth ni preferencias. |
| 6. QA visual, promocion y handoff | pendiente | - | Screenshots, CSS clasificado, bloqueadores `ready` y receta reusable. |

## Corte 1: Inventario Ejecutable Y Contrato De Reuso

Objetivo: confirmar el estado real de DemoCRM antes de modificar el shell.

Tareas:

1. Crear `docs/design/analysis-shared-shell-visual-inventory.md`.
2. Crear `docs/design/design-shared-shell-visual-convergence.md`.
3. Revisar `ui/src/main.tsx`, `ui/src/styles.css`, `ui/package.json` y
   `ui/scripts/qa-visual-smoke.mjs`.
4. Clasificar componentes compartidos ya consumidos:
   - `AppShell`;
   - `Sidebar`;
   - `Topbar`;
   - `WorkspaceLayout`;
   - tablas, filtros, paneles y detalles.
5. Clasificar CSS local como `keep`, `shim`, `cleanup` o `blocker`.
6. Definir si la convergencia debe quedarse en `AppShell` o migrar a
   `BusinessOpsShellTemplate`.
7. Registrar baseline de screenshots con `qa:visual`.
8. Gate: docs + checks + commit + push.

Entregables:

- inventario visual DemoCRM;
- diseno de convergencia DemoCRM;
- matriz de rollback;
- primer reporte de QA visual.

## Corte 2: Metadata De Rutas Y Navegacion

Objetivo: separar metadata visual de rutas para que sidebar/header no dependan
de estructuras dispersas.

Tareas:

1. Crear registry de rutas CRM con `id`, `label`, `title`, `description`,
   `icon`, `groupId`, `groupLabel`, `groupOrder`, `itemOrder`, `badge` y
   `keywords`.
2. Adaptar el registry a `SidebarItem[]`.
3. Confirmar orden y grupos:
   - Gestion;
   - Relacion;
   - Operacion;
   - Gobierno;
   - Runtime.
4. Mantener `Dashboard`, `Cuentas`, `Contactos`, `Oportunidades`,
   `Actividades`, `Reportes`, `Configuracion`, `Plataforma`, `Marca` y
   `Runtime`.
5. Revisar badges de version, ambiente, branch y contadores.
6. Documentar visibilidad demo/productiva.
7. Gate: docs + checks + commit + push.

Entregables:

- metadata unica de rutas;
- navegacion lista para el shell compartido;
- subtitulos estables por vista.

## Corte 3: Dashboard Analitico Sin Tablas

Objetivo: redisenar `Dashboard` como overview analitico de CRM, no como vista
operativa.

Tareas:

1. Separar datos operativos hacia `Cuentas`, `Contactos`, `Oportunidades` y
   `Actividades`.
2. Crear score ejecutivo CRM:
   - readiness demo;
   - cuentas;
   - contactos;
   - oportunidades;
   - actividades;
   - runtime.
3. Crear dominios de lectura:
   - Relacion comercial;
   - Pipeline;
   - Actividad;
   - Reportes;
   - Gobierno.
4. Mantener el perfil `business-ops` sin convertir la vista en landing page.
5. Evitar tablas en `Dashboard`.
6. Usar primitivas compartidas antes de agregar CSS local.
7. Gate: docs + checks + QA visual + commit + push.

Entregables:

- Dashboard analitico;
- cero tablas en Dashboard;
- screenshots desktop y viewport estrecho.

## Corte 4: Convergencia Del Shell Principal

Objetivo: alinear el shell principal con el contrato Platform/Directory.

Tareas:

1. Comparar `AppShell` actual contra `BusinessOpsShellTemplate`.
2. Decidir si se migra a `BusinessOpsShellTemplate` o si `AppShell` cumple el
   contrato visual objetivo.
3. Garantizar:
   - marca;
   - version;
   - ambiente;
   - branch;
   - boton de retorno;
   - subtitulo por vista;
   - acciones de tema/notificaciones/usuario;
   - persistencia de sidebar y scroll.
4. Retirar o aislar estilos locales del shell que dupliquen tokens
   compartidos.
5. Mantener rutas CRM existentes sin cambiar ownership de dominio.
6. Gate: docs + checks + QA visual + commit + push.

Entregables:

- shell principal convergente;
- rollback claro;
- CSS local reducido o clasificado.

## Corte 5: UserDrawer, Preferencias Y Contexto CRM

Objetivo: usar el drawer compartido de cuenta sin introducir auth local.

Tareas:

1. Confirmar fuente de usuario desde IAM/Accounts.
2. Mapear usuario al contrato `UserDrawerUser` si existe.
3. Crear secciones:
   - Cuenta;
   - Preferencias UI;
   - Alcance DemoCRM;
   - Promocion productiva.
4. Mantener preferencias locales solo si no existe componente compartido.
5. No persistir autoridad IAM, MFA ni claims en CRM.
6. Validar cierre por Escape y no superponer drawers/modales.
7. Gate: docs + checks + QA visual + commit + push.

Entregables:

- drawer de usuario compartido o excepcion documentada;
- frontera demo/productiva visible;
- preferencias locales clasificadas.

## Corte 6: QA Visual, Promocion Y Handoff

Objetivo: cerrar el plan con evidencia y dejarlo reusable.

Tareas:

1. Capturar screenshots desktop:
   - Dashboard;
   - Cuentas;
   - UserDrawer o excepcion documentada.
2. Capturar viewport estrecho:
   - header;
   - sidebar;
   - overflow de titulos;
   - drawer.
3. Clasificar CSS restante:
   - `keep`;
   - `shim`;
   - `cleanup`;
   - `blocker`.
4. Actualizar `docs/README.md`, `docs/design/README.md` y
   `docs/plans/README.md`.
5. Crear `docs/plans-completed/README.md` si aun no existe.
6. Mover el plan a `docs/plans-completed/` si todos los cortes cierran.
7. Mantener estado `pilot` mientras las dependencias sigan en `file:`.
8. Gate: docs + checks + QA visual + commit + push.

Entregables:

- evidencia de QA visual;
- plan cerrado o bloqueadores claros;
- receta reusable para `pyrosa-crm` productivo.

## Criterio De Cierre

El plan queda cerrado cuando:

- DemoCRM conserva ownership de cuentas/contactos/oportunidades/actividades;
- el shell principal esta alineado con Platform/Directory;
- `Dashboard` es analitico y sin tablas;
- `Cuentas` sigue siendo la primera vista operativa read-only;
- `UserDrawer` compartido esta activo o hay excepcion documentada;
- `typecheck`, `build` y `qa:visual` pasan;
- la documentacion queda actualizada;
- el repo queda limpio tras commit y push.
