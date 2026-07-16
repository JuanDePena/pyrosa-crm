#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createReleaseManifest,
  loadAndVerifyReleaseManifest,
  readGitReleaseMetadata,
  writeReleaseManifest
} from "./lib/release-manifest.mjs";

const uiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(uiRoot, "..");
const packageJson = JSON.parse(readFileSync(resolve(uiRoot, "package.json"), "utf8"));
const releaseConfig = packageJson.pyrosaRelease ?? {};
const git = readGitReleaseMetadata(repoRoot);
const manifestPath = resolve(uiRoot, "build/release-manifest.json");
const manifest = createReleaseManifest({
  uiRoot,
  version: process.env.PYROSA_CRM_RELEASE_VERSION ?? releaseConfig.version,
  commit: git.commit,
  branch: process.env.PYROSA_CRM_RELEASE_BRANCH ?? git.branch,
  sourceDirty: git.sourceDirty
});

writeReleaseManifest(manifestPath, manifest);
const verified = loadAndVerifyReleaseManifest({ uiRoot, manifestPath });
console.log(JSON.stringify({
  ok: true,
  releaseId: verified.releaseId,
  version: verified.version,
  commit: verified.commit,
  sourceDirty: verified.sourceDirty,
  manifestSha256: verified.manifestSha256,
  clientSha256: verified.client.sha256,
  serverSha256: verified.server.sha256
}));
