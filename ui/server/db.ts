import pg from "pg";
import type { CrmServerConfig } from "./config.js";
import type { CrmAccessContext } from "./crmV1Types.js";
import { CrmV1Error } from "./crmV1Domain.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(config: CrmServerConfig): pg.Pool {
  if (!pool) {
    pool = new Pool(resolvePgConfig(config));
  }
  return pool;
}

export async function queryPostgres<T extends pg.QueryResultRow = pg.QueryResultRow>(
  config: CrmServerConfig,
  text: string,
  values: unknown[] = []
): Promise<pg.QueryResult<T>> {
  return getPool(config).query<T>(text, values);
}

export async function withPostgresTransaction<T>(
  config: CrmServerConfig,
  work: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool(config).connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the domain/database error that caused the rollback.
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function withCrmTenantTransaction<T>(
  config: CrmServerConfig,
  access: CrmAccessContext,
  work: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const searchPath = crmTenantSearchPath(access);
  return withPostgresTransaction(config, async (client) => {
    await client.query(
      "SELECT set_config('search_path', $1, true)",
      [searchPath]
    );
    const observed = await client.query<{ search_path: string }>(
      "SELECT current_setting('search_path') AS search_path"
    );
    if (observed.rows[0]?.search_path !== searchPath) {
      throw new CrmV1Error(
        500,
        "crm.database.tenant_binding_failed",
        "PostgreSQL no confirmó el contexto tenant de la transacción."
      );
    }
    return work(client);
  });
}

export function crmTenantSearchPath(access: CrmAccessContext): string {
  return `pg_catalog,"${tenantSchema(access)}","pyrosa_democrm"`;
}

export async function closePostgres(): Promise<void> {
  if (!pool) {
    return;
  }
  const current = pool;
  pool = null;
  await current.end();
}

export async function loadDatabaseStatus(config: CrmServerConfig): Promise<Record<string, unknown>> {
  try {
    const result = await queryPostgres(config, "select current_database() as database_name, current_user as database_user");
    const row = result.rows[0] as { database_name?: string; database_user?: string } | undefined;
    return {
      ok: true,
      database: row?.database_name ?? config.dbDatabase,
      user: row?.database_user ?? config.dbUser
    };
  } catch {
    return {
      ok: false,
      database: config.dbDatabase,
      error: "crm.database.unavailable"
    };
  }
}

function resolvePgConfig(config: CrmServerConfig): pg.PoolConfig {
  const base: pg.PoolConfig = {
    connectionTimeoutMillis: config.dbConnectTimeoutMs,
    statement_timeout: config.dbStatementTimeoutMs,
    max: 5
  };

  if (config.dbDsn) {
    return {
      ...base,
      connectionString: config.dbDsn
    };
  }

  return {
    ...base,
    host: config.dbHost,
    port: config.dbPort,
    database: config.dbDatabase,
    user: config.dbUser,
    password: config.dbPassword
  };
}

function tenantSchema(access: CrmAccessContext): string {
  if (
    !/^pyrosa_(?:demo)?crm_[a-f0-9]{12}$/u.test(access.schemaName) ||
    !access.schemaName.endsWith(`_${access.tenantKey}`)
  ) {
    throw new CrmV1Error(
      500,
      "crm.schema.invalid",
      "El contexto CRM no contiene un schema tenant válido."
    );
  }
  return access.schemaName;
}
