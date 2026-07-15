#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const uiRoot = resolve(import.meta.dirname, "..");
const contract = readJson(resolve(import.meta.dirname, "pyrosa-ui-adoption-contract.json"));
const packageJson = readJson(resolve(uiRoot, "package.json"));
const packageLock = readJson(resolve(uiRoot, "package-lock.json"));
const sources = Object.fromEntries(
  Object.entries(contract.sources).map(([key, path]) => [key, readFileSync(resolve(uiRoot, path), "utf8")])
);
const productSources = [
  sources.app,
  sources.api,
  sources.dashboard,
  sources.fatalError,
  sources.resourceConfig,
  sources.resources,
  sources.routes,
  sources.routing
].join("\n");
const checks = [];

check("contract schema and application identity are ready", () =>
  contract.schemaVersion === 2 &&
  contract.application === "pyrosa-democrm" &&
  contract.profile === "business-ops" &&
  contract.theme === "pyrosa-base@1.0.0" &&
  contract.status === "ready"
);

for (const [dependency, expectedVersion] of Object.entries(contract.sharedDependencies)) {
  const provenance = contract.packageProvenance?.packages?.[dependency];
  const expectedUrl = `${contract.packageProvenance?.baseUrl}/${provenance?.tarball}`;
  const locked = packageLock.packages?.[`node_modules/${dependency}`];
  check(`shared dependency ${dependency} is pinned to immutable ${expectedVersion}`, () =>
    provenance?.sha256?.match(/^[0-9a-f]{64}$/u) &&
    packageJson.dependencies?.[dependency] === expectedUrl &&
    locked?.version === expectedVersion &&
    locked?.resolved === expectedUrl &&
    locked?.integrity === provenance.integrity
  );
}

check("shared package bundle pins published aggregate provenance", () =>
  /^[0-9a-f]{64}$/u.test(contract.packageProvenance?.aggregateSha256 ?? "")
);

check("route registry exports the canonical routeDefinitions collection", () =>
  /export\s+const\s+routeDefinitions\s*[:=]/u.test(sources.routes)
);
const routeArray = extractAssignedArray(sources.routes, "routeDefinitions");
const routeObjects = extractTopLevelObjects(routeArray);
const routesById = new Map(
  routeObjects
    .map((source) => ({ source, id: stringProperty(source, "id") }))
    .filter(({ id }) => Boolean(id))
    .map((route) => [route.id, route])
);
check("route registry contains only the nine governed v2607 routes", () =>
  routesById.size === contract.routes.length &&
  contract.routes.every((route) => routesById.has(route.id))
);
for (const expected of contract.routes) {
  const route = routesById.get(expected.id);
  check(`route ${expected.id} declares every SidebarItem metadata field`, () =>
    Boolean(route) && contract.routeRequiredFields.every((field) => hasObjectProperty(route.source, field))
  );
  for (const field of ["hash", "groupId", "groupLabel"]) {
    check(`route ${expected.id} keeps canonical ${field}`, () =>
      Boolean(route) && stringProperty(route.source, field) === expected[field]
    );
  }
  for (const field of ["groupOrder", "itemOrder"]) {
    check(`route ${expected.id} keeps canonical ${field}`, () =>
      Boolean(route) && numberProperty(route.source, field) === expected[field]
    );
  }
  check(`route ${expected.id} remains searchable`, () =>
    Boolean(route) && arrayPropertyHasString(route.source, "keywords")
  );
}
check("navigation exposes exactly one optional live status and no static badge", () =>
  sources.routes.includes("status: statusByRoute?.[route.id]") &&
  !sources.routes.includes("badge: route.badge") &&
  !routeObjects.some((route) => hasObjectProperty(route, "badge"))
);
check("application consumes the canonical navigation adapter", () =>
  sources.app.includes("createCrmSidebarItems({") && !sources.app.includes("routeDefinitions.map")
);

for (const route of contract.resourceViews.routes) {
  check(`resource ${route} maps to a CRM v1 endpoint`, () =>
    sources.resourceConfig.includes(`id: "${route}"`) &&
    sources.resourceConfig.includes(`/api/crm/v1/`)
  );
}
for (const mode of contract.resourceViews.modes) {
  check(`linked resource routing supports ${mode}`, () =>
    sources.routing.includes(`"${mode}"`) && productSources.includes(`mode === "${mode}"`)
  );
}
for (const state of contract.resourceViews.requiredStates) {
  check(`resource views expose ${state} state`, () =>
    sources.resources.includes(`"${state}"`)
  );
}
check("resource lists request backend pagination and typed filters", () =>
  sources.resources.includes('new URLSearchParams({ limit: "25" })') &&
  sources.resources.includes('parameters.set("q", query)') &&
  sources.resources.includes('parameters.set("status", status)') &&
  sources.resources.includes('parameters.set("cursor", cursor)')
);
check("resource writes protect create and update operations", () =>
  sources.resources.includes("newIdempotencyKey") &&
  sources.resources.includes("entityEtag") &&
  sources.resources.includes('method: isEdit ? "PATCH" : "POST"')
);
check("cases appointments opportunities and reports expose typed command endpoints", () =>
  [
    "/api/crm/v1/cases/${id}/transition",
    "/api/crm/v1/appointments/${id}/${action}",
    "/api/crm/v1/opportunities/${id}/transition",
    "/api/crm/v1/report-runs"
  ].every((fragment) => sources.resources.includes(fragment))
);

check("Dashboard consumes the real summary endpoint", () =>
  sources.dashboard.includes(contract.dashboard.endpoint) &&
  sources.dashboard.includes(contract.dashboard.requiredMarker)
);
for (const primitive of contract.dashboard.requiredPrimitives) {
  check(`Dashboard adopts shared executive primitive ${primitive}`, () =>
    new RegExp(`\\b${escapeRegExp(primitive)}\\b`, "u").test(sources.dashboard)
  );
}
for (const fragment of contract.dashboard.forbiddenFragments) {
  check(`Dashboard excludes operational or fixture fragment ${fragment}`, () =>
    !sources.dashboard.includes(fragment)
  );
}
check("Dashboard preserves explicit live empty stale and unavailable states", () =>
  ["live", "empty", "stale", "unavailable"].every((state) => sources.dashboard.includes(`"${state}"`)) &&
  sources.dashboard.includes("No se activaron metricas locales")
);
check("Dashboard links only through the allowlisted CRM hash resolver", () =>
  sources.dashboard.includes("allowedDashboardRoute") &&
  sources.routing.includes("routeHash(parsed.routeId")
);

check("BusinessOpsShellTemplate owns the shell", () =>
  sources.app.includes('from "@pyrosa/ui-templates"') &&
  sources.app.includes(`<${contract.shell.component}`) &&
  !sources.app.includes("<AppShell") &&
  !sources.app.includes("<Sidebar") &&
  !sources.app.includes("<Topbar")
);
for (const [prop, value] of [
  ["brandTitle", contract.shell.brandTitle],
  ["environment", contract.shell.environment],
  ["sidebarPersistKey", contract.shell.sidebarPersistKey],
  ["userLabel", contract.shell.userLabel]
]) {
  check(`shared shell pins ${prop}`, () => sources.app.includes(`${prop}="${value}"`));
}
check("shell metadata appears only in the sidebar", () =>
  contract.shell.showTopbarMeta === false &&
  sources.app.includes("showTopbarMeta={false}")
);
check("shell persists workspace scroll by route and mode", () =>
  sources.app.includes(`contentScrollPersistKey={\`${contract.shell.contentScrollPersistKeyPrefix}\${location.routeId}-\${location.mode}\`}`)
);
check("Overview hides the back action while nested views have deterministic back", () =>
  contract.shell.overviewBackAction === "hidden" &&
  sources.app.includes("leadingAction={canGoBack ? undefined : false}") &&
  sources.app.includes("function navigateBack()")
);
check("each view owns WorkspaceLayout and StatusStrip", () =>
  [sources.dashboard, sources.resources, readFileSync(resolve(uiRoot, "src/ConfigurationView.tsx"), "utf8")]
    .every((source) => source.includes("<WorkspaceLayout") && source.includes("<StatusStrip")) &&
  !sources.app.includes("<WorkspaceLayout") &&
  !sources.app.includes("<StatusStrip")
);

check("shared UserDrawer is rendered without a local drawer clone", () =>
  sources.app.includes(`<${contract.userDrawer.component}`) &&
  contract.userDrawer.forbiddenLocalComponents.every((component) =>
    !new RegExp(`function\\s+${escapeRegExp(component)}\\b|<${escapeRegExp(component)}\\b`, "u").test(productSources)
  )
);
for (const section of contract.userDrawer.requiredSections) {
  check(`UserDrawer exposes ${section}`, () => sources.app.includes(`title: "${section}"`));
}
for (const fragment of contract.userDrawer.forbiddenAuthorityFragments) {
  check(`CRM never persists IAM authority fragment ${fragment}`, () => !productSources.includes(fragment));
}
check("drawer state is mutually exclusive and closes on Escape", () =>
  sources.app.includes("const [openDrawer, setOpenDrawer]") &&
  sources.app.includes('openDrawer === "alerts"') &&
  sources.app.includes('openDrawer === "user"') &&
  sources.app.includes('event.key !== "Escape"')
);

check("fatal bootstrap errors render outside SharedShell", () =>
  sources.app.indexOf("<FatalErrorLanding") < sources.app.indexOf("<BusinessOpsShellTemplate") &&
  sources.app.includes("bootstrapState.kind === \"error\"")
);
check("fatal landing contains brand title subtitle message retry and technical disclosure", () =>
  sources.fatalError.includes("crm-logo.png") &&
  sources.fatalError.includes("<h1") &&
  sources.fatalError.includes("crm-fatal__subtitle") &&
  sources.fatalError.includes("{message}") &&
  sources.fatalError.includes("Intentar nuevamente") &&
  sources.fatalError.includes("<details") &&
  sources.fatalError.includes("Detalle tecnico")
);
for (const fragment of contract.fatalError.forbiddenFragments) {
  check(`fatal landing does not expose ${fragment}`, () => !sources.fatalError.includes(fragment));
}
check("render failures are contained by the fatal error boundary", () =>
  sources.fatalError.includes("FatalErrorBoundary") &&
  readFileSync(resolve(uiRoot, "src/main.tsx"), "utf8").includes("<FatalErrorBoundary>")
);

check("API client applies server-resolved tenant context", () =>
  sources.api.includes(contract.api.tenantHeader) &&
  sources.app.includes("bootstrap.context?.activeTenantId") &&
  !sources.app.includes("setTenantId")
);
for (const header of contract.api.requiredHeaders) {
  check(`API client supports ${header}`, () => sources.api.includes(header));
}
check("API client fails closed on network non-JSON and non-2xx responses", () =>
  sources.api.includes("crm.network.unavailable") &&
  sources.api.includes("crm.response.invalid_content_type") &&
  sources.api.includes("if (!response.ok)") &&
  sources.api.includes("throw new CrmApiError")
);
for (const fragment of contract.api.forbiddenFragments) {
  check(`product source excludes legacy fallback fragment ${fragment}`, () => !productSources.includes(fragment));
}

const cssClasses = collectCrmClassNames(sources.styles);
const classifiedCssPrefixes = Object.values(contract.css.classification).flat();
check("CSS contract includes keep shim cleanup and blocker classifications", () =>
  ["keep", "shim", "cleanup", "blocker"].every((name) => Array.isArray(contract.css.classification[name]))
);
check("CSS contract has no open blocker selectors", () => contract.css.classification.blocker.length === 0);
check("every local CRM selector is classified", () =>
  [...cssClasses].every((className) => classifiedCssPrefixes.some((prefix) =>
    className === prefix || className.startsWith(`${prefix}-`) || className.startsWith(`${prefix}__`)
  ))
);
check("CSS classifications do not overlap", () => new Set(classifiedCssPrefixes).size === classifiedCssPrefixes.length);
for (const prefix of classifiedCssPrefixes) {
  check(`classified CSS prefix ${prefix} is backed by local styles`, () =>
    [...cssClasses].some((className) => className === prefix || className.startsWith(`${prefix}-`) || className.startsWith(`${prefix}__`))
  );
}
for (const selector of contract.css.forbiddenSharedShellOverrides) {
  check(`local CSS does not override shared shell selector ${selector}`, () => !sources.styles.includes(selector));
}
check("local CSS contains no copied hexadecimal palette", () =>
  contract.css.forbidHexColors === true && !/#[0-9a-f]{3,8}\b/iu.test(sources.styles)
);
check("local CSS never targets shared pyrosa-ui internals", () =>
  contract.css.forbidSharedInternals === true && !/\.py-[a-z0-9_-]+/iu.test(sources.styles)
);

for (const id of contract.visualQa.requiredCases) {
  check(`visual QA declares ${id}`, () => sources.visualQa.includes(`id: "${id}"`));
}
check("visual QA evidence remains sanitized", () =>
  contract.visualQa.sanitizedEvidence === true &&
  sources.visualQa.includes("sanitizeEvidence") &&
  sources.visualQa.includes("relativeScreenshot") &&
  !sources.visualQa.includes("textSample:")
);
check("visual QA checks no Dashboard tables horizontal overflow and drawer bounds", () =>
  sources.visualQa.includes("forbidTables") &&
  sources.visualQa.includes("bodyScrollWidth") &&
  sources.visualQa.includes("drawerWithinViewport")
);

check("rollback remains actionable and covers every close gate", () =>
  contract.rollback.strategy === "source-revert" &&
  contract.rollback.steps.length >= 4 &&
  ["check:pyrosa-ui", "typecheck", "build", "qa:visual"].every((gate) => contract.rollback.validation.includes(gate))
);
check("package exposes the durable Pyrosa UI gate", () =>
  packageJson.scripts?.["check:pyrosa-ui"] === "node ./scripts/check-pyrosa-ui-adoption.mjs" &&
  packageJson.scripts?.["test:run"]?.includes("npm run check:pyrosa-ui")
);

const failures = checks.filter((entry) => !entry.pass);
for (const entry of checks) console.log(`${entry.pass ? "ok" : "fail"} - ${entry.label}`);
if (failures.length) {
  console.error(`Pyrosa UI adoption contract failed: ${failures.length} check(s).`);
  process.exitCode = 1;
} else {
  console.log(`Pyrosa UI adoption contract passed: ${checks.length} checks.`);
}

function check(label, evaluate) {
  let pass = false;
  try { pass = Boolean(evaluate()); } catch { pass = false; }
  checks.push({ label, pass });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function extractAssignedArray(source, variableName) {
  const declaration = new RegExp(`(?:export\\s+)?const\\s+${escapeRegExp(variableName)}[\\s\\S]*?=\\s*\\[`, "u").exec(source);
  if (!declaration) return "";
  const openIndex = declaration.index + declaration[0].lastIndexOf("[");
  return extractBalanced(source, openIndex, "[", "]");
}

function extractBalanced(source, openIndex, openCharacter, closeCharacter) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === openCharacter) depth += 1;
    if (character === closeCharacter) {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex, index + 1);
    }
  }
  return "";
}

function extractTopLevelObjects(arraySource) {
  const objects = [];
  let depth = 0;
  let start = -1;
  let quote = "";
  let escaped = false;
  for (let index = 1; index < arraySource.length - 1; index += 1) {
    const character = arraySource[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(arraySource.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return objects;
}

function hasObjectProperty(source, property) {
  return new RegExp(`(?:^|[,\\n]\\s*)${escapeRegExp(property)}\\s*:`, "u").test(source);
}

function stringProperty(source, property) {
  return new RegExp(`(?:^|[,\\n]\\s*)${escapeRegExp(property)}\\s*:\\s*["']([^"']+)["']`, "u").exec(source)?.[1] ?? "";
}

function numberProperty(source, property) {
  const value = new RegExp(`(?:^|[,\\n]\\s*)${escapeRegExp(property)}\\s*:\\s*(\\d+)`, "u").exec(source)?.[1];
  return value ? Number(value) : Number.NaN;
}

function arrayPropertyHasString(source, property) {
  const match = new RegExp(`(?:^|[,\\n]\\s*)${escapeRegExp(property)}\\s*:\\s*\\[([^\\]]*)\\]`, "u").exec(source);
  return Boolean(match?.[1] && /["'][^"']+["']/u.test(match[1]));
}

function collectCrmClassNames(source) {
  return new Set([...source.matchAll(/\.((?:crm)[a-zA-Z0-9_-]*)/gu)].map((match) => match[1]));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
