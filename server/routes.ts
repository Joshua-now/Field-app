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

  // --- API Routes ---

  // Technicians
  app.get(api.technicians.list.path, async (req, res) => {
    const techs = await storage.getTechnicians();
    res.json(techs);
  });

  app.get(api.technicians.get.path, async (req, res) => {
    const tech = await storage.getTechnician(Number(req.params.id));
    if (!tech) return res.status(404).json({ message: "Technician not found" });
    res.json(tech);
  });

  app.post(api.technicians.create.path, async (req, res) => {
    try {
      const input = api.technicians.create.input.parse(req.body);
      const tech = await storage.createTechnician(input);
      res.status(201).json(tech);
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
      res.json(tech);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
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

  // Jobs
  app.get(api.jobs.list.path, async (req, res) => {
    const filters = {
      date: req.query.date as string,
      technicianId: req.query.technicianId ? Number(req.query.technicianId) : undefined,
      status: req.query.status as string,
      customerId: req.query.customerId ? Number(req.query.customerId) : undefined,
    };
    const jobs = await storage.getJobs(filters);
    res.json(jobs);
  });

  app.get(api.jobs.get.path, async (req, res) => {
    const job = await storage.getJob(Number(req.params.id));
    if (!job) return res.status(404).json({ message: "Job not found" });
    res.json(job);
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

  // Seed Data Function (called once if DB empty)
  await seedDatabase();

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
