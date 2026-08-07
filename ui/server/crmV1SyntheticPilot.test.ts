import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { test } from "node:test";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  parseSyntheticPilotCliArguments,
  runSyntheticPilot,
  writeSyntheticPilotEvidence
} from "./crmV1SyntheticPilot.js";

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

test("synthetic pilot evidence requires an explicit output directory", async () => {
  assert.throws(
    () => parseSyntheticPilotCliArguments([]),
    /evidenceDirectory es obligatorio/
  );
  assert.throws(
    () => parseSyntheticPilotCliArguments(["--evidence-directory"]),
    /requiere una ruta explicita/
  );
  assert.throws(
    () => parseSyntheticPilotCliArguments(["--unknown", "value"]),
    /Argumento no reconocido/
  );

  const parsed = parseSyntheticPilotCliArguments(["--evidence-directory", "./tmp/pilot-evidence"]);
  assert.equal(parsed.evidenceDirectory, resolve("./tmp/pilot-evidence"));
});

test("synthetic pilot writes evidence only to the caller-provided temporary directory", async () => {
  const evidenceDirectory = await mkdtemp(join(tmpdir(), "pyrosa-democrm-pilot-"));
  try {
    const evidence = await runSyntheticPilot({
      seedPath: resolve("../database/seeds/v2607-synthetic.json"),
      generatedAt: "2026-07-15T00:00:00.000Z"
    });
    await assert.rejects(
      writeSyntheticPilotEvidence(evidence, ""),
      /evidenceDirectory es obligatorio/
    );

    const paths = await writeSyntheticPilotEvidence(evidence, evidenceDirectory);
    assert.equal(paths.jsonPath.startsWith(`${evidenceDirectory}/`), true);
    assert.equal(paths.markdownPath.startsWith(`${evidenceDirectory}/`), true);
    assert.deepEqual(JSON.parse(await readFile(paths.jsonPath, "utf8")), evidence);
    const markdown = await readFile(paths.markdownPath, "utf8");
    assert.match(markdown, /Estado: `passed`/);
    assert.match(markdown, /--evidence-directory \/ruta\/segura/);
  } finally {
    await rm(evidenceDirectory, { recursive: true, force: true });
  }
});
