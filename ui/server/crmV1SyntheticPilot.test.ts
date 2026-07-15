import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import { runSyntheticPilot } from "./crmV1SyntheticPilot.js";

test("v2607 synthetic pilot covers the CRM domains without live side effects", async () => {
  const evidence = await runSyntheticPilot({
    seedPath: resolve("../database/seeds/v2607-synthetic.json"),
    generatedAt: "2026-07-15T00:00:00.000Z"
  });

  assert.equal(evidence.status, "passed");
  assert.equal(evidence.classification, "isolated-synthetic");
  assert.equal(evidence.input.workbookRead, false);
  assert.equal(evidence.execution.databaseAccess, false);
  assert.equal(evidence.execution.liveTenantMutation, false);
  assert.ok(evidence.assertions.length >= 15);
  assert.ok(evidence.assertions.every((item) => item.status === "pass"));
  assert.ok(Object.values(evidence.aggregateCounts.primaryTenant).every((value) => value === 1));
  assert.ok(Object.values(evidence.aggregateCounts.controlTenant).every((value) => value === 0));
  assert.equal(evidence.aggregateCounts.import.quarantinedRecords, 2);
  assert.equal(evidence.aggregateCounts.import.committedRecords, 1);
  assert.equal(evidence.aggregateCounts.import.rolledBackBatches, 1);
  assert.equal(evidence.privacy.sensitiveValuesPersistedInEvidence, false);
  assert.equal(evidence.canary.livePromotion, false);
});
