import { users, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "../../db";
import { eq } from "drizzle-orm";

// Default tenant ID for new users (auto-assigned if not specified)
const DEFAULT_TENANT_ID = "default-tenant";

// Interface for auth storage operations
// (IMPORTANT) These user operations are mandatory for Replit Auth.
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // Check if user already exists to preserve their tenantId
    const existingUser = await this.getUser(userData.id!);
    
    // Auto-assign default tenant for new users if not specified
    const tenantId = existingUser?.tenantId ?? userData.tenantId ?? DEFAULT_TENANT_ID;
    
    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        tenantId,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          // Update user info but preserve tenantId if they already have one
          ...userData,
          tenantId: existingUser?.tenantId ?? tenantId,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }
}

export const authStorage = new AuthStorage();
