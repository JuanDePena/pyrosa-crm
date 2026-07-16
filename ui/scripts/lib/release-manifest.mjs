import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const schemaVersion = 1;
const application = "pyrosa-democrm";
const clientRoot = "dist";
const serverRoot = "build/server";
const serverEntry = "index.js";
const launcherFiles = ["scripts/lib/release-manifest.mjs", "server.mjs"];

export function readGitReleaseMetadata(repoRoot) {
  const commit = git(repoRoot, ["rev-parse", "HEAD"]);
  const branch = git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const status = git(repoRoot, ["status", "--porcelain", "--untracked-files=normal"]);
  return {
    branch,
    commit,
    sourceDirty: status.length > 0
  };
}

export function createReleaseManifest({
  uiRoot,
  version,
  commit,
  branch,
  sourceDirty,
  generatedAt = new Date().toISOString()
}) {
  const normalizedVersion = requiredText(version, "version");
  const normalizedCommit = requiredText(commit, "commit").toLowerCase();
  if (!/^[a-f0-9]{40}$/u.test(normalizedCommit)) {
    throw artifactError("crm.artifact.commit_invalid", "El commit del release debe ser un SHA Git completo.");
  }

  const client = describeTree(resolve(uiRoot, clientRoot), clientRoot);
  const server = {
    ...describeTree(resolve(uiRoot, serverRoot), serverRoot),
    entry: serverEntry
  };
  if (!Object.hasOwn(server.files, serverEntry)) {
    throw artifactError("crm.artifact.server_entry_missing", "El entrypoint BFF no existe dentro del artefacto compilado.");
  }
  const launcher = describeSelectedFiles(resolve(uiRoot), ".", launcherFiles);
  const aggregateSha256 = sha256(
    [client.sha256, server.sha256, launcher.sha256].join("\n")
  );
  const releaseId = buildReleaseId(normalizedVersion, normalizedCommit, aggregateSha256);

  return {
    schemaVersion,
    application,
    releaseId,
    version: normalizedVersion,
    commit: normalizedCommit,
    branch: requiredText(branch, "branch"),
    sourceDirty: sourceDirty === true,
    generatedAt,
    aggregateSha256,
    artifacts: {
      client,
      server,
      launcher
    }
  };
}

export function writeReleaseManifest(manifestPath, manifest) {
  const absolutePath = resolve(manifestPath);
  const temporaryPath = `${absolutePath}.tmp-${process.pid}`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
    renameSync(temporaryPath, absolutePath);
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
}

export function loadAndVerifyReleaseManifest({ uiRoot, manifestPath }) {
  const absoluteManifestPath = resolve(manifestPath);
  let raw;
  let manifest;
  try {
    raw = readFileSync(absoluteManifestPath);
    manifest = JSON.parse(raw.toString("utf8"));
  } catch {
    throw artifactError("crm.artifact.manifest_unreadable", "El manifiesto de release no existe o no es JSON valido.");
  }

  validateManifestShape(manifest);
  const client = describeTree(resolve(uiRoot, clientRoot), clientRoot);
  const server = {
    ...describeTree(resolve(uiRoot, serverRoot), serverRoot),
    entry: serverEntry
  };
  const launcher = describeSelectedFiles(resolve(uiRoot), ".", launcherFiles);
  assertArtifactMatches("client", manifest.artifacts.client, client);
  assertArtifactMatches("server", manifest.artifacts.server, server);
  assertArtifactMatches("launcher", manifest.artifacts.launcher, launcher);

  const aggregateSha256 = sha256(
    [client.sha256, server.sha256, launcher.sha256].join("\n")
  );
  if (manifest.aggregateSha256 !== aggregateSha256) {
    throw artifactError("crm.artifact.aggregate_mismatch", "El hash agregado del release no coincide con sus artefactos.");
  }
  const expectedReleaseId = buildReleaseId(manifest.version, manifest.commit, aggregateSha256);
  if (manifest.releaseId !== expectedReleaseId) {
    throw artifactError("crm.artifact.release_id_mismatch", "El releaseId no corresponde al commit y los artefactos declarados.");
  }

  return {
    schemaVersion: manifest.schemaVersion,
    application: manifest.application,
    releaseId: manifest.releaseId,
    version: manifest.version,
    commit: manifest.commit,
    branch: manifest.branch,
    sourceDirty: manifest.sourceDirty,
    generatedAt: manifest.generatedAt,
    aggregateSha256,
    manifestPath: absoluteManifestPath,
    manifestSha256: sha256(raw),
    client: runtimeArtifact(resolve(uiRoot), client),
    server: {
      ...runtimeArtifact(resolve(uiRoot), server),
      entry: server.entry,
      entryPath: resolve(uiRoot, server.root, server.entry)
    },
    launcher: runtimeArtifact(resolve(uiRoot), launcher)
  };
}

export function artifactError(code, message) {
  const error = new Error(message);
  error.name = "CrmArtifactError";
  error.code = code;
  return error;
}

function validateManifestShape(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw artifactError("crm.artifact.manifest_invalid", "El manifiesto de release no tiene un objeto raiz valido.");
  }
  if (manifest.schemaVersion !== schemaVersion || manifest.application !== application) {
    throw artifactError("crm.artifact.manifest_contract_invalid", "El manifiesto no corresponde al contrato DemoCRM soportado.");
  }
  if (!/^[a-f0-9]{40}$/u.test(String(manifest.commit ?? ""))) {
    throw artifactError("crm.artifact.commit_invalid", "El manifiesto no declara un commit Git valido.");
  }
  for (const field of ["releaseId", "version", "branch", "generatedAt", "aggregateSha256"]) {
    requiredText(manifest[field], field);
  }
  if (typeof manifest.sourceDirty !== "boolean") {
    throw artifactError("crm.artifact.source_state_invalid", "El manifiesto no declara el estado de la fuente.");
  }
  if (!manifest.artifacts || typeof manifest.artifacts !== "object") {
    throw artifactError("crm.artifact.manifest_invalid", "El manifiesto no declara los artefactos requeridos.");
  }
  if (manifest.artifacts.client?.root !== clientRoot) {
    throw artifactError("crm.artifact.client_root_invalid", "El root del cliente no coincide con el contrato de release.");
  }
  if (manifest.artifacts.server?.root !== serverRoot || manifest.artifacts.server?.entry !== serverEntry) {
    throw artifactError("crm.artifact.server_root_invalid", "El root o entrypoint del BFF no coincide con el contrato de release.");
  }
  if (manifest.artifacts.launcher?.root !== ".") {
    throw artifactError("crm.artifact.launcher_root_invalid", "El root del launcher no coincide con el contrato de release.");
  }
}

function describeTree(root, manifestRoot) {
  if (!existsSync(root) || !lstatSync(root).isDirectory()) {
    throw artifactError("crm.artifact.root_missing", `Falta el root requerido del artefacto ${manifestRoot}.`);
  }
  return describeFiles(root, manifestRoot, listFiles(root));
}

function describeSelectedFiles(root, manifestRoot, paths) {
  for (const path of paths) {
    const absolutePath = resolve(root, path);
    if (!isInside(root, absolutePath) || !existsSync(absolutePath) || !lstatSync(absolutePath).isFile()) {
      throw artifactError("crm.artifact.launcher_missing", "Falta un archivo requerido del launcher DemoCRM.");
    }
  }
  return describeFiles(root, manifestRoot, [...paths].sort());
}

function describeFiles(root, manifestRoot, paths) {
  const files = {};
  let bytes = 0;
  for (const relativePath of paths) {
    const absolutePath = resolve(root, relativePath);
    const content = readFileSync(absolutePath);
    files[toPosix(relativePath)] = {
      sha256: sha256(content),
      size: content.byteLength
    };
    bytes += content.byteLength;
  }
  return {
    root: manifestRoot,
    fileCount: paths.length,
    bytes,
    sha256: artifactDigest(files),
    files
  };
}

function listFiles(root, current = root) {
  const paths = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const absolutePath = join(current, entry.name);
    if (entry.isSymbolicLink()) {
      throw artifactError("crm.artifact.symlink_rejected", "Los artefactos de release no admiten enlaces simbolicos.");
    }
    if (entry.isDirectory()) {
      paths.push(...listFiles(root, absolutePath));
      continue;
    }
    if (!entry.isFile()) {
      throw artifactError("crm.artifact.file_type_rejected", "El artefacto contiene un tipo de archivo no soportado.");
    }
    paths.push(toPosix(relative(root, absolutePath)));
  }
  return paths.sort();
}

function assertArtifactMatches(name, declared, observed) {
  if (!declared || typeof declared !== "object") {
    throw artifactError(`crm.artifact.${name}_missing`, `El manifiesto no declara el artefacto ${name}.`);
  }
  if (JSON.stringify(declared) !== JSON.stringify(observed)) {
    throw artifactError(`crm.artifact.${name}_mismatch`, `El artefacto ${name} no coincide con el manifiesto de release.`);
  }
}

function runtimeArtifact(uiRoot, artifact) {
  return {
    ...artifact,
    rootPath: resolve(uiRoot, artifact.root)
  };
}

function artifactDigest(files) {
  const canonical = Object.entries(files)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, metadata]) => `${metadata.sha256} ${metadata.size} ${path}\n`)
    .join("");
  return sha256(canonical);
}

function buildReleaseId(version, commit, aggregateSha256) {
  const safeVersion = String(version).replace(/[^A-Za-z0-9._-]+/gu, "-");
  return `${application}/${safeVersion}/${commit.slice(0, 12)}/${aggregateSha256.slice(0, 16)}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function requiredText(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw artifactError("crm.artifact.manifest_invalid", `El campo ${field} es requerido en el manifiesto.`);
  }
  return normalized;
}

function git(repoRoot, args) {
  try {
    return execFileSync("git", ["-C", repoRoot, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch {
    throw artifactError("crm.artifact.git_metadata_unavailable", "No fue posible resolver la metadata Git del release.");
  }
}

function isInside(root, candidate) {
  const normalizedRoot = `${resolve(root)}${sep}`;
  return resolve(candidate).startsWith(normalizedRoot);
}

function toPosix(path) {
  return path.split(sep).join("/");
}
