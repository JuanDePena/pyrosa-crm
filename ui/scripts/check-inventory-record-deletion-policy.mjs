#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const inventory = JSON.parse(readFileSync(resolve(import.meta.dirname, "inventory-record-deletion-policy.json"), "utf8"));
const policySource = readFileSync(resolve(root, "server/crmV1DeletionPolicy.ts"), "utf8");
const httpSource = readFileSync(resolve(root, "server/crmV1Http.ts"), "utf8");
const postgresSource = readFileSync(resolve(root, "server/crmV1Postgres.ts"), "utf8");
const viewsSource = readFileSync(resolve(root, "src/ResourceViews.tsx"), "utf8");
const recycleSource = readFileSync(resolve(root, "src/RecycleBinView.tsx"), "utf8");

const failures = [];
const check = (label, condition) => { if (!condition) failures.push(label); };
check("inventory schema/application", inventory.schemaVersion === "pyrosa-inventory-record-deletion-inventory-v1" && inventory.application === "pyrosa-democrm");
check("strict server environment", inventory.environmentSource === "APP_ENV" && JSON.stringify(inventory.environmentAllowlist) === JSON.stringify(["development", "production"]));
check("purge and bulk delete excluded", inventory.permanentPurge === false && inventory.bulkDelete === false);
check("all surfaces classified", inventory.resources.length === 9 && inventory.resources.every((entry) => entry.class && entry.owner && entry.lifecycle));

for (const entry of inventory.resources.filter((candidate) => candidate.lifecycle === "enabled")) {
  check(`${entry.resource} exact capability`, policySource.includes(`${entry.resource}: { capability: "${entry.capability}"`));
  check(`${entry.resource} exact command`, httpSource.includes("store.trash(resource, id") && entry.command.endsWith("/:id/trash"));
  check(`${entry.resource} exact restore`, httpSource.includes("store.restore(resource, segments[2]") && entry.restoreCommand.includes(`/recycle-bin/${entry.resource}/`));
}
check("list projection has no per-row store calls", postgresSource.includes("deletionDependencyExpression(resource, \"source\")") && !viewsSource.includes("Promise.all("));
check("command revalidates under lock", postgresSource.indexOf("lockRecord(client") < postgresSource.indexOf("assertDeletionAllowed({"));
check("provider inventory owns delete dialog", viewsSource.includes("BusinessRecordInventoryTemplate") && viewsSource.includes("deletion:") && !viewsSource.includes("ConfirmActionDialog"));
check("provider recycle routes own inventory/detail", recycleSource.includes("BusinessRecordRecycleBinTemplate") && recycleSource.includes('mode: "inventory"') && recycleSource.includes('mode: "detail"'));
check("permanent delete semantic is absent", !`${viewsSource}\n${recycleSource}`.includes("record.delete"));
check("runtime SQL does not purge business rows", !/DELETE\s+FROM\s+\$\{schema\}\.crm_/iu.test(postgresSource));

if (failures.length) {
  for (const failure of failures) process.stderr.write(`FAIL ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`DemoCRM inventory deletion policy guard passed (${inventory.resources.length} classified surfaces).\n`);
}
