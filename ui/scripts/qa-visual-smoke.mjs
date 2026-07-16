#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";

const visualCases = [
  {
    id: "desktop-dashboard",
    hash: "dashboard",
    viewport: { width: 1440, height: 1000, mobile: false },
    expect: ["PYROSA CRM", "Overview CRM", "Estado ejecutivo del CRM"],
    forbidTables: true
  },
  {
    id: "desktop-cuentas",
    hash: "cuentas",
    viewport: { width: 1440, height: 1000, mobile: false },
    expect: ["PYROSA CRM", "Cuentas"]
  },
  {
    id: "desktop-casos",
    hash: "casos",
    viewport: { width: 1440, height: 1000, mobile: false },
    expect: ["PYROSA CRM", "Casos"]
  },
  {
    id: "desktop-agenda",
    hash: "agenda",
    viewport: { width: 1440, height: 1000, mobile: false },
    expect: ["PYROSA CRM", "Agenda"]
  },
  {
    id: "desktop-user-drawer",
    hash: "dashboard",
    viewport: { width: 1440, height: 1000, mobile: false },
    expect: ["PYROSA CRM", "Cuenta", "Preferencias UI", "Alcance DemoCRM", "Configuracion efectiva"],
    interaction: "open-user-drawer",
    requiredSelector: ".py-user-drawer"
  },
  {
    id: "narrow-dashboard",
    hash: "dashboard",
    viewport: { width: 390, height: 844, mobile: true },
    expect: ["PYROSA CRM", "Overview CRM", "Estado ejecutivo del CRM"],
    forbidTables: true
  },
  {
    id: "narrow-cuentas",
    hash: "cuentas",
    viewport: { width: 390, height: 844, mobile: true },
    expect: ["PYROSA CRM", "Cuentas"]
  },
  {
    id: "narrow-casos",
    hash: "casos",
    viewport: { width: 390, height: 844, mobile: true },
    expect: ["PYROSA CRM", "Casos"]
  },
  {
    id: "narrow-agenda",
    hash: "agenda",
    viewport: { width: 390, height: 844, mobile: true },
    expect: ["PYROSA CRM", "Agenda"]
  },
  {
    id: "narrow-user-drawer",
    hash: "dashboard",
    viewport: { width: 390, height: 844, mobile: true },
    expect: ["PYROSA CRM", "Cuenta", "Preferencias UI", "Alcance DemoCRM", "Configuracion efectiva"],
    interaction: "open-user-drawer",
    requiredSelector: ".py-user-drawer"
  },
  {
    id: "desktop-fatal-error",
    hash: "dashboard",
    viewport: { width: 1440, height: 1000, mobile: false },
    expect: ["PYROSA CRM", "DemoCRM no esta disponible", "Detalle tecnico"],
    expectedFatal: true,
    mockBootstrapError: true,
    requiredSelector: "[data-py-internal-error-landing='true']"
  }
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const requestedBaseUrl = args.baseUrl ?? process.env.PYROSA_CRM_QA_BASE_URL;
  const previewPort = parseDebugPort(args.previewPort ?? process.env.PYROSA_CRM_QA_PREVIEW_PORT ?? randomPort());
  const baseUrl = normalizeBaseUrl(requestedBaseUrl ?? `http://127.0.0.1:${previewPort}`);
  const outDir = resolve(process.cwd(), args.outDir ?? process.env.PYROSA_CRM_QA_OUT_DIR ?? "tmp/qa-visual");
  const chromiumBin = args.chromiumBin ?? process.env.CHROMIUM_BIN ?? findChromium();
  const debugPort = parseDebugPort(args.debugPort ?? process.env.PYROSA_CRM_QA_DEBUG_PORT ?? randomPort());
  const sessionSecret = process.env.PYROSA_CRM_IAM_CLIENT_SECRET ?? "";
  const iamIssuer = new URL(
    process.env.PYROSA_CRM_QA_IAM_ISSUER ??
      process.env.PYROSA_CRM_IAM_BASE_URL ??
      "https://iam.pyrosa.com.do"
  ).origin;

  if (!chromiumBin) {
    throw new Error("Chromium no esta disponible. Define CHROMIUM_BIN para ejecutar QA visual.");
  }

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true, mode: 0o750 });
  await chmod(outDir, 0o750);

  let preview = null;
  if (!requestedBaseUrl) {
    const viteBin = resolve(process.cwd(), "node_modules/vite/bin/vite.js");
    if (!existsSync(resolve(process.cwd(), "dist/index.html")) || !existsSync(viteBin)) {
      throw new Error("QA visual requiere un build local y Vite instalado. Ejecuta npm run build primero.");
    }
    preview = spawn(
      process.execPath,
      [viteBin, "preview", "--host", "127.0.0.1", "--port", String(previewPort), "--strictPort"],
      { cwd: process.cwd(), stdio: ["ignore", "ignore", "ignore"] }
    );
    try {
      await waitForPreview(baseUrl, preview);
    } catch (error) {
      await terminateProcess(preview);
      throw error;
    }
  }

  const userDataDir = await mkdtemp(join(tmpdir(), "democrm-visual-qa-"));
  const chromium = spawn(
    chromiumBin,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--hide-scrollbars",
      "--lang=es-DO",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      "about:blank"
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );

  let chromiumStderr = "";
  let browser = null;
  let failed = false;
  chromium.stderr.on("data", (chunk) => {
    chromiumStderr = `${chromiumStderr}${String(chunk)}`.slice(-64_000);
  });

  try {
    const wsUrl = await waitForDebuggerUrl(debugPort, chromium);
    browser = await CdpClient.connect(wsUrl);
    const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });

    await browser.send("Page.enable", {}, sessionId);
    await browser.send("Runtime.enable", {}, sessionId);
    await browser.send("Log.enable", {}, sessionId);
    await browser.send("Network.enable", {}, sessionId);
    await browser.send("Network.setCacheDisabled", { cacheDisabled: true }, sessionId);
    await browser.send(
      "Emulation.setEmulatedMedia",
      {
        media: "screen",
        features: [
          { name: "prefers-color-scheme", value: "light" },
          { name: "prefers-reduced-motion", value: "reduce" }
        ]
      },
      sessionId
    );
    const cookieResult = await browser.send(
      "Network.setCookie",
      {
        name: "PYROSA_CRM_SESSION",
        value: buildSessionCookie(sessionSecret, iamIssuer),
        url: baseUrl.origin,
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
        secure: baseUrl.protocol === "https:",
        expires: Math.floor(Date.now() / 1000) + 3600
      },
      sessionId
    );
    if (cookieResult.success === false) {
      throw new Error("Chromium rechazo la cookie sintetica de QA.");
    }

    const diagnostics = [];
    browser.on("Runtime.exceptionThrown", (params) => {
      diagnostics.push({ level: "error", source: "runtime", message: params.exceptionDetails?.text ?? "runtime exception" });
    });
    browser.on("Runtime.consoleAPICalled", (params) => {
      if (params.type === "error" || params.type === "assert") {
        diagnostics.push({
          level: "error",
          source: "console",
          message: params.args?.map((arg) => arg.value ?? arg.description ?? "").join(" ") || params.type
        });
      }
    });
    browser.on("Log.entryAdded", (params) => {
      if (params.entry?.level === "error") {
        diagnostics.push({ level: "error", source: params.entry.source ?? "log", message: params.entry.text ?? "browser log error" });
      }
    });
    browser.on("Network.loadingFailed", (params) => {
      if (!params.canceled && ["Document", "Script", "Stylesheet", "Fetch", "XHR"].includes(params.type)) {
        diagnostics.push({ level: "error", source: "network", message: `${params.type}: ${params.errorText ?? "loading failed"}` });
      }
    });

    const results = [];
    for (const visualCase of visualCases) {
      const screenshotPath = join(outDir, `${visualCase.id}.png`);
      const routeUrl = new URL(`/ui#${visualCase.hash}`, baseUrl);
      routeUrl.searchParams.set("qa-case", visualCase.id);
      const diagnosticStart = diagnostics.length;
      await ensureUserDrawerClosed(browser, sessionId);
      const mockScriptId = await installCrmApiMock(
        browser,
        sessionId,
        visualCase.mockBootstrapError === true
      );
      await browser.send(
        "Emulation.setDeviceMetricsOverride",
        {
          width: visualCase.viewport.width,
          height: visualCase.viewport.height,
          deviceScaleFactor: 1,
          mobile: visualCase.viewport.mobile
        },
        sessionId
      );
      await browser.send(
        "Emulation.setTouchEmulationEnabled",
        {
          enabled: visualCase.viewport.mobile,
          ...(visualCase.viewport.mobile ? { maxTouchPoints: 1 } : {})
        },
        sessionId
      );
      await navigateAndSettle(browser, sessionId, routeUrl.toString(), visualCase.expect.slice(0, 2));
      if (visualCase.interaction === "open-user-drawer") {
        await openUserDrawer(browser, sessionId);
      }
      const inspection = await inspectPage(browser, sessionId, visualCase);
      const routeDiagnostics = diagnostics.slice(diagnosticStart).map(sanitizeDiagnostic);
      const diagnosticFailures = routeDiagnostics.map((entry) => `${entry.source}: ${entry.message}`);
      const screenshot = await browser.send(
        "Page.captureScreenshot",
        { format: "png", captureBeyondViewport: false, fromSurface: true },
        sessionId
      );
      await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"), { mode: 0o640 });
      results.push({
        id: visualCase.id,
        route: `/ui#${visualCase.hash}`,
        screenshot: relativeScreenshot(outDir, screenshotPath),
        viewport: visualCase.viewport,
        diagnostics: routeDiagnostics,
        ...inspection,
        failures: [...inspection.failures, ...diagnosticFailures]
      });
      if (mockScriptId) {
        await browser.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: mockScriptId }, sessionId);
      }
    }

    const failures = results.flatMap((result) => result.failures.map((failure) => `${result.id}: ${failure}`));
    const manifest = sanitizeEvidence({
      schemaVersion: 2,
      ok: failures.length === 0,
      generatedAt: new Date().toISOString(),
      application: "pyrosa-democrm",
      qaDataMode: "synthetic-contract",
      baseOrigin: baseUrl.origin,
      chromium: basename(chromiumBin),
      captures: results.length,
      results,
      failures
    });
    const manifestPath = join(outDir, "manifest.json");
    await atomicWriteFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(JSON.stringify({ ok: manifest.ok, manifest: relative(process.cwd(), manifestPath), captures: results.length, failures }, null, 2));

    if (!manifest.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    browser?.close();
    await terminateProcess(chromium);
    if (preview) await terminateProcess(preview);
    await rm(userDataDir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100
    });
    if ((failed || process.exitCode) && chromiumStderr) {
      console.error(sanitizeDiagnostic({ source: "chromium", message: chromiumStderr }).message);
    }
  }
}

async function waitForPreview(baseUrl, process) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (process.exitCode !== null) {
      throw new Error(`El preview local termino antes de iniciar (exit ${process.exitCode}).`);
    }
    try {
      const response = await fetch(baseUrl, { redirect: "manual" });
      if (response.ok) return;
    } catch {
      // Vite is still booting.
    }
    await delay(100);
  }
  throw new Error("El preview local de QA no respondio dentro del timeout.");
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) continue;
    const key = argument.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
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

function normalizeBaseUrl(value) {
  const url = new URL(String(value));
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("QA visual solo admite base URLs HTTP o HTTPS.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("La base URL de QA no puede contener credenciales, query ni hash.");
  }
  return url;
}

function parseDebugPort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("El puerto de depuracion de Chromium no es valido.");
  }
  return port;
}

function randomPort() {
  return 41000 + Number.parseInt(randomBytes(2).toString("hex"), 16) % 20000;
}

function findChromium() {
  for (const candidate of ["/usr/local/bin/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"]) {
    if (existsSync(candidate)) return candidate;
  }
  return "";
}

function buildSessionCookie(secret, iamIssuer) {
  const now = new Date();
  const session = {
    sid: `qa-${randomBytes(8).toString("hex")}`,
    iamIdentity: {
      issuer: iamIssuer,
      subject: "qa-democrm"
    },
    user: {
      id: 9001,
      email: "qa-democrm@pyrosa.local",
      displayName: "QA DemoCRM",
      role: "superadmin",
      locale: "es",
      timezone: "America/Santo_Domingo",
      status: "active",
      primaryEmail: { email: "qa-democrm@pyrosa.local", verifiedAt: now.toISOString(), isVerified: true },
      security: { mfaRequired: false, activeMfaMethods: 1 }
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

async function waitForDebuggerUrl(port, process) {
  const url = `http://127.0.0.1:${port}/json/version`;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (process.exitCode !== null) {
      throw new Error(`Chromium termino antes de publicar DevTools (exit ${process.exitCode}).`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        const payload = await response.json();
        if (payload.webSocketDebuggerUrl) return payload.webSocketDebuggerUrl;
      }
    } catch {
      // Chromium is still booting.
    }
    await delay(200);
  }
  throw new Error("Chromium DevTools no respondio dentro del timeout de QA.");
}

async function navigateAndSettle(client, sessionId, url, expectedText) {
  const navigation = await client.send("Page.navigate", { url }, sessionId);
  if (navigation.errorText) {
    throw new Error(`Navegacion Chromium fallo: ${navigation.errorText}`);
  }
  const expectedUrl = new URL(url);
  await waitForPageContent(
    client,
    sessionId,
    `${expectedUrl.pathname}${expectedUrl.hash}`,
    expectedText,
    12_000
  );
  await client.send(
    "Runtime.evaluate",
    {
      expression: `(() => {
        const id = "pyrosa-visual-qa-stability";
        if (!document.getElementById(id)) {
          const style = document.createElement("style");
          style.id = id;
          style.textContent = "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;caret-color:transparent!important}";
          document.head.appendChild(style);
        }
        return document.fonts?.ready ? document.fonts.ready.then(() => true) : true;
      })()`,
      awaitPromise: true,
      returnByValue: true
    },
    sessionId
  );
  await delay(150);
}

async function waitForPageContent(client, sessionId, expectedPath, expectedText, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastState = null;
  while (Date.now() < deadline) {
    const evaluation = await client.send(
      "Runtime.evaluate",
      {
        expression: `(() => {
          const text = document.body?.innerText ?? "";
          const expected = ${JSON.stringify(expectedText)};
          return {
            ready: document.readyState,
            path: location.pathname + location.hash,
            title: document.title,
            text: text.slice(0, 240),
            missing: expected.filter((item) => !text.includes(item))
          };
        })()`,
        returnByValue: true
      },
      sessionId
    );
    lastState = evaluation.result?.value ?? null;
    if (
      lastState?.ready !== "loading" &&
      lastState?.path === expectedPath &&
      Array.isArray(lastState?.missing) &&
      lastState.missing.length === 0
    ) {
      return;
    }
    await delay(200);
  }
  const diagnostic = sanitizeDiagnostic({ message: JSON.stringify(lastState ?? {}) }).message;
  throw new Error(
    `La vista ${expectedPath} no alcanzo contenido estable dentro del timeout de QA. Estado final: ${diagnostic}`
  );
}

async function openUserDrawer(client, sessionId) {
  const evaluation = await client.send(
    "Runtime.evaluate",
    {
      expression: `(() => {
        const trigger = document.querySelector('button[aria-label="Cuenta"]');
        if (!(trigger instanceof HTMLButtonElement)) return { clicked: false };
        trigger.click();
        return { clicked: true };
      })()`,
      returnByValue: true
    },
    sessionId
  );
  if (!evaluation.result?.value?.clicked) {
    throw new Error("No se encontro la accion canonica Cuenta para abrir UserDrawer.");
  }
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const drawer = await client.send(
      "Runtime.evaluate",
      { expression: "Boolean(document.querySelector('.py-user-drawer'))", returnByValue: true },
      sessionId
    );
    if (drawer.result?.value === true) {
      await delay(100);
      return;
    }
    await delay(100);
  }
  throw new Error("UserDrawer no abrio dentro del timeout de QA.");
}

async function ensureUserDrawerClosed(client, sessionId) {
  const evaluation = await client.send(
    "Runtime.evaluate",
    {
      expression: `(() => {
        if (!document.querySelector(".py-user-drawer")) return { wasOpen: false };
        document.dispatchEvent(new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          code: "Escape",
          key: "Escape"
        }));
        return { wasOpen: true };
      })()`,
      returnByValue: true
    },
    sessionId
  );
  if (!evaluation.result?.value?.wasOpen) return;

  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const drawer = await client.send(
      "Runtime.evaluate",
      { expression: "Boolean(document.querySelector('.py-user-drawer'))", returnByValue: true },
      sessionId
    );
    if (drawer.result?.value === false) return;
    await delay(100);
  }
  throw new Error("UserDrawer no cerro al aislar el siguiente escenario de QA.");
}

async function installCrmApiMock(client, sessionId, bootstrapFailure) {
  const now = "2026-07-15T12:00:00.000Z";
  const meta = { asOf: now, requestId: "qa-contract-request", tenantId: "tenant-qa-001" };
  const resources = {
    accounts: [{ id: "account-qa-001", name: "Cuenta sintetica QA", type: "organization", status: "active", ownerId: "team-qa", version: 1, updatedAt: now }],
    contacts: [{ id: "contact-qa-001", displayName: "Contacto sintetico QA", role: "patient", status: "active", version: 1, updatedAt: now }],
    cases: [{ id: "case-qa-001", subject: "Coordinacion sintetica QA", caseType: "appointment-coordination", priority: "normal", status: "in_progress", ownerId: "agent-qa", version: 1, updatedAt: now }],
    activities: [{ id: "activity-qa-001", subject: "Seguimiento sintetico QA", type: "call", status: "open", ownerId: "agent-qa", version: 1, updatedAt: now }],
    appointments: [{ id: "appointment-qa-001", status: "scheduled", resourceId: "resource-qa", startAt: "2026-07-16T14:00:00.000Z", endAt: "2026-07-16T15:00:00.000Z", timezone: "America/Santo_Domingo", version: 1, updatedAt: now }],
    opportunities: [{ id: "opportunity-qa-001", name: "Oportunidad sintetica QA", status: "open", stageId: "qualified", amountMinor: 125000, currency: "USD", probability: 40, version: 1, updatedAt: now }],
    reports: [{ id: "case-backlog", key: "case-backlog", label: "Seguimiento de casos", description: "Reporte sintetico de QA", status: "active", version: 1, updatedAt: now }]
  };
  const responses = {
    session: {
      ok: true,
      session: {
        csrfToken: "qa-browser-csrf-token",
        expiresAt: "2026-07-15T13:00:00.000Z",
        tenant: { id: "tenant-qa-001", label: "Tenant sintetico QA" },
        user: {
          displayName: "QA DemoCRM",
          email: "qa-democrm@pyrosa.local",
          locale: "es-DO",
          role: "superadmin",
          status: "active",
          timezone: "America/Santo_Domingo",
          primaryEmail: { email: "qa-democrm@pyrosa.local", isVerified: true },
          security: { activeMfaMethods: 1, mfaRequired: false }
        }
      }
    },
    bootstrap: {
      app: { branch: "main", name: "pyrosa-crm", version: "v2607" },
      context: {
        activeTenantId: "tenant-qa-001",
        displayName: "Tenant sintetico QA",
        profileKey: "healthcare-call-center",
        profileVersion: "1",
        tenantKey: "8ef427da9f0e",
        timezone: "America/Santo_Domingo"
      }
    },
    dashboard: {
      data: {
        contractVersion: "crm-dashboard-summary-v1",
        metricSetVersion: "healthcare-call-center@1",
        profileVersion: "healthcare-call-center@1",
        period: { from: "2026-06-15T12:00:00.000Z", to: now },
        timezone: "America/Santo_Domingo",
        asOf: now,
        freshness: { state: "live", generatedAt: now, ageSeconds: 0 },
        score: { value: 92, formulaVersion: "crm-operational-score@1", dimensions: [] },
        metrics: [
          { key: "cases.open", label: "Casos abiertos", value: 8, unit: "casos", tone: "neutral" },
          { key: "cases.overdue", label: "Casos vencidos", value: 1, unit: "casos", tone: "warning", target: 0 },
          { key: "appointments.exceptions", label: "Excepciones de agenda", value: 0, unit: "citas", tone: "success", target: 0 }
        ],
        signals: [
          { key: "profile", label: "Perfil", value: "healthcare-call-center@1", tone: "neutral" },
          { key: "dictionary", label: "Diccionario", value: "2.0.1", tone: "success" }
        ],
        progress: [{ key: "sla", label: "Cumplimiento SLA", value: 96, target: 95, unit: "%" }],
        risks: [{ key: "cases-overdue", label: "Casos vencidos", count: 1, route: "#casos?status=overdue", severity: "medium" }],
        domains: [
          { key: "accounts", label: "Cuentas", value: 4, route: "#cuentas", status: "live" },
          { key: "contacts", label: "Contactos", value: 9, route: "#contactos", status: "live" },
          { key: "cases", label: "Casos", value: 8, route: "#casos", status: "live" },
          { key: "appointments", label: "Agenda", value: 3, route: "#agenda", status: "live" }
        ],
        insights: [{ key: "case-sla", title: "Priorizar caso vencido", detail: "Un caso sintetico requiere revision.", route: "#casos?status=overdue", tone: "warning" }]
      },
      meta
    }
  };
  const source = `(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      const path = new URL(url, window.location.href).pathname;
      const json = (payload, status = 200, requestId = "qa-contract-request") => Promise.resolve(new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json", "x-request-id": requestId }
      }));
      if (path === "/api/crm/bootstrap" && ${JSON.stringify(bootstrapFailure)}) {
        return Promise.resolve(new Response(JSON.stringify({
          error: {
            code: "crm.bootstrap.qa_failure",
            message: "DemoCRM tiene un problema interno temporal.",
            requestId: "qa-fatal-request",
            occurredAt: "2026-07-15T00:00:00.000Z",
            retryable: true,
            fields: []
          }
        }), {
          status: 503,
          headers: { "content-type": "application/json", "x-request-id": "qa-fatal-request" }
        }));
      }
      if (path === "/api/crm/session") return json(${JSON.stringify(responses.session)});
      if (path === "/api/crm/bootstrap") return json(${JSON.stringify(responses.bootstrap)});
      if (path === "/api/crm/v1/dashboard-summary") return json(${JSON.stringify(responses.dashboard)});
      if (path.startsWith("/api/crm/v1/")) {
        const resource = path.slice("/api/crm/v1/".length).split("/")[0];
        const rows = ${JSON.stringify(resources)}[resource];
        if (Array.isArray(rows)) {
          return json({ data: rows, meta: ${JSON.stringify(meta)}, page: { limit: 25, nextCursor: null, total: rows.length } });
        }
      }
      return nativeFetch(input, init);
    };
  })();`;
  const result = await client.send("Page.addScriptToEvaluateOnNewDocument", { source }, sessionId);
  return result.identifier;
}

async function inspectPage(client, sessionId, visualCase) {
  const expression = `(() => {
    const text = document.body?.innerText ?? "";
    const root = document.documentElement;
    const drawer = document.querySelector(".py-user-drawer");
    const drawerRect = drawer?.getBoundingClientRect();
    return {
      path: location.pathname + location.hash,
      title: document.title,
      bodyScrollWidth: root.scrollWidth,
      viewportWidth: window.innerWidth,
      tableCount: document.querySelectorAll("table").length,
      drawerPresent: Boolean(drawer),
      shellPresent: Boolean(document.querySelector(".py-app-shell")),
      sidebarPresent: Boolean(document.querySelector(".py-sidebar")),
      topbarPresent: Boolean(document.querySelector(".py-topbar")),
      requiredSelectorPresent: ${JSON.stringify(visualCase.requiredSelector ?? "")} === "" || Boolean(document.querySelector(${JSON.stringify(visualCase.requiredSelector ?? "body")})),
      drawerWithinViewport: !drawerRect || (
        drawerRect.left >= -1 && drawerRect.right <= window.innerWidth + 1 &&
        drawerRect.top >= -1 && drawerRect.bottom <= window.innerHeight + 1
      ),
      hasLoginRedirect: location.pathname.includes("/auth/login") || text.includes("Autenticacion requerida"),
      hasContractFallback: text.includes("Contrato local") || text.includes("fallback local"),
      hasRuntimeError: text.includes("PYROSA CRM no pudo completar la solicitud"),
      missing: ${JSON.stringify(visualCase.expect)}.filter((item) => !text.includes(item))
    };
  })()`;
  const evaluation = await client.send("Runtime.evaluate", { expression, returnByValue: true }, sessionId);
  const value = evaluation.result?.value ?? {};
  const failures = [];
  const expectedPath = `/ui#${visualCase.hash}`;
  if (value.path !== expectedPath) failures.push(`ruta inesperada ${value.path ?? "desconocida"}; se esperaba ${expectedPath}`);
  if (value.hasLoginRedirect) failures.push("la sesion QA fue redirigida a login");
  if (value.hasContractFallback) failures.push("la UI mostro fallback por contratos no disponibles");
  if (value.hasRuntimeError) failures.push("la UI mostro error runtime");
  if (visualCase.expectedFatal) {
    if (value.shellPresent || value.sidebarPresent || value.topbarPresent) failures.push("la landing fatal se renderizo dentro del SharedShell");
  } else if (!value.shellPresent || !value.sidebarPresent || !value.topbarPresent) {
    failures.push("faltan superficies del SharedShell");
  }
  if (!value.requiredSelectorPresent) failures.push(`falta selector requerido ${visualCase.requiredSelector}`);
  if (!visualCase.interaction && value.drawerPresent) failures.push("UserDrawer quedo abierto fuera de su escenario");
  if (Array.isArray(value.missing) && value.missing.length > 0) failures.push(`faltan textos esperados: ${value.missing.join(", ")}`);
  if (visualCase.forbidTables && Number(value.tableCount) > 0) failures.push(`Dashboard renderizo ${value.tableCount} tabla(s)`);
  if (Number(value.bodyScrollWidth) > Number(value.viewportWidth) + 12) failures.push(`overflow horizontal body ${value.bodyScrollWidth}/${value.viewportWidth}`);
  if (!value.drawerWithinViewport) failures.push("UserDrawer excede el viewport");
  return { ...value, failures };
}

function relativeScreenshot(outDir, screenshotPath) {
  const path = relative(outDir, screenshotPath).replaceAll("\\", "/");
  if (!path || path.startsWith("../") || path.includes("/../")) {
    throw new Error("La captura quedo fuera del directorio de evidencia.");
  }
  return path;
}

function sanitizeDiagnostic(entry) {
  const message = String(entry?.message ?? "")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, "[email]")
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/giu, "[authorization]")
    .replace(/([?&](?:code|state|token|ticket|secret|session|password)=)[^&\s]+/giu, "$1[redacted]")
    .replace(/(https?:\/\/[^\s?]+)\?[^\s]+/giu, "$1?[redacted]")
    .replace(/PYROSA_CRM_SESSION=[^;\s]+/gu, "PYROSA_CRM_SESSION=[redacted]")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 500);
  return { level: entry?.level ?? "error", source: entry?.source ?? "browser", message };
}

function sanitizeEvidence(value) {
  if (Array.isArray(value)) return value.map(sanitizeEvidence);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeEvidence(item)]));
  }
  if (typeof value !== "string") return value;
  return sanitizeDiagnostic({ message: value }).message;
}

async function atomicWriteFile(path, contents) {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, contents, { mode: 0o640 });
  await rename(temporaryPath, path);
  await chmod(path, 0o640);
}

async function terminateProcess(process) {
  if (process.exitCode !== null) return;
  process.kill("SIGTERM");
  await Promise.race([
    new Promise((resolvePromise) => process.once("exit", resolvePromise)),
    delay(1_000)
  ]);
  if (process.exitCode === null) process.kill("SIGKILL");
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.eventQueue = [];
    this.eventWaiters = [];
    this.listeners = new Map();
    socket.addEventListener("message", (event) => this.handleMessage(JSON.parse(String(event.data))));
  }

  static connect(url) {
    return new Promise((resolvePromise, reject) => {
      const socket = new WebSocket(url);
      const timeout = setTimeout(() => reject(new Error("Timeout conectando con Chromium DevTools")), 10_000);
      socket.addEventListener("open", () => {
        clearTimeout(timeout);
        resolvePromise(new CdpClient(socket));
      });
      socket.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("No fue posible conectar con Chromium DevTools"));
      });
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? new Set();
    listeners.add(listener);
    this.listeners.set(method, listeners);
    return () => listeners.delete(listener);
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId;
    this.nextId += 1;
    const message = { id, method, params, ...(sessionId ? { sessionId } : {}) };
    return new Promise((resolvePromise, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 15_000);
      this.pending.set(id, { resolve: resolvePromise, reject, timeout });
      this.socket.send(JSON.stringify(message));
    });
  }

  waitForEvent(method, sessionId, timeoutMs) {
    const queuedIndex = this.eventQueue.findIndex((event) => event.method === method && (!sessionId || event.sessionId === sessionId));
    if (queuedIndex >= 0) return Promise.resolve(this.eventQueue.splice(queuedIndex, 1)[0].params);
    return new Promise((resolvePromise, reject) => {
      const timeout = setTimeout(() => {
        this.eventWaiters = this.eventWaiters.filter((waiter) => waiter.resolve !== resolvePromise);
        reject(new Error(`CDP event timeout: ${method}`));
      }, timeoutMs);
      this.eventWaiters.push({ method, sessionId, resolve: resolvePromise, timeout });
    });
  }

  handleMessage(message) {
    if (message.id && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) pending.reject(new Error(`${message.error.message}: ${message.error.data ?? ""}`));
      else pending.resolve(message.result ?? {});
      return;
    }

    for (const listener of this.listeners.get(message.method) ?? []) {
      listener(message.params ?? {}, message.sessionId);
    }
    const waiterIndex = this.eventWaiters.findIndex(
      (waiter) => waiter.method === message.method && (!waiter.sessionId || waiter.sessionId === message.sessionId)
    );
    if (waiterIndex >= 0) {
      const waiter = this.eventWaiters.splice(waiterIndex, 1)[0];
      clearTimeout(waiter.timeout);
      waiter.resolve(message.params ?? {});
      return;
    }
    this.eventQueue.push(message);
    if (this.eventQueue.length > 200) this.eventQueue.shift();
  }

  close() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Conexion CDP cerrada."));
    }
    for (const waiter of this.eventWaiters) {
      clearTimeout(waiter.timeout);
      waiter.resolve({});
    }
    this.pending.clear();
    this.eventWaiters = [];
    this.listeners.clear();
    this.socket.close();
  }
}

main().catch((error) => {
  console.error(sanitizeDiagnostic({ message: error instanceof Error ? error.stack : String(error) }).message);
  process.exitCode = 1;
});
