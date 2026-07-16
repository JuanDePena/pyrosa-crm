import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { CrmServerConfig } from "./config.js";

export type CrmReleaseFile = {
  sha256: string;
  size: number;
};

export type CrmReleaseArtifact = {
  root: string;
  rootPath: string;
  fileCount: number;
  bytes: number;
  sha256: string;
  files: Record<string, CrmReleaseFile>;
};

export type CrmRuntimeRelease = {
  schemaVersion: number;
  application: string;
  releaseId: string;
  version: string;
  commit: string;
  branch: string;
  sourceDirty: boolean;
  generatedAt: string;
  aggregateSha256: string;
  manifestPath: string;
  manifestSha256: string;
  client: CrmReleaseArtifact;
  server: CrmReleaseArtifact & { entry: string; entryPath: string };
  launcher: CrmReleaseArtifact;
};

export type CrmReleaseFreshness =
  | { ok: true }
  | { ok: false; code: string };

export class CrmArtifactConsistencyError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "CrmArtifactConsistencyError";
  }
}

export function assertReleaseMatchesConfig(release: CrmRuntimeRelease, config: CrmServerConfig): void {
  if (release.application !== "pyrosa-democrm" || release.schemaVersion !== 1) {
    throw new CrmArtifactConsistencyError(
      "crm.artifact.contract_invalid",
      "El release no corresponde al contrato DemoCRM soportado."
    );
  }
  if (release.sourceDirty) {
    throw new CrmArtifactConsistencyError(
      "crm.artifact.source_dirty",
      "El runtime no puede iniciar desde un release generado con cambios sin commit."
    );
  }
  if (release.version !== config.version) {
    throw new CrmArtifactConsistencyError(
      "crm.artifact.version_mismatch",
      "La version configurada no coincide con la version del artefacto."
    );
  }
  if (release.branch !== config.branch) {
    throw new CrmArtifactConsistencyError(
      "crm.artifact.branch_mismatch",
      "La rama configurada no coincide con la rama del artefacto."
    );
  }
  if (resolve(release.client.rootPath) !== resolve(config.distDir)) {
    throw new CrmArtifactConsistencyError(
      "crm.artifact.client_root_mismatch",
      "El directorio cliente configurado no pertenece al release verificado."
    );
  }
  assertReleaseFresh(release);
}

export function inspectReleaseFreshness(
  release: CrmRuntimeRelease,
  verifyArtifacts = false
): CrmReleaseFreshness {
  try {
    const observed = sha256(readFileSync(release.manifestPath));
    if (observed !== release.manifestSha256) {
      return { ok: false, code: "crm.artifact.manifest_changed" };
    }
    if (verifyArtifacts) {
      for (const [name, artifact, exactTree] of [
        ["client", release.client, true],
        ["server", release.server, true],
        ["launcher", release.launcher, false]
      ] as const) {
        if (!artifactMatches(artifact, exactTree)) {
          return { ok: false, code: `crm.artifact.${name}_changed` };
        }
      }
    }
    return { ok: true };
  } catch {
    return { ok: false, code: "crm.artifact.manifest_unavailable" };
  }
}

export function assertReleaseFresh(release: CrmRuntimeRelease): void {
  const freshness = inspectReleaseFreshness(release);
  if (!freshness.ok) {
    throw new CrmArtifactConsistencyError(
      freshness.code,
      "El artefacto desplegado cambio despues de iniciar el BFF."
    );
  }
}

export function assertClientArtifactFile(filePath: string, release: CrmRuntimeRelease): void {
  const relativePath = relative(resolve(release.client.rootPath), resolve(filePath)).split("\\").join("/");
  if (!relativePath || relativePath.startsWith("../") || relativePath === "..") {
    throw new CrmArtifactConsistencyError(
      "crm.artifact.client_path_invalid",
      "El archivo solicitado no pertenece al artefacto cliente verificado."
    );
  }
  const expected = release.client.files[relativePath];
  if (!expected) {
    throw new CrmArtifactConsistencyError(
      "crm.artifact.client_file_undeclared",
      "El archivo solicitado no esta declarado en el release cliente."
    );
  }
  let content: Buffer;
  try {
    content = readFileSync(filePath);
  } catch {
    throw new CrmArtifactConsistencyError(
      "crm.artifact.client_file_unavailable",
      "Un archivo declarado del cliente no esta disponible."
    );
  }
  if (content.byteLength !== expected.size || sha256(content) !== expected.sha256) {
    throw new CrmArtifactConsistencyError(
      "crm.artifact.client_file_mismatch",
      "El archivo cliente no coincide con el BFF cargado."
    );
  }
}

export function publicReleaseIdentity(release: CrmRuntimeRelease) {
  return {
    releaseId: release.releaseId,
    version: release.version,
    commit: release.commit,
    branch: release.branch,
    sourceDirty: release.sourceDirty,
    manifestSha256: release.manifestSha256,
    clientSha256: release.client.sha256,
    serverSha256: release.server.sha256
  };
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function artifactMatches(artifact: CrmReleaseArtifact, exactTree: boolean): boolean {
  try {
    const expectedPaths = Object.keys(artifact.files).sort();
    if (exactTree) {
      const observedPaths = listFiles(artifact.rootPath);
      if (
        observedPaths.length !== expectedPaths.length ||
        observedPaths.some((path, index) => path !== expectedPaths[index])
      ) {
        return false;
      }
    }
    return expectedPaths.every((path) => {
      const expected = artifact.files[path];
      if (!expected) return false;
      const content = readFileSync(resolve(artifact.rootPath, path));
      return content.byteLength === expected.size && sha256(content) === expected.sha256;
    });
  } catch {
    return false;
  }
}

function listFiles(root: string, current = root): string[] {
  const paths: string[] = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const absolutePath = join(current, entry.name);
    if (entry.isDirectory()) {
      paths.push(...listFiles(root, absolutePath));
      continue;
    }
    if (!entry.isFile()) {
      return ["__unsupported_file_type__"];
    }
    paths.push(relative(root, absolutePath).split("\\").join("/"));
  }
  return paths.sort();
}
