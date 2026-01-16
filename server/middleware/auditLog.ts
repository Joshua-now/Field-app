import type { RequestHandler } from "express";

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

const auditBuffer: AuditEntry[] = [];
const MAX_BUFFER_SIZE = 1000;

function getClientIp(req: any): string {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() 
    || req.headers['x-real-ip'] 
    || req.connection?.remoteAddress 
    || req.ip 
    || 'unknown';
}

export const auditLogMiddleware: RequestHandler = (req, res, next) => {
  const startTime = Date.now();
  const entry: AuditEntry = {
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    ip: getClientIp(req),
    userAgent: req.headers['user-agent'] || 'unknown',
  };

  res.on('finish', () => {
    const user = req.user as any;
    entry.userId = user?.id || user?.sub || user?.claims?.sub;
    entry.tenantId = req.tenantId;
    entry.statusCode = res.statusCode;
    entry.duration = Date.now() - startTime;

    if (req.path.startsWith('/api') && !req.path.includes('/health')) {
      logAuditEntry(entry);
    }
  });

  next();
};

function logAuditEntry(entry: AuditEntry) {
  auditBuffer.push(entry);
  
  if (auditBuffer.length > MAX_BUFFER_SIZE) {
    auditBuffer.shift();
  }

  if (entry.statusCode && entry.statusCode >= 400) {
    console.log(`[AUDIT] ${entry.method} ${entry.path} ${entry.statusCode} - IP: ${entry.ip} User: ${entry.userId || 'anonymous'}`);
  }

  if (isSuspiciousActivity(entry)) {
    console.warn(`[SECURITY] Suspicious activity detected: ${entry.method} ${entry.path} from ${entry.ip}`);
  }
}

function isSuspiciousActivity(entry: AuditEntry): boolean {
  const recentFromSameIp = auditBuffer.filter(e => 
    e.ip === entry.ip && 
    new Date(e.timestamp).getTime() > Date.now() - 60000
  );
  
  if (recentFromSameIp.length > 100) {
    return true;
  }

  const failedAttempts = recentFromSameIp.filter(e => 
    e.statusCode === 401 || e.statusCode === 403
  );
  
  if (failedAttempts.length > 10) {
    return true;
  }

  return false;
}

export function getRecentAuditLogs(limit: number = 100): AuditEntry[] {
  return auditBuffer.slice(-limit);
}
