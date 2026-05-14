import type { RequestHandler } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";

interface AuditEntry {
  timestamp: string;
  requestId?: string;
  method: string;
  path: string;
  ip: string;
  userAgent: string;
  userId?: string;
  tenantId?: string;
  statusCode?: number;
  duration?: number;
}

// In-memory ring buffer — last 200 entries for quick in-process access
const auditBuffer: AuditEntry[] = [];
const MAX_BUFFER_SIZE = 200;

function getClientIp(req: any): string {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
    || req.headers["x-real-ip"]
    || req.connection?.remoteAddress
    || req.ip
    || "unknown";
}

export const auditLogMiddleware: RequestHandler = (req, res, next) => {
  const startTime = Date.now();
  const entry: AuditEntry = {
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    ip: getClientIp(req),
    userAgent: req.headers["user-agent"] || "unknown",
  };

  res.on("finish", () => {
    const user = (req as any).user;
    entry.userId = user?.id || user?.sub || user?.claims?.sub;
    entry.tenantId = req.tenantId;
    entry.statusCode = res.statusCode;
    entry.duration = Date.now() - startTime;

    if (req.path.startsWith("/api") && !req.path.includes("/health")) {
      logAuditEntry(entry);
    }
  });

  next();
};

function logAuditEntry(entry: AuditEntry) {
  // In-memory ring buffer
  auditBuffer.push(entry);
  if (auditBuffer.length > MAX_BUFFER_SIZE) auditBuffer.shift();

  // Console output for errors and suspicious activity
  if (entry.statusCode && entry.statusCode >= 400) {
    console.log(
      `[AUDIT] ${entry.method} ${entry.path} ${entry.statusCode} - ` +
      `IP: ${entry.ip} User: ${entry.userId || "anonymous"}`
    );
  }

  if (isSuspiciousActivity(entry)) {
    console.warn(`[SECURITY] Suspicious activity: ${entry.method} ${entry.path} from ${entry.ip}`);
  }

  // Persist to database — fire-and-forget, never block the request
  persistAuditEntry(entry).catch((err) => {
    // Only log DB errors occasionally to avoid log spam
    if (Math.random() < 0.05) {
      console.error("[Audit] DB persist error:", err?.message);
    }
  });
}

async function persistAuditEntry(entry: AuditEntry) {
  await db.execute(sql`
    INSERT INTO audit_logs
      (created_at, request_id, method, path, ip, user_agent, user_id, tenant_id, status_code, duration_ms)
    VALUES
      (${entry.timestamp}::timestamptz, ${entry.requestId ?? null}, ${entry.method}, ${entry.path},
       ${entry.ip}, ${entry.userAgent}, ${entry.userId ?? null}, ${entry.tenantId ?? null},
       ${entry.statusCode ?? null}, ${entry.duration ?? null})
  `);
}

function isSuspiciousActivity(entry: AuditEntry): boolean {
  const recentFromSameIp = auditBuffer.filter(
    (e) => e.ip === entry.ip && new Date(e.timestamp).getTime() > Date.now() - 60_000
  );
  if (recentFromSameIp.length > 100) return true;
  const failedAttempts = recentFromSameIp.filter(
    (e) => e.statusCode === 401 || e.statusCode === 403
  );
  if (failedAttempts.length > 10) return true;
  return false;
}

export function getRecentAuditLogs(limit = 100): AuditEntry[] {
  return auditBuffer.slice(-limit);
}
