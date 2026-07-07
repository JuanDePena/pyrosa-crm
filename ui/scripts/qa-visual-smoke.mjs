#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const defaultRoutes = [
  {
    id: "dashboard",
    hash: "dashboard",
    viewport: { width: 1440, height: 1000, mobile: false },
    expect: ["PYROSA CRM", "Dashboard", "Cuentas"]
  },
  {
    id: "cuentas",
    hash: "cuentas",
    viewport: { width: 1440, height: 1000, mobile: false },
    expect: ["Cuentas", "Atlas Retail Group", "Enterprise"]
  },
  {
    id: "oportunidades",
    hash: "oportunidades",
    viewport: { width: 1440, height: 1000, mobile: false },
    expect: ["Oportunidades", "Atlas renovacion 2026", "Propuesta"]
  },
  {
    id: "plataforma",
    hash: "plataforma",
    viewport: { width: 1440, height: 1000, mobile: false },
    expect: ["Contratos con servicios Pyrosa", "Platform", "IAM"]
  },
  {
    id: "mobile-dashboard",
    hash: "dashboard",
    viewport: { width: 390, height: 844, mobile: true },
    expect: ["PYROSA CRM", "Dashboard"]
  }
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = trimTrailingSlash(args.baseUrl ?? process.env.PYROSA_CRM_QA_BASE_URL ?? "http://127.0.0.1:10166");
  const outDir = resolve(process.cwd(), args.outDir ?? process.env.PYROSA_CRM_QA_OUT_DIR ?? "tmp/qa-visual");
  const chromiumBin = args.chromiumBin ?? process.env.CHROMIUM_BIN ?? findChromium();
  const debugPort = Number(args.debugPort ?? process.env.PYROSA_CRM_QA_DEBUG_PORT ?? randomPort());
  const sessionSecret = process.env.PYROSA_CRM_IAM_CLIENT_SECRET ?? "";

  if (!chromiumBin) {
    throw new Error("Chromium no esta disponible. Define CHROMIUM_BIN para ejecutar QA visual.");
  }

  await mkdir(outDir, { recursive: true });

  const userDataDir = await mkdtemp(join(tmpdir(), "democrm-visual-qa-"));
  const chromium = spawn(
    chromiumBin,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      "about:blank"
    ],
    {
      stdio: ["ignore", "ignore", "pipe"]
    }
  );

  let chromiumStderr = "";
  let failed = false;
  chromium.stderr.on("data", (chunk) => {
    chromiumStderr += String(chunk);
  });

  try {
    const wsUrl = await waitForDebuggerUrl(debugPort);
    const browser = await CdpClient.connect(wsUrl);
    const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });

    await browser.send("Page.enable", {}, sessionId);
    await browser.send("Runtime.enable", {}, sessionId);
    await browser.send("Network.enable", {}, sessionId);
    await browser.send(
      "Network.setCookie",
      {
        name: "PYROSA_CRM_SESSION",
        value: buildSessionCookie(sessionSecret),
        url: baseUrl,
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
        expires: Math.floor(Date.now() / 1000) + 3600
      },
      sessionId
    );

    const results = [];
    for (const route of defaultRoutes) {
      const screenshotPath = join(outDir, `${route.id}.png`);
      const url = `${baseUrl}/ui#${route.hash}`;
      await browser.send(
        "Emulation.setDeviceMetricsOverride",
        {
          width: route.viewport.width,
          height: route.viewport.height,
          deviceScaleFactor: 1,
          mobile: route.viewport.mobile
        },
        sessionId
      );
      await navigateAndSettle(browser, sessionId, url);
      const inspection = await inspectPage(browser, sessionId, route.expect);
      const screenshot = await browser.send(
        "Page.captureScreenshot",
        { format: "png", captureBeyondViewport: false },
        sessionId
      );
      await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
      results.push({
        id: route.id,
        url,
        screenshot: screenshotPath,
        viewport: route.viewport,
        ...inspection
      });
    }

    const failures = results.flatMap((result) => result.failures.map((failure) => `${result.id}: ${failure}`));
    const manifest = {
      ok: failures.length === 0,
      generatedAt: new Date().toISOString(),
      baseUrl,
      chromium: chromiumBin,
      results,
      failures
    };
    const manifestPath = join(outDir, "manifest.json");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(JSON.stringify({ ok: manifest.ok, manifest: manifestPath, captures: results.length, failures }, null, 2));

    if (!manifest.ok) {
      process.exitCode = 1;
    }

    await browser.close();
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    chromium.kill("SIGTERM");
    await delay(250);
    if (chromium.exitCode === null) {
      chromium.kill("SIGKILL");
    }
    await rm(userDataDir, { recursive: true, force: true });
    if ((failed || process.exitCode) && chromiumStderr) {
      console.error(chromiumStderr);
    }
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      parsed[key] = next;
      index += 1;
    } else {
      parsed[key] = "1";
    }
  }
  return parsed;
}

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, "");
}

function randomPort() {
  return 41000 + Number.parseInt(randomBytes(2).toString("hex"), 16) % 20000;
}

function findChromium() {
  for (const candidate of ["/usr/local/bin/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"]) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return "";
}

function buildSessionCookie(secret) {
  const now = new Date();
  const session = {
    sid: `qa-${randomBytes(8).toString("hex")}`,
    user: {
      id: 9001,
      email: "qa-democrm@pyrosa.local",
      displayName: "QA DemoCRM",
      role: "superadmin",
      locale: "es",
      timezone: "America/Santo_Domingo",
      status: "active",
      primaryEmail: {
        email: "qa-democrm@pyrosa.local",
        verifiedAt: now.toISOString(),
        isVerified: true
      },
      security: {
        mfaRequired: false,
        activeMfaMethods: 1
      }
    },
    csrf: `qa-${randomBytes(8).toString("hex")}`,
    uiAuthSessionId: `qa-${randomBytes(8).toString("hex")}`,
    uiAuthParentSessionId: null,
    uiAuthAuthenticatedAt: now.toISOString(),
    uiAuthLastCheckedAt: now.toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  };
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  const signature = createHmac("sha256", String(secret ?? "")).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

async function waitForDebuggerUrl(port) {
  const url = `http://127.0.0.1:${port}/json/version`;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const payload = await response.json();
        if (payload.webSocketDebuggerUrl) {
          return payload.webSocketDebuggerUrl;
        }
      }
    } catch {
      await delay(200);
    }
  }
  throw new Error(`Chromium DevTools no respondio en ${url}`);
}

async function navigateAndSettle(client, sessionId, url) {
  const loaded = client.waitForEvent("Page.loadEventFired", sessionId, 10000);
  await client.send("Page.navigate", { url }, sessionId);
  await loaded.catch(() => null);
  await delay(1200);
}

async function inspectPage(client, sessionId, expectedText) {
  const expression = `(() => {
    const text = document.body ? document.body.innerText : "";
    const root = document.documentElement;
    return {
      href: location.href,
      title: document.title,
      textSample: text.replace(/\\s+/g, " ").trim().slice(0, 240),
      bodyScrollWidth: root.scrollWidth,
      viewportWidth: window.innerWidth,
      hasLoginRedirect: location.pathname.includes("/auth/login") || text.includes("Autenticacion requerida"),
      hasContractFallback: text.includes("Contrato local") || text.includes("fallback local"),
      hasRuntimeError: text.includes("PYROSA CRM no pudo completar la solicitud"),
      missing: ${JSON.stringify(expectedText)}.filter((item) => !text.includes(item))
    };
  })()`;
  const evaluation = await client.send("Runtime.evaluate", { expression, returnByValue: true }, sessionId);
  const value = evaluation.result?.value ?? {};
  const failures = [];
  if (value.hasLoginRedirect) {
    failures.push("la sesion QA fue redirigida a login");
  }
  if (value.hasContractFallback) {
    failures.push("la UI mostro fallback por contratos no disponibles");
  }
  if (value.hasRuntimeError) {
    failures.push("la UI mostro error runtime");
  }
  if (Array.isArray(value.missing) && value.missing.length > 0) {
    failures.push(`faltan textos esperados: ${value.missing.join(", ")}`);
  }
  if (Number(value.bodyScrollWidth) > Number(value.viewportWidth) + 12) {
    failures.push(`overflow horizontal body ${value.bodyScrollWidth}/${value.viewportWidth}`);
  }
  return { ...value, failures };
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.eventQueue = [];
    this.eventWaiters = [];
    socket.addEventListener("message", (event) => {
      this.handleMessage(JSON.parse(String(event.data)));
    });
  }

  static connect(url) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const timeout = setTimeout(() => reject(new Error("Timeout conectando con Chromium DevTools")), 10000);
      socket.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve(new CdpClient(socket));
      });
      socket.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("No fue posible conectar con Chromium DevTools"));
      });
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId;
    this.nextId += 1;
    const message = { id, method, params };
    if (sessionId) {
      message.sessionId = sessionId;
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 15000);
      this.pending.set(id, { resolve, reject, timeout });
      this.socket.send(JSON.stringify(message));
    });
  }

  waitForEvent(method, sessionId, timeoutMs) {
    const queuedIndex = this.eventQueue.findIndex((event) => event.method === method && (!sessionId || event.sessionId === sessionId));
    if (queuedIndex >= 0) {
      const [event] = this.eventQueue.splice(queuedIndex, 1);
      return Promise.resolve(event.params);
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.eventWaiters = this.eventWaiters.filter((waiter) => waiter.resolve !== resolve);
        reject(new Error(`CDP event timeout: ${method}`));
      }, timeoutMs);
      this.eventWaiters.push({ method, sessionId, resolve, timeout });
    });
  }

  handleMessage(message) {
    if (message.id && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) {
        pending.reject(new Error(`${message.error.message}: ${message.error.data ?? ""}`));
      } else {
        pending.resolve(message.result ?? {});
      }
      return;
    }

    const waiterIndex = this.eventWaiters.findIndex(
      (waiter) => waiter.method === message.method && (!waiter.sessionId || waiter.sessionId === message.sessionId)
    );
    if (waiterIndex >= 0) {
      const [waiter] = this.eventWaiters.splice(waiterIndex, 1);
      clearTimeout(waiter.timeout);
      waiter.resolve(message.params ?? {});
      return;
    }
    this.eventQueue.push(message);
  }

  close() {
    this.socket.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
