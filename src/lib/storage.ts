import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AsyncLocalStorage } from "node:async_hooks";
import mysql from "mysql2/promise";
import { Pool } from "pg";
import { databaseIdentifier, verifyDatabaseIdentifier } from "./database-identity";

export type StorageConfig = {
  engine: "sqlite" | "mysql" | "postgres" | "supabase";
  databaseCode?: string;
  ca?: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  tls: boolean;
};
export const dataDirectory = path.resolve(
  process.env.DATA_DIR || path.join(process.cwd(), "data"),
);
export const configPath = path.join(dataDirectory, "storage.json");
export const defaultConfig: StorageConfig = {
  engine: "sqlite",
  host: "localhost",
  port: 3306,
  database: "service_report",
  username: "",
  password: "",
  tls: false,
};

export function readConfig(): StorageConfig {
  const saved = existsSync(configPath)
    ? JSON.parse(readFileSync(configPath, "utf8"))
    : defaultConfig;
  return validateConfig({
    ...saved,
    ...(process.env.DB_ENGINE ? { engine: process.env.DB_ENGINE } : {}),
    ...(process.env.DB_HOST ? { host: process.env.DB_HOST } : {}),
    ...(process.env.DB_PORT ? { port: Number(process.env.DB_PORT) } : {}),
    ...(process.env.DB_NAME ? { database: process.env.DB_NAME } : {}),
    ...(process.env.DB_USER ? { username: process.env.DB_USER } : {}),
    ...(process.env.DB_PASSWORD !== undefined
      ? { password: process.env.DB_PASSWORD }
      : {}),
    ...(process.env.DB_TLS !== undefined
      ? { tls: process.env.DB_TLS === "true" }
      : {}),
    ...(process.env.DB_CODE !== undefined ? {databaseCode:process.env.DB_CODE} : {}),
    ...(process.env.DB_SSL_CA !== undefined ? {ca:process.env.DB_SSL_CA} : {}),
  });
}

export function validateConfig(input: unknown): StorageConfig {
  if (!input || typeof input !== "object")
    throw new Error("Enter storage connection settings.");
  const c = input as StorageConfig;
  if (!["sqlite", "mysql", "postgres", "supabase"].includes(c.engine))
    throw new Error("Choose SQLite, MySQL, PostgreSQL, or Supabase.");
  if(c.databaseCode && !/^\d{5}$/.test(c.databaseCode)) throw new Error('Invalid database identifier. Enter five digits.');
  if(c.ca !== undefined && (typeof c.ca !== 'string' || c.ca.length>16000)) throw new Error('Invalid TLS certificate.');
  if(c.engine === 'supabase' && !c.tls) throw new Error('Supabase requires TLS with certificate verification.');
  for (const key of ["host", "database", "username", "password"] as const) {
    if (typeof c[key] !== "string" || c[key].length > 512)
      throw new Error(`Invalid ${key}.`);
  }
  if (!Number.isInteger(c.port) || c.port < 1 || c.port > 65535)
    throw new Error("Port must be between 1 and 65535.");
  if (typeof c.tls !== "boolean") throw new Error("Invalid TLS setting.");
  if (
    c.engine !== "sqlite" &&
    (!c.host.trim() || !c.database.trim() || !c.username.trim())
  ) {
    throw new Error("Host, database, and username are required.");
  }
  return {
    engine: c.engine,
    host: c.host.trim(),
    port: c.port,
    database: c.database.trim(),
    username: c.username.trim(),
    password: c.password,
    tls: c.tls,
    ...(c.databaseCode ? {databaseCode:c.databaseCode} : {}),
    ...(c.ca ? {ca:c.ca} : {}),
  };
}

export function saveConfig(config: StorageConfig) {
  mkdirSync(dataDirectory, { recursive: true });
  const temporary = `${configPath}.tmp`;
  writeFileSync(temporary, JSON.stringify(config, null, 2), { mode: 0o600 });
  renameSync(temporary, configPath);
}

type Value = string | number | Buffer | Uint8Array | null;
export type Row = Record<string, unknown>;
type Session = { query: (sql: string, values: Value[]) => Promise<Row[]> };

export class Storage {
  readonly config: StorageConfig;
  private local?: DatabaseSync;
  private mysqlPool?: mysql.Pool;
  private pgPool?: Pool;
  private context = new AsyncLocalStorage<Session>();
  private tail: Promise<void> = Promise.resolve();

  constructor(config: StorageConfig) {
    this.config = config;
    if (config.engine === "sqlite") {
      mkdirSync(dataDirectory, { recursive: true });
      this.local = new DatabaseSync(path.join(dataDirectory, "reports.sqlite"));
      this.local.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
    } else if (config.engine === "mysql") {
      this.mysqlPool = mysql.createPool({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.username,
        password: config.password,
        ssl: config.tls ? { rejectUnauthorized: true, ca:config.ca || undefined } : undefined,
        connectionLimit: 4,
        connectTimeout: 5000,
        charset: "utf8mb4",
      });
    } else {
      this.pgPool = new Pool({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.username,
        password: config.password,
        ssl: config.tls ? { rejectUnauthorized: true, ca:config.ca || undefined } : undefined,
        max: 4,
        connectionTimeoutMillis: 5000,
        statement_timeout: 15000,
      });
    }
  }

  private sql(sql: string) {
    if (this.config.engine === "postgres" || this.config.engine === "supabase") {
      let index = 0;
      return sql
        .replace(/\?/g, () => `$${++index}`)
        .replace(
          /MAX\(uses, excluded.uses\)/g,
          "GREATEST(suggestions.uses, excluded.uses)",
        );
    }
    if (this.config.engine === "mysql") {
      return sql
        .replace(/ON CONFLICT\(key\) DO NOTHING/g, "ON DUPLICATE KEY UPDATE key = key")
        .replace(/ON CONFLICT\(part_no\) DO NOTHING/g, "ON DUPLICATE KEY UPDATE part_no = part_no")
        .replace(/\bkey\b/g, "`key`")
        .replace(/\blines\b/g, "`lines`")
        .replace(
          /ON CONFLICT\(kind, parent, value\) DO NOTHING/g,
          "ON DUPLICATE KEY UPDATE kind = kind",
        )
        .replace(
          /ON CONFLICT\(kind, parent, value\) DO UPDATE SET uses = MAX\(uses, excluded.uses\)/g,
          "ON DUPLICATE KEY UPDATE uses = GREATEST(uses, VALUES(uses))",
        );
    }
    return sql;
  }

  private async locked<T>(work: () => Promise<T>): Promise<T> {
    if (this.context.getStore()) return work();
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }

  async query(sql: string, values: Value[] = []): Promise<Row[]> {
    return this.locked(async () => {
      const session = this.context.getStore();
      const translated = this.sql(sql);
      if (session) return session.query(translated, values);
      if (this.local) {
        const statement = this.local.prepare(translated);
        if (/^\s*(SELECT|PRAGMA)/i.test(sql))
          return statement.all(...values) as Row[];
        statement.run(...values);
        return [];
      }
      if (this.mysqlPool) {
        const [rows] = await this.mysqlPool.execute(translated, values);
        return Array.isArray(rows) ? (rows as Row[]) : [];
      }
      return (await this.pgPool!.query(translated, values)).rows;
    });
  }

  prepare(sql: string) {
    return {
      all: (...values: Value[]) => this.query(sql, values),
      get: async (...values: Value[]) => (await this.query(sql, values))[0],
      run: (...values: Value[]) => this.query(sql, values),
    };
  }

  /** Bounded batches keep remote round trips down and stay within driver parameter limits. */
  async insertRows(prefix: string, rows: Value[][], suffix: string) {
    for (let offset = 0; offset < rows.length; offset += 200) {
      const batch = rows.slice(offset, offset + 200);
      const placeholders = batch.map(row => `(${row.map(() => "?").join(", ")})`).join(", ");
      await this.query(`${prefix} VALUES ${placeholders} ${suffix}`, batch.flat());
    }
  }

  async transaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.context.getStore()) return work();
    return this.locked(async () => {
      const connection = this.mysqlPool
        ? await this.mysqlPool.getConnection()
        : this.pgPool
          ? await this.pgPool.connect()
          : null;
      const query: Session["query"] = async (sql, values) => {
        if (this.local) {
          if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) {
            this.local.exec(sql);
            return [];
          }
          const stmt = this.local.prepare(sql);
          if (/^\s*SELECT/i.test(sql)) return stmt.all(...values) as Row[];
          stmt.run(...values);
          return [];
        }
        if (this.mysqlPool) {
          const [rows] = await (connection as mysql.PoolConnection).query(
            sql,
            values,
          );
          return Array.isArray(rows) ? (rows as Row[]) : [];
        }
        return (
          await (connection as import("pg").PoolClient).query(sql, values)
        ).rows;
      };
      try {
        await query("BEGIN", []);
        const result = await this.context.run({ query }, work);
        await query("COMMIT", []);
        return result;
      } catch (error) {
        await query("ROLLBACK", []);
        throw error;
      } finally {
        connection?.release();
      }
    });
  }

  async initialize() {
    const mysqlEngine = this.config.engine === "mysql";
    const short = mysqlEngine ? "VARCHAR(255) COLLATE utf8mb4_bin" : "TEXT";
    const id = mysqlEngine ? "VARCHAR(36)" : "TEXT";
    const large = mysqlEngine ? "LONGTEXT" : "TEXT";
    const blob = mysqlEngine
      ? "LONGBLOB"
      : this.config.engine === "postgres" || this.config.engine === "supabase"
        ? "BYTEA"
        : "BLOB";
    await this.query(`CREATE TABLE IF NOT EXISTS reports (
      id ${id} PRIMARY KEY, title TEXT NOT NULL, prepared_by TEXT NOT NULL, source_filename TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, prefix_map ${large} NOT NULL, lines ${large} NOT NULL, source_blob ${blob}
    )`);
    await this.query(`CREATE TABLE IF NOT EXISTS suggestions (
      kind ${mysqlEngine ? "VARCHAR(32) COLLATE utf8mb4_bin" : "TEXT"} NOT NULL,
      parent ${short} NOT NULL DEFAULT '', value ${short} NOT NULL, uses INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (kind, parent, value)
    )`);
    await this.query(
      `CREATE TABLE IF NOT EXISTS meta (key ${short} PRIMARY KEY, value TEXT NOT NULL)`,
    );
    await this.query(`CREATE TABLE IF NOT EXISTS parts (
      part_no ${short} PRIMARY KEY, description TEXT NOT NULL, default_qty TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
    )`);
    await this.query(
      `CREATE TABLE IF NOT EXISTS technicians (name ${short} PRIMARY KEY, active INTEGER NOT NULL DEFAULT 1)`,
    );
    if(this.config.engine==='supabase') {
      // App connections use the database owner; browser API roles must not access workbooks.
      for(const table of ['reports','suggestions','meta','parts','technicians']) await this.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      const roles=await this.query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')");
      for(const role of roles) await this.query(`REVOKE ALL ON TABLE reports, suggestions, meta, parts, technicians FROM ${String(role.rolname)}`);
    }
  }

  async close() {
    this.local?.close();
    await this.mysqlPool?.end();
    await this.pgPool?.end();
  }
}

const globalStorage = globalThis as unknown as {
  deskStorage?: Promise<Storage>;
  deskWritesPaused?: boolean;
};
export function database(): Promise<Storage> {
  if (!globalStorage.deskStorage) {
    globalStorage.deskStorage = (async () => {
      const db = new Storage(readConfig());
      try {
        if(db.config.databaseCode) await verifyDatabaseIdentifier(db,db.config.databaseCode);
        await db.initialize();
        if(!db.config.databaseCode) await databaseIdentifier(db);
        return db;
      } catch (error) {
        await db.close();
        throw error;
      }
    })();
    globalStorage.deskStorage.catch(() => {
      globalStorage.deskStorage = undefined;
    });
  }
  return globalStorage.deskStorage;
}
export function writesPaused() {
  return globalStorage.deskWritesPaused === true;
}
export function pauseWrites() {
  globalStorage.deskWritesPaused = true;
}
export function assertWritable() {
  if (writesPaused())
    throw new Error(
      "Storage migration is prepared. Restart the service desk before editing reports.",
    );
}
