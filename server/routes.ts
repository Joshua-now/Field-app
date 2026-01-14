import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { registerChatRoutes } from "./replit_integrations/chat";
import { registerImageRoutes } from "./replit_integrations/image";
import { registerAudioRoutes } from "./replit_integrations/audio";
import { validateStatusTransition, JobStatus } from "@shared/jobStateMachine";
import { errorHandler } from "./middleware/errorHandler";
import { apiRateLimiter, strictRateLimiter } from "./middleware/rateLimiter";

// Helper to strip sensitive data from technician responses
function sanitizeTechnician(tech: any) {
  if (!tech) return tech;
  const { passwordHash, ...safe } = tech;
  return safe;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup Auth
  await setupAuth(app);
  registerAuthRoutes(app);
  
  // Setup Integrations
  registerObjectStorageRoutes(app);
  registerChatRoutes(app);
  registerImageRoutes(app);
  registerAudioRoutes(app);

  // Apply rate limiting to all API routes
  app.use("/api", apiRateLimiter);

  // --- Customer Portal (Public) ---
  app.get("/api/customer-portal/lookup", async (req, res) => {
    const phone = req.query.phone as string;
    if (!phone) {
      return res.status(400).json({ message: "Phone number required" });
    }
    
    const customers = await storage.getCustomers(phone);
    const customer = customers.find(c => c.phone.replace(/\D/g, "").includes(phone.replace(/\D/g, "")));
    
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }
    
    const allJobs = await storage.getJobs({ customerId: customer.id });
    const jobs = allJobs.map(j => ({
      id: j.id,
      jobNumber: j.jobNumber,
      scheduledDate: j.scheduledDate,
      scheduledTimeStart: j.scheduledTimeStart,
      serviceType: j.serviceType,
      status: j.status,
      description: j.description,
      workPerformed: j.workPerformed,
      completedAt: j.completedAt,
      technician: j.technician ? { firstName: j.technician.firstName, lastName: j.technician.lastName } : null
    }));
    
    res.json({
      customer: {
        id: customer.id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
        addressStreet: customer.addressStreet,
        addressCity: customer.addressCity,
        addressState: customer.addressState,
        addressZip: customer.addressZip
      },
      jobs
    });
  });

  // --- Health Check ---
  app.get("/api/health", async (req, res) => {
    try {
      const dbCheck = await storage.healthCheck();
      res.json({ 
        status: "ok", 
        timestamp: new Date().toISOString(),
        database: dbCheck ? "connected" : "disconnected"
      });
    } catch (err) {
      res.status(503).json({ 
        status: "degraded", 
        timestamp: new Date().toISOString(),
        database: "error"
      });
    }
  });

  // --- Admin: Orphan Cleanup ---
  app.post("/api/admin/cleanup", strictRateLimiter, async (req, res) => {
    try {
      const result = await storage.cleanupOrphans();
      res.json({ 
        success: true, 
        cleaned: result,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      res.status(500).json({ 
        success: false, 
        message: "Cleanup failed" 
      });
    }
  });

  // --- API Routes ---

  // Technicians
  app.get(api.technicians.list.path, async (req, res) => {
    const techs = await storage.getTechnicians();
    res.json(techs.map(sanitizeTechnician));
  });

  app.get(api.technicians.get.path, async (req, res) => {
    const tech = await storage.getTechnician(Number(req.params.id));
    if (!tech) return res.status(404).json({ message: "Technician not found" });
    res.json(sanitizeTechnician(tech));
  });

  app.post(api.technicians.create.path, async (req, res) => {
    try {
      const input = api.technicians.create.input.parse(req.body);
      const tech = await storage.createTechnician(input);
      res.status(201).json(sanitizeTechnician(tech));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.technicians.update.path, async (req, res) => {
    try {
      const input = api.technicians.update.input.parse(req.body);
      const tech = await storage.updateTechnician(Number(req.params.id), input);
      if (!tech) return res.status(404).json({ message: "Technician not found" });
      res.json(sanitizeTechnician(tech));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // Technician Location Update (for mobile GPS tracking)
  app.post("/api/technicians/:id/location", async (req, res) => {
    try {
      const { latitude, longitude } = req.body;
      if (typeof latitude !== "number" || typeof longitude !== "number") {
        return res.status(400).json({ message: "Invalid coordinates" });
      }
      const tech = await storage.updateTechnicianLocation(
        Number(req.params.id),
        latitude,
        longitude
      );
      if (!tech) return res.status(404).json({ message: "Technician not found" });
      res.json({ success: true, lastUpdate: tech.lastLocationUpdate });
    } catch (err) {
      throw err;
    }
  });

  // Customers
  app.get(api.customers.list.path, async (req, res) => {
    const customers = await storage.getCustomers(req.query.search as string);
    res.json(customers);
  });

  app.get(api.customers.get.path, async (req, res) => {
    const customer = await storage.getCustomer(Number(req.params.id));
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    res.json(customer);
  });

  app.post(api.customers.create.path, async (req, res) => {
    try {
      const input = api.customers.create.input.parse(req.body);
      const customer = await storage.createCustomer(input);
      res.status(201).json(customer);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put("/api/customers/:id", async (req, res) => {
    try {
      const customer = await storage.updateCustomer(Number(req.params.id), req.body);
      if (!customer) return res.status(404).json({ message: "Customer not found" });
      res.json(customer);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete("/api/customers/:id", async (req, res) => {
    const deleted = await storage.deleteCustomer(Number(req.params.id));
    if (!deleted) return res.status(404).json({ message: "Customer not found" });
    res.json({ success: true });
  });

  // Jobs
  app.get(api.jobs.list.path, async (req, res) => {
    const filters = {
      date: req.query.date as string,
      technicianId: req.query.technicianId ? Number(req.query.technicianId) : undefined,
      status: req.query.status as string,
      customerId: req.query.customerId ? Number(req.query.customerId) : undefined,
    };
    const jobsList = await storage.getJobs(filters);
    // Sanitize technician data in responses
    const sanitizedJobs = jobsList.map(job => ({
      ...job,
      technician: sanitizeTechnician(job.technician)
    }));
    res.json(sanitizedJobs);
  });

  app.get(api.jobs.get.path, async (req, res) => {
    const job = await storage.getJob(Number(req.params.id));
    if (!job) return res.status(404).json({ message: "Job not found" });
    res.json({
      ...job,
      technician: sanitizeTechnician(job.technician)
    });
  });

  app.post(api.jobs.create.path, async (req, res) => {
    try {
      const input = api.jobs.create.input.parse(req.body);
      const job = await storage.createJob(input);
      res.status(201).json(job);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.jobs.update.path, async (req, res) => {
    try {
      const input = api.jobs.update.input.parse(req.body);
      
      if (input.status) {
        const currentJob = await storage.getJob(Number(req.params.id));
        if (!currentJob) return res.status(404).json({ message: "Job not found" });
        
        const validation = validateStatusTransition(
          currentJob.status as JobStatus, 
          input.status as JobStatus
        );
        if (!validation.valid) {
          return res.status(409).json({ 
            error: "Invalid Status Transition",
            message: validation.message 
          });
        }
      }
      
      const job = await storage.updateJob(Number(req.params.id), input);
      if (!job) return res.status(404).json({ message: "Job not found" });
      res.json(job);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete("/api/jobs/:id", async (req, res) => {
    const deleted = await storage.deleteJob(Number(req.params.id));
    if (!deleted) return res.status(404).json({ message: "Job not found" });
    res.json({ success: true });
  });
  
  // Parts
  app.get(api.parts.list.path, async (req, res) => {
    const parts = await storage.getParts();
    res.json(parts);
  });
  
  app.post(api.parts.create.path, async (req, res) => {
    try {
      const input = api.parts.create.input.parse(req.body);
      const part = await storage.createPart(input);
      res.status(201).json(part);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // Job Photos
  app.get(api.jobPhotos.list.path, async (req, res) => {
    const photos = await storage.getJobPhotos(Number(req.params.jobId));
    res.json(photos);
  });

  app.post(api.jobPhotos.create.path, async (req, res) => {
    try {
      const input = api.jobPhotos.create.input.parse(req.body);
      const photo = await storage.createJobPhoto({
        ...input,
        jobId: Number(req.params.jobId),
      });
      res.status(201).json(photo);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete("/api/photos/:id", async (req, res) => {
    const deleted = await storage.deleteJobPhoto(Number(req.params.id));
    if (!deleted) return res.status(404).json({ message: "Photo not found" });
    res.json({ success: true });
  });

  // Seed Data Function (called once if DB empty)
  await seedDatabase();

  // Error handler middleware (must be last)
  app.use(errorHandler);

  return httpServer;
}

async function seedDatabase() {
  const existingTechs = await storage.getTechnicians();
  if (existingTechs.length === 0) {
    console.log("Seeding database...");
    
    // Techs
    const tech1 = await storage.createTechnician({
      email: "tech1@example.com",
      passwordHash: "1234",
      firstName: "Mike",
      lastName: "Johnson",
      phone: "555-0101",
      specialties: ["hvac", "electrical"],
      currentLocationLat: "28.5383",
      currentLocationLng: "-81.3792"
    });
    
    const tech2 = await storage.createTechnician({
      email: "tech2@example.com",
      passwordHash: "5678",
      firstName: "Sarah",
      lastName: "Connor",
      phone: "555-0102",
      specialties: ["plumbing"],
    });

    // Customers
    const cust1 = await storage.createCustomer({
      firstName: "Alice",
      lastName: "Smith",
      phone: "555-1001",
      email: "alice@example.com",
      addressStreet: "123 Maple Ave",
      addressCity: "Orlando",
      addressState: "FL",
      addressZip: "32801"
    });

    const cust2 = await storage.createCustomer({
      firstName: "Bob",
      lastName: "Jones",
      phone: "555-1002",
      email: "bob@example.com",
      addressStreet: "456 Oak Dr",
      addressCity: "Orlando",
      addressState: "FL",
      addressZip: "32803"
    });
    
    // Jobs
    await storage.createJob({
      customerId: cust1.id,
      technicianId: tech1.id,
      scheduledDate: new Date().toISOString().split('T')[0],
      scheduledTimeStart: "09:00:00",
      serviceType: "hvac_repair",
      priority: "urgent",
      description: "AC not cooling",
      status: "scheduled"
    });
    
    await storage.createJob({
      customerId: cust2.id,
      technicianId: tech2.id,
      scheduledDate: new Date().toISOString().split('T')[0],
      scheduledTimeStart: "14:00:00",
      serviceType: "plumbing_leak",
      priority: "normal",
      description: "Leaky faucet in kitchen",
      status: "assigned"
    });
    
    // Parts
    await storage.createPart({
      partName: "HVAC Filter 20x20x1",
      quantityOnHand: 50,
      costPerUnit: "15.00"
    });
    
    console.log("Database seeded!");
  }
}
