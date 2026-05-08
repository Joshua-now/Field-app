import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { createTenantStorage } from "./tenantStorage";
import { z } from "zod";
import { isAuthenticated, requireRole } from "./auth/jwt";
import { authRouter } from "./auth/routes";
import { validateStatusTransition, JobStatus } from "@shared/jobStateMachine";
import { errorHandler, asyncHandler, AppError, NotFoundError, ValidationError } from "./middleware/errorHandler";
import { apiRateLimiter, strictRateLimiter } from "./middleware/rateLimiter";
import { tenantContextMiddleware } from "./middleware/tenantContext";
import { db, getHealthStatus } from "./db";
import { securityHeaders, requestIdMiddleware } from "./middleware/security";
import { auditLogMiddleware } from "./middleware/auditLog";
import { eq } from "drizzle-orm";
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
import bcrypt from "bcryptjs";
import axios from "axios";

const DEFAULT_TENANT_ID = "default-tenant";

function getTenantId(req: Request): string {
  return req.tenantId || DEFAULT_TENANT_ID;
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

  // ── OPENROUTER DIAGNOSTIC (public) ────────────────────────────────────────
  app.get("/api/bob/ping", asyncHandler(async (_req, res) => {
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
    const data = validateBody(
      insertTechnicianSchema.omit({ tenantId: true }),
      req.body
    );
    const tech = await getTenantStorage(req).createTechnician(data as any);
    res.status(201).json(sanitizeTechnician(tech));
  }));

  app.put("/api/technicians/:id", asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new ValidationError("Invalid technician ID");
    const tech = await getTenantStorage(req).updateTechnician(id, req.body);
    res.json(sanitizeTechnician(tech));
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
    const customer = await getTenantStorage(req).updateCustomer(id, req.body);
    res.json(customer);
  }));

  app.delete("/api/customers/:id", asyncHandler(async (req, res) => {
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
    const job = await getTenantStorage(req).updateJob(id, req.body);
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

  app.delete("/api/jobs/:id", asyncHandler(async (req, res) => {
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
    const id = Number(req.params.id);
    if (isNaN(id)) throw new ValidationError("Invalid conversation ID");
    const msgs = await db.query.bobMessages.findMany({
      where: (t: any, { eq }: any) => eq(t.conversationId, id),
      orderBy: (t: any, { asc }: any) => [asc(t.createdAt)],
    });
    res.json(msgs);
  }));

  app.post("/api/bob/conversations/:id/messages", isAuthenticated, asyncHandler(async (req, res) => {
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
  // Auth: tenant API key in header (X-Tenant-Key) — no JWT required
  app.post("/api/leads/inbound", asyncHandler(async (req, res) => {
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

    // Guard: don't re-seed if data already exists
    const existingTechs = await db.select().from(techTable).where(eqOp(techTable.tenantId, tenantId)).limit(1);
    if (existingTechs.length > 0) {
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

  // ── ERROR HANDLER (must be last) ──────────────────────────────────────────
  app.use(errorHandler);

  return httpServer;
}
