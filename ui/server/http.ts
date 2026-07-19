import { createReadStream, existsSync, statSync } from "node:fs";
import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { extname, join, relative, resolve } from "node:path";
import { mimeTypes, type CrmServerConfig } from "./config.js";
import { assertClientArtifactFile, type CrmRuntimeRelease } from "./release.js";

export type RequestContext = {
  correlationId: string;
  requestId: string;
  startedAt: bigint;
  url: URL;
  headOnly: boolean;
};

export function createRequestContext(req: IncomingMessage): RequestContext {
  const requestId = getRequestId(req);
  return {
    correlationId: getCorrelationId(req, requestId),
    requestId,
    startedAt: process.hrtime.bigint(),
    url: new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`),
    headOnly: (req.method || "GET").toUpperCase() === "HEAD"
  };
}

export function applyCommonHeaders(res: ServerResponse, requestId: string, correlationId = requestId): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Pyrosa-Crm-Service", "node");
  res.setHeader("X-Request-Id", requestId);
  res.setHeader("X-Correlation-Id", correlationId);
}

export function logAccess(
  req: IncomingMessage,
  res: ServerResponse,
  context: RequestContext,
  config: CrmServerConfig
): void {
  if (!config.accessLog) {
    return;
  }
  res.on("finish", () => {
    const elapsedMs = Number(process.hrtime.bigint() - context.startedAt) / 1000000;
    console.log(
      [
        "access",
        `id=${context.requestId}`,
        `method=${req.method || "GET"}`,
        `path=${context.url.pathname}`,
        `status=${res.statusCode}`,
        `duration_ms=${elapsedMs.toFixed(1)}`
      ].join(" ")
    );
  });
}

export function sendJson(
  res: ServerResponse,
  status: number,
  payload: unknown,
  headOnly = false,
  extraHeaders: OutgoingHttpHeaders = {}
): void {
  const body = `${JSON.stringify(payload)}\n`;
  res.statusCode = status;
  setHeaders(res, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": String(Buffer.byteLength(body)),
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  if (headOnly) {
    res.end();
    return;
  }
  res.end(body);
}

export function sendText(
  res: ServerResponse,
  status: number,
  body: string,
  contentType = "text/plain; charset=utf-8"
): void {
  res.statusCode = status;
  setHeaders(res, {
    "Content-Type": contentType,
    "Content-Length": String(Buffer.byteLength(body))
  });
  res.end(body);
}

export function sendHtml(
  res: ServerResponse,
  status: number,
  body: string,
  headOnly = false,
  extraHeaders: OutgoingHttpHeaders = {}
): void {
  res.statusCode = status;
  setHeaders(res, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": String(Buffer.byteLength(body)),
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  res.end(headOnly ? undefined : body);
}

export function serveStatic(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  config: CrmServerConfig,
  release: CrmRuntimeRelease
): void {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendText(res, 405, "Method Not Allowed");
    return;
  }

  const decoded = safeDecode(pathname);
  if (decoded === null || decoded.includes("\0")) {
    sendText(res, 400, "Bad Request");
    return;
  }

  const requestedPath = decoded === "/" ? "/index.html" : decoded;
  const filePath = safeResolve(config.distDir, requestedPath);
  const resolved = filePath && fileExists(filePath) ? filePath : null;

  if (!resolved && (requestedPath.startsWith("/assets/") || extname(requestedPath))) {
    sendText(res, 404, "Not Found");
    return;
  }

  const responsePath = resolved || join(config.distDir, "index.html");
  assertClientArtifactFile(responsePath, release);
  const stat = statSync(responsePath);
  const ext = extname(responsePath).toLowerCase();
  const isAsset = relative(config.distDir, responsePath).startsWith("assets/");
  const etag = weakEtag(stat);

  if (req.headers["if-none-match"] === etag) {
    res.statusCode = 304;
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", isAsset ? "public, max-age=31536000, immutable" : "no-cache");
    res.end();
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
  res.setHeader("Content-Length", String(stat.size));
  res.setHeader("ETag", etag);
  res.setHeader("Last-Modified", stat.mtime.toUTCString());
  res.setHeader("Cache-Control", isAsset ? "public, max-age=31536000, immutable" : "no-cache");

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  createReadStream(responsePath).pipe(res);
}

export function assertStaticShellExists(config: CrmServerConfig): void {
  if (!existsSync(join(config.distDir, "index.html"))) {
    throw new Error(`PYROSA CRM UI dist not found at ${config.distDir}. Run npm --prefix ui run build first.`);
  }
}

function setHeaders(res: ServerResponse, headers: OutgoingHttpHeaders): void {
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined) {
      res.setHeader(name, value);
    }
  }
}

function getRequestId(req: IncomingMessage): string {
  const header = String(req.headers["x-request-id"] || "").trim();
  if (/^[a-zA-Z0-9_.:-]{8,128}$/.test(header)) {
    return header;
  }
  return randomUUID();
}

function getCorrelationId(req: IncomingMessage, requestId: string): string {
  const raw = req.headers["x-correlation-id"];
  const header = String(Array.isArray(raw) ? raw[0] ?? "" : raw ?? "").trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9_.:@/+~-]{7,127}$/.test(header) ? header : requestId;
}

function safeResolve(root: string, pathname: string): string | null {
  const resolved = resolve(root, `.${pathname}`);
  const rel = relative(root, resolved);
  if (rel.startsWith("..") || rel === "" || rel.includes("..")) {
    return null;
  }
  return resolved;
}

function fileExists(filePath: string): boolean {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function weakEtag(stat: { size: number; mtimeMs: number }): string {
  return `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
}
