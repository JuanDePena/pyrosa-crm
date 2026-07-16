# Evidencia Saneada Del Canario Owner DemoCRM V2607

Fecha UTC: `2026-07-16`

Estado: `owner E2E 3/3 verde; expansion general bloqueada por SLO Store`

## Alcance

Esta evidencia registra el canario interno de `pyrosa-democrm` para tenant `1`
y la capability de lectura `crm.cases.read`. No usa el workbook VOIX, datos de
pacientes, fixtures de cliente ni PII. No conserva subject, email, tokens,
cookies, secrets, DSN, decision ids ni payloads completos.

## Prerequisitos Observados

| Plano | Resultado saneado |
| --- | --- |
| Platform | adopcion y readiness ready; diccionario global `2.0.0` y tenant-aware `2.0.1` |
| Store | saga terminal y entitlement `effective` |
| Directory | asiento activo con capacidad `1/1` |
| IAM | bindings `tenant_admin` y `billing_admin` frescos |
| OAuth owner | carriles de Directory, Store y Platform habilitados con clients/audiences/scopes exactos |
| DemoCRM runtime | v2607, frontend/BFF coherentes y health con artefacto valido |

## Correccion De Sesion

La landing fatal permitio observar de forma segura
`crm.bootstrap.csrf_missing`; no activo datos locales ni una vista de respaldo.
La correccion conserva en la sesion firmada privada el issuer y subject
canonicos recibidos desde IAM y mantiene el CSRF same-origin.

Controles verificados en source/tests:

- el subject browser no se fabrica desde `user.id`;
- CRM acepta un identificador opaco de `1..200` caracteres con alfabeto
  `A-Za-z0-9._~-`;
- issuer distinto, subject vacio/padded/invalido y cookie legacy sin identidad
  canonica fallan cerrados;
- session/bootstrap redactan issuer y subject;
- el detalle publico conserva solo el codigo tecnico saneado.

Durante el smoke, Store detecto que su contrato exigia historicamente un
subject de longitud minima `3`. El owner fue corregido para aceptar subjects
opacos `1..256`, paso `83` pruebas con `1` skip esperado, publico el commit
`a1a3537` y reinicio su runtime. No se amplio el alfabeto ni se introdujo un
fallback.

## Resultado Owner E2E

El smoke uso la identidad real de la asignacion activa sin imprimirla. CRM
compuso las tres decisiones con el mismo tenant, aplicacion, capability y
correlacion:

| Resultado | Valor |
| --- | --- |
| decisiones owner | Directory + Store + Platform `3/3 allow` |
| tenant | `1` |
| tenant key | `8ef427da9f0e` |
| schema | `pyrosa_democrm_8ef427da9f0e` |
| dictionary | `2.0.1` |
| profile | `core` |
| capability | `crm.cases.read` presente |

El schema termina en el tenant key devuelto por Directory y coincide con el
target ready de Platform. Store autorizo el mismo tenant/app/capability con el
entitlement efectivo. No hubo reinterpretacion de bearer, cookie, header ni
identidad local.

## Limite De Promocion

El subgate owner del tenant interno queda verde. No equivale a:

- promocion de una cohorte general;
- habilitacion del resource server bearer entrante;
- workshop o import del XLSX VOIX;
- autorizacion de PII;
- promocion hacia `crm.pyrosa.com.do`.

El SLO historico de Store en su ventana movil de 24 horas permanece
`critical`; `/canaryz` responde `503` aunque la saga actual sea terminal. Es el
gate transversal pendiente para ampliar la cohorte. Se conserva el dato tal
como fue observado; no se reduce la ventana ni se reclasifica el estado para
forzar readiness.

## Siguiente Criterio

Antes de expandir se exige que el SLO movil de Store salga de `critical`,
`/canaryz` recupere readiness y se completen los gates funcionales, de
privacidad, backup/restore y rollback descritos en el
[runbook de promocion](../ops/democrm-v2607-promotion.md).
