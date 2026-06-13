import pg from "pg";
import type { CrmServerConfig } from "./config.js";

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
  } catch (error) {
    return {
      ok: false,
      database: config.dbDatabase,
      error: error instanceof Error ? error.message : String(error)
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
