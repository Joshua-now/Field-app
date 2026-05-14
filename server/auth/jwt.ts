import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { RequestHandler } from "express";

// ─── JWT SECRET ───────────────────────────────────────────────────────────────
// Must be set as an environment variable — no fallback intentionally.
// If missing, crash on first token operation so it's caught immediately.
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET environment variable is not set. " +
      "Generate a random 32+ character string and add it to your Railway environment variables."
    );
  }
  return secret;
}

const JWT_EXPIRES_IN = "7d";

// ─── TOKEN HELPERS ────────────────────────────────────────────────────────────

export function signToken(payload: { id: string; email: string; tenantId: string; role: string }) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): any {
  return jwt.verify(token, getJwtSecret());
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
