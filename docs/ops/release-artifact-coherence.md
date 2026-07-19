# Coherencia De Artefacto Frontend Y BFF

Fecha: `2026-07-19`

Estado: `control observado en runtime v2607 canary`

## Invariante

DemoCRM sirve el cliente React y el BFF Node como una sola unidad de release.
Nunca se considera valido un cliente generado por un build y un BFF cargado por
otro. Ante ausencia, alteracion o mezcla de artefactos, el proceso o la
solicitud falla de forma cerrada; no presenta una vista local de respaldo.

## Manifiesto

`npm --prefix ui run build` genera al final
`ui/build/release-manifest.json`. El manifiesto declara:

- aplicacion, version, branch, commit Git completo y estado limpio/sucio;
- `releaseId` derivado del commit y del hash agregado;
- hashes SHA-256, tamanos y archivos exactos de `ui/dist`;
- hashes SHA-256, tamanos, archivos exactos y entrypoint de
  `ui/build/server`;
- hashes del launcher `ui/server.mjs` y del verificador que participa en el
  arranque.

El manifiesto es un artefacto generado e ignorado por Git. Debe viajar junto al
cliente y BFF del mismo release; no se copia ni regenera sobre un artefacto ya
publicado.

## Verificacion Fail-Closed

Antes de importar el BFF, `ui/server.mjs` verifica el manifiesto y todos los
archivos declarados. El servidor tampoco abre el listener cuando:

- el manifiesto falta o fue alterado;
- un archivo falta, sobra o no coincide con su SHA-256;
- el release fue generado desde un worktree sucio;
- `PYROSA_CRM_VERSION` o `PYROSA_CRM_BRANCH` no coincide con el manifiesto;
- el entrypoint configurado apunta fuera del BFF verificado.

Después del arranque, cada solicitud comprueba que el manifiesto sigue siendo
el mismo que cargó el proceso. Cada archivo estático se valida contra su hash
antes de servirse. Por tanto, un build ejecutado mientras el BFF anterior sigue
en memoria produce `503 crm.artifact.inconsistent` en vez de mezclar releases.

### Presentacion Segura Del Fallo

El BFF conserva en memoria, desde su propio arranque verificado, el HTML, CSS y
logo necesarios para renderizar `InternalErrorLanding` de `@pyrosa/ui-templates`
sin depender de la SPA que acaba de declarar inconsistente. El contrato de
negociacion es estricto:

- una navegacion `GET|HEAD` de documento, identificada por
  `Sec-Fetch-Dest: document` o `Accept: text/html`, recibe la landing publica y
  el status real `503`;
- `/api/*`, `/internal/*` y el health conservan JSON machine-safe aunque el
  cliente envie `Accept: text/html`;
- la landing solo publica codigo estable, HTTP, operacion allowlisted,
  `Request ID`, fecha y release abreviado; nunca paths, hashes internos,
  cookies, trazas ni el mensaje crudo de la excepcion;
- el documento usa `Cache-Control: no-store` y CSP por nonce.

Una falla inesperada o una degradacion de introspeccion IAM sigue el mismo
contrato para navegaciones. DemoCRM no conserva una sesion local como respaldo
cuando IAM no puede verificarla; el BFF responde fail-closed y las APIs
mantienen su envelope JSON.

## Health Y Bootstrap

`GET /__pyrosa_crm_health` publica datos no secretos de provenance:

- `releaseId` y `commit` en el nivel superior;
- version, branch, estado de fuente y hashes de cliente/BFF en `release`;
- `artifact.ok` o el codigo de inconsistencia.

El health solo responde `200` cuando DB y artefacto estan sanos. El bootstrap
autenticado publica `app.releaseId` y `app.commit` para que soporte pueda
correlacionar la UI con el runtime sin exponer cookies ni secretos.

## Evidencia Del Canario V2607

El runtime `pyrosa-democrm` ya fue promovido a v2607 como unidad coherente y el
health observo `artifact.ok=true`, source limpio y hashes de cliente/BFF
consistentes. Esta evidencia habilita el canario owner; no constituye una
promocion de `pyrosa-crm` ni de una cohorte general.

La correccion posterior a `crm.bootstrap.csrf_missing` cambia el contrato de
sesion: conserva la identidad IAM real en privado, rechaza cookies legacy y
redacta issuer/subject de session/bootstrap. El smoke terminal con la identidad
de la asignacion activa obtuvo Directory + Store + Platform `3/3 allow`, schema
`pyrosa_democrm_8ef427da9f0e`, diccionario `2.0.1`, perfil `core` y capability
`crm.cases.read`, sin registrar el subject.

Para promocion browser, la correccion debe viajar siempre en un artefacto
construido desde el commit limpio exacto y volver a pasar health antes de abrir
trafico. El smoke owner verde no permite mezclar el BFF corregido con el
cliente/manifiesto v2607 anterior.

El SLO movil `critical` de Store y su `/canaryz=503` no indican incoherencia de
artefacto CRM. Son un gate transversal independiente que impide ampliar la
cohorte aunque el health local de CRM sea sano.

## Build Y Promocion

```bash
npm --prefix ui run test:release-manifest
npm --prefix ui run typecheck
npm --prefix ui run build
```

Un build de desarrollo puede producir `sourceDirty=true` para permitir pruebas
de hashes, pero ese artefacto no inicia en runtime. Para promocion:

1. commit y push del source exacto;
2. build desde worktree limpio con version/branch de destino;
3. verificar pruebas y el manifiesto generado;
4. mover cliente, BFF y manifiesto como una sola unidad;
5. reiniciar el servicio para cargar el release;
6. exigir health con el mismo `releaseId`, commit, version y
   `artifact.ok=true` antes de abrir trafico.
7. para cambios de auth/sesion, renovar una cookie browser y comprobar el
   acceso contra Directory, Store y Platform sin exponer identidad ni secrets.

No se debe ejecutar `npm run build` dentro del checkout montado por un runtime
abierto. El guard evita servir una mezcla, pero durante esa escritura la
aplicacion queda intencionalmente no disponible.

## Rollback

Un rollback valido selecciona un artefacto anterior que ya contenga `dist`,
`build/server` y `build/release-manifest.json`, cambia la unidad completa y
reinicia. No se reconstruye, no se hace checkout sobre el arbol live y no se
copian archivos sueltos.

El control actual protege el checkout bind-mounted. La evolucion recomendada
es empaquetar esa misma unidad en una imagen OCI por commit, fijarla por digest
y conservar al menos el digest anterior para rollback atomico.
