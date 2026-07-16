#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadAndVerifyReleaseManifest } from "./scripts/lib/release-manifest.mjs";

const appRoot = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(
  process.env.PYROSA_CRM_RELEASE_MANIFEST || resolve(appRoot, "build/release-manifest.json")
);
let release;
try {
  release = loadAndVerifyReleaseManifest({ uiRoot: appRoot, manifestPath });
} catch (error) {
  const code = typeof error?.code === "string" ? error.code : "crm.artifact.verification_failed";
  console.error(`PYROSA CRM release verification failed: ${code}.`);
  process.exit(1);
}

const serverEntry = release.server.entryPath;
const configuredServerEntry = String(process.env.PYROSA_CRM_UI_SERVER_ENTRY ?? "").trim();
if (configuredServerEntry && resolve(appRoot, configuredServerEntry) !== serverEntry) {
  console.error("PYROSA CRM server entry does not belong to the verified release.");
  process.exit(1);
}

if (!existsSync(serverEntry)) {
  console.error("PYROSA CRM verified server runtime is not available. Run npm --prefix ui run build first.");
  process.exit(1);
}

const runtime = await import(pathToFileURL(serverEntry).href);

if (typeof runtime.startServer !== "function") {
  console.error(`PYROSA CRM server runtime at ${serverEntry} does not export startServer().`);
  process.exit(1);
}

runtime.startServer(release);
