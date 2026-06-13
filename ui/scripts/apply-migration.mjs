import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "../..");
const migrationsDir = join(appRoot, "database", "migrations");

async function main() {
  const client = new Client(resolvePgConfig());
  await client.connect();

  try {
    await client.query(`
      create table if not exists crm_schema_migrations (
        version text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const migrationFiles = (await readdir(migrationsDir))
      .filter((entry) => entry.endsWith(".sql"))
      .sort();

    for (const fileName of migrationFiles) {
      const version = fileName.replace(/\.sql$/, "");
      const applied = await client.query(
        "select 1 from crm_schema_migrations where version = $1",
        [version]
      );
      if ((applied.rowCount ?? 0) > 0) {
        process.stdout.write(`Skipping ${fileName}; already applied.\n`);
        continue;
      }

      const sql = await readFile(join(migrationsDir, fileName), "utf8");
      process.stdout.write(`Applying ${fileName}...\n`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "insert into crm_schema_migrations (version) values ($1) on conflict (version) do nothing",
          [version]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

function resolvePgConfig() {
  if (process.env.PYROSA_CRM_DB_DSN?.trim()) {
    return {
      connectionString: process.env.PYROSA_CRM_DB_DSN.trim()
    };
  }

  return {
    host: process.env.PYROSA_CRM_DB_HOST || "127.0.0.1",
    port: Number(process.env.PYROSA_CRM_DB_PORT || 5432),
    database: process.env.PYROSA_CRM_DB_DATABASE || "app_pyrosa_democrm",
    user: process.env.PYROSA_CRM_DB_USER || "app_pyrosa_democrm",
    password: process.env.PYROSA_CRM_DB_PASSWORD || ""
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
