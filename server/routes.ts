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


  // ── DEMO SEED (one-time, authenticated) ──────────────────────────────────
  app.post("/api/admin/seed-demo", async (req, res) => {
    const tenantId = req.tenantId || DEFAULT_TENANT_ID;
    try {
      const { technicians: techTable, customers: custTable, jobs: jobTable } = await import("@shared/schema");
      const { tenants } = await import("@shared/models/auth");
      const bcrypt = await import("bcryptjs");
      const { eq: eqOp } = await import("drizzle-orm");

      // Guard: don't re-seed if data already exists
      const existingTechs = await db.select().from(techTable).where(eqOp(techTable.tenantId, tenantId)).limit(1);
      if (existingTechs.length > 0) {
        return res.status(409).json({ message: "Demo data already exists for this tenant. Delete existing records first." });
      }

      const tenant = await db.select().from(tenants).where(eqOp(tenants.id, tenantId)).limit(1).then(r => r[0]);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });

      const pwHash = await bcrypt.hash("demo1234", 10);

      const d = (offsetDays: number) => {
        const dt = new Date(); dt.setDate(dt.getDate() + offsetDays);
        return dt.toISOString().split("T")[0];
      };

      // Technicians
      const [marcus, priya, darnell] = await Promise.all([
        db.insert(techTable).values({ tenantId, email: "marcus.hayes@demo.com", passwordHash: pwHash, firstName: "Marcus", lastName: "Hayes", phone: "(813) 555-0142", employeeId: "TECH-001", specialties: ["HVAC","Refrigeration"], certifications: ["EPA 608","NATE Certified"], isActive: true }).returning().then(r => r[0]),
        db.insert(techTable).values({ tenantId, email: "priya.nguyen@demo.com", passwordHash: pwHash, firstName: "Priya", lastName: "Nguyen", phone: "(813) 555-0187", employeeId: "TECH-002", specialties: ["Plumbing","Water Heaters"], certifications: ["Florida Plumbing License"], isActive: true }).returning().then(r => r[0]),
        db.insert(techTable).values({ tenantId, email: "darnell.brooks@demo.com", passwordHash: pwHash, firstName: "Darnell", lastName: "Brooks", phone: "(813) 555-0231", employeeId: "TECH-003", specialties: ["Electrical","Generators"], certifications: ["Florida Electrical License"], isActive: true }).returning().then(r => r[0]),
      ]);

      // Customers
      const [linda, bob, carol, james, patricia] = await Promise.all([
        db.insert(custTable).values({ tenantId, firstName: "Linda", lastName: "Carver", email: "linda.carver@gmail.com", phone: "(813) 555-1201", addressStreet: "4821 Palma Ceia Dr", addressCity: "Tampa", addressState: "FL", addressZip: "33629", tags: ["VIP","Repeat"], notes: "Has two AC units — always ask about the upstairs unit.", customerSince: "2023-03-15", totalJobsCompleted: 7, lifetimeValue: "2840.00" }).returning().then(r => r[0]),
        db.insert(custTable).values({ tenantId, firstName: "Bob", lastName: "Stanton", email: "bstanton@outlook.com", phone: "(813) 555-0934", addressStreet: "1102 Bayshore Blvd", addressCity: "Tampa", addressState: "FL", addressZip: "33606", gateCode: "#4421", tags: ["Commercial"], notes: "Condo unit 8B. Park in visitor spot, gate code #4421.", customerSince: "2024-01-08", totalJobsCompleted: 3, lifetimeValue: "1150.00" }).returning().then(r => r[0]),
        db.insert(custTable).values({ tenantId, firstName: "Carol", lastName: "Mendez", email: "carol.mendez@yahoo.com", phone: "(813) 555-2876", addressStreet: "7603 Gunn Hwy", addressCity: "Tampa", addressState: "FL", addressZip: "33625", tags: ["New Customer"], notes: "Referred by Linda Carver.", customerSince: d(0), totalJobsCompleted: 0, lifetimeValue: "0.00" }).returning().then(r => r[0]),
        db.insert(custTable).values({ tenantId, firstName: "James", lastName: "Whitfield", email: "jwhitfield@protonmail.com", phone: "(813) 555-3318", addressStreet: "2250 N Dale Mabry Hwy", addressCity: "Tampa", addressState: "FL", addressZip: "33607", accessNotes: "Dog in yard — call before entering gate.", tags: ["Repeat"], notes: "Has a pit bull named Zeus. Call ahead.", customerSince: "2023-11-20", totalJobsCompleted: 4, lifetimeValue: "1890.00" }).returning().then(r => r[0]),
        db.insert(custTable).values({ tenantId, firstName: "Patricia", lastName: "Drummond", email: "pat.drummond@gmail.com", phone: "(813) 555-4502", addressStreet: "9312 Lazy Lane", addressCity: "Tampa", addressState: "FL", addressZip: "33614", tags: ["Senior","VIP"], notes: "Elderly customer, needs extra time. Always send ETA.", customerSince: "2022-06-10", totalJobsCompleted: 12, lifetimeValue: "4200.00" }).returning().then(r => r[0]),
      ]);

      // Jobs
      await Promise.all([
        db.insert(jobTable).values({ tenantId, jobNumber: "JOB-2405-001", customerId: linda.id, technicianId: marcus.id, scheduledDate: d(0), scheduledTimeStart: "09:00:00", scheduledTimeEnd: "11:00:00", estimatedDurationMinutes: 120, serviceType: "HVAC Maintenance", priority: "normal", description: "Annual AC tune-up. Customer reports clicking noise on startup.", specialInstructions: "Check both units — upstairs and downstairs.", status: "in_progress", startedAt: new Date(), totalCost: "185.00", paymentStatus: "pending" }),
        db.insert(jobTable).values({ tenantId, jobNumber: "JOB-2405-002", customerId: bob.id, technicianId: priya.id, scheduledDate: d(0), scheduledTimeStart: "11:30:00", scheduledTimeEnd: "13:00:00", estimatedDurationMinutes: 90, serviceType: "Plumbing Repair", priority: "urgent", description: "Slow drain in master bath. Water pooling 5+ minutes.", specialInstructions: "Condo 8B — gate code #4421, visitor parking.", status: "en_route", enRouteAt: new Date(), totalCost: "225.00", paymentStatus: "pending" }),
        db.insert(jobTable).values({ tenantId, jobNumber: "JOB-2405-003", customerId: carol.id, technicianId: marcus.id, scheduledDate: d(0), scheduledTimeStart: "14:00:00", scheduledTimeEnd: "15:30:00", estimatedDurationMinutes: 90, serviceType: "AC Installation", priority: "normal", description: "Install new Carrier 3-ton mini-split. Unit is on-site.", status: "scheduled", totalCost: "1850.00", paymentStatus: "invoiced" }),
        db.insert(jobTable).values({ tenantId, jobNumber: "JOB-2405-004", customerId: james.id, technicianId: darnell.id, scheduledDate: d(1), scheduledTimeStart: "08:00:00", scheduledTimeEnd: "10:00:00", estimatedDurationMinutes: 120, serviceType: "Electrical Inspection", priority: "normal", description: "Annual panel inspection. Customer adding a hot tub.", specialInstructions: "Dog in yard — call customer before entering gate.", status: "scheduled", totalCost: "350.00", paymentStatus: "pending" }),
        db.insert(jobTable).values({ tenantId, jobNumber: "JOB-2405-005", customerId: patricia.id, technicianId: priya.id, scheduledDate: d(1), scheduledTimeStart: "10:30:00", scheduledTimeEnd: "12:00:00", estimatedDurationMinutes: 90, serviceType: "Water Heater Replacement", priority: "urgent", description: "40-gal leaking from bottom. 11 years old, replacement approved.", specialInstructions: "Senior customer — send ETA text 30 min before arrival.", status: "scheduled", totalCost: "1240.00", paymentStatus: "invoiced" }),
        db.insert(jobTable).values({ tenantId, jobNumber: "JOB-2405-006", customerId: linda.id, technicianId: darnell.id, scheduledDate: d(2), scheduledTimeStart: "09:00:00", scheduledTimeEnd: "11:00:00", estimatedDurationMinutes: 120, serviceType: "Generator Installation", priority: "normal", description: "Install whole-home Generac 22kW standby. Unit on-site in garage.", status: "scheduled", totalCost: "3200.00", paymentStatus: "invoiced" }),
        db.insert(jobTable).values({ tenantId, jobNumber: "JOB-2405-007", customerId: james.id, technicianId: marcus.id, scheduledDate: d(-1), scheduledTimeStart: "10:00:00", scheduledTimeEnd: "12:00:00", estimatedDurationMinutes: 120, serviceType: "HVAC Repair", priority: "urgent", description: "AC not cooling — refrigerant leak at evaporator coil.", status: "completed", completedAt: new Date(Date.now() - 86400000), actualDurationMinutes: 105, workPerformed: "Located leak at evaporator coil, repaired, recharged with 2 lbs R-410A. System cooling at 72°F.", totalCost: "485.00", paymentStatus: "paid", customerRating: 5, customerFeedback: "Marcus was awesome — on time and AC is ice cold!" }),
        db.insert(jobTable).values({ tenantId, jobNumber: "JOB-2405-008", customerId: patricia.id, technicianId: priya.id, scheduledDate: d(-3), scheduledTimeStart: "09:30:00", scheduledTimeEnd: "11:00:00", estimatedDurationMinutes: 90, serviceType: "Drain Cleaning", priority: "normal", description: "Main line slow drain. Hydro-jet service.", status: "completed", completedAt: new Date(Date.now() - 3 * 86400000), actualDurationMinutes: 80, workPerformed: "Camera found grease buildup at 35ft. Hydro-jet cleared blockage.", totalCost: "320.00", paymentStatus: "paid", customerRating: 4, customerFeedback: "Very professional. Priya explained exactly what she found.", requiresFollowup: true, followupDate: d(27), followupReason: "30-day drain check per customer agreement" }),
      ]);

      res.json({
        message: "Demo seed complete!",
        created: { technicians: 3, customers: 5, jobs: 8 },
        technicianPin: "demo1234",
      });
    } catch (err: any) {
      console.error("[Seed] Error:", err?.message);
      res.status(500).json({ message: err?.message || "Seed failed" });
    }
  });

  // ── ERROR HANDLER (must be last) ──────────────────────────────────────────
  app.use(errorHandler);

  return httpServer;
}
