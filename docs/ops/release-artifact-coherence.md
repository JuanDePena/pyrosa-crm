# Coherencia De Artefacto Frontend Y BFF

Fecha: `2026-07-15`

Estado: `control implementado en source; promocion runtime pendiente`

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

## Health Y Bootstrap

`GET /__pyrosa_crm_health` publica datos no secretos de provenance:

- `releaseId` y `commit` en el nivel superior;
- version, branch, estado de fuente y hashes de cliente/BFF en `release`;
- `artifact.ok` o el codigo de inconsistencia.

El health solo responde `200` cuando DB y artefacto estan sanos. El bootstrap
autenticado publica `app.releaseId` y `app.commit` para que soporte pueda
correlacionar la UI con el runtime sin exponer cookies ni secretos.

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
