# SharedShell DemoCRM: operación y handoff

Fecha: `2026-07-15`
Estado: `pilot-converged`

## Canonical Contracts

The transversal shell and interaction rules live in:

- [SharedShell](https://github.com/JuanDePena/pyrosa-docs/blob/main/design/shared-shell.md);
- [SharedShell navigation and keyboard](https://github.com/JuanDePena/pyrosa-docs/blob/main/design/shared-shell-navigation-keyboard.md).

This handoff remains local because it records the delivered CRM routes, auth,
contracts, runtime and QA evidence.

## Alcance

`pyrosa-democrm` tiene una superficie React/Node funcional para el CRM demo.
Consume SharedShell mediante `BusinessOpsShellTemplate`, conserva el runtime
compatible con SimpleHostMan y mantiene el dominio CRM separado de IAM,
Accounts y Platform.

## Superficie entregada

| Area | Current contract |
| --- | --- |
| Shell | `BusinessOpsShellTemplate`, `WorkspaceLayout`, `StatusStrip` y primitivas de `@pyrosa/ui`; no existe una composición local paralela de sidebar/topbar. |
| Routes | Registry único y tipado para Dashboard, Cuentas, Contactos, Oportunidades, Actividades, Reportes, Configuración, Plataforma, Marca y Runtime. |
| Navegación | Cinco grupos funcionales, búsqueda de sidebar, persistencia de shell/scroll y regreso lógico a Dashboard. |
| Dashboard | Score ejecutivo y dominios Relación comercial, Pipeline, Actividad, Reportes y Gobierno, sin tablas operativas. |
| Cuenta | `UserDrawer` compartido con identidad read-only, enlaces a fachadas Accounts y logout delegado. |
| Auth | Delegated UI auth through `pyrosa-iam` client `crm`; protected `/ui` and `/api/crm/*` surfaces use `PYROSA_CRM_SESSION`. |
| Contracts | `/api/crm/contracts` exposes `democrm-contract-v0.4` with CRM workbench rows, platform services, modules and session context. |
| Actions | `/api/crm/contracts/action-preview` supports `inspect` and `prepare`; both are `GET`, `preview-only` and `mutates=false`. |
| Runtime | `npm run build` produce cliente, `build/server` y un manifiesto comun; `server.mjs` verifica hashes/commit/version antes de cargar el BFF. |
| Visual QA | `npm run qa:visual -- --base-url http://127.0.0.1:10166` captura screenshots y manifiesto bajo `ui/tmp/qa-visual`. |

## Verificación operativa

Desde la raíz del repositorio:

```bash
npm --prefix ui run check:pyrosa-ui
npm --prefix ui run test:release-manifest
npm --prefix ui run typecheck
npm --prefix ui run build
systemctl restart app-pyrosa-democrm.service
curl -fsS http://127.0.0.1:10166/__pyrosa_crm_health
npm --prefix ui run qa:visual -- --base-url http://127.0.0.1:10166
```

La corrida es válida cuando:

- el contrato ejecutable de adopción Pyrosa UI pasa;
- typecheck y build terminan con código `0`;
- el health responde `ok` para `pyrosa-crm`, `artifact.ok=true` y publica el
  `releaseId`/commit esperado;
- `ui/tmp/qa-visual/manifest.json` declara `ok: true`;
- Dashboard no contiene tabla;
- Cuentas conserva la inspección read-only;
- `UserDrawer` abre y cierra sin superponerse al detalle;
- el viewport estrecho no presenta overflow horizontal.

Las imágenes y el manifiesto son artefactos efímeros. El resumen durable de la
corrida de cierre vive en
[`docs/evidence/shared-shell-visual-convergence-2026-07-15.md`](../evidence/shared-shell-visual-convergence-2026-07-15.md).

## Operación de navegación

- `#dashboard` es el punto de entrada y regreso lógico.
- Las rutas históricas `#inicio` y `#modulos` se resuelven a Dashboard.
- En una ruta secundaria, el botón de regreso vuelve a Dashboard.
- `Escape` cierra primero el drawer activo; sin capas abiertas aplica el mismo
  regreso lógico.
- El sidebar usa `pyrosa-democrm` y el scroll usa `democrm-${activeRoute}`;
  no deben reutilizar claves de Platform o Directory.

## Frontera de cuenta

DemoCRM no administra contraseña, MFA, sesiones globales ni autoridad. El
`UserDrawer` muestra contexto read-only y dirige Perfil, Preferencias, MFA y
Sesiones a las fachadas de Accounts. IAM continúa siendo la autoridad de
autenticación y sesión.

## Handoff de dominio

Next domain work should connect real CRM endpoints in this order:

1. Define dictionary-backed tables for CRM-owned customer, contact, pipeline and
   activity data.
2. Replace contract-first rows with read-only account, contact, opportunity and
   activity endpoints.
3. Add write commands only after validation gates and audit events exist.
4. Keep IAM, Accounts and Platform as external owners for identity, account
   center and runtime governance.
5. Promote `inspect` and `prepare` actions from preview to command handlers one
   action at a time.

## Rollback

No hay migración de datos asociada a la convergencia visual. Ante una regresión
funcional:

1. identificar el commit de convergencia aceptado;
2. revertirlo de forma completa, sin restaurar overrides parciales sobre
   clases `.py-*`;
3. repetir typecheck, build, health y smoke visual;
4. mantener la adopción en `pilot` y documentar la causa antes de reintentar.

Un cambio de screenshots sin fallo funcional bloquea promoción, pero no exige
rollback automático. Comparar primero el manifiesto y las capturas desktop y
móvil.

El rollback de runtime mueve siempre `dist`, `build/server` y
`build/release-manifest.json` del mismo release. No se restauran archivos
individuales ni se ejecuta un build sobre el checkout live.

## Guardrails

- Do not implement local authentication or bypass delegated UI auth.
- Do not store platform-owned identity, MFA or account authority inside CRM.
- Keep new mutations behind explicit API contracts, validation and audit.
- Keep screenshots and local smoke artifacts under ignored `ui/tmp/`.
- Keep adoption in `pilot` while `@pyrosa/*` dependencies use `file:`.
- Do not add local selectors over shared `.py-*` internals.
