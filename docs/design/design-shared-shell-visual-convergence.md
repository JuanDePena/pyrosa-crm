# Diseño de convergencia visual SharedShell para DemoCRM

Fecha: `2026-07-15`

Estado: `implementado en piloto`

## Decisión central

DemoCRM usa `BusinessOpsShellTemplate` como única shell de la superficie
autenticada. No mantiene una composición paralela de `AppShell`, `Sidebar` y
`Topbar`. La decisión alinea la app con Platform y Directory y conserva el
perfil `business-ops` sin mover responsabilidades del dominio CRM.

Los contratos transversales aplicables son
[SharedShell](https://github.com/JuanDePena/pyrosa-docs/blob/main/design/shared-shell.md)
y
[navegación y teclado](https://github.com/JuanDePena/pyrosa-docs/blob/main/design/shared-shell-navigation-keyboard.md).

## Arquitectura de la vista

```text
hash del navegador
        |
        v
routeRegistry CRM -----> SidebarItem[] -----> BusinessOpsShellTemplate
        |                                            |
        |                                            +--> UserDrawer
        |                                            +--> acciones de shell
        v
metadata activa -----> título/descripción -----> WorkspaceLayout
                                                    |
                         +--------------------------+------------------+
                         |                                             |
                  Dashboard analítico                          vista operativa
                  sin DataTable                         filtros/tabla/detalle
```

La shell recibe metadata y callbacks; no recibe filas, permisos mutantes ni
reglas de negocio. `main.tsx` conserva sesión, contratos, resolución de vistas
y composición de dominio. [`routeRegistry.tsx`](../../ui/src/routeRegistry.tsx)
es la fuente única de navegación.

## Contrato del registry

Cada ruta declara:

| Campo | Uso |
| --- | --- |
| `id`, `hash` | Identidad estable y URL hash compatible con enlaces existentes. |
| `label`, `title`, `description` | Sidebar, topbar y contexto accesible de la vista. |
| `icon` | Iconografía coherente sin depender de nombres dentro del shell. |
| `groupId`, `groupLabel` | Grupos Gestión, Relación, Operación, Gobierno y Runtime. |
| `groupOrder`, `itemOrder` | Orden determinista independiente del render. |
| `badge` | Lectura breve de estado; no reemplaza autorización ni contador autoritativo. |
| `keywords` | Búsqueda por conceptos del dominio y sinónimos de cada ruta. |

El helper del registry produce `SidebarItem[]` con `active` y `onSelect`. Las
rutas históricas `#inicio` y `#modulos` pueden resolverse a Dashboard como
compatibilidad, pero no aparecen como ítems nuevos.

## Composición del shell

`BusinessOpsShellTemplate` se configura con:

- logo y título `PYROSA CRM`;
- versión, ambiente demo/pilot y branch obtenidos del bootstrap o del contrato;
- `sidebarPersistKey="pyrosa-democrm"` exclusivo de DemoCRM;
- `contentScrollPersistKey={`democrm-${activeRoute}`}` separado por ruta;
- título y descripción de la metadata activa;
- `navigationBack` desde cualquier vista secundaria hacia Dashboard;
- tema, alertas y usuario solo cuando exista una acción real;
- `UserDrawer` como única capa de cuenta.

No se representan botones vacíos. Las acciones de tema o alertas solo se
habilitan con estado y comportamiento explícitos. El logout queda en
`UserDrawer` y usa `/logout`.

## Dashboard analítico

Dashboard es una lectura ejecutiva, no una bandeja operativa. No renderiza
`DataTable`, filtros de inventario ni acciones mutantes. Su raíz expone
`data-dashboard-kind="analytic"` para que el guard de adopción verifique esta
decisión sin depender de textos visibles.

### Score ejecutivo

El encabezado resume readiness demo, cuentas, contactos, oportunidades,
actividades y runtime con señales derivadas del bootstrap y los contratos ya
cargados. Los valores contract-first deben conservar una etiqueta visible que
evite interpretarlos como datos productivos.

### Dominios de lectura

| Dominio | Lectura |
| --- | --- |
| Relación comercial | Cuentas y contactos disponibles para inspección. |
| Pipeline | Oportunidades y estado del forecast contract-first. |
| Actividad | Seguimientos y tareas visibles. |
| Reportes | Datasets analíticos preparados, todavía sin consultas productivas. |
| Gobierno | Integraciones, configuración, marca y límites de mutación. |

Las vistas Cuentas, Contactos, Oportunidades, Actividades y Reportes continúan
siendo los destinos operativos. Cuentas permanece como primer canario
read-only.

## UserDrawer y fronteras de identidad

El drawer mapea la respuesta de sesión a `UserDrawerUser` y construye secciones
de cuenta, preferencias y alcance CRM.

| Información o acción | Propietario | Tratamiento en DemoCRM |
| --- | --- | --- |
| Nombre, email, rol y estado de sesión | IAM/Accounts | Lectura en memoria durante la sesión; no se replica en tablas CRM. |
| Perfil | Accounts | Enlace a la fachada de autoservicio. |
| Preferencias | Accounts y estado visual compartido | Enlace a Accounts; solo la preferencia estrictamente visual puede vivir en storage del navegador. |
| Contraseña y MFA | Accounts como fachada, IAM como autoridad | Enlaces de autoservicio; DemoCRM no captura secretos ni factores. |
| Sesiones | Accounts como fachada, IAM como autoridad | Enlace de consulta/revocación fuera de CRM. |
| Alcance DemoCRM | Contratos CRM | Lectura de ambiente, branch, estado demo y prohibición de mutaciones. |
| Logout | IAM/session gateway | Navegación a `/logout`; no borra autoridad local inexistente. |

Solo puede existir una capa lateral abierta. Al abrir `UserDrawer` se cierra
cualquier detalle; al abrir un detalle se cierra el drawer de usuario. `Escape`
cierra primero la capa superior y solo después aplica el regreso lógico de
navegación. Esto evita overlays y pérdida accidental de contexto.

## Teclado y navegación

- `Escape` cierra primero `UserDrawer` o `DetailDrawer`.
- Sin capas abiertas, `Escape` y el botón de regreso usan la misma ruta lógica
  hacia Dashboard.
- Una interacción dentro de `input`, `textarea`, `select` o contenido editable
  no dispara navegación global.
- El cambio de hash conserva las URLs existentes y actualiza metadata, sidebar
  y contenido de forma atómica.
- El sidebar mantiene búsqueda y orden de grupos mediante `SidebarItem[]`.

## Matriz keep, shim, cleanup y blocker

| Clase | Incluye | Regla de evolución |
| --- | --- | --- |
| `keep` | Layouts y detalles de cuentas, contactos, oportunidades, actividades, reportes, marca y runtime. | Se conserva mientras represente semántica CRM y no duplique una primitiva compartida. |
| `shim` | Reset mínimo de página y adaptadores de espaciado/responsive. | Debe ser pequeño, explícito y candidato a retiro cuando el paquete compartido lo cubra. |
| `cleanup` | Overrides del sidebar, marca local de shell, resumen local de sesión y logout duplicado. | Se retira en la convergencia y no debe reintroducirse. |
| `blocker` | Overrides locales de internals `.py-*`, auth local, autoridad IAM persistida o Dashboard con tabla operativa. | Bloquea la promoción y exige corrección antes del cierre. |

## Rollback

La convergencia no agrega DDL ni transforma datos. El rollback es de código y
puede ejecutarse como una reversión atómica del commit de cierre.

1. Declarar el runtime en mantenimiento si el defecto impide navegar o cerrar
   sesión.
2. Revertir el commit de convergencia completo; no restaurar selectores
   `.py-*` de manera parcial.
3. Ejecutar `npm --prefix ui run typecheck` y
   `npm --prefix ui run build`.
4. Reiniciar el runtime mediante el mecanismo operativo vigente y verificar
   `GET /__pyrosa_crm_health`.
5. Ejecutar el smoke visual contra Dashboard y Cuentas antes de retirar
   mantenimiento.
6. Mantener el estado `pilot` y registrar el motivo. No cambiar contratos de
   IAM, Accounts ni datos CRM durante este rollback.

Si solo falla un escenario de screenshot sin regresión funcional, no se
revierte automáticamente: se conserva el runtime, se bloquea la promoción y se
compara el manifiesto de QA con la última evidencia aceptada.

## Criterios de promoción

El shell puede operar como `pilot` cuando typecheck, build, health y QA visual
pasan. La promoción a `ready` requiere además sustituir las dependencias
`file:` por paquetes publicados e inmutables, repetir QA sobre ese artefacto y
completar el checklist de identidad productiva `pyrosa-crm`.

El próximo corte de dominio —diccionarios, persistencia y endpoints reales
para cuentas, contactos, oportunidades y actividades— queda como handoff de
producto. No bloquea este cierre visual ni autoriza mutaciones contract-first.
