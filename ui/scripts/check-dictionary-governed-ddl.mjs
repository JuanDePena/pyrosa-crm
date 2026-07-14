#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile, realpath } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultPolicyPath = resolve(scriptDir, "dictionary-governed-ddl-enforcement-policy.json");
const sourceExtensions = new Set([".cjs", ".js", ".mjs", ".php", ".py", ".sh", ".sql", ".ts", ".tsx"]);
const excludedDirectoryNames = new Set([
  ".git",
  ".next",
  "build",
  "coverage",
  "dist",
  "docs",
  "node_modules",
  "storage",
  "vendor"
]);
const remediation = "Move the structural change to a versioned Platform dictionary, generate an approved plan, and apply it through the governed migration runner. If this is a pre-existing exception, add one exact path and Git blob with owner, reason, review date, and expiry; wildcards are forbidden.";

const ddlPatterns = [
  {
    id: "object-definition",
    expression: /\b(?:CREATE|ALTER|DROP)\s+(?:(?:OR\s+REPLACE|TEMP(?:ORARY)?|UNLOGGED|UNIQUE|CONCURRENTLY|IF\s+(?:NOT\s+)?EXISTS|DEFINER\s*=\s*[^\s]+)\s+)*(?:DATABASE|SCHEMA|TABLESPACE|TABLE|FOREIGN\s+TABLE|INDEX|TYPE|DOMAIN|SEQUENCE|MATERIALIZED\s+VIEW|VIEW|FUNCTION|PROCEDURE|AGGREGATE|OPERATOR(?:\s+CLASS|\s+FAMILY)?|TRIGGER|EVENT\s+TRIGGER|EVENT|EXTENSION|POLICY|RULE|COLLATION|CONVERSION|CAST|LANGUAGE|TEXT\s+SEARCH\s+(?:CONFIGURATION|DICTIONARY|PARSER|TEMPLATE)|PUBLICATION|SUBSCRIPTION|SERVER|FOREIGN\s+DATA\s+WRAPPER|USER\s+MAPPING|ROLE|USER|GROUP)\b/giu
  },
  {
    id: "truncate",
    expression: /\bTRUNCATE(?:\s+TABLE)?\b/giu
  },
  {
    id: "rename-table",
    expression: /\bRENAME\s+TABLE\b/giu
  },
  {
    id: "object-comment",
    expression: /\bCOMMENT\s+ON\s+(?:DATABASE|SCHEMA|TABLE|COLUMN|INDEX|TYPE|DOMAIN|SEQUENCE|MATERIALIZED\s+VIEW|VIEW|FUNCTION|PROCEDURE|TRIGGER|EXTENSION|POLICY|ROLE)\b/giu
  },
  {
    id: "security-label",
    expression: /\bSECURITY\s+LABEL\s+ON\b/giu
  },
  {
    id: "default-privileges",
    expression: /\bALTER\s+DEFAULT\s+PRIVILEGES\b/giu
  },
  {
    id: "grant",
    expression: /\bGRANT\s+[\s\S]{1,500}?\s+(?:ON\s+[\s\S]{1,300}?\s+)?TO\s+(?:PUBLIC|CURRENT_USER|SESSION_USER|[A-Za-z_][\w$.-]*)\b/giu
  },
  {
    id: "revoke",
    expression: /\bREVOKE\s+[\s\S]{1,500}?\s+(?:ON\s+[\s\S]{1,300}?\s+)?FROM\s+(?:PUBLIC|CURRENT_USER|SESSION_USER|[A-Za-z_][\w$.-]*)\b/giu
  },
  {
    id: "role-context",
    expression: /\b(?:SET\s+(?:LOCAL\s+)?ROLE(?!\s*=)|RESET\s+ROLE|SET\s+SESSION\s+AUTHORIZATION|RESET\s+SESSION\s+AUTHORIZATION)\b/giu
  },
  {
    id: "owned-objects",
    expression: /\b(?:REASSIGN|DROP)\s+OWNED\b/giu
  }
];

export async function checkDictionaryGovernedDdl(options) {
  const workspace = await realpath(resolve(options.workspace));
  const policyPath = resolve(options.policyPath ?? defaultPolicyPath);
  const policy = await loadPolicy(policyPath);
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  validateDate(today, "today");

  const repository = policy.repositories.find((candidate) => candidate.slug === options.repoSlug);
  if (!repository) {
    throw new PolicyError(`Unknown repo slug ${options.repoSlug}. Configure it explicitly in ${displayPath(policyPath)}.`);
  }

  const entries = policy.entries.filter((entry) => entry.repo === options.repoSlug);
  const entriesByPath = new Map(entries.map((entry) => [entry.path, entry]));
  const files = await listScannableFiles(workspace);
  const findings = [];
  const blobsByPath = new Map();

  for (const absolutePath of files) {
    const repoPath = normalizePath(relative(workspace, absolutePath));
    const content = await readFile(absolutePath);
    const text = content.toString("utf8");
    const matches = findDdlMatches(text);
    if (matches.length === 0) continue;
    const gitBlob = gitBlobSha1(content);
    blobsByPath.set(repoPath, gitBlob);
    findings.push({ gitBlob, matches, path: repoPath });
  }

  const violations = [];
  const warnings = [];
  for (const finding of findings) {
    const entry = entriesByPath.get(finding.path);
    if (!entry) {
      for (const match of finding.matches) {
        violations.push(findingViolation("UNAUTHORIZED_DDL", finding, match, remediation));
      }
      continue;
    }
    if (entry.gitBlob !== finding.gitBlob) {
      violations.push({
        code: "BLOB_MISMATCH",
        path: finding.path,
        line: finding.matches[0].line,
        pattern: finding.matches[0].pattern,
        message: `Policy pins blob ${entry.gitBlob}, but the current worktree content is ${finding.gitBlob}.`,
        remediation
      });
      continue;
    }
    evaluateEntryDates(entry, today, violations, warnings, finding);
  }

  for (const entry of entries) {
    if (!blobsByPath.has(entry.path)) {
      violations.push({
        code: "STALE_POLICY_ENTRY",
        path: entry.path,
        line: 1,
        pattern: entry.disposition,
        message: "The exact policy entry no longer maps to a detected DDL or privilege surface in the current worktree.",
        remediation: "Remove the stale entry after confirming the structural surface was retired, or restore the exact reviewed blob."
      });
    }
  }

  return {
    schemaVersion: "pyrosa-platform-dictionary-governed-ddl-check-v1",
    checkedAt: `${today}T00:00:00.000Z`,
    repo: options.repoSlug,
    workspace,
    policyPath,
    scannedFileCount: files.length,
    detectedSurfaceCount: findings.length,
    policyEntryCount: entries.length,
    violations,
    warnings,
    ok: violations.length === 0
  };
}

export function findDdlMatches(content) {
  const matches = [];
  for (const definition of ddlPatterns) {
    definition.expression.lastIndex = 0;
    let match;
    while ((match = definition.expression.exec(content)) !== null) {
      matches.push({
        line: lineAt(content, match.index),
        pattern: definition.id,
        statement: compact(match[0]).slice(0, 180)
      });
      if (match[0].length === 0) definition.expression.lastIndex += 1;
    }
  }
  return matches.sort((left, right) => left.line - right.line || left.pattern.localeCompare(right.pattern));
}

export function gitBlobSha1(content) {
  const value = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const header = Buffer.from(`blob ${value.length}\0`);
  return createHash("sha1").update(header).update(value).digest("hex");
}

export function formatResult(result) {
  const lines = [];
  for (const violation of result.violations) {
    lines.push(`::error file=${escapeWorkflow(violation.path)},line=${violation.line},title=${violation.code}::${escapeWorkflow(`${violation.pattern}: ${violation.message} Remediation: ${violation.remediation}`)}`);
    lines.push(`[${violation.code}] ${result.repo}:${violation.path}:${violation.line} pattern=${violation.pattern}`);
    lines.push(`  ${violation.message}`);
    lines.push(`  Remediation: ${violation.remediation}`);
  }
  for (const warning of result.warnings) {
    lines.push(`::warning file=${escapeWorkflow(warning.path)},line=${warning.line},title=${warning.code}::${escapeWorkflow(warning.message)}`);
    lines.push(`[${warning.code}] ${result.repo}:${warning.path}:${warning.line} ${warning.message}`);
  }
  lines.push(result.ok
    ? `dictionary-governed-ddl: PASS repo=${result.repo} files=${result.scannedFileCount} surfaces=${result.detectedSurfaceCount} policy=${result.policyEntryCount}`
    : `dictionary-governed-ddl: FAIL repo=${result.repo} violations=${result.violations.length} surfaces=${result.detectedSurfaceCount}`);
  return `${lines.join("\n")}\n`;
}

async function loadPolicy(policyPath) {
  const enforcement = JSON.parse(await readFile(policyPath, "utf8"));
  if (enforcement.schemaVersion !== "pyrosa-platform-dictionary-governed-ddl-enforcement-policy-v1" || enforcement.mode !== "enforce") {
    throw new PolicyError("The enforcement policy must use schema v1 and mode enforce.");
  }
  if (typeof enforcement.inherits !== "string" || enforcement.inherits.trim() === "") {
    throw new PolicyError("The enforcement policy must inherit the immutable Cut 1 policy.");
  }
  const inheritedPath = resolve(dirname(policyPath), enforcement.inherits);
  const inherited = JSON.parse(await readFile(inheritedPath, "utf8"));
  if (inherited.schemaVersion !== "pyrosa-platform-dictionary-governed-ddl-policy-v1" || inherited.mode !== "inventory-only") {
    throw new PolicyError("The inherited policy is not the immutable Cut 1 inventory policy.");
  }
  const overrideEntries = enforcement.entries ?? [];
  if (!Array.isArray(overrideEntries)) throw new PolicyError("Enforcement policy entries must be an array.");
  const mergedEntries = new Map(inherited.entries.map((entry) => [policyKey(entry), entry]));
  for (const entry of overrideEntries) mergedEntries.set(policyKey(entry), entry);
  const policy = {
    repositories: inherited.repositories,
    entries: [...mergedEntries.values()],
    enforcement
  };
  validatePolicy(policy);
  return policy;
}

function validatePolicy(policy) {
  if (!Array.isArray(policy.repositories) || policy.repositories.length === 0) {
    throw new PolicyError("At least one repository must be configured.");
  }
  const repositories = new Set();
  for (const repository of policy.repositories) {
    requireText(repository.slug, `repository ${repository.slug ?? "unknown"} slug`);
    if (repositories.has(repository.slug)) throw new PolicyError(`Duplicate repository ${repository.slug}.`);
    repositories.add(repository.slug);
  }
  const keys = new Set();
  for (const entry of policy.entries) {
    for (const field of ["repo", "path", "gitBlob", "owner", "classification", "disposition", "justification", "reviewBy"]) {
      requireText(entry[field], `${entry.repo ?? "unknown"}:${entry.path ?? "unknown"} ${field}`);
    }
    if (!repositories.has(entry.repo)) throw new PolicyError(`Entry references unknown repository ${entry.repo}.`);
    if (entry.path.startsWith("/") || entry.path.includes("..") || /[*?\[\]{}]/u.test(entry.path)) {
      throw new PolicyError(`Policy paths must be exact, relative, and cannot contain wildcards: ${entry.repo}:${entry.path}.`);
    }
    if (!/^[0-9a-f]{40}$/u.test(entry.gitBlob)) throw new PolicyError(`Invalid Git blob: ${entry.repo}:${entry.path}.`);
    if (!["allow", "ignored", "legacy-exception"].includes(entry.disposition)) {
      throw new PolicyError(`Unsupported disposition ${entry.disposition}: ${entry.repo}:${entry.path}.`);
    }
    validateDate(entry.reviewBy, `${entry.repo}:${entry.path} reviewBy`);
    if (entry.disposition === "legacy-exception") {
      validateDate(entry.expiresOn, `${entry.repo}:${entry.path} expiresOn`);
      if (entry.reviewBy > entry.expiresOn) throw new PolicyError(`Review follows expiry: ${entry.repo}:${entry.path}.`);
    }
    const key = policyKey(entry);
    if (keys.has(key)) throw new PolicyError(`Duplicate entry ${entry.repo}:${entry.path}.`);
    keys.add(key);
  }
}

function evaluateEntryDates(entry, today, violations, warnings, finding) {
  const common = {
    path: finding.path,
    line: finding.matches[0].line,
    pattern: finding.matches[0].pattern
  };
  if (entry.disposition === "legacy-exception" && today > entry.expiresOn) {
    violations.push({
      ...common,
      code: "EXCEPTION_EXPIRED",
      message: `Temporary exception owned by ${entry.owner} expired on ${entry.expiresOn}.`,
      remediation: "Remove the direct DDL or replace the exception with a newly reviewed exact blob and a bounded expiry."
    });
    return;
  }
  if (today > entry.reviewBy) {
    warnings.push({
      ...common,
      code: "REVIEW_OVERDUE",
      message: `Policy review owned by ${entry.owner} was due on ${entry.reviewBy}; update or retire this exact entry.`
    });
  }
}

async function listScannableFiles(root) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolutePath = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (!excludedDirectoryNames.has(entry.name)) await visit(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (sourceExtensions.has(extname(entry.name).toLowerCase())) files.push(absolutePath);
    }
  }
  await visit(root);
  return files;
}

function findingViolation(code, finding, match, suggestion) {
  return {
    code,
    path: finding.path,
    line: match.line,
    pattern: match.pattern,
    message: `Detected ${match.statement} in an unlisted worktree blob ${finding.gitBlob}.`,
    remediation: suggestion
  };
}

function parseArgs(args) {
  const options = { policyPath: defaultPolicyPath, repoSlug: null, today: null, workspace: null, json: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (["--policy", "--repo-slug", "--today", "--workspace"].includes(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      if (arg === "--policy") options.policyPath = value;
      if (arg === "--repo-slug") options.repoSlug = value;
      if (arg === "--today") options.today = value;
      if (arg === "--workspace") options.workspace = value;
      index += 1;
      continue;
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!options.repoSlug) throw new Error("--repo-slug is required.");
  if (!options.workspace) throw new Error("--workspace is required.");
  return options;
}

function validateDate(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new PolicyError(`${label} must be YYYY-MM-DD.`);
  }
}

function requireText(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new PolicyError(`${label} is required.`);
}

function lineAt(content, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) if (content.charCodeAt(cursor) === 10) line += 1;
  return line;
}

function compact(value) {
  return value.replace(/\s+/gu, " ").trim();
}

function normalizePath(path) {
  return path.split(sep).join("/");
}

function policyKey(entry) {
  return `${entry.repo}\0${entry.path}`;
}

function displayPath(path) {
  return normalizePath(relative(process.cwd(), path));
}

function escapeWorkflow(value) {
  return value.replace(/%/gu, "%25").replace(/\r/gu, "%0D").replace(/\n/gu, "%0A").replace(/:/gu, "%3A").replace(/,/gu, "%2C");
}

export class PolicyError extends Error {}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await checkDictionaryGovernedDdl(options);
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : formatResult(result));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`dictionary-governed-ddl: ERROR ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}

const invokedPath = process.argv[1] ? await realpath(process.argv[1]).catch(() => resolve(process.argv[1])) : null;
if (invokedPath && pathToFileURL(invokedPath).href === import.meta.url) await main();
