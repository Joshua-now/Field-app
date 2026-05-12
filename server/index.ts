import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { startHeartbeat } from "./bob/heartbeat";

const app = express();
const httpServer = createServer(app);

// Trust Railway's load balancer so req.ip / rate limiting work correctly
app.set("trust proxy", 1);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJson: Record<string, any> | undefined;

  const orig = res.json;
  res.json = function (body, ...args) {
    capturedJson = body;
    return orig.apply(res, [body, ...args]);
  };

  res.on("finish", () => {
    const ms = Date.now() - start;
    if (path.startsWith("/api")) {
      let line = `${req.method} ${path} ${res.statusCode} in ${ms}ms`;
      if (capturedJson) line += ` :: ${JSON.stringify(capturedJson)}`;
      log(line);
    }
  });
  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  // Fallback error handler (errorHandler in routes.ts is primary)
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    if (!res.headersSent) {
      res.status(status).json({ message: err.message || "Internal Server Error" });
    }
    // Do NOT re-throw — that crashes the process
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ── Startup env validation ────────────────────────────────────────────────
  const REQUIRED_PROD = ["JWT_SECRET", "DATABASE_URL"];
  const RECOMMENDED   = ["OPENROUTER_API_KEY", "TELNYX_API_KEY", "TELNYX_PHONE_NUMBER", "TELNYX_CONNECTION_ID"];
  if (process.env.NODE_ENV === "production") {
    for (const v of REQUIRED_PROD) {
      if (!process.env[v]) {
        // Crash hard — missing JWT_SECRET or DATABASE_URL means the app is broken
        throw new Error(`⛔ MISSING REQUIRED env var in production: ${v} — set it in Railway and redeploy`);
      }
    }
  }
  for (const v of RECOMMENDED) {
    if (!process.env[v]) log(`⚠  Missing recommended env var: ${v} (some features disabled)`, "startup");
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
    log(`serving on port ${port}`);
    startHeartbeat();
  });
})();
