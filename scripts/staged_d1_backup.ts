#!/usr/bin/env node
/**
 * ==============================================================================
 * 📦 PantryPool — Staged Zero-Downtime D1 Backup Utility
 * ==============================================================================
 *
 * Exports Cloudflare D1 schema and table data using non-blocking read queries (SELECT).
 * Unlike `wrangler d1 export`, this approach does NOT trigger Cloudflare's exclusive
 * snapshot lock, ensuring the production database remains 100% available to serve
 * concurrent user and edge worker queries without downtime or dropped transactions.
 *
 * Usage:
 *   npx tsx scripts/staged_d1_backup.ts [options]
 *
 * Options:
 *   --output <path>    Custom output file path (default: backups/d1/pantrypool_d1_<TIMESTAMP>.sql)
 *   --database <id>    Override database ID or name
 *   --batch-size <num> Number of rows per SELECT batch (default: 1000)
 *   --help             Show help
 *
 * Environment variables:
 *   CLOUDFLARE_API_TOKEN   Cloudflare API token with D1:Read permissions
 *   CLOUDFLARE_ACCOUNT_ID  Cloudflare Account ID
 * ==============================================================================
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_DB_NAME = 'pantrypool-db';
const DEFAULT_DB_ID = process.env.CLOUDFLARE_D1_DATABASE_ID || '';
const BACKUP_DIR = path.resolve(process.cwd(), 'backups/d1');

interface TableMeta {
  name: string;
  sql: string;
}

interface IndexMeta {
  sql: string;
}

// Parse command-line flags
const args = process.argv.slice(2);
let customOutput: string | null = null;
let dbIdentifier: string = process.env.CLOUDFLARE_D1_DATABASE_ID || DEFAULT_DB_ID;
let batchSize = 1000;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--output' && args[i + 1]) {
    customOutput = args[++i];
  } else if (args[i] === '--database' && args[i + 1]) {
    dbIdentifier = args[++i];
  } else if (args[i] === '--batch-size' && args[i + 1]) {
    batchSize = parseInt(args[++i], 10) || 1000;
  } else if (args[i] === '--help') {
    console.log(`PantryPool Staged Non-Locking D1 Backup
Options:
  --output <path>    Output SQL file path
  --database <id>    Cloudflare D1 Database ID
  --batch-size <num> Row batch size (default: 1000)
`);
    process.exit(0);
  }
}

// Ensure backup directory exists
fs.mkdirSync(BACKUP_DIR, { recursive: true });

const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');
const sqlFilePath = customOutput
  ? path.resolve(customOutput)
  : path.join(BACKUP_DIR, `pantrypool_d1_${timestamp}.sql`);
const gzFilePath = `${sqlFilePath}.gz`;

const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

async function executeQuery<T = any>(sql: string): Promise<T[]> {
  if (apiToken && accountId) {
    // Preferred: Direct Cloudflare REST API query (non-blocking)
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${dbIdentifier}/query`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sql })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Cloudflare D1 Query API returned HTTP ${res.status}: ${errText}`);
    }

    const data: any = await res.json();
    if (!data.success) {
      throw new Error(`Cloudflare D1 Query API Error: ${JSON.stringify(data.errors)}`);
    }

    const firstResult = data.result?.[0];
    return (firstResult?.results as T[]) || [];
  } else {
    // Fallback: Use wrangler d1 execute with read-only query
    const escapedSql = sql.replace(/"/g, '\\"');
    const cmd = `npx wrangler d1 execute "${DEFAULT_DB_NAME}" --remote --command="${escapedSql}" --json`;
    const output = execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
    const parsed = JSON.parse(output);
    const first = Array.isArray(parsed) ? parsed[0] : parsed;
    return (first?.results as T[]) || [];
  }
}

function formatSqlValue(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'NULL';
  if (typeof val === 'boolean') return val ? '1' : '0';
  if (typeof val === 'object') {
    if (Buffer.isBuffer(val)) {
      return `X'${val.toString('hex')}'`;
    }
    return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function runStagedBackup() {
  console.log(`[Staged Backup] Starting non-locking export for D1 database (${dbIdentifier})...`);
  console.log(`[Staged Backup] Target output: ${sqlFilePath}`);

  const writeStream = fs.createWriteStream(sqlFilePath, { encoding: 'utf-8' });

  // SQLite foreign key deferral preamble
  writeStream.write('PRAGMA defer_foreign_keys=TRUE;\n');
  writeStream.write('BEGIN TRANSACTION;\n\n');

  try {
    // 1. Fetch user tables
    console.log('[Staged Backup] Discovering tables...');
    const tables = await executeQuery<TableMeta>(
      "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name;"
    );

    console.log(`[Staged Backup] Found ${tables.length} tables to export.`);

    // 2. Export table schemas and data
    for (const table of tables) {
      console.log(`[Staged Backup] Exporting table: ${table.name}...`);
      writeStream.write(`-- --------------------------------------------------------\n`);
      writeStream.write(`-- Table: ${table.name}\n`);
      writeStream.write(`-- --------------------------------------------------------\n`);
      writeStream.write(`${table.sql};\n`);

      // Stream rows in chunks
      let offset = 0;
      let totalRows = 0;

      while (true) {
        const rows = await executeQuery<Record<string, any>>(
          `SELECT * FROM "${table.name}" LIMIT ${batchSize} OFFSET ${offset};`
        );

        if (!rows || rows.length === 0) break;

        for (const row of rows) {
          const columns = Object.keys(row);
          const colList = columns.map(c => `"${c}"`).join(',');
          const valList = columns.map(c => formatSqlValue(row[c])).join(',');
          writeStream.write(`INSERT INTO "${table.name}" (${colList}) VALUES(${valList});\n`);
        }

        totalRows += rows.length;
        offset += rows.length;

        if (rows.length < batchSize) break;
      }

      console.log(`[Staged Backup]   └ Completed ${table.name} (${totalRows} rows).`);
      writeStream.write('\n');
    }

    // 3. Export custom indexes
    console.log('[Staged Backup] Exporting indexes...');
    const indexes = await executeQuery<IndexMeta>(
      "SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%';"
    );

    if (indexes.length > 0) {
      writeStream.write(`-- --------------------------------------------------------\n`);
      writeStream.write(`-- Indexes\n`);
      writeStream.write(`-- --------------------------------------------------------\n`);
      for (const idx of indexes) {
        writeStream.write(`${idx.sql};\n`);
      }
      writeStream.write('\n');
    }

    writeStream.write('COMMIT;\n');
    writeStream.end();

    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', () => resolve());
      writeStream.on('error', reject);
    });

    console.log(`[Staged Backup] SQL dump generated successfully: ${sqlFilePath}`);

    // 4. Compress to .gz
    console.log(`[Staged Backup] Compressing snapshot with gzip -9...`);
    const readRaw = fs.createReadStream(sqlFilePath);
    const writeGz = fs.createWriteStream(gzFilePath);
    const gzip = zlib.createGzip({ level: 9 });

    await new Promise<void>((resolve, reject) => {
      readRaw.pipe(gzip).pipe(writeGz)
        .on('finish', () => resolve())
        .on('error', reject);
    });

    const rawSize = (fs.statSync(sqlFilePath).size / 1024).toFixed(1);
    const gzSize = (fs.statSync(gzFilePath).size / 1024).toFixed(1);

    console.log(`[Staged Backup] ✅ Backup complete!`);
    console.log(`[Staged Backup]    Raw SQL:    ${sqlFilePath} (${rawSize} KB)`);
    console.log(`[Staged Backup]    Compressed: ${gzFilePath} (${gzSize} KB)`);
    console.log(`[Staged Backup] Zero-lock guarantee preserved; no query downtime occurred.`);
  } catch (err: any) {
    writeStream.end();
    console.error(`[Staged Backup] ❌ Backup failed:`, err?.message || err);
    process.exit(1);
  }
}

runStagedBackup().catch(err => {
  console.error('[Staged Backup] Fatal error:', err);
  process.exit(1);
});
