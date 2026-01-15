import { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { users, tenants } from "@shared/schema";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
      tenant?: typeof tenants.$inferSelect;
    }
  }
}

export async function tenantContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = req.user as any;
    
    // OIDC sessions may have ID in:
    // - user.id (standard passport)
    // - user.sub (OIDC standard)
    // - user.claims.sub (Replit OIDC test harness)
    const userId = user?.id || user?.sub || user?.claims?.sub;
    
    if (!userId) {
      return next();
    }

    const [dbUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!dbUser || !dbUser.tenantId) {
      return next();
    }

    req.tenantId = dbUser.tenantId;

    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, dbUser.tenantId))
      .limit(1);

    if (tenant) {
      req.tenant = tenant;
    }

    next();
  } catch (error) {
    console.error("[TenantContext] Error:", error);
    next();
  }
}

export function requireTenant(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!req.tenantId) {
    return res.status(403).json({ 
      message: "No tenant context. Please complete your account setup." 
    });
  }
  next();
}

export function getTenantId(req: Request): string {
  if (!req.tenantId) {
    throw new Error("Tenant context not available");
  }
  return req.tenantId;
}
