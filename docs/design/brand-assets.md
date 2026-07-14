# Brand Assets

Este documento fija el contrato tecnico de marca para `PYROSA CRM` y mantiene
la misma convencion usada por las demas apps del ecosistema Pyrosa.

## Gobierno transversal

Las reglas de canvas, derivados, manifests y procedencia compartidas viven en
[Gobierno de marca Pyrosa](https://github.com/JuanDePena/pyrosa-docs/blob/main/design/brand-governance.md).
Este documento conserva unicamente los assets, paths, fallback y comandos
propios de CRM.

## Contrato activo

- Logo master cuadrado: `ui/public/public/assets/brand/crm-logo.png`
- Canvas master: `1024x1024`
- App icons:
  - `crm-logo-android-chrome-192x192.png`
  - `crm-logo-android-chrome-512x512.png`
  - `crm-logo-apple-touch-icon.png`
- Favicons PNG:
  - `crm-logo-favicon-16x16.png`
  - `crm-logo-favicon-32x32.png`
- Favicon ICO: `ui/public/public/favicon.ico`
- Manifest: `ui/public/public/site.webmanifest`

## Regla visual

El simbolo debe vivir centrado dentro de un canvas cuadrado transparente. La
figura interna debe conservar un margen seguro consistente para que el logo se
vea equilibrado en sidebar, header, README, pestañas de navegador, touch icons
y PWA manifest.

El master CRM se sirve en la shell desde
`/public/assets/brand/crm-logo.png`. Si el asset no existe, la UI conserva el
fallback textual `PC`.

## Reglas de mantenimiento

- No usar masters rectangulares como `*-logo.png` activo.
- No versionar favicons generados desde fuentes distintas al master activo.
- Regenerar `16`, `32`, `180`, `192`, `512` y `favicon.ico` en el mismo corte.
- Mantener `site.webmanifest` apuntando solo a los derivados activos.
- Documentar cualquier excepcion antes de cambiar el encuadre o la familia de
  assets.
- En la shell actual, el sidebar usa el logo dentro del header de 72px; el
  asset debe verse balanceado tambien en esa escala.

## Regeneracion

Las variantes se generan desde consola a partir del master:

```bash
brand_dir="ui/public/public/assets/brand"
master="$brand_dir/crm-logo.png"
magick "$master" -strip -resize 16x16 "$brand_dir/crm-logo-favicon-16x16.png"
magick "$master" -strip -resize 32x32 "$brand_dir/crm-logo-favicon-32x32.png"
magick "$master" -strip -resize 180x180 "$brand_dir/crm-logo-apple-touch-icon.png"
magick "$master" -strip -resize 192x192 "$brand_dir/crm-logo-android-chrome-192x192.png"
magick "$master" -strip -resize 512x512 "$brand_dir/crm-logo-android-chrome-512x512.png"
magick "$master" -define icon:auto-resize=64,48,32,16 "ui/public/public/favicon.ico"
```
