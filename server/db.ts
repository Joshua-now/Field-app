import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

const isRailwayEnvironment = !!process.env.RAILWAY_ENVIRONMENT;
const databaseUrl = isRailwayEnvironment 
  ? (process.env.RAILWAY_DATABASE_URL || process.env.DATABASE_URL)
  : process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

console.log(`[DB] Using ${isRailwayEnvironment ? 'Railway' : 'Replit'} database`);

let connectionFailures = 0;
const MAX_FAILURES_BEFORE_ALERT = 3;

export const pool = new Pool({ 
  connectionString: databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", (err) => {
  connectionFailures++;
  console.error(`[DB] Pool error (failure #${connectionFailures}):`, err.message);
  
  if (connectionFailures >= MAX_FAILURES_BEFORE_ALERT) {
    console.error("[DB] CRITICAL: Multiple connection failures detected - self-healing triggered");
    attemptSelfHeal();
  }
});

pool.on("connect", () => {
  connectionFailures = 0;
  console.log("[DB] New client connected to pool");
});

async function attemptSelfHeal() {
  console.log("[DB] Attempting self-heal: testing connection...");
  const isHealthy = await testConnection();
  if (isHealthy) {
    console.log("[DB] Self-heal successful: connection restored");
    connectionFailures = 0;
  } else {
    console.error("[DB] Self-heal failed: connection still unavailable");
  }
}

export const db = drizzle(pool, { schema });

export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    return true;
  } catch (err) {
    console.error("[DB] Connection test failed:", err);
    return false;
  }
}

export async function getHealthStatus(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  database: boolean;
  connectionFailures: number;
  poolStats: { total: number; idle: number; waiting: number };
}> {
  const dbHealthy = await testConnection();
  
  return {
    status: dbHealthy ? (connectionFailures > 0 ? 'degraded' : 'healthy') : 'unhealthy',
    database: dbHealthy,
    connectionFailures,
    poolStats: {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    },
  };
}
