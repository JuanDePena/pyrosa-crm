#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const uiRoot = resolve(import.meta.dirname, "..");
const contractPath = resolve(import.meta.dirname, "pyrosa-ui-adoption-contract.json");
const contract = readJson(contractPath);
const packageJson = readJson(resolve(uiRoot, "package.json"));
const appSource = readSource(contract.sources.app);
const routeSource = readSource(contract.sources.routes);
const stylesSource = readSource(contract.sources.styles);
const visualQaSource = readSource(contract.sources.visualQa);

const checks = [];

check("contract schema and application identity are stable", () =>
  contract.schemaVersion === 1 &&
  contract.application === "pyrosa-democrm" &&
  contract.profile === "business-ops" &&
  contract.theme === "pyrosa-base@1.0.0" &&
  contract.status === "pilot"
);

for (const dependency of contract.sharedDependencies) {
  check(`shared dependency ${dependency} is declared through a local workspace package`, () =>
    typeof packageJson.dependencies?.[dependency] === "string" &&
    packageJson.dependencies[dependency].startsWith("file:")
  );
}

check("route registry exports the canonical routeDefinitions collection", () =>
  /export\s+const\s+routeDefinitions\s*[:=]/u.test(routeSource)
);

const routeArray = extractAssignedArray(routeSource, "routeDefinitions");
const routeObjects = extractTopLevelObjects(routeArray);
const routesById = new Map(
  routeObjects
    .map((source) => ({ source, id: stringProperty(source, "id") }))
    .filter(({ id }) => Boolean(id))
    .map((route) => [route.id, route])
);

check("route registry contains only the ten governed CRM routes", () =>
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
  check(`route ${expected.id} has searchable keywords`, () =>
    Boolean(route) && arrayPropertyHasString(route.source, "keywords")
  );
}

check("route registry exposes the shared navigation adapter", () =>
  routeSource.includes("export function createCrmSidebarItems") &&
  routeSource.includes("routeDefinitions.map") &&
  routeSource.includes("groupId: route.groupId") &&
  routeSource.includes("groupLabel: route.groupLabel") &&
  routeSource.includes("groupOrder: route.groupOrder") &&
  routeSource.includes("itemOrder: route.itemOrder") &&
  routeSource.includes("keywords: route.keywords")
);
check("application consumes the canonical navigation adapter", () =>
  appSource.includes("createCrmSidebarItems({") && !appSource.includes("const navItems = routeDefinitions.map")
);

const dashboardSource = extractFunction(appSource, contract.dashboard.component);
check("Dashboard exposes the governed analytic marker", () =>
  dashboardSource.includes(contract.dashboard.requiredMarker)
);
for (const fragment of contract.dashboard.forbiddenFragments) {
  check(`Dashboard does not render operational fragment ${fragment}`, () =>
    Boolean(dashboardSource) && !dashboardSource.includes(fragment)
  );
}
check("Dashboard retains shared analytic primitives", () =>
  dashboardSource.includes("<MetricGrid") &&
  dashboardSource.includes("<MetricCard") &&
  dashboardSource.includes("<Panel")
);

check("BusinessOpsShellTemplate is imported and owns the main shell", () =>
  appSource.includes('from "@pyrosa/ui-templates"') &&
  appSource.includes(`<${contract.shell.component}`) &&
  !appSource.includes("<AppShell") &&
  !appSource.includes("<Sidebar") &&
  !appSource.includes("<Topbar")
);
for (const [prop, value] of [
  ["brandTitle", contract.shell.brandTitle],
  ["environment", contract.shell.environment],
  ["sidebarPersistKey", contract.shell.sidebarPersistKey],
  ["userLabel", contract.shell.userLabel]
]) {
  check(`shared shell pins ${prop}`, () => appSource.includes(`${prop}="${value}"`));
}
check("shared shell persists scroll independently by route", () =>
  appSource.includes(`contentScrollPersistKey={\`${contract.shell.contentScrollPersistKeyPrefix}\${activeRoute}\`}`)
);
check("Overview does not expose an inert back action", () =>
  contract.shell.overviewBackAction === "hidden" &&
  appSource.includes('leadingAction={activeRoute === "dashboard" ? false : undefined}')
);
check("shared shell owns theme, alert and account actions", () =>
  appSource.includes("onThemeToggle=") &&
  appSource.includes("onAlertsClick=") &&
  appSource.includes("onUserClick=") &&
  appSource.includes("alertsExpanded=") &&
  appSource.includes("userExpanded=")
);

check("shared UserDrawer is imported and rendered", () =>
  new RegExp(`\\b${escapeRegExp(contract.userDrawer.component)}\\b`, "u").test(appSource) &&
  appSource.includes(`<${contract.userDrawer.component}`) &&
  appSource.includes('className="py-user-drawer"') === false
);
for (const title of contract.userDrawer.requiredSections) {
  check(`UserDrawer exposes ${title}`, () => appSource.includes(`title: "${title}"`));
}
for (const component of contract.userDrawer.forbiddenLocalComponents) {
  check(`legacy local drawer ${component} remains absent`, () =>
    !new RegExp(`function\\s+${escapeRegExp(component)}\\b|<${escapeRegExp(component)}\\b`, "u").test(appSource)
  );
}
for (const fragment of contract.userDrawer.forbiddenAuthorityFragments) {
  check(`CRM does not persist IAM authority fragment ${fragment}`, () => !appSource.includes(fragment));
}
check("drawer state is mutually exclusive", () =>
  appSource.includes("const [openDrawer, setOpenDrawer]") &&
  appSource.includes('openDrawer === "alerts"') &&
  appSource.includes('openDrawer === "user"') &&
  appSource.includes("setOpenDrawer((current)")
);
check("drawer closes through the shared Escape path", () =>
  appSource.includes("closeDrawerOnEscape") &&
  appSource.includes('event.key !== "Escape"') &&
  appSource.includes("setOpenDrawer(null)")
);

const cssClasses = collectCrmClassNames(stylesSource);
const classifiedCssPrefixes = Object.values(contract.css.classification).flat();
check("CSS contract includes keep, shim, cleanup and blocker classifications", () =>
  ["keep", "shim", "cleanup", "blocker"].every((classification) =>
    Array.isArray(contract.css.classification[classification])
  )
);
check("CSS contract has no open blocker selectors", () => contract.css.classification.blocker.length === 0);
check("every local CRM selector is classified", () =>
  [...cssClasses].every((className) =>
    classifiedCssPrefixes.some((prefix) => className === prefix || className.startsWith(`${prefix}-`) || className.startsWith(`${prefix}__`))
  )
);
check("CSS classifications do not overlap", () => new Set(classifiedCssPrefixes).size === classifiedCssPrefixes.length);
for (const prefix of classifiedCssPrefixes) {
  check(`classified CSS prefix ${prefix} is backed by local styles`, () =>
    [...cssClasses].some((className) => className === prefix || className.startsWith(`${prefix}-`) || className.startsWith(`${prefix}__`))
  );
}
for (const selector of contract.css.forbiddenSharedShellOverrides) {
  check(`local CSS does not override shared shell selector ${selector}`, () => !stylesSource.includes(selector));
}

check("visual QA script declares the complete desktop and narrow evidence matrix", () =>
  contract.visualQa.requiredCases.every((id) => visualQaSource.includes(`id: "${id}"`))
);
check("visual QA evidence is explicitly sanitized", () =>
  contract.visualQa.sanitizedEvidence === true &&
  visualQaSource.includes("sanitizeEvidence") &&
  visualQaSource.includes("relativeScreenshot") &&
  !visualQaSource.includes("textSample:")
);
check("visual QA captures the shared UserDrawer through its account action", () =>
  visualQaSource.includes('interaction: "open-user-drawer"') &&
  visualQaSource.includes('button[aria-label="Cuenta"]') &&
  visualQaSource.includes(".py-user-drawer")
);
check("visual QA rejects Dashboard tables and horizontal overflow", () =>
  visualQaSource.includes("forbidTables") &&
  visualQaSource.includes("bodyScrollWidth") &&
  visualQaSource.includes("drawerWithinViewport")
);

check("rollback contract remains actionable and covers all close gates", () =>
  contract.rollback.strategy === "source-revert" &&
  contract.rollback.steps.length >= 4 &&
  ["check:pyrosa-ui", "typecheck", "build", "qa:visual"].every((gate) =>
    contract.rollback.validation.includes(gate)
  )
);
check("package exposes the durable Pyrosa UI gate", () =>
  packageJson.scripts?.["check:pyrosa-ui"] === "node ./scripts/check-pyrosa-ui-adoption.mjs" &&
  packageJson.scripts?.["test:run"]?.includes("npm run check:pyrosa-ui")
);

const failures = checks.filter((entry) => !entry.pass);
for (const entry of checks) {
  console.log(`${entry.pass ? "ok" : "fail"} - ${entry.label}`);
}

if (failures.length > 0) {
  console.error(`Pyrosa UI adoption contract failed: ${failures.length} check(s).`);
  process.exitCode = 1;
} else {
  console.log(`Pyrosa UI adoption contract passed: ${checks.length} checks.`);
}

function check(label, evaluate) {
  let pass = false;
  try {
    pass = Boolean(evaluate());
  } catch {
    pass = false;
  }
  checks.push({ label, pass });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readSource(relativePath) {
  return readFileSync(resolve(uiRoot, relativePath), "utf8");
}

function extractAssignedArray(source, variableName) {
  const declaration = new RegExp(`(?:export\\s+)?const\\s+${escapeRegExp(variableName)}[\\s\\S]*?=\\s*\\[`, "u").exec(source);
  if (!declaration) {
    return "";
  }
  const openIndex = declaration.index + declaration[0].lastIndexOf("[");
  return extractBalanced(source, openIndex, "[", "]");
}

function extractFunction(source, functionName) {
  const declaration = new RegExp(`function\\s+${escapeRegExp(functionName)}\\s*\\(`, "u").exec(source);
  if (!declaration) {
    return "";
  }
  const parametersOpenIndex = source.indexOf("(", declaration.index);
  const parameters = extractBalanced(source, parametersOpenIndex, "(", ")");
  const openIndex = source.indexOf("{", parametersOpenIndex + parameters.length);
  return openIndex === -1 ? "" : extractBalanced(source, openIndex, "{", "}");
}

function extractBalanced(source, openIndex, openCharacter, closeCharacter) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      blockComment = true;
      index += 1;
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
