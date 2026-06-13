#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const appRoot = dirname(fileURLToPath(import.meta.url));
const serverEntry = resolve(
  process.env.PYROSA_CRM_UI_SERVER_ENTRY || resolve(appRoot, "build/server/index.js")
);

if (!existsSync(serverEntry)) {
  console.error(`PYROSA CRM server runtime not found at ${serverEntry}. Run npm --prefix ui run build first.`);
  process.exit(1);
}

const runtime = await import(pathToFileURL(serverEntry).href);

if (typeof runtime.startServer !== "function") {
  console.error(`PYROSA CRM server runtime at ${serverEntry} does not export startServer().`);
  process.exit(1);
}

runtime.startServer();
