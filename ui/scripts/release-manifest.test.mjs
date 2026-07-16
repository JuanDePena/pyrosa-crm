import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import {
  createReleaseManifest,
  loadAndVerifyReleaseManifest,
  writeReleaseManifest
} from "./lib/release-manifest.mjs";

const commit = "0123456789abcdef0123456789abcdef01234567";

test("release manifest binds client, BFF and launcher to one release id", () => {
  withFixture(({ uiRoot, manifestPath }) => {
    const manifest = createReleaseManifest({
      uiRoot,
      version: "v2607",
      commit,
      branch: "main",
      sourceDirty: false,
      generatedAt: "2026-07-15T00:00:00.000Z"
    });
    writeReleaseManifest(manifestPath, manifest);
    const verified = loadAndVerifyReleaseManifest({ uiRoot, manifestPath });

    assert.match(verified.releaseId, /^pyrosa-democrm\/v2607\/0123456789ab\/[a-f0-9]{16}$/u);
    assert.equal(verified.commit, commit);
    assert.equal(verified.sourceDirty, false);
    assert.equal(verified.client.fileCount, 2);
    assert.equal(verified.server.entry, "index.js");
    assert.match(verified.manifestSha256, /^[a-f0-9]{64}$/u);
  });
});

for (const [label, path, code] of [
  ["client mutation", "dist/index.html", "crm.artifact.client_mismatch"],
  ["BFF mutation", "build/server/index.js", "crm.artifact.server_mismatch"],
  ["launcher mutation", "server.mjs", "crm.artifact.launcher_mismatch"]
]) {
  test(`release verification rejects ${label}`, () => {
    withFixture(({ uiRoot, manifestPath }) => {
      const manifest = createReleaseManifest({
        uiRoot,
        version: "v2607",
        commit,
        branch: "main",
        sourceDirty: false
      });
      writeReleaseManifest(manifestPath, manifest);
      writeFileSync(resolve(uiRoot, path), "tampered\n");
      assert.throws(
        () => loadAndVerifyReleaseManifest({ uiRoot, manifestPath }),
        (error) => error?.code === code
      );
    });
  });
}

test("release verification rejects undeclared client files", () => {
  withFixture(({ uiRoot, manifestPath }) => {
    const manifest = createReleaseManifest({
      uiRoot,
      version: "v2607",
      commit,
      branch: "main",
      sourceDirty: false
    });
    writeReleaseManifest(manifestPath, manifest);
    writeFileSync(resolve(uiRoot, "dist/assets/unexpected.js"), "unexpected\n");
    assert.throws(
      () => loadAndVerifyReleaseManifest({ uiRoot, manifestPath }),
      (error) => error?.code === "crm.artifact.client_mismatch"
    );
  });
});

function withFixture(run) {
  const uiRoot = mkdtempSync(resolve(tmpdir(), "pyrosa-crm-release-"));
  const manifestPath = resolve(uiRoot, "build/release-manifest.json");
  try {
    mkdirSync(resolve(uiRoot, "dist/assets"), { recursive: true });
    mkdirSync(resolve(uiRoot, "build/server"), { recursive: true });
    mkdirSync(resolve(uiRoot, "scripts/lib"), { recursive: true });
    writeFileSync(resolve(uiRoot, "dist/index.html"), "<main>CRM</main>\n");
    writeFileSync(resolve(uiRoot, "dist/assets/app.js"), "export const app = true;\n");
    writeFileSync(resolve(uiRoot, "build/server/index.js"), "export function startServer() {}\n");
    writeFileSync(resolve(uiRoot, "server.mjs"), "export const launcher = true;\n");
    writeFileSync(resolve(uiRoot, "scripts/lib/release-manifest.mjs"), "export const verifier = true;\n");
    run({ uiRoot, manifestPath });
  } finally {
    rmSync(uiRoot, { recursive: true, force: true });
  }
}
