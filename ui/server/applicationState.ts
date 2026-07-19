import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  InternalErrorLanding,
  type InternalErrorPresentation
} from "@pyrosa/ui-templates";
import type { CrmServerConfig } from "./config.js";

export type CrmStandaloneLandingDocument = {
  csp: string;
  html: string;
};

export type CrmStandaloneLandingRenderer = {
  renderInternalError(model: InternalErrorPresentation): CrmStandaloneLandingDocument;
};

export function createCrmStandaloneLandingRenderer(
  config: Pick<CrmServerConfig, "distDir">
): CrmStandaloneLandingRenderer {
  const styles = loadSharedLandingStyles();
  const logoDataUrl = loadVerifiedLogoDataUrl(config.distDir);

  return {
    renderInternalError(model) {
      const nonce = randomBytes(18).toString("base64");
      const markup = renderToStaticMarkup(
        createElement(InternalErrorLanding, {
          logo: logoDataUrl
            ? createElement("img", { alt: "", src: logoDataUrl })
            : undefined,
          model
        })
      );
      const title = escapeHtml(`${model.appName || "PYROSA CRM"} — ${model.title || "No disponible"}`);
      const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${title}</title>
  <style nonce="${nonce}">${escapeStyle(styles)}
html,body{margin:0;min-height:100%;}body{background:#edf2f7;}</style>
</head>
<body>
${markup}
<script nonce="${nonce}">${standaloneLandingScript}</script>
</body>
</html>`;

      return {
        html,
        csp: [
          "default-src 'none'",
          "base-uri 'none'",
          "connect-src 'none'",
          "form-action 'self'",
          "frame-ancestors 'none'",
          "img-src data:",
          `script-src 'nonce-${nonce}'`,
          `style-src 'nonce-${nonce}'`
        ].join("; ")
      };
    }
  };
}

function loadSharedLandingStyles(): string {
  return [
    "@pyrosa/ui/styles.css",
    "@pyrosa/ui-layouts/styles.css",
    "@pyrosa/ui-templates/styles.css"
  ].map((specifier) => readFileSync(fileURLToPath(import.meta.resolve(specifier)), "utf8")).join("\n");
}

function loadVerifiedLogoDataUrl(distDir: string): string | undefined {
  try {
    const content = readFileSync(join(distDir, "public/assets/brand/crm-logo.png"));
    return `data:image/png;base64,${content.toString("base64")}`;
  } catch {
    return undefined;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character] ?? character);
}

function escapeStyle(value: string): string {
  return value.replace(/<\/style/giu, "<\\/style");
}

const standaloneLandingScript = `(()=>{
  const heading=document.querySelector('.py-application-state-landing__heading h1');
  if(heading instanceof HTMLElement) heading.focus();
  const button=document.querySelector('.py-application-state-landing__details-copy');
  if(!(button instanceof HTMLButtonElement)) return;
  button.addEventListener('click',async()=>{
    const rows=[...document.querySelectorAll('.py-application-state-landing__details dl>div')]
      .map((row)=>{
        const label=row.querySelector('dt')?.textContent?.trim()||'';
        const value=row.querySelector('dd')?.textContent?.trim()||'';
        return label&&value?label+': '+value:'';
      }).filter(Boolean);
    const summary=document.querySelector('.py-application-state-landing__details summary')?.textContent?.trim()||'Detalle técnico';
    const text=[summary,...rows].join('\\n');
    try{
      if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);}else{
        const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';
        document.body.append(area);area.select();if(!document.execCommand('copy'))throw new Error('copy');area.remove();
      }
      button.dataset.copyState='copied';button.setAttribute('aria-label','Detalle técnico copiado');
    }catch{button.dataset.copyState='error';}
  });
})();`;
