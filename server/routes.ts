import type { Express, Request, Response } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { createTenantStorage } from "./tenantStorage";
import { api } from "@shared/routes";
import { z } from "zod";
import { isAuthenticated } from "./auth/jwt";
import { authRouter } from "./auth/routes";
import { validateStatusTransition, JobStatus } from "@shared/jobStateMachine";
import { errorHandler } from "./middleware/errorHandler";
import { apiRateLimiter, strictRateLimiter } from "./middleware/rateLimiter";
import { tenantContextMiddleware, requireTenant } from "./middleware/tenantContext";
import { db, getHealthStatus } from "./db";
import { securityHeaders, requestIdMiddleware } from "./middleware/security";
import { auditLogMiddleware } from "./middleware/auditLog";
import { eq } from "drizzle-orm";
import { bobConversations, bobMessages, bobMemory } from "@shared/schema";
import { runBobAgent } from "./bob/agent";

const DEFAULT_TENANT_ID = "default-tenant";

function getTenantStorage(req: Request) {
  return createTenantStorage(req.tenantId || DEFAULT_TENANT_ID);
}

function sanitizeTechnician(tech: any) {
  if (!tech) return tech;
  const { passwordHash, ...safe } = tech;
  return safe;
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.use(securityHeaders);
  app.use(requestIdMiddleware);
  app.use(auditLogMiddleware);

  // ── PUBLIC ────────────────────────────────────────────────────────────────
  app.get("/api/health", async (_req, res) => {
    try {
      const health = await getHealthStatus();
      const code = health.status === "unhealthy" ? 503 : 200;
      res.status(code).json({ ...health, timestamp: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: "unhealthy" });
    }
  });

  // ── AUTH (register / login / profile) ────────────────────────────────────
  app.use("/api/auth", authRouter);

  // ── PROTECTED — wire auth + tenant context on all /api routes below ──────
  app.use("/api", apiRateLimiter, isAuthenticated, tenantContextMiddleware);

  // ── TECHNICIANS ───────────────────────────────────────────────────────────
  app.get("/api/technicians", async (req, res) => {
    const techs = await getTenantStorage(req).getTechnicians();
    res.json(techs.map(sanitizeTechnician));
  });

  app.get("/api/technicians/:id", async (req, res) => {
    const tech = await getTenantStorage(req).getTechnician(Number(req.params.id));
    if (!tech) return res.status(404).json({ message: "Technician not found" });
    res.json(sanitizeTechnician(tech));
  });

  app.post("/api/technicians", strictRateLimiter, async (req, res) => {
    const tech = await getTenantStorage(req).createTechnician(req.body);
    res.status(201).json(sanitizeTechnician(tech));
  });

  app.put("/api/technicians/:id", async (req, res) => {
    const tech = await getTenantStorage(req).updateTechnician(Number(req.params.id), req.body);
    res.json(sanitizeTechnician(tech));
  });

  app.patch("/api/technicians/:id/location", async (req, res) => {
    const { latitude, longitude } = req.body;
    const tech = await getTenantStorage(req).updateTechnicianLocation(
      Number(req.params.id), latitude, longitude
    );
    if (!tech) return res.status(404).json({ message: "Technician not found" });
    res.json(sanitizeTechnician(tech));
  });

  // ── CUSTOMERS ─────────────────────────────────────────────────────────────
  app.get("/api/customers", async (req, res) => {
    const customers = await getTenantStorage(req).getCustomers(req.query.search as string);
    res.json(customers);
  });

  app.get("/api/customers/:id", async (req, res) => {
    const customer = await getTenantStorage(req).getCustomer(Number(req.params.id));
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    res.json(customer);
  });

  app.post("/api/customers", async (req, res) => {
    const customer = await getTenantStorage(req).createCustomer(req.body);
    res.status(201).json(customer);
  });

  app.put("/api/customers/:id", async (req, res) => {
    const customer = await getTenantStorage(req).updateCustomer(Number(req.params.id), req.body);
    res.json(customer);
  });

  app.delete("/api/customers/:id", async (req, res) => {
    const ok = await getTenantStorage(req).deleteCustomer(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Customer not found" });
    res.status(204).send();
  });

  // ── JOBS ──────────────────────────────────────────────────────────────────
  app.get("/api/jobs", async (req, res) => {
    const { date, technicianId, status, customerId } = req.query as any;
    const jobs = await getTenantStorage(req).getJobs({
      date, status,
      technicianId: technicianId ? Number(technicianId) : undefined,
      customerId: customerId ? Number(customerId) : undefined,
    });
    res.json(jobs);
  });

  app.get("/api/jobs/:id", async (req, res) => {
    const job = await getTenantStorage(req).getJob(Number(req.params.id));
    if (!job) return res.status(404).json({ message: "Job not found" });
    res.json(job);
  });

  app.post("/api/jobs", async (req, res) => {
    const job = await getTenantStorage(req).createJob(req.body);
    res.status(201).json(job);
  });

  app.put("/api/jobs/:id", async (req, res) => {
    const job = await getTenantStorage(req).updateJob(Number(req.params.id), req.body);
    res.json(job);
  });

  app.post("/api/jobs/:id/status", async (req, res) => {
    const job = await getTenantStorage(req).getJob(Number(req.params.id));
    if (!job) return res.status(404).json({ message: "Job not found" });

    const { status } = req.body;
    const result = validateStatusTransition(job.status as JobStatus, status as JobStatus);
    if (!result.valid) return res.status(400).json({ message: result.message });

    const updated = await getTenantStorage(req).updateJob(Number(req.params.id), { status });
    res.json(updated);
  });

  app.delete("/api/jobs/:id", async (req, res) => {
    const ok = await getTenantStorage(req).deleteJob(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Job not found" });
    res.status(204).send();
  });

  // ── PARTS ─────────────────────────────────────────────────────────────────
  app.get("/api/parts", async (req, res) => {
    res.json(await getTenantStorage(req).getParts());
  });

  app.post("/api/parts", async (req, res) => {
    res.status(201).json(await getTenantStorage(req).createPart(req.body));
  });

  // ── JOB PHOTOS ────────────────────────────────────────────────────────────
  app.get("/api/jobs/:jobId/photos", async (req, res) => {
    res.json(await getTenantStorage(req).getJobPhotos(Number(req.params.jobId)));
  });

  app.post("/api/jobs/:jobId/photos", async (req, res) => {
    const photo = await getTenantStorage(req).createJobPhoto({
      ...req.body,
      jobId: Number(req.params.jobId),
    });
    res.status(201).json(photo);
  });

  app.delete("/api/jobs/:jobId/photos/:id", async (req, res) => {
    const ok = await getTenantStorage(req).deleteJobPhoto(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Photo not found" });
    res.status(204).send();
  });

  // ── JOB NOTES ─────────────────────────────────────────────────────────────
  app.get("/api/jobs/:jobId/notes", async (req, res) => {
    res.json(await getTenantStorage(req).getJobNotes(Number(req.params.jobId)));
  });

  app.post("/api/jobs/:jobId/notes", async (req, res) => {
    const note = await getTenantStorage(req).createJobNote({
      ...req.body,
      jobId: Number(req.params.jobId),
    });
    res.status(201).json(note);
  });

  // ── CHECKLISTS ────────────────────────────────────────────────────────────
  app.get("/api/checklists", async (req, res) => {
    res.json(await getTenantStorage(req).getServiceChecklists(req.query.serviceType as string));
  });

  app.get("/api/jobs/:jobId/checklist", async (req, res) => {
    res.json(await getTenantStorage(req).getJobChecklistItems(Number(req.params.jobId)));
  });

  app.patch("/api/checklist-items/:id", async (req, res) => {
    const item = await getTenantStorage(req).updateJobChecklistItem(
      Number(req.params.id),
      { isCompleted: req.body.isCompleted, notes: req.body.notes }
    );
    res.json(item);
  });

  // ── BOB AI ASSISTANT ─────────────────────────────────────────────────────
  app.get("/api/bob/conversations", async (req, res) => {
    const tenantId = req.tenantId || DEFAULT_TENANT_ID;
    const result = await db.query.bobConversations.findMany({
      where: (t, { eq }) => eq(t.tenantId, tenantId),
      orderBy: (t, { desc }) => [desc(t.updatedAt)],
      limit: 50,
    });
    res.json(result);
  });

  app.post("/api/bob/conversations", async (req, res) => {
    const tenantId = req.tenantId || DEFAULT_TENANT_ID;
    const [conv] = await db.insert(bobConversations).values({ tenantId, channel: "chat", status: "open" }).returning();
    res.status(201).json(conv);
  });

  app.get("/api/bob/conversations/:id/messages", async (req, res) => {
    const msgs = await db.query.bobMessages.findMany({
      where: (t, { eq }) => eq(t.conversationId, Number(req.params.id)),
      orderBy: (t, { asc }) => [asc(t.createdAt)],
    });
    res.json(msgs);
  });

  app.post("/api/bob/conversations/:id/messages", async (req, res) => {
    const tenantId = req.tenantId || DEFAULT_TENANT_ID;
    const conversationId = Number(req.params.id);
    const { content } = req.body;
    if (!content) return res.status(400).json({ message: "content required" });

    await db.insert(bobMessages).values({ tenantId, conversationId, role: "user", content });

    // Run the real Bob agent
    let reply: string;
    try {
      reply = await runBobAgent(tenantId, conversationId, content);
    } catch (err: any) {
      console.error("[Bob] Agent error:", err?.message);
      reply = "I hit an error on my end — check the server logs.";
    }

    const [msg] = await db.insert(bobMessages).values({
      tenantId, conversationId, role: "assistant", content: reply,
    }).returning();

    await db.update(bobConversations).set({ updatedAt: new Date() })
      .where(eq(bobConversations.id, conversationId));

    res.status(201).json(msg);
  });

  app.get("/api/bob/memory", async (req, res) => {
    const tenantId = req.tenantId || DEFAULT_TENANT_ID;
    const rows = await db.query.bobMemory.findMany({
      where: (t, { eq }) => eq(t.tenantId, tenantId),
      orderBy: (t, { desc }) => [desc(t.updatedAt)],
    });
    res.json(rows);
  });

  // ── ERROR HANDLER (must be last) ──────────────────────────────────────────
  app.use(errorHandler);

  return httpServer;
}
