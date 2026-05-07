import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { RequestHandler } from "express";

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";
const JWT_EXPIRES_IN = "7d";

// ─── TOKEN HELPERS ────────────────────────────────────────────────────────────

export function signToken(payload: { id: string; email: string; tenantId: string; role: string }) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): any {
  return jwt.verify(token, JWT_SECRET);
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ─── MIDDLEWARE ────────────────────────────────────────────────────────────────

export const isAuthenticated: RequestHandler = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = verifyToken(token);
    (req as any).user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

export const requireRole = (...roles: string[]): RequestHandler => (req, res, next) => {
  const user = (req as any).user;
  if (!user || !roles.includes(user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
};
