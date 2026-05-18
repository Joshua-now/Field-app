import { Router } from "express";
import { db } from "../db";
import { users, tenants, technicians } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { signToken, hashPassword, comparePassword, isAuthenticated } from "./jwt";
import { createRateLimiter } from "../middleware/rateLimiter";
import { z } from "zod";
import bcrypt from "bcryptjs";

export const authRouter = Router();

// Strict limiter for auth endpoints — 10 attempts per minute per IP
const authLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 10 });

// ─── REGISTER (creates tenant + owner user) ───────────────────────────────────
const registerSchema = z.object({
  companyName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
});

authRouter.post("/register", authLimiter, async (req, res) => {
  try {
    const body = registerSchema.parse(req.body);

    const [existing] = await db.select().from(users).where(eq(users.email, body.email));
    if (existing) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const slug = body.companyName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 50) + "-" + Date.now().toString(36);

    const [tenant] = await db.insert(tenants).values({
      companyName: body.companyName,
      slug,
      email: body.email,
      phone: body.phone,
      planTier: "free",
      status: "active",
    }).returning();

    const passwordHash = await hashPassword(body.password);
    const [user] = await db.insert(users).values({
      tenantId: tenant.id,
      email: body.email,
      passwordHash,
      firstName: body.firstName,
      lastName: body.lastName,
      role: "owner",
      isActive: true,
    }).returning();

    const token = signToken({
      id: user.id,
      email: user.email,
      tenantId: tenant.id,
      role: user.role!,
    });

    const { passwordHash: _, ...safeUser } = user;
    res.status(201).json({ token, user: safeUser, tenant });
  } catch (err: any) {
    if (err.name === "ZodError") {
      return res.status(400).json({ message: err.errors[0]?.message });
    }
    console.error("[Auth] Register error:", err.message);
    res.status(500).json({ message: "Registration failed" });
  }
});

// ─── LOGIN ────────────────────────────────────────────────────────────────────
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Block login for suspended/inactive tenants
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, user.tenantId!));
    if (!tenant || tenant.status === "suspended" || tenant.status === "cancelled") {
      return res.status(403).json({ message: "Account suspended. Contact support." });
    }

    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = signToken({
      id: user.id,
      email: user.email,
      tenantId: user.tenantId!,
      role: user.role!,
    });

    const { passwordHash: _, ...safeUser } = user;
    res.json({ token, user: safeUser, tenant: { companyName: tenant.companyName, planTier: tenant.planTier } });
  } catch (err: any) {
    if (err.name === "ZodError") {
      return res.status(400).json({ message: err.errors[0]?.message });
    }
    console.error("[Auth] Login error:", err.message);
    res.status(500).json({ message: "Login failed" });
  }
});

// ─── TECHNICIAN LOGIN ─────────────────────────────────────────────────────────
const techLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenantId: z.string().min(1),
});

authRouter.post("/technician-login", authLimiter, async (req, res) => {
  try {
    const { email, password, tenantId } = techLoginSchema.parse(req.body);

    const [tech] = await db
      .select()
      .from(technicians)
      .where(and(eq(technicians.email, email), eq(technicians.tenantId, tenantId)));

    if (!tech || !tech.isActive) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, tech.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = signToken({
      id: String(tech.id),
      email: tech.email,
      tenantId: tech.tenantId,
      role: "technician",
    });

    const { passwordHash: _, ...safeTech } = tech;
    res.json({ token, technician: safeTech });
  } catch (err: any) {
    if (err.name === "ZodError") {
      return res.status(400).json({ message: err.errors[0]?.message });
    }
    console.error("[Auth] Technician login error:", err.message);
    res.status(500).json({ message: "Login failed" });
  }
});

// ─── GET CURRENT USER ─────────────────────────────────────────────────────────
authRouter.get("/user", isAuthenticated, async (req, res) => {
  try {
    const { id } = (req as any).user;
    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (!user) return res.status(404).json({ message: "User not found" });
    const { passwordHash: _, ...safeUser } = user;
    res.json(safeUser);
  } catch (err: any) {
    res.status(500).json({ message: "Failed to fetch user" });
  }
});

// ─── UPDATE PROFILE ───────────────────────────────────────────────────────────
authRouter.put("/user", isAuthenticated, async (req, res) => {
  try {
    const { id } = (req as any).user;
    const allowed = ["firstName", "lastName", "profileImageUrl"];
    const updates: any = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const [updated] = await db.update(users).set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id)).returning();
    const { passwordHash: _, ...safeUser } = updated;
    res.json(safeUser);
  } catch (err: any) {
    res.status(500).json({ message: "Update failed" });
  }
});
