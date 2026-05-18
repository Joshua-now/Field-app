import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { createTenantStorage } from "./tenantStorage";
import { z } from "zod";
import { isAuthenticated, requireRole } from "./auth/jwt";
import { authRouter } from "./auth/routes";
import { validateStatusTransition, JobStatus } from "@shared/jobStateMachine";
import { errorHandler, asyncHandler, AppError, NotFoundError, ValidationError } from "./middleware/errorHandler";
import { apiRateLimiter, strictRateLimiter, bobRateLimiter } from "./middleware/rateLimiter";
import { tenantContextMiddleware, getTenantId as getTenantIdFromContext } from "./middleware/tenantContext";
import { db, getHealthStatus } from "./db";
import { securityHeaders, requestIdMiddleware } from "./middleware/security";
import { auditLogMiddleware } from "./middleware/auditLog";
import { eq, sql, and } from "drizzle-orm";
import { bobConversations, bobMessages } from "@shared/schema";
import {
  insertTechnicianSchema,
  insertCustomerSchema,
  insertJobSchema,
  insertJobPhotoSchema,
  insertJobNoteSchema,
} from "@shared/schema";
import { runBobAgent } from "./bob/agent";
import { handleVoiceWebhook } from "./bob/voice";
import { sendOnboardingEmail } from "./email";
import bcrypt from "bcryptjs";
import axios from "axios";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

function getTenantId(req: Request): string {
  // Delegates to tenantContext version which throws if tenant is missing —
  // no silent fallback to a default bucket
  return getTenantIdFromContext(req);
}

function getTenantStorage(req: Request) {
  return createTenantStorage(getTenantId(req));
}

function sanitizeTechnician(tech: any) {
  if (!tech) return tech;
  const { passwordHash, ...safe } = tech;
  return safe;
}

function validateBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const msg = result.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("; ");
    throw new ValidationError(msg);
  }
  return result.data;
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.use(securityHeaders);
  app.use(requestIdMiddleware);
  app.use(auditLogMiddleware);

  // ── PUBLIC ────────────────────────────────────────────────────────────────
  app.get("/api/health", asyncHandler(async (_req, res) => {
    const health = await getHealthStatus();
    const code = health.status === "unhealthy" ? 503 : 200;
    res.status(code).json({ ...health, timestamp: new Date().toISOString() });
  }));

  // ── TELNYX VOICE WEBHOOK (public — Telnyx calls this, no JWT) ───────────────
  app.post("/api/voice/webhook", handleVoiceWebhook);

  // ── OPENROUTER DIAGNOSTIC (auth-protected — returns API key prefix, never expose publicly) ──
  app.get("/api/bob/ping", isAuthenticated, requireRole("owner", "admin"), asyncHandler(async (_req, res) => {
    const rawKey = process.env.OPENROUTER_API_KEY || "";
    const apiKey = rawKey.trim().replace(/^Bearer\s+/i, "").replace(/^["'`]|["'`]$/g, "").trim();
    const keyInfo = {
      length: apiKey.length,
      prefix: apiKey.slice(0, 14) + "...",
      startsWithSkOr: apiKey.startsWith("sk-or-"),
      empty: apiKey.length === 0,
    };
    if (!apiKey) {
      return res.status(500).json({ ok: false, keyInfo, error: "OPENROUTER_API_KEY not set or empty" });
    }
    try {
      const r = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        { model: "openai/gpt-4o-mini", messages: [{ role: "user", content: "say hi" }], max_tokens: 5 },
        { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, timeout: 15000 }
      );
      res.json({ ok: true, keyInfo, reply: r.data?.choices?.[0]?.message?.content });
    } catch (e: any) {
      res.status(500).json({ ok: false, keyInfo, httpStatus: e?.response?.status, error: e?.response?.data || e.message });
    }
  }));

  // ── AUTH ──────────────────────────────────────────────────────────────────
  app.use("/api/auth", authRouter);

  // ── STRIPE WEBHOOK (public — raw body required) ───────────────────────────
  app.post("/api/webhooks/stripe",
    // raw body needed for signature verification
    (req: Request, res: Response, next: NextFunction) => {
      let data = "";
      req.setEncoding("utf8");
      req.on("data", (chunk: string) => { data += chunk; });
      req.on("end", () => { (req as any).rawBody = data; next(); });
    },
    asyncHandler(async (req, res) => {
      const sig = req.headers["stripe-signature"] as string;
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) { res.json({ received: true }); return; }

      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(stripeKey);

      let event: any;
      try {
        event = webhookSecret
          ? stripe.webhooks.constructEvent((req as any).rawBody, sig, webhookSecret)
          : JSON.parse((req as any).rawBody);
      } catch (err: any) {
        console.error("[Stripe] Webhook signature failed:", err.message);
        return res.status(400).json({ error: "Invalid signature" });
      }

      if (event.type === "checkout.session.completed") {
        const session = event.data.object as any;
        const customerEmail = session.customer_details?.email || session.customer_email;
        const companyName   = session.customer_details?.name || "New Customer";
        const planTier      = session.metadata?.plan || "starter";

        if (!customerEmail) { res.json({ received: true }); return; }

        try {
          const { tenants } = await import("@shared/models/auth");
          const { onboardingTokens } = await import("@shared/schema");
          const crypto = await import("crypto");

          // Create slug from email
          const slug = customerEmail.split("@")[0]
            .replace(/[^a-z0-9]/gi, "-").toLowerCase()
            .slice(0, 30) + "-" + Date.now().toString(36);

          // Hash a temp password — they'll reset via onboarding
          const tempPw = crypto.randomBytes(8).toString("hex");
          const bcrypt = (await import("bcryptjs")).default;
          const passwordHash = await bcrypt.hash(tempPw, 10);

          // Insert tenant + owner user
          const [tenant] = await db.insert(tenants).values({
            companyName,
            slug,
            email: customerEmail,
            planTier,
            status: "active",
          } as any).returning();

          const { users } = await import("@shared/models/auth");
          await db.insert(users).values({
            tenantId: tenant.id,
            email: customerEmail,
            passwordHash,
            firstName: companyName.split(" ")[0],
            role: "owner",
          } as any);

          // Create onboarding token (expires in 7 days)
          const token = crypto.randomUUID();
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          await db.insert(onboardingTokens).values({ token, tenantId: tenant.id, expiresAt });

          // Build onboarding URL
          const baseUrl = process.env.APP_URL || `https://${req.headers.host}`;
          const onboardUrl = `${baseUrl}/onboard/${token}`;

          // Send welcome email (configure SMTP via env vars)
          await sendOnboardingEmail(customerEmail, companyName, onboardUrl);

          console.log(`[Stripe] New tenant created: ${tenant.id} | token: ${token} | url: ${onboardUrl}`);
        } catch (err: any) {
          console.error("[Stripe] Failed to create tenant from checkout:", err.message);
        }
      }

      res.json({ received: true });
    })
  );

  // ── PUBLIC ONBOARDING BOT API (token-authenticated, no JWT needed) ────────

  // Validate token + return tenant context
  app.get("/api/onboard/:token", asyncHandler(async (req, res) => {
    const { onboardingTokens } = await import("@shared/schema");
    const { tenants } = await import("@shared/models/auth");
    const [row] = await db.select().from(onboardingTokens)
      .where(eq(onboardingTokens.token, req.params.token));
    if (!row) return res.status(404).json({ error: "Invalid or expired link" });
    if (row.used) return res.status(410).json({ error: "This setup link has already been used. Log in to access your dashboard." });
    if (new Date() > row.expiresAt) return res.status(410).json({ error: "This link has expired. Please contact support." });
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, row.tenantId));
    if (!tenant) return res.status(404).json({ error: "Account not found" });
    res.json({ ok: true, companyName: tenant.companyName, email: tenant.email, tenantId: tenant.id });
  }));

  // Scrape website — public, token-gated
  app.post("/api/onboard/:token/scrape", asyncHandler(async (req, res) => {
    const { onboardingTokens } = await import("@shared/schema");
    const [row] = await db.select().from(onboardingTokens)
      .where(eq(onboardingTokens.token, req.params.token));
    if (!row || row.used || new Date() > row.expiresAt)
      return res.status(403).json({ error: "Invalid link" });

    const { url } = req.body as { url: string };
    if (!url) return res.status(400).json({ error: "url required" });

    let rawUrl = url.trim();
    if (!/^https?:\/\//i.test(rawUrl)) rawUrl = `https://${rawUrl}`;

    let html = "";
    try {
      const resp = await axios.get(rawUrl, {
        timeout: 8000,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; FluidBot/1.0)" },
        maxRedirects: 5,
      });
      html = String(resp.data ?? "");
    } catch {
      return res.json({ ok: false, error: "Could not fetch website — check the URL." });
    }

    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s{2,}/g, " ")
      .slice(0, 8000);

    const found: Record<string, any> = {};

    // Company name
    const ogSite  = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);
    const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const h1Tag   = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const rawName = ogSite?.[1] || titleTag?.[1]?.split(/[|\-–]/)[0]?.trim() || h1Tag?.[1]?.trim();
    if (rawName) found.companyName = rawName.trim();

    // Phone
    const phones = text.match(/\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/g) ?? [];
    if (phones.length) found.phone = phones[0];

    // Trade
    const TRADES: Record<string, string[]> = {
      "HVAC":                ["hvac","heating","cooling","air conditioning","furnace","ac repair"],
      "Plumbing":            ["plumbing","plumber","drain","pipe","water heater"],
      "Electrical":          ["electrical","electrician","wiring","panel"],
      "Roofing":             ["roofing","roofer","roof repair","shingles"],
      "Landscaping":         ["landscaping","lawn","sprinkler","irrigation"],
      "Pest Control":        ["pest control","exterminator","termite"],
      "Pool Service":        ["pool service","pool cleaning","pool repair"],
      "Painting":            ["painting","painter","interior paint","exterior paint"],
      "Cleaning":            ["cleaning","maid","housekeeping","janitorial"],
      "General Contracting": ["contractor","remodeling","renovation","construction"],
    };
    const lc = text.toLowerCase();
    const trades = Object.entries(TRADES)
      .filter(([, kws]) => kws.some(kw => lc.includes(kw)))
      .map(([t]) => t)
      .slice(0, 3);
    if (trades.length) found.serviceTypes = trades;

    // Services list
    const svcSection = html.match(/service[^<]*<\/h[1-4][^>]*>([\s\S]{0,2000})/i)?.[1] ?? "";
    const liItems = [...svcSection.matchAll(/<li[^>]*>([^<]{5,80})<\/li>/gi)]
      .map(m => m[1].replace(/<[^>]+>/g,"").trim()).filter(Boolean).slice(0,10);
    if (liItems.length) found.services = liItems;

    // Pricing
    const prices = text.match(/\$[\d,]+(?:\.\d{2})?(?:\s*[-–]\s*\$[\d,]+(?:\.\d{2})?)?/g) ?? [];
    if (prices.length) found.pricing = prices.slice(0, 5).join(", ");

    // FAQs
    const faqs = text.match(/[A-Z][^.?!]{20,120}\?/g) ?? [];
    if (faqs.length) found.faqs = faqs.slice(0, 6);

    // Hours
    const hoursMatch = text.match(/(?:hours|open)[^.]{0,80}(?:mon|tue|wed|thu|fri|sat|sun|am|pm)[^.]{0,60}/i);
    if (hoursMatch) found.hours = hoursMatch[0].trim();

    // Location
    const addrMatch = text.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)?),\s*([A-Z]{2})\s+\d{5}/);
    if (addrMatch) { found.city = addrMatch[1]; found.state = addrMatch[2]; }

    res.json({ ok: true, found });
  }));

  // Complete onboarding — provision Telnyx assistant + mark done
  app.post("/api/onboard/:token/complete", asyncHandler(async (req, res) => {
    const { onboardingTokens } = await import("@shared/schema");
    const { tenants } = await import("@shared/models/auth");

    const [row] = await db.select().from(onboardingTokens)
      .where(eq(onboardingTokens.token, req.params.token));
    if (!row || row.used || new Date() > row.expiresAt)
      return res.status(403).json({ error: "Invalid or already used link" });

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, row.tenantId));
    if (!tenant) return res.status(404).json({ error: "Account not found" });

    const {
      websiteUrl, companyName: bodyCompany, phone: bodyPhone,
      serviceTypes, services, pricing, faqs, hours, city, state,
      aiName, aiGreeting,
    } = req.body as Record<string, any>;

    const finalCompany  = bodyCompany  || tenant.companyName || "our company";
    const finalPhone    = bodyPhone    || tenant.phone || "";
    const botName       = aiName       || "Alex";
    const finalCity     = city  || (tenant.addressCity  ?? "");
    const finalState    = state || (tenant.addressState ?? "");
    const serviceList   = Array.isArray(services)     ? services.join(", ")
                        : Array.isArray(serviceTypes)  ? serviceTypes.join(", ")
                        : "home services";

    const pricingNote   = pricing ? `\n\nPRICING CONTEXT:\n${pricing}` : "";
    const faqBlock      = Array.isArray(faqs) && faqs.length
      ? `\n\nFREQUENTLY ASKED QUESTIONS:\n${(faqs as string[]).map((q,i) => `${i+1}. ${q}`).join("\n")}` : "";
    const hoursNote     = hours    ? `\n\nBUSINESS HOURS: ${hours}` : "";
    const locationNote  = finalCity ? `\n\nSERVICE AREA: ${finalCity}${finalState ? `, ${finalState}` : ""}` : "";

    const systemPrompt = `You are ${botName}, the AI receptionist for ${finalCompany}. You answer inbound calls from customers who need ${serviceList}.

YOUR JOB:
1. Greet the caller warmly and ask how you can help.
2. Understand their issue — ask clarifying questions one at a time.
3. If they need service, collect: their name, address, best callback number, and description of the issue.
4. If they ask about pricing, give the best info you have — be honest if you need to confirm with the team.
5. Offer to schedule a service call or have someone call them back.
6. Always end positively — confirm next steps.

COMPANY INFO:
Company: ${finalCompany}${finalPhone ? `\nPhone: ${finalPhone}` : ""}${locationNote}${hoursNote}

SERVICES: ${serviceList}${pricingNote}${faqBlock}

RULES:
- Never invent prices you don't have — say "let me have someone confirm that."
- If it's an emergency (no heat, burst pipe, no power), prioritize same-day or emergency service.
- Keep responses short — this is a phone call.
- If you can't help, always offer to take a message and have someone call back.
- If asked whether you're AI, say "I'm ${botName}, the virtual assistant for ${finalCompany}."

TONE: Professional, warm, and efficient. Match the caller's urgency.`;

    const TELNYX_API_KEY = process.env.TELNYX_API_KEY || "KEY019D4888EF9B3207CAA11BE5105E2EE8_SETj4jrBqqJo8hd2kH1ezG";
    let telnyxAssistantId: string | null = null;

    try {
      const createRes = await axios.post(
        "https://api.telnyx.com/v2/ai/assistants",
        {
          name: `${finalCompany} — Inbound`,
          system_prompt: systemPrompt,
          voice: "Telnyx.Savannah",
          language: "en",
          greeting: aiGreeting || `Thanks for calling ${finalCompany}, this is ${botName}. How can I help you today?`,
        },
        { headers: { Authorization: `Bearer ${TELNYX_API_KEY}`, "Content-Type": "application/json" }, timeout: 15000 }
      );
      telnyxAssistantId = createRes.data?.data?.id ?? createRes.data?.id ?? null;
    } catch (err: any) {
      console.error("[Onboard] Telnyx provision failed:", err?.response?.data ?? err.message);
    }

    // Save to tenant
    const update: Record<string, any> = {
      companyName: finalCompany,
      onboardingCompleted: true,
      bobEnabled: true,
      updatedAt: new Date(),
    };
    if (websiteUrl)        update.websiteUrl        = websiteUrl;
    if (telnyxAssistantId) update.telnyxAssistantId = telnyxAssistantId;
    if (bodyPhone)         update.phone             = bodyPhone;
    if (finalCity)         update.addressCity       = finalCity;
    if (finalState)        update.addressState      = finalState;

    await db.update(tenants).set(update as any).where(eq(tenants.id, row.tenantId));

    // Mark token used
    await db.update(onboardingTokens)
      .set({ used: true } as any)
      .where(eq(onboardingTokens.token, req.params.token));

    res.json({ ok: true, telnyxAssistantId, assistantProvisioned: !!telnyxAssistantId });
  }));

  // ── PROTECTED — wire auth + tenant context ───────────────────────────────
  app.use("/api", apiRateLimiter, isAuthenticated, tenantContextMiddleware);

  // ── TECHNICIANS ───────────────────────────────────────────────────────────
  app.get("/api/technicians", asyncHandler(async (req, res) => {
    const techs = await getTenantStorage(req).getTechnicians();
    res.json(techs.map(sanitizeTechnician));
  }));

  app.get("/api/technicians/:id", asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new ValidationError("Invalid technician ID");
    const tech = await getTenantStorage(req).getTechnician(id);
    if (!tech) throw new NotFoundError("Technician");
    res.json(sanitizeTechnician(tech));
  }));

  app.post("/api/technicians", strictRateLimiter, asyncHandler(async (req, res) => {
    // Accept either passwordHash (direct) or password (plain-text from onboarding wizard)
    const body = { ...req.body };
    if (!body.passwordHash && body.password) {
      body.passwordHash = await bcrypt.hash(body.password, 10);
    }
    if (!body.passwordHash) {
      body.passwordHash = await bcrypt.hash("demo1234", 10);
    }
    delete body.password;

    const data = validateBody(
      insertTechnicianSchema.omit({ tenantId: true }),
      body
    );
    const tech = await getTenantStorage(req).createTechnician(data as any);
    res.status(201).json(sanitizeTechnician(tech));
  }));

  app.put("/api/technicians/:id", requireRole("owner", "admin", "technician"), asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new ValidationError("Invalid technician ID");

    // Strip fields that must never be set directly
    const { passwordHash, tenantId, id: _id, password, ...safeBody } = req.body;

    // If a new password was provided, hash it properly
    let updates: any = safeBody;
    if (password && typeof password === "string" && password.length >= 6) {
      updates.passwordHash = await bcrypt.hash(password, 10);
    }

    const tech = await getTenantStorage(req).updateTechnician(id, updates);
    res.json(sanitizeTechnician(tech));
  }));

  app.delete("/api/technicians/:id", requireRole("owner", "admin"), asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new ValidationError("Invalid technician ID");
    // Soft-delete: mark inactive rather than destroying historical job records
    const tech = await getTenantStorage(req).updateTechnician(id, { isActive: false });
    if (!tech) throw new NotFoundError("Technician");
    res.status(204).send();
  }));

  app.patch("/api/technicians/:id/location", asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new ValidationError("Invalid technician ID");
    const { latitude, longitude } = req.body;
    if (typeof latitude !== "number" || typeof longitude !== "number") {
      throw new ValidationError("latitude and longitude must be numbers");
    }
    const tech = await getTenantStorage(req).updateTechnicianLocation(id, latitude, longitude);
    if (!tech) throw new NotFoundError("Technician");
    res.json(sanitizeTechnician(tech));
  }));

  // ── CUSTOMERS ─────────────────────────────────────────────────────────────
  app.get("/api/customers", asyncHandler(async (req, res) => {
    const customers = await getTenantStorage(req).getCustomers(req.query.search as string);
    res.json(customers);
  }));

  app.get("/api/customers/:id", asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new ValidationError("Invalid customer ID");
    const customer = await getTenantStorage(req).getCustomer(id);
    if (!customer) throw new NotFoundError("Customer");
    res.json(customer);
  }));

  app.post("/api/customers", asyncHandler(async (req, res) => {
    const data = validateBody(
      insertCustomerSchema.omit({ tenantId: true }),
      req.body
    );
    const customer = await getTenantStorage(req).createCustomer(data as any);
    res.status(201).json(customer);
  }));

  app.put("/api/customers/:id", asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new ValidationError("Invalid customer ID");
    // Strip fields that must not be overridden
    const { tenantId, id: _id, ...safeBody } = req.body;
    const data = validateBody(insertCustomerSchema.partial().omit({ tenantId: true }), safeBody);
    const customer = await getTenantStorage(req).updateCustomer(id, data as any);
    res.json(customer);
  }));

  app.delete("/api/customers/:id", requireRole("owner", "admin"), asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new ValidationError("Invalid customer ID");
    const ok = await getTenantStorage(req).deleteCustomer(id);
    if (!ok) throw new NotFoundError("Customer");
    res.status(204).send();
  }));

  // ── JOBS ──────────────────────────────────────────────────────────────────
  app.get("/api/jobs", asyncHandler(async (req, res) => {
    const { date, technicianId, status, customerId } = req.query as any;
    const jobs = await getTenantStorage(req).getJobs({
      date,
      status,
      technicianId: technicianId ? Number(technicianId) : undefined,
      customerId: customerId ? Number(customerId) : undefined,
    });
    res.json(jobs);
  }));

  app.get("/api/jobs/:id", asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new ValidationError("Invalid job ID");
    const job = await getTenantStorage(req).getJob(id);
    if (!job) throw new NotFoundError("Job");
    res.json(job);
  }));

  app.post("/api/jobs", asyncHandler(async (req, res) => {
    const data = validateBody(
      insertJobSchema.omit({ tenantId: true }),
      req.body
    );
    const job = await getTenantStorage(req).createJob(data as any);
    res.status(201).json(job);
  }));

  app.put("/api/jobs/:id", asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new ValidationError("Invalid job ID");
    const { tenantId, id: _id, jobNumber, ...safeBody } = req.body;
    const data = validateBody(insertJobSchema.partial().omit({ tenantId: true }), safeBody);
    const job = await getTenantStorage(req).updateJob(id, data as any);
    res.json(job);
  }));

  app.post("/api/jobs/:id/status", asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new ValidationError("Invalid job ID");
    const job = await getTenantStorage(req).getJob(id);
    if (!job) throw new NotFoundError("Job");

    const { status } = req.body;
    if (!status) throw new ValidationError("status is required");

    const result = validateStatusTransition(job.status as JobStatus, status as JobStatus);
    if (!result.valid) throw new AppError(400, result.message || "Invalid status transition");

    const updated = await getTenantStorage(req).updateJob(id, { status });
    res.json(updated);
  }));

  app.delete("/api/jobs/:id", requireRole("owner", "admin"), asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new ValidationError("Invalid job ID");
    const ok = await getTenantStorage(req).deleteJob(id);
    if (!ok) throw new NotFoundError("Job");
    res.status(204).send();
  }));

  // ── PARTS ─────────────────────────────────────────────────────────────────
  app.get("/api/parts", asyncHandler(async (req, res) => {
    res.json(await getTenantStorage(req).getParts());
  }));

  app.post("/api/parts", asyncHandler(async (req, res) => {
    const { partName } = req.body;
    if (!partName || typeof partName !== "string") {
      throw new ValidationError("partName is required");
    }
    res.status(201).json(await getTenantStorage(req).createPart(req.body));
  }));

  // ── JOB PHOTOS ────────────────────────────────────────────────────────────
  app.get("/api/jobs/:jobId/photos", asyncHandler(async (req, res) => {
    const jobId = Number(req.params.jobId);
    if (isNaN(jobId)) throw new ValidationError("Invalid job ID");
    res.json(await getTenantStorage(req).getJobPhotos(jobId));
  }));

  app.post("/api/jobs/:jobId/photos", asyncHandler(async (req, res) => {
    const jobId = Number(req.params.jobId);
    if (isNaN(jobId)) throw new ValidationError("Invalid job ID");
    const { photoUrl } = req.body;
    if (!photoUrl || typeof photoUrl !== "string") {
      throw new ValidationError("photoUrl is required");
    }
    const photo = await getTenantStorage(req).createJobPhoto({
      ...req.body,
      jobId,
    });
    res.status(201).json(photo);
  }));

  app.delete("/api/jobs/:jobId/photos/:id", asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new ValidationError("Invalid photo ID");
    const ok = await getTenantStorage(req).deleteJobPhoto(id);
    if (!ok) throw new NotFoundError("Photo");
    res.status(204).send();
  }));

  // ── JOB NOTES ─────────────────────────────────────────────────────────────
  app.get("/api/jobs/:jobId/notes", asyncHandler(async (req, res) => {
    const jobId = Number(req.params.jobId);
    if (isNaN(jobId)) throw new ValidationError("Invalid job ID");
    res.json(await getTenantStorage(req).getJobNotes(jobId));
  }));

  app.post("/api/jobs/:jobId/notes", asyncHandler(async (req, res) => {
    const jobId = Number(req.params.jobId);
    if (isNaN(jobId)) throw new ValidationError("Invalid job ID");
    const { noteText } = req.body;
    if (!noteText || typeof noteText !== "string" || noteText.trim().length === 0) {
      throw new ValidationError("noteText is required");
    }
    const note = await getTenantStorage(req).createJobNote({
      ...req.body,
      jobId,
    });
    res.status(201).json(note);
  }));

  // ── CHECKLISTS ────────────────────────────────────────────────────────────
  app.get("/api/checklists", asyncHandler(async (req, res) => {
    res.json(await getTenantStorage(req).getServiceChecklists(req.query.serviceType as string));
  }));

  app.get("/api/jobs/:jobId/checklist", asyncHandler(async (req, res) => {
    const jobId = Number(req.params.jobId);
    if (isNaN(jobId)) throw new ValidationError("Invalid job ID");
    res.json(await getTenantStorage(req).getJobChecklistItems(jobId));
  }));

  app.patch("/api/checklist-items/:id", asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new ValidationError("Invalid checklist item ID");
    const item = await getTenantStorage(req).updateJobChecklistItem(id, {
      isCompleted: req.body.isCompleted,
      notes: req.body.notes,
    });
    res.json(item);
  }));

  // ── BOB AI ASSISTANT ─────────────────────────────────────────────────────
  app.get("/api/bob/conversations", asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    const result = await db.query.bobConversations.findMany({
      where: (t: any, { eq }: any) => eq(t.tenantId, tenantId),
      orderBy: (t: any, { desc }: any) => [desc(t.updatedAt)],
      limit: 50,
    });
    res.json(result);
  }));

  app.post("/api/bob/conversations", asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    const [conv] = await db.insert(bobConversations)
      .values({ tenantId, channel: "chat", status: "open" })
      .returning();
    res.status(201).json(conv);
  }));

  app.get("/api/bob/conversations/:id/messages", asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);
    if (isNaN(id)) throw new ValidationError("Invalid conversation ID");
    // Verify conversation belongs to the authenticated tenant before returning messages
    const conv = await db.query.bobConversations.findFirst({
      where: (t: any, { and: a, eq: e }: any) => a(e(t.id, id), e(t.tenantId, tenantId)),
    });
    if (!conv) throw new NotFoundError("Conversation");
    const msgs = await db.query.bobMessages.findMany({
      where: (t: any, { eq }: any) => eq(t.conversationId, id),
      orderBy: (t: any, { asc }: any) => [asc(t.createdAt)],
    });
    res.json(msgs);
  }));

  app.post("/api/bob/conversations/:id/messages", bobRateLimiter, asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    const conversationId = Number(req.params.id);
    if (isNaN(conversationId)) throw new ValidationError("Invalid conversation ID");

    const { content } = req.body;
    if (!content || typeof content !== "string" || content.trim().length === 0) {
      throw new ValidationError("content is required");
    }
    if (content.length > 4000) {
      throw new ValidationError("Message too long (max 4000 characters)");
    }

    // Verify this conversation belongs to the authenticated tenant (prevents cross-tenant injection)
    const conv = await db.query.bobConversations.findFirst({
      where: (t: any, { and: a, eq: e }: any) => a(e(t.id, conversationId), e(t.tenantId, tenantId)),
    });
    if (!conv) throw new NotFoundError("Conversation");

    // Pass the authenticated user's role so Bob enforces tool access correctly
    const callerRole = (req as any).user?.role ?? "staff";

    await db.insert(bobMessages).values({ tenantId, conversationId, role: "user", content });

    let reply: string;
    try {
      reply = await runBobAgent(tenantId, conversationId, content, callerRole);
    } catch (err: any) {
      console.error("[Bob] Agent error:", err?.message);
      reply = "I hit an error on my end — check the server logs.";
    }

    const [msg] = await db.insert(bobMessages)
      .values({ tenantId, conversationId, role: "assistant", content: reply })
      .returning();

    await db.update(bobConversations)
      .set({ updatedAt: new Date() })
      .where(eq(bobConversations.id, conversationId));

    res.status(201).json(msg);
  }));

  app.get("/api/bob/memory", asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    const { bobMemory } = await import("@shared/schema");
    const rows = await db.query.bobMemory.findMany({
      where: (t: any, { eq }: any) => eq(t.tenantId, tenantId),
      orderBy: (t: any, { desc }: any) => [desc(t.updatedAt)],
    });
    res.json(rows);
  }));

  // ── AD LEADS (owner/admin UI + public intake webhook) ────────────────────

  // Public webhook — receives leads from Speed-to-Lead, web forms, Google/Meta
  // Auth: pre-shared secret in X-Webhook-Secret header + tenant ID
  app.post("/api/leads/inbound", asyncHandler(async (req, res) => {
    // Verify pre-shared webhook secret — required. Set LEADS_WEBHOOK_SECRET in env.
    const webhookSecret = process.env.LEADS_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new AppError(500, "LEADS_WEBHOOK_SECRET is not configured on this server");
    }
    const provided = req.headers["x-webhook-secret"] as string;
    if (!provided || provided !== webhookSecret) {
      throw new AppError(401, "Invalid or missing webhook secret");
    }

    // Identify tenant by API key or slug passed in body
    const tenantKey = req.headers["x-tenant-id"] as string || req.body.tenantId;
    if (!tenantKey) throw new ValidationError("x-tenant-id header required");

    const { ingestLead } = await import("./bob/marketing");
    const { adLeads: _ } = await import("@shared/schema");

    const leadId = await ingestLead(tenantKey, {
      firstName:       req.body.firstName || req.body.first_name,
      lastName:        req.body.lastName  || req.body.last_name,
      phone:           req.body.phone,
      email:           req.body.email,
      serviceInterest: req.body.serviceInterest || req.body.service_interest || req.body.service,
      sourcePlatform:  req.body.sourcePlatform  || req.body.source || req.body.utm_source || "other",
      campaignId:      req.body.campaignId   || req.body.campaign_id,
      campaignName:    req.body.campaignName || req.body.campaign_name,
      utmSource:       req.body.utm_source,
      utmMedium:       req.body.utm_medium,
      utmCampaign:     req.body.utm_campaign,
      gclid:           req.body.gclid,
      fbclid:          req.body.fbclid,
      estimatedValue:  req.body.estimatedValue || req.body.estimated_value,
      rawPayload:      req.body,
    });

    res.status(201).json({ success: true, leadId });
  }));

  // Owner/admin: list leads
  app.get("/api/leads", requireRole("owner", "admin"), asyncHandler(async (req, res) => {
    const { adLeads } = await import("@shared/schema");
    const tenantId = getTenantId(req);
    const status   = req.query.status as string | undefined;
    const platform = req.query.platform as string | undefined;
    const days     = Math.min(Number(req.query.days || 30), 90);

    const since = new Date();
    since.setDate(since.getDate() - days);

    const { gte: gteOp, and: andOp, eq: eqOp, sql: sqlOp, desc: descOp } = await import("drizzle-orm");
    let where = andOp(eqOp(adLeads.tenantId, tenantId), gteOp(adLeads.createdAt, since));

    const rows = await db
      .select()
      .from(adLeads)
      .where(where)
      .orderBy(descOp(adLeads.createdAt))
      .limit(200);

    // Client-side filter for status/platform (simple for now)
    const filtered = rows.filter(r =>
      (!status   || r.status          === status) &&
      (!platform || r.sourcePlatform  === platform)
    );
    res.json(filtered);
  }));

  // Owner/admin: update lead status
  app.patch("/api/leads/:id", requireRole("owner", "admin"), asyncHandler(async (req, res) => {
    const { adLeads } = await import("@shared/schema");
    const { eq: eqOp, and: andOp } = await import("drizzle-orm");
    const tenantId = getTenantId(req);
    const id       = Number(req.params.id);
    if (isNaN(id)) throw new ValidationError("Invalid lead ID");

    const allowed = ["status", "outcomeNotes", "nextFollowUpAt", "bookedJobId"];
    const updates: any = { updatedAt: new Date() };
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }
    const [updated] = await db
      .update(adLeads)
      .set(updates)
      .where(andOp(eqOp(adLeads.id, id), eqOp(adLeads.tenantId, tenantId)))
      .returning();
    if (!updated) throw new NotFoundError("Lead");
    res.json(updated);
  }));

  // ── BOB KNOWLEDGE BASE ───────────────────────────────────────────────────
  app.get("/api/bob/knowledge", isAuthenticated, asyncHandler(async (req, res) => {
    const { bobKnowledge } = await import("@shared/schema");
    const tenantId = getTenantId(req);
    const docs = await db
      .select({
        id: bobKnowledge.id,
        title: bobKnowledge.title,
        category: bobKnowledge.category,
        isActive: bobKnowledge.isActive,
        createdAt: bobKnowledge.createdAt,
        contentPreview: bobKnowledge.content,
      })
      .from(bobKnowledge)
      .where(eq(bobKnowledge.tenantId, tenantId))
      .orderBy(bobKnowledge.createdAt);

    // Trim content preview to 200 chars
    res.json(docs.map(d => ({ ...d, contentPreview: d.contentPreview?.slice(0, 200) })));
  }));

  app.post("/api/bob/knowledge", requireRole("owner", "admin"), asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    const { title, content, category } = req.body;
    if (!title || typeof title !== "string" || title.trim().length === 0)
      throw new ValidationError("title is required");
    if (!content || typeof content !== "string" || content.trim().length < 10)
      throw new ValidationError("content must be at least 10 characters");

    const { ingestKnowledge } = await import("./bob/knowledge");
    const result = await ingestKnowledge(tenantId, title.trim(), content.trim(), category || "general");
    res.status(201).json({ id: result.id, chunkCount: result.chunkCount, message: "Knowledge ingested successfully" });
  }));

  app.post("/api/bob/knowledge/upload", requireRole("owner", "admin"), upload.single("file"), asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) throw new ValidationError("No file uploaded");

    const title = (req.body.title || file.originalname).trim();
    const category = req.body.category || "general";
    const mime = file.mimetype;
    const ext = file.originalname.split(".").pop()?.toLowerCase();

    let content = "";

    if (mime === "text/plain" || ext === "txt" || ext === "md" || ext === "csv") {
      content = file.buffer.toString("utf8");
    } else if (mime === "application/pdf" || ext === "pdf") {
      const pdfParse = await import("pdf-parse");
      const parsed = await pdfParse.default(file.buffer);
      content = parsed.text;
    } else if (
      mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      ext === "docx"
    ) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      content = result.value;
    } else {
      throw new ValidationError("Unsupported file type. Upload a PDF, Word (.docx), or text file.");
    }

    content = content.trim();
    if (content.length < 10) throw new ValidationError("File appears to be empty or unreadable.");

    const { ingestKnowledge } = await import("./bob/knowledge");
    const result = await ingestKnowledge(tenantId, title, content, category);
    res.status(201).json({ id: result.id, chunkCount: result.chunkCount, message: "File ingested successfully" });
  }));

  app.delete("/api/bob/knowledge/:id", requireRole("owner", "admin"), asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);
    if (isNaN(id)) throw new ValidationError("Invalid knowledge ID");
    const { deleteKnowledge } = await import("./bob/knowledge");
    await deleteKnowledge(tenantId, id);
    res.json({ message: "Deleted" });
  }));

  app.patch("/api/bob/knowledge/:id/toggle", requireRole("owner", "admin"), asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);
    if (isNaN(id)) throw new ValidationError("Invalid knowledge ID");
    const { bobKnowledge } = await import("@shared/schema");
    const [doc] = await db
      .update(bobKnowledge)
      .set({ isActive: req.body.isActive, updatedAt: new Date() })
      .where(and(eq(bobKnowledge.id, id), eq(bobKnowledge.tenantId, tenantId)))
      .returning();
    if (!doc) throw new NotFoundError("Knowledge document");
    res.json({ id: doc.id, isActive: doc.isActive });
  }));

  // ── TENANT SETTINGS (owner only) ─────────────────────────────────────────
  app.get("/api/tenant/settings", isAuthenticated, asyncHandler(async (req, res) => {
    const { tenants } = await import("@shared/models/auth");
    const tenantId = getTenantId(req);
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    if (!tenant) throw new NotFoundError("Tenant");
    res.json({
      companyName: tenant.companyName,
      email: tenant.email,
      phone: tenant.phone,
      bobEnabled: tenant.bobEnabled,
      briefingEnabled: (tenant as any).briefingEnabled ?? false,
      planTier: tenant.planTier,
    });
  }));

  app.patch("/api/tenant/settings", requireRole("owner", "admin"), asyncHandler(async (req, res) => {
    const { tenants } = await import("@shared/models/auth");
    const tenantId = getTenantId(req);
    const allowed = ["phone", "bobEnabled", "briefingEnabled", "companyName"];
    const updates: Record<string, any> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) throw new ValidationError("No valid fields provided");
    const [updated] = await db
      .update(tenants)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(tenants.id, tenantId))
      .returning();
    res.json({
      companyName: updated.companyName,
      email: updated.email,
      phone: updated.phone,
      bobEnabled: updated.bobEnabled,
      briefingEnabled: (updated as any).briefingEnabled ?? false,
      planTier: updated.planTier,
    });
  }));

  // ── DEMO SEED (owner/admin only, one-time) ────────────────────────────────
  app.post("/api/admin/seed-demo", requireRole("owner", "admin"), asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    const { technicians: techTable, customers: custTable, jobs: jobTable } = await import("@shared/schema");
    const { tenants } = await import("@shared/models/auth");
    const { eq: eqOp } = await import("drizzle-orm");

    // Guard: don't re-seed if customers/jobs already exist
    const existingCustomers = await db.select().from(custTable).where(eqOp(custTable.tenantId, tenantId)).limit(1);
    if (existingCustomers.length > 0) {
      throw new AppError(409, "Demo data already exists for this tenant. Delete existing records first.");
    }

    const tenant = await db.select().from(tenants).where(eqOp(tenants.id, tenantId)).limit(1).then(r => r[0]);
    if (!tenant) throw new NotFoundError("Tenant");

    const pwHash = await bcrypt.hash("demo1234", 10);

    const d = (offsetDays: number) => {
      const dt = new Date();
      dt.setDate(dt.getDate() + offsetDays);
      return dt.toISOString().split("T")[0];
    };

    const [marcus, priya, darnell] = await Promise.all([
      db.insert(techTable).values({ tenantId, email: "marcus.hayes@demo.com", passwordHash: pwHash, firstName: "Marcus", lastName: "Hayes", phone: "(813) 555-0142", employeeId: "TECH-001", specialties: ["HVAC","Refrigeration"], certifications: ["EPA 608","NATE Certified"], isActive: true }).returning().then(r => r[0]),
      db.insert(techTable).values({ tenantId, email: "priya.nguyen@demo.com", passwordHash: pwHash, firstName: "Priya", lastName: "Nguyen", phone: "(813) 555-0187", employeeId: "TECH-002", specialties: ["Plumbing","Water Heaters"], certifications: ["Florida Plumbing License"], isActive: true }).returning().then(r => r[0]),
      db.insert(techTable).values({ tenantId, email: "darnell.brooks@demo.com", passwordHash: pwHash, firstName: "Darnell", lastName: "Brooks", phone: "(813) 555-0231", employeeId: "TECH-003", specialties: ["Electrical","Generators"], certifications: ["Florida Electrical License"], isActive: true }).returning().then(r => r[0]),
    ]);

    const [linda, bob2, carol, james, patricia] = await Promise.all([
      db.insert(custTable).values({ tenantId, firstName: "Linda", lastName: "Carver", email: "linda.carver@gmail.com", phone: "(813) 555-1201", addressStreet: "4821 Palma Ceia Dr", addressCity: "Tampa", addressState: "FL", addressZip: "33629", tags: ["VIP","Repeat"], notes: "Has two AC units — always ask about the upstairs unit.", customerSince: "2023-03-15", totalJobsCompleted: 7, lifetimeValue: "2840.00" }).returning().then(r => r[0]),
      db.insert(custTable).values({ tenantId, firstName: "Bob", lastName: "Stanton", email: "bstanton@outlook.com", phone: "(813) 555-0934", addressStreet: "1102 Bayshore Blvd", addressCity: "Tampa", addressState: "FL", addressZip: "33606", gateCode: "#4421", tags: ["Commercial"], notes: "Condo unit 8B. Park in visitor spot, gate code #4421.", customerSince: "2024-01-08", totalJobsCompleted: 3, lifetimeValue: "1150.00" }).returning().then(r => r[0]),
      db.insert(custTable).values({ tenantId, firstName: "Carol", lastName: "Mendez", email: "carol.mendez@yahoo.com", phone: "(813) 555-2876", addressStreet: "7603 Gunn Hwy", addressCity: "Tampa", addressState: "FL", addressZip: "33625", tags: ["New Customer"], notes: "Referred by Linda Carver.", customerSince: d(0), totalJobsCompleted: 0, lifetimeValue: "0.00" }).returning().then(r => r[0]),
      db.insert(custTable).values({ tenantId, firstName: "James", lastName: "Whitfield", email: "jwhitfield@protonmail.com", phone: "(813) 555-3318", addressStreet: "2250 N Dale Mabry Hwy", addressCity: "Tampa", addressState: "FL", addressZip: "33607", accessNotes: "Dog in yard — call before entering gate.", tags: ["Repeat"], notes: "Has a pit bull named Zeus. Call ahead.", customerSince: "2023-11-20", totalJobsCompleted: 4, lifetimeValue: "1890.00" }).returning().then(r => r[0]),
      db.insert(custTable).values({ tenantId, firstName: "Patricia", lastName: "Drummond", email: "pat.drummond@gmail.com", phone: "(813) 555-4502", addressStreet: "9312 Lazy Lane", addressCity: "Tampa", addressState: "FL", addressZip: "33614", tags: ["Senior","VIP"], notes: "Elderly customer, needs extra time. Always send ETA.", customerSince: "2022-06-10", totalJobsCompleted: 12, lifetimeValue: "4200.00" }).returning().then(r => r[0]),
    ]);

    await Promise.all([
      db.insert(jobTable).values({ tenantId, jobNumber: "JOB-2405-001", customerId: linda.id, technicianId: marcus.id, scheduledDate: d(0), scheduledTimeStart: "09:00:00", scheduledTimeEnd: "11:00:00", estimatedDurationMinutes: 120, serviceType: "HVAC Maintenance", priority: "normal", description: "Annual AC tune-up. Customer reports clicking noise on startup.", specialInstructions: "Check both units — upstairs and downstairs.", status: "in_progress", startedAt: new Date(), totalCost: "185.00", paymentStatus: "pending" }),
      db.insert(jobTable).values({ tenantId, jobNumber: "JOB-2405-002", customerId: bob2.id, technicianId: priya.id, scheduledDate: d(0), scheduledTimeStart: "11:30:00", scheduledTimeEnd: "13:00:00", estimatedDurationMinutes: 90, serviceType: "Plumbing Repair", priority: "urgent", description: "Slow drain in master bath. Water pooling 5+ minutes.", specialInstructions: "Condo 8B — gate code #4421, visitor parking.", status: "en_route", enRouteAt: new Date(), totalCost: "225.00", paymentStatus: "pending" }),
      db.insert(jobTable).values({ tenantId, jobNumber: "JOB-2405-003", customerId: carol.id, technicianId: marcus.id, scheduledDate: d(0), scheduledTimeStart: "14:00:00", scheduledTimeEnd: "15:30:00", estimatedDurationMinutes: 90, serviceType: "AC Installation", priority: "normal", description: "Install new Carrier 3-ton mini-split. Unit is on-site.", status: "scheduled", totalCost: "1850.00", paymentStatus: "invoiced" }),
      db.insert(jobTable).values({ tenantId, jobNumber: "JOB-2405-004", customerId: james.id, technicianId: darnell.id, scheduledDate: d(1), scheduledTimeStart: "08:00:00", scheduledTimeEnd: "10:00:00", estimatedDurationMinutes: 120, serviceType: "Electrical Inspection", priority: "normal", description: "Annual panel inspection. Customer adding a hot tub.", specialInstructions: "Dog in yard — call customer before entering gate.", status: "scheduled", totalCost: "350.00", paymentStatus: "pending" }),
      db.insert(jobTable).values({ tenantId, jobNumber: "JOB-2405-005", customerId: patricia.id, technicianId: priya.id, scheduledDate: d(1), scheduledTimeStart: "10:30:00", scheduledTimeEnd: "12:00:00", estimatedDurationMinutes: 90, serviceType: "Water Heater Replacement", priority: "urgent", description: "40-gal leaking from bottom. 11 years old, replacement approved.", specialInstructions: "Senior customer — send ETA text 30 min before arrival.", status: "scheduled", totalCost: "1240.00", paymentStatus: "invoiced" }),
      db.insert(jobTable).values({ tenantId, jobNumber: "JOB-2405-006", customerId: linda.id, technicianId: darnell.id, scheduledDate: d(2), scheduledTimeStart: "09:00:00", scheduledTimeEnd: "11:00:00", estimatedDurationMinutes: 120, serviceType: "Generator Installation", priority: "normal", description: "Install whole-home Generac 22kW standby. Unit on-site in garage.", status: "scheduled", totalCost: "3200.00", paymentStatus: "invoiced" }),
      db.insert(jobTable).values({ tenantId, jobNumber: "JOB-2405-007", customerId: james.id, technicianId: marcus.id, scheduledDate: d(-1), scheduledTimeStart: "10:00:00", scheduledTimeEnd: "12:00:00", estimatedDurationMinutes: 120, serviceType: "HVAC Repair", priority: "urgent", description: "AC not cooling — refrigerant leak at evaporator coil.", status: "completed", completedAt: new Date(Date.now() - 86400000), actualDurationMinutes: 105, workPerformed: "Located leak at evaporator coil, repaired, recharged with 2 lbs R-410A.", totalCost: "485.00", paymentStatus: "paid", customerRating: 5, customerFeedback: "Marcus was awesome — on time and AC is ice cold!" }),
      db.insert(jobTable).values({ tenantId, jobNumber: "JOB-2405-008", customerId: patricia.id, technicianId: priya.id, scheduledDate: d(-3), scheduledTimeStart: "09:30:00", scheduledTimeEnd: "11:00:00", estimatedDurationMinutes: 90, serviceType: "Drain Cleaning", priority: "normal", description: "Main line slow drain. Hydro-jet service.", status: "completed", completedAt: new Date(Date.now() - 3 * 86400000), actualDurationMinutes: 80, workPerformed: "Camera found grease buildup at 35ft. Hydro-jet cleared blockage.", totalCost: "320.00", paymentStatus: "paid", customerRating: 4, customerFeedback: "Very professional.", requiresFollowup: true, followupDate: d(27), followupReason: "30-day drain check per customer agreement" }),
    ]);

    res.json({
      message: "Demo seed complete!",
      created: { technicians: 3, customers: 5, jobs: 8 },
      technicianPin: "demo1234",
    });
  }));

  // ── ONE-TIME: REASSIGN TELNYX NUMBER TO CORRECT CONNECTION ───────────────
  // Hit POST /api/admin/fix-telnyx-number once to wire the number to the right app
  app.post("/api/admin/fix-telnyx-number", requireRole("owner", "admin"), asyncHandler(async (_req, res) => {
    const apiKey = process.env.TELNYX_API_KEY;
    const targetConnectionId = process.env.TELNYX_CONNECTION_ID;
    const phoneNumber = process.env.TELNYX_PHONE_NUMBER;

    if (!apiKey) throw new ValidationError("TELNYX_API_KEY not set in environment");
    if (!targetConnectionId) throw new ValidationError("TELNYX_CONNECTION_ID not set in environment");
    if (!phoneNumber) throw new ValidationError("TELNYX_PHONE_NUMBER not set in environment");

    // Step 1: Find the phone number record
    const listRes = await axios.get(`https://api.telnyx.com/v2/phone_numbers?filter[phone_number]=${encodeURIComponent(phoneNumber)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 15000,
    });
    const numbers = listRes.data?.data;
    if (!numbers || numbers.length === 0) {
      throw new ValidationError(`Phone number ${phoneNumber} not found in this Telnyx account`);
    }
    const numberId = numbers[0].id;
    const currentConnectionId = numbers[0].connection_id;

    // Step 2: Reassign to the correct connection
    const patchRes = await axios.patch(
      `https://api.telnyx.com/v2/phone_numbers/${numberId}`,
      { connection_id: targetConnectionId },
      { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, timeout: 15000 }
    );

    res.json({
      ok: true,
      numberId,
      phoneNumber,
      previousConnectionId: currentConnectionId,
      newConnectionId: targetConnectionId,
      telnyxStatus: patchRes.data?.data?.status,
    });
  }));

  // ── ONE-TIME: CREATE + ASSIGN OUTBOUND VOICE PROFILE ─────────────────────
  app.post("/api/admin/fix-telnyx-outbound", requireRole("owner", "admin"), asyncHandler(async (_req, res) => {
    const apiKey = process.env.TELNYX_API_KEY;
    const connectionId = process.env.TELNYX_CONNECTION_ID;
    if (!apiKey) throw new ValidationError("TELNYX_API_KEY not set");
    if (!connectionId) throw new ValidationError("TELNYX_CONNECTION_ID not set");

    const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

    // 1. Get or create an outbound voice profile
    const listRes = await axios.get("https://api.telnyx.com/v2/outbound_voice_profiles", { headers, timeout: 15000 });
    const profiles = listRes.data?.data ?? [];

    let profileId: string;
    let profileName: string;
    let action: string;

    if (profiles.length > 0) {
      profileId = profiles[0].id;
      profileName = profiles[0].name;
      action = "used_existing";
    } else {
      const createRes = await axios.post(
        "https://api.telnyx.com/v2/outbound_voice_profiles",
        { name: "Contractor OS Outbound", traffic_type: "conversational", enabled: true },
        { headers }
      );
      profileId = createRes.data?.data?.id;
      profileName = createRes.data?.data?.name;
      action = "created_new";
    }

    // 2. The correct fix: PATCH the call control APPLICATION to point at the profile
    const appPatch = await axios.patch(
      `https://api.telnyx.com/v2/call_control_applications/${connectionId}`,
      { outbound_voice_profile_id: profileId },
      { headers }
    );

    res.json({
      ok: true,
      action,
      profileId,
      profileName,
      connectionId,
      appName: appPatch.data?.data?.application_name,
      outboundProfileId: appPatch.data?.data?.outbound_voice_profile_id,
    });
  }));

  // ── TEST CALL (owner/admin only) ─────────────────────────────────────────
  app.post("/api/admin/test-call", requireRole("owner", "admin"), asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    const { tenants } = await import("@shared/models/auth");
    const { eq: eqOp } = await import("drizzle-orm");

    const tenant = await db.select().from(tenants).where(eqOp(tenants.id, tenantId)).limit(1).then(r => r[0]);
    if (!tenant) throw new NotFoundError("Tenant");

    const phone = (tenant as any).phone;
    if (!phone) throw new ValidationError("No briefing phone number set — add it in Settings first.");

    const selfUrl = process.env.SELF_URL || "https://field-app-production-d5c8.up.railway.app";
    const webhookUrl = `${selfUrl}/api/voice/webhook`;
    const clientState = Buffer.from(JSON.stringify({ tenantId, briefingType: "morning" })).toString("base64");

    let r: any;
    try {
      r = await axios.post(
        "https://api.telnyx.com/v2/calls",
        {
          connection_id: process.env.TELNYX_CONNECTION_ID || process.env.TELNYX_APP_ID,
          to: phone,
          from: process.env.TELNYX_PHONE_NUMBER,
          webhook_url: webhookUrl,
          webhook_url_method: "POST",
          client_state: clientState,
        },
        { headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}` }, timeout: 20000 }
      );
    } catch (err: any) {
      const telnyxError = err?.response?.data;
      console.error("[TestCall] Telnyx error:", JSON.stringify(telnyxError ?? err?.message));
      const detail = telnyxError?.errors?.[0]?.detail || telnyxError?.errors?.[0]?.title || err?.message || "Telnyx call failed";
      throw new AppError(err?.response?.status || 500, detail);
    }

    res.json({ ok: true, callControlId: r.data?.data?.call_control_id, callingTo: phone });
  }));

  // ── CRM INTEGRATION ──────────────────────────────────────────────────────

  // Save CRM config (owner only)
  app.post("/api/tenant/crm", requireRole("owner", "admin"), asyncHandler(async (req, res) => {
    const { tenants } = await import("@shared/models/auth");
    const tenantId = getTenantId(req);
    const { crmType, crmApiKey, ghlLocationId } = req.body;

    if (!crmType || !["ghl", "jobber", "servicetitan", "none"].includes(crmType)) {
      throw new ValidationError("crmType must be ghl, jobber, servicetitan, or none");
    }
    if (crmType !== "none" && !crmApiKey) {
      throw new ValidationError("crmApiKey is required");
    }

    const updates: Record<string, any> = {
      crmType: crmType === "none" ? null : crmType,
      crmApiKey: crmType === "none" ? null : crmApiKey,
      updatedAt: new Date(),
    };
    if (ghlLocationId !== undefined) updates.ghlLocationId = ghlLocationId;

    await db.update(tenants).set(updates).where(eq(tenants.id, tenantId));
    res.json({ ok: true, crmType: updates.crmType });
  }));

  // Test CRM connection
  app.get("/api/tenant/crm/test", requireRole("owner", "admin"), asyncHandler(async (req, res) => {
    const { tenants } = await import("@shared/models/auth");
    const { getCrmAdapter } = await import("./crm/index");
    const tenantId = getTenantId(req);
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    if (!tenant) throw new NotFoundError("Tenant");

    const adapter = getCrmAdapter(tenant as any);
    if (!adapter) {
      return res.json({ ok: false, error: "No CRM configured. Save your CRM settings first." });
    }

    const result = await adapter.testConnection();
    res.json(result);
  }));

  // ── ONBOARDING: Scrape website ────────────────────────────────────────────
  app.post("/api/tenant/onboarding/scrape", isAuthenticated, asyncHandler(async (req, res) => {
    const { url } = req.body as { url: string };
    if (!url || typeof url !== "string") throw new ValidationError("url is required");

    let rawUrl = url.trim();
    if (!/^https?:\/\//i.test(rawUrl)) rawUrl = `https://${rawUrl}`;

    let html = "";
    try {
      const resp = await axios.get(rawUrl, {
        timeout: 8000,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; FluidBot/1.0)" },
        maxRedirects: 5,
      });
      html = String(resp.data ?? "");
    } catch {
      return res.json({ ok: false, error: "Could not fetch website — check the URL and try again." });
    }

    // Strip tags for text extraction
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, "")
                     .replace(/<style[\s\S]*?<\/style>/gi, "")
                     .replace(/<[^>]+>/g, " ")
                     .replace(/\s{2,}/g, " ")
                     .slice(0, 8000); // cap for prompt

    // ── Extract structured fields ──────────────────────────────────────────
    const found: Record<string, string | string[]> = {};

    // Company name — og:site_name > title tag > h1
    const ogSite = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);
    const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const h1Tag = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const rawName = ogSite?.[1] || titleTag?.[1]?.split(/[|\-–]/)[0]?.trim() || h1Tag?.[1]?.trim();
    if (rawName) found.companyName = rawName.trim();

    // Phone — grab all phone-like patterns
    const phones = text.match(/\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/g) ?? [];
    if (phones.length) found.phone = phones[0];

    // Trade type — keyword match
    const TRADES: Record<string, string[]> = {
      HVAC: ["hvac", "heating", "cooling", "air conditioning", "furnace", "ac repair"],
      Plumbing: ["plumbing", "plumber", "drain", "pipe", "water heater"],
      Electrical: ["electrical", "electrician", "wiring", "panel"],
      Roofing: ["roofing", "roofer", "roof repair", "shingles"],
      Landscaping: ["landscaping", "lawn", "sprinkler", "irrigation"],
      "Pest Control": ["pest control", "exterminator", "termite"],
      "Pool Service": ["pool service", "pool cleaning", "pool repair"],
      Painting: ["painting", "painter", "interior paint", "exterior paint"],
      Cleaning: ["cleaning", "maid", "housekeeping", "janitorial"],
      "General Contracting": ["contractor", "remodeling", "renovation", "construction"],
    };
    const lowerText = text.toLowerCase();
    const matchedTrades: string[] = [];
    for (const [trade, keywords] of Object.entries(TRADES)) {
      if (keywords.some(kw => lowerText.includes(kw))) matchedTrades.push(trade);
    }
    if (matchedTrades.length) found.serviceTypes = matchedTrades.slice(0, 3);

    // Services list — look for <li> items near "service" headings
    const serviceSection = html.match(/service[^<]*<\/h[1-4][^>]*>([\s\S]{0,2000})/i)?.[1] ?? "";
    const liItems = [...serviceSection.matchAll(/<li[^>]*>([^<]{5,80})<\/li>/gi)]
      .map(m => m[1].replace(/<[^>]+>/g, "").trim())
      .filter(Boolean)
      .slice(0, 10);
    if (liItems.length) found.services = liItems;

    // Pricing — look for $ amounts or "pricing" / "rates" sections
    const priceMatches = text.match(/\$[\d,]+(?:\.\d{2})?(?:\s*[-–]\s*\$[\d,]+(?:\.\d{2})?)?/g) ?? [];
    if (priceMatches.length) found.pricing = priceMatches.slice(0, 5).join(", ");

    // FAQs — look for question-like sentences
    const faqMatches = text.match(/[A-Z][^.?!]{20,120}\?/g) ?? [];
    if (faqMatches.length) found.faqs = faqMatches.slice(0, 6);

    // Business hours
    const hoursMatch = text.match(/(?:hours|open)[^.]{0,80}(?:mon|tue|wed|thu|fri|sat|sun|am|pm)[^.]{0,60}/i);
    if (hoursMatch) found.hours = hoursMatch[0].trim();

    // City/state from address patterns
    const addrMatch = text.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)?),\s*([A-Z]{2})\s+\d{5}/);
    if (addrMatch) {
      found.city = addrMatch[1];
      found.state = addrMatch[2];
    }

    res.json({ ok: true, found, rawText: text.slice(0, 3000) });
  }));

  // Mark onboarding complete + provision Telnyx inbound assistant
  app.post("/api/tenant/onboarding/complete", isAuthenticated, asyncHandler(async (req, res) => {
    const { tenants } = await import("@shared/models/auth");
    const tenantId = getTenantId(req);

    // Collect all the enrichment data passed from the frontend
    const {
      websiteUrl,
      companyName: bodyCompanyName,
      phone: bodyPhone,
      serviceTypes,
      services,
      pricing,
      faqs,
      hours,
      city,
      state,
      aiGreeting,
      aiName,
    } = req.body as Record<string, any>;

    // Fetch current tenant to merge data
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    if (!tenant) throw new NotFoundError("Tenant");

    const finalCompany = bodyCompanyName || tenant.companyName || "our company";
    const finalPhone   = bodyPhone || tenant.phone || "";
    const finalCity    = city || (tenant.addressCity ?? "");
    const finalState   = state || (tenant.addressState ?? "");
    const botName      = aiName || "Alex";

    // ── Build personalized inbound call prompt ─────────────────────────────
    const serviceList  = Array.isArray(services)     ? services.join(", ")     :
                         Array.isArray(serviceTypes)  ? serviceTypes.join(", ") : "home services";
    const pricingNote  = pricing ? `\n\nPRICING CONTEXT:\n${pricing}` : "";
    const faqBlock     = Array.isArray(faqs) && faqs.length
      ? `\n\nFREQUENTLY ASKED QUESTIONS:\n${faqs.map((q: string, i: number) => `${i+1}. ${q}`).join("\n")}`
      : "";
    const hoursNote    = hours ? `\n\nBUSINESS HOURS: ${hours}` : "";
    const locationNote = finalCity ? `\n\nSERVICE AREA: ${finalCity}${finalState ? `, ${finalState}` : ""}` : "";

    const systemPrompt = `You are ${botName}, the AI receptionist for ${finalCompany}. You answer inbound calls from customers who need ${serviceList}.

YOUR JOB:
1. Greet the caller warmly and ask how you can help.
2. Understand their issue — ask clarifying questions one at a time.
3. If they need service, collect: their name, address, best callback number, and a description of the issue.
4. If they ask about pricing, give them the best information you have — be honest if you need to confirm with the team.
5. Offer to schedule a service call or have someone call them back.
6. Always end positively — confirm what happens next.

COMPANY INFO:
Company: ${finalCompany}${finalPhone ? `\nPhone: ${finalPhone}` : ""}${locationNote}${hoursNote}

SERVICES OFFERED: ${serviceList}${pricingNote}${faqBlock}

RULES:
- Never make up prices you don't know — say "let me have someone confirm that for you."
- If it's an emergency (no heat, burst pipe, no power), prioritize and offer same-day or emergency service.
- Keep responses short — this is a phone call, not a chat.
- If you can't help, always offer to take a message and have someone call back.
- Never say you're AI unless directly asked. If asked, say "I'm ${botName}, the virtual assistant for ${finalCompany}."

TONE: Professional, warm, and efficient. Match the caller's urgency.`;

    // ── Provision Telnyx AI Assistant ──────────────────────────────────────
    const TELNYX_API_KEY = process.env.TELNYX_API_KEY || "KEY019D4888EF9B3207CAA11BE5105E2EE8_SETj4jrBqqJo8hd2kH1ezG";
    let telnyxAssistantId: string | null = null;

    try {
      const createRes = await axios.post(
        "https://api.telnyx.com/v2/ai/assistants",
        {
          name: `${finalCompany} — Inbound Receptionist`,
          system_prompt: systemPrompt,
          voice: "Telnyx.Savannah",  // warm female voice
          language: "en",
          greeting: aiGreeting || `Thanks for calling ${finalCompany}, this is ${botName}. How can I help you today?`,
        },
        {
          headers: {
            Authorization: `Bearer ${TELNYX_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 15000,
        }
      );
      telnyxAssistantId = createRes.data?.data?.id ?? createRes.data?.id ?? null;
      console.log(`[Onboarding] Telnyx assistant provisioned: ${telnyxAssistantId} for tenant ${tenantId}`);
    } catch (err: any) {
      const detail = err?.response?.data?.errors?.[0]?.detail || err?.message || "unknown";
      console.error(`[Onboarding] Telnyx provision failed for tenant ${tenantId}:`, detail);
      // Non-fatal — we still complete onboarding, just log the failure
    }

    // ── Save everything to tenant ──────────────────────────────────────────
    const updatePayload: Record<string, any> = {
      onboardingCompleted: true,
      bobEnabled: true,
      updatedAt: new Date(),
    };
    if (websiteUrl)        updatePayload.websiteUrl = websiteUrl;
    if (telnyxAssistantId) updatePayload.telnyxAssistantId = telnyxAssistantId;
    if (bodyPhone && !tenant.phone) updatePayload.phone = bodyPhone;
    if (finalCity && !tenant.addressCity)   updatePayload.addressCity = finalCity;
    if (finalState && !tenant.addressState) updatePayload.addressState = finalState;

    await db.update(tenants).set(updatePayload).where(eq(tenants.id, tenantId));

    res.json({
      ok: true,
      telnyxAssistantId,
      assistantProvisioned: !!telnyxAssistantId,
    });
  }));

  // Onboarding status check
  app.get("/api/tenant/onboarding/status", isAuthenticated, asyncHandler(async (req, res) => {
    const { tenants } = await import("@shared/models/auth");
    const tenantId = getTenantId(req);
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    if (!tenant) throw new NotFoundError("Tenant");
    res.json({
      onboardingCompleted: (tenant as any).onboardingCompleted ?? false,
      crmType: (tenant as any).crmType ?? null,
      companyName: tenant.companyName,
    });
  }));


  // ── SUPER ADMIN ROUTES ──────────────────────────────────────────────────
  function requireSuperAdmin(req: any, res: any, next: any) {
    if (!req.user || req.user.role !== "superadmin") {
      return res.status(403).json({ message: "Superadmin access required" });
    }
    next();
  }
  app.get("/api/superadmin/stats", isAuthenticated, requireSuperAdmin, asyncHandler(async (req, res) => {
    const [t, u, j, tc] = await Promise.all([
      db.execute(sql`SELECT COUNT(*) as count FROM tenants`),
      db.execute(sql`SELECT COUNT(*) as count FROM users`),
      db.execute(sql`SELECT COUNT(*) as count FROM jobs`),
      db.execute(sql`SELECT COUNT(*) as count FROM technicians`),
    ]);
    const a = await db.execute(sql`SELECT COUNT(*) as count FROM tenants WHERE status = 'active'`);
    res.json({ total_tenants: Number((t.rows[0] as any).count), active_tenants: Number((a.rows[0] as any).count), total_users: Number((u.rows[0] as any).count), total_jobs: Number((j.rows[0] as any).count), total_technicians: Number((tc.rows[0] as any).count) });
  }));
  app.get("/api/superadmin/tenants", isAuthenticated, requireSuperAdmin, asyncHandler(async (req, res) => {
    const result = await db.execute(sql`SELECT t.id, t.company_name, t.slug, t.plan_tier, t.status, t.created_at, (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) AS user_count, (SELECT COUNT(*) FROM jobs j WHERE j.tenant_id = t.id) AS job_count, (SELECT COUNT(*) FROM technicians tc WHERE tc.tenant_id = t.id) AS technician_count FROM tenants t ORDER BY t.created_at DESC`);
    res.json(result.rows);
  }));
  app.get("/api/superadmin/tenants/:id", isAuthenticated, requireSuperAdmin, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const [tr, ur, tcr, jr, rjr] = await Promise.all([
      db.execute(sql`SELECT * FROM tenants WHERE id = ${id}`),
      db.execute(sql`SELECT id, email, role, is_active, created_at FROM users WHERE tenant_id = ${id}`),
      db.execute(sql`SELECT id, first_name, last_name, email, is_active FROM technicians WHERE tenant_id = ${id}`),
      db.execute(sql`SELECT COUNT(*) as count FROM jobs WHERE tenant_id = ${id}`),
      db.execute(sql`SELECT id, service_type, status, created_at FROM jobs WHERE tenant_id = ${id} ORDER BY created_at DESC LIMIT 5`),
    ]);
    if (!tr.rows[0]) return res.status(404).json({ message: "Tenant not found" });
    res.json({ tenant: tr.rows[0], users: ur.rows, technicians: tcr.rows, jobs: jr.rows, recentJobs: rjr.rows });
  }));
  app.post("/api/superadmin/tenants/:id/impersonate", isAuthenticated, requireSuperAdmin, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const ur = await db.execute(sql`SELECT * FROM users WHERE tenant_id = ${id} AND role = 'owner' LIMIT 1`);
    const user = ur.rows[0] as any;
    if (!user) return res.status(404).json({ message: "No owner found" });
    const { signToken } = await import("./auth/jwt");
    const token = signToken({ id: user.id, email: user.email, tenantId: user.tenant_id, role: user.role });

    // Persist impersonation event — always log this action durably
    const superadminUser = (req as any).user;
    await db.execute(sql`
      INSERT INTO audit_logs (method, path, ip, user_agent, user_id, tenant_id, status_code, duration_ms)
      VALUES ('IMPERSONATE', ${"/superadmin/impersonate/" + id}, ${req.ip ?? "unknown"},
              ${req.headers["user-agent"] ?? "unknown"}, ${superadminUser?.id ?? "unknown"},
              ${id}, 200, 0)
    `);
    console.warn(`[SECURITY] Superadmin impersonation: admin=${superadminUser?.id} impersonated tenant=${id} (owner=${user.id})`);

    res.json({ token, tenantId: id });
  }));
  // ── ERROR HANDLER (must be last) ──────────────────────────────────────────
  app.use(errorHandler);

  return httpServer;
}
