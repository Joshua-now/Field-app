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
    
    // OIDC sessions may have ID in either 'id' or 'sub' field
    const userId = user?.id || user?.sub;
    
    if (!userId) {
      // Log for debugging on mutating requests
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
        console.log(`[TenantContext] No user ID found for ${req.method} ${req.path}. req.user:`, user ? JSON.stringify(user) : 'undefined');
      }
      return next();
    }

    const [dbUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!dbUser) {
      console.warn(`[TenantContext] User ${userId} not found in database`);
      return next();
    }

    if (!dbUser.tenantId) {
      console.warn(`[TenantContext] User ${userId} (${dbUser.email}) has no tenantId`);
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
