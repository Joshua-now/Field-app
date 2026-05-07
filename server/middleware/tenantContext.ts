import { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { tenants } from "@shared/schema";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
      tenant?: typeof tenants.$inferSelect;
    }
  }
}

// Reads tenantId from the JWT payload (set by isAuthenticated middleware)
export async function tenantContextMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    const user = (req as any).user;
    if (!user?.tenantId) return next();

    req.tenantId = user.tenantId;

    const [tenant] = await db.select().from(tenants)
      .where(eq(tenants.id, user.tenantId)).limit(1);
    if (tenant) req.tenant = tenant;

    next();
  } catch (err) {
    console.error("[TenantContext] Error:", err);
    next();
  }
}

export function requireTenant(req: Request, res: Response, next: NextFunction) {
  if (!req.tenantId) {
    return res.status(403).json({ message: "No tenant context. Please complete account setup." });
  }
  next();
}

export function getTenantId(req: Request): string {
  if (!req.tenantId) throw new Error("Tenant context not available");
  return req.tenantId;
}
