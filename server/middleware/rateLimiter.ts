import { Request, Response, NextFunction } from "express";

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const CLEANUP_INTERVAL = 60000;
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, CLEANUP_INTERVAL);

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
  skipFailedRequests?: boolean;
}

export function createRateLimiter(options: RateLimitOptions) {
  const {
    windowMs,
    maxRequests,
    keyGenerator = (req) => req.ip || req.socket.remoteAddress || "unknown",
    skipFailedRequests = false
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator(req);
    const now = Date.now();
    
    let entry = rateLimitStore.get(key);
    
    if (!entry || entry.resetTime < now) {
      entry = { count: 0, resetTime: now + windowMs };
      rateLimitStore.set(key, entry);
    }
    
    entry.count++;
    
    const remaining = Math.max(0, maxRequests - entry.count);
    const resetSeconds = Math.ceil((entry.resetTime - now) / 1000);
    
    res.setHeader("X-RateLimit-Limit", maxRequests);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", resetSeconds);
    
    if (entry.count > maxRequests) {
      res.status(429).json({
        error: "Too Many Requests",
        message: "Rate limit exceeded. Please try again later.",
        retryAfter: resetSeconds
      });
      return;
    }
    
    if (skipFailedRequests) {
      const originalSend = res.send;
      res.send = function(body) {
        if (res.statusCode >= 400) {
          entry!.count--;
        }
        return originalSend.call(this, body);
      };
    }
    
    next();
  };
}

export const apiRateLimiter = createRateLimiter({
  windowMs: 60000,
  maxRequests: 100
});

export const strictRateLimiter = createRateLimiter({
  windowMs: 60000,
  maxRequests: 10
});
