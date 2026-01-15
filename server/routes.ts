import type { Express, Request, Response } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { createTenantStorage, ITenantStorage } from "./tenantStorage";
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
import { tenantContextMiddleware, requireTenant } from "./middleware/tenantContext";

const DEFAULT_TENANT_ID = "default-tenant";

function getTenantStorage(req: Request): ITenantStorage {
  const tenantId = req.tenantId || DEFAULT_TENANT_ID;
  return createTenantStorage(tenantId);
}

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
  
  // Apply tenant context after auth (extracts tenant from authenticated user)
  app.use(tenantContextMiddleware);
  
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
    
    // Normalize input phone to digits only
    const normalizedInput = phone.replace(/\D/g, "");
    
    // Require at least 10 digits for a valid US phone lookup
    if (normalizedInput.length < 10) {
      return res.status(400).json({ message: "Please enter a complete phone number" });
    }
    
    // Get all customers and find EXACT match on normalized phone
    const customers = await storage.getCustomers();
    const customer = customers.find(c => {
      const normalizedStored = c.phone.replace(/\D/g, "");
      // Exact match on last 10 digits (handles country code variations)
      return normalizedInput.slice(-10) === normalizedStored.slice(-10);
    });
    
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

  // --- Smart Dispatch: Get technician suggestions for a job ---
  app.get("/api/dispatch/suggestions", async (req, res) => {
    const { customerId, serviceType, scheduledDate } = req.query;
    
    if (!customerId || !serviceType || !scheduledDate) {
      return res.status(400).json({ message: "customerId, serviceType, and scheduledDate required" });
    }
    
    // Get customer location
    const customer = await storage.getCustomer(Number(customerId));
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }
    
    // Get all active technicians
    const technicians = await storage.getTechnicians();
    const activeTechs = technicians.filter(t => t.isActive);
    
    // Get all jobs for the scheduled date to calculate workload
    const dateJobs = await storage.getJobs({ date: scheduledDate as string });
    
    // Calculate score for each technician
    const suggestions = await Promise.all(activeTechs.map(async (tech) => {
      let score = 100;
      const reasons: string[] = [];
      
      // 1. Specialty match (+30 points)
      const serviceCategory = (serviceType as string).split('_')[0]; // hvac, plumbing, electrical
      if (tech.specialties?.includes(serviceCategory)) {
        score += 30;
        reasons.push(`Specialized in ${serviceCategory}`);
      }
      
      // 2. Workload penalty (-10 per job that day)
      const techJobs = dateJobs.filter(j => j.technicianId === tech.id && j.status !== "cancelled");
      score -= techJobs.length * 10;
      if (techJobs.length === 0) {
        reasons.push("No jobs scheduled that day");
      } else if (techJobs.length <= 2) {
        reasons.push(`${techJobs.length} job(s) scheduled`);
      } else {
        reasons.push(`Heavy workload: ${techJobs.length} jobs`);
      }
      
      // 3. Proximity bonus (if we have location data)
      let distanceMiles: number | null = null;
      if (customer.addressLat && customer.addressLng && tech.currentLocationLat && tech.currentLocationLng) {
        const lat1 = parseFloat(customer.addressLat);
        const lng1 = parseFloat(customer.addressLng);
        const lat2 = parseFloat(tech.currentLocationLat);
        const lng2 = parseFloat(tech.currentLocationLng);
        
        // Haversine formula for distance
        const R = 3959; // Earth radius in miles
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        distanceMiles = R * c;
        
        if (distanceMiles < 5) {
          score += 20;
          reasons.push(`Only ${distanceMiles.toFixed(1)} miles away`);
        } else if (distanceMiles < 15) {
          score += 10;
          reasons.push(`${distanceMiles.toFixed(1)} miles away`);
        } else {
          reasons.push(`${distanceMiles.toFixed(1)} miles away`);
        }
      }
      
      // 4. Recent location update bonus (+5 if updated within last hour)
      if (tech.lastLocationUpdate) {
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (new Date(tech.lastLocationUpdate) > hourAgo) {
          score += 5;
        }
      }
      
      return {
        technician: sanitizeTechnician(tech),
        score,
        reasons,
        distanceMiles,
        jobsScheduled: techJobs.length
      };
    }));
    
    // Sort by score descending
    suggestions.sort((a, b) => b.score - a.score);
    
    res.json(suggestions.slice(0, 5)); // Return top 5 suggestions
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

  // --- Job Checklists ---
  app.get("/api/jobs/:jobId/checklist", async (req, res) => {
    const items = await storage.getJobChecklistItems(Number(req.params.jobId));
    res.json(items);
  });

  app.post("/api/jobs/:jobId/checklist/initialize", async (req, res) => {
    const job = await storage.getJob(Number(req.params.jobId));
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }
    const items = await storage.initializeJobChecklist(job.id, job.serviceType);
    res.json(items);
  });

  app.put("/api/checklist-items/:id", async (req, res) => {
    const updateSchema = z.object({
      isCompleted: z.boolean().optional(),
      notes: z.string().optional()
    });
    try {
      const input = updateSchema.parse(req.body);
      const updated = await storage.updateJobChecklistItem(Number(req.params.id), input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.get("/api/service-checklists", async (req, res) => {
    const serviceType = req.query.serviceType as string | undefined;
    const checklists = await storage.getServiceChecklists(serviceType);
    res.json(checklists);
  });

  app.post("/api/service-checklists", async (req, res) => {
    const checklistSchema = z.object({
      serviceType: z.string().min(1),
      name: z.string().min(1),
      items: z.array(z.object({
        step: z.number(),
        label: z.string(),
        required: z.boolean().optional()
      })).min(1)
    });
    try {
      const input = checklistSchema.parse(req.body);
      const tenantStore = getTenantStorage(req);
      const checklist = await tenantStore.createServiceChecklist({ ...input, isActive: true });
      res.status(201).json(checklist);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // --- Route Optimization ---
  app.post("/api/optimize-route", async (req, res) => {
    const routeSchema = z.object({
      jobIds: z.array(z.number()).min(2),
      startLat: z.number().optional(),
      startLng: z.number().optional()
    });
    
    let input;
    try {
      input = routeSchema.parse(req.body);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
    
    const { jobIds, startLat, startLng } = input;
    
    const jobs = await Promise.all(
      jobIds.map(id => storage.getJob(id))
    );
    
    const validJobs = jobs.filter(j => j !== undefined) as NonNullable<typeof jobs[0]>[];
    
    if (validJobs.length < 2) {
      return res.status(400).json({ message: "Need at least 2 valid jobs to optimize" });
    }
    
    const jobsWithLocation = validJobs.filter(j => 
      j.customer?.addressLat && j.customer?.addressLng
    );
    
    const jobsMissingLocation = validJobs.filter(j => 
      !j.customer?.addressLat || !j.customer?.addressLng
    );
    
    if (jobsWithLocation.length < 2) {
      return res.json({
        optimizedOrder: validJobs.map(j => j.id),
        jobs: validJobs.map(j => ({
          id: j.id,
          jobNumber: j.jobNumber,
          customer: j.customer ? {
            name: `${j.customer.firstName} ${j.customer.lastName}`,
            address: `${j.customer.addressStreet || ''}, ${j.customer.addressCity || ''}`
          } : null,
          hasLocation: !!(j.customer?.addressLat && j.customer?.addressLng)
        })),
        totalDistanceMiles: null,
        message: `Insufficient location data. ${jobsMissingLocation.length} job(s) missing coordinates.`,
        missingLocationJobIds: jobsMissingLocation.map(j => j.id)
      });
    }
    
    const haversineDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
      const R = 3959;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLng/2) * Math.sin(dLng/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    };
    
    const optimized: typeof jobsWithLocation = [];
    const remaining = [...jobsWithLocation];
    
    let currentLat: number;
    let currentLng: number;
    
    if (startLat !== undefined && startLng !== undefined) {
      currentLat = startLat;
      currentLng = startLng;
    } else {
      const firstJob = remaining.shift()!;
      optimized.push(firstJob);
      currentLat = parseFloat(firstJob.customer!.addressLat!);
      currentLng = parseFloat(firstJob.customer!.addressLng!);
    }
    
    while (remaining.length > 0) {
      let nearestIdx = 0;
      let nearestDist = Infinity;
      
      for (let i = 0; i < remaining.length; i++) {
        const job = remaining[i];
        const lat = parseFloat(job.customer!.addressLat!);
        const lng = parseFloat(job.customer!.addressLng!);
        const dist = haversineDistance(currentLat, currentLng, lat, lng);
        
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = i;
        }
      }
      
      const nearest = remaining.splice(nearestIdx, 1)[0];
      optimized.push(nearest);
      currentLat = parseFloat(nearest.customer!.addressLat!);
      currentLng = parseFloat(nearest.customer!.addressLng!);
    }
    
    let totalDistance = 0;
    let prevLat = startLat ?? parseFloat(optimized[0].customer!.addressLat!);
    let prevLng = startLng ?? parseFloat(optimized[0].customer!.addressLng!);
    
    for (const job of optimized) {
      const lat = parseFloat(job.customer!.addressLat!);
      const lng = parseFloat(job.customer!.addressLng!);
      totalDistance += haversineDistance(prevLat, prevLng, lat, lng);
      prevLat = lat;
      prevLng = lng;
    }
    
    const response: any = {
      optimizedOrder: optimized.map(j => j.id),
      jobs: optimized.map(j => ({
        id: j.id,
        jobNumber: j.jobNumber,
        customer: j.customer ? {
          name: `${j.customer.firstName} ${j.customer.lastName}`,
          address: `${j.customer.addressStreet || ''}, ${j.customer.addressCity || ''}`
        } : null,
        hasLocation: true
      })),
      totalDistanceMiles: Math.round(totalDistance * 10) / 10
    };
    
    if (jobsMissingLocation.length > 0) {
      response.message = `${jobsMissingLocation.length} job(s) excluded due to missing coordinates`;
      response.missingLocationJobIds = jobsMissingLocation.map(j => j.id);
    }
    
    res.json(response);
  });

  // --- Invoice & Payments ---
  app.post("/api/jobs/:id/invoice", async (req, res) => {
    const invoiceSchema = z.object({
      lineItems: z.array(z.object({
        description: z.string().min(1),
        amount: z.number().positive()
      })).min(1),
      sendEmail: z.boolean().optional().default(true)
    });
    
    let input;
    try {
      input = invoiceSchema.parse(req.body);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
    
    const { stripeService } = await import('./stripeService');
    const jobId = Number(req.params.id);
    const job = await storage.getJob(jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (!job.customer) return res.status(400).json({ message: "Job has no customer" });
    
    if (job.invoiceId) {
      return res.status(409).json({ message: "Job already has an invoice" });
    }
    
    const { lineItems, sendEmail } = input;
    
    try {
      if (!job.customer.email) {
        return res.status(400).json({ message: "Customer email required for invoicing" });
      }
      const customer = await stripeService.getOrCreateCustomer(
        job.customer.email,
        `${job.customer.firstName} ${job.customer.lastName}`,
        job.customer.phone || undefined
      );
      
      const invoice = await stripeService.createJobInvoice(
        customer.id,
        job.id,
        job.jobNumber,
        lineItems
      );
      
      if (sendEmail) {
        await stripeService.sendInvoice(invoice.id);
      }
      
      await storage.updateJob(jobId, { 
        invoiceId: invoice.id,
        paymentStatus: 'invoiced' as any
      });
      
      res.json({ 
        invoiceId: invoice.id,
        invoiceUrl: invoice.hosted_invoice_url,
        status: invoice.status
      });
    } catch (err: any) {
      console.error('Invoice creation error:', err);
      res.status(500).json({ message: err.message || "Failed to create invoice" });
    }
  });

  app.post("/api/jobs/:id/payment-link", async (req, res) => {
    const { stripeService } = await import('./stripeService');
    const jobId = Number(req.params.id);
    const job = await storage.getJob(jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (!job.customer) return res.status(400).json({ message: "Job has no customer" });
    
    const { amount, description } = req.body;
    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ message: "Valid amount required" });
    }
    
    try {
      if (!job.customer.email) {
        return res.status(400).json({ message: "Customer email required for payment" });
      }
      const customer = await stripeService.getOrCreateCustomer(
        job.customer.email,
        `${job.customer.firstName} ${job.customer.lastName}`,
        job.customer.phone || undefined
      );
      
      const session = await stripeService.createQuickPaymentLink(
        customer.id,
        amount,
        description || `Service for ${job.jobNumber}`,
        job.id,
        job.jobNumber
      );
      
      res.json({ 
        paymentUrl: session.url,
        sessionId: session.id
      });
    } catch (err: any) {
      console.error('Payment link error:', err);
      res.status(500).json({ message: err.message || "Failed to create payment link" });
    }
  });

  app.get("/api/stripe/publishable-key", async (req, res) => {
    try {
      const { getStripePublishableKey } = await import('./stripeClient');
      const key = await getStripePublishableKey();
      res.json({ publishableKey: key });
    } catch (err) {
      res.status(500).json({ message: "Stripe not configured" });
    }
  });

  // --- AI Voice Calling (Bland AI) ---
  app.post("/api/jobs/:id/customer-not-home", async (req, res) => {
    const jobId = Number(req.params.id);
    const job = await storage.getJob(jobId);
    
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (!job.customer) return res.status(400).json({ message: "Job has no customer" });
    if (!job.customer.phone) return res.status(400).json({ message: "Customer has no phone number" });
    
    const { triggerCustomerNotHomeCall } = await import('./blandAiService');
    
    const companyName = process.env.COMPANY_NAME || process.env.VITE_COMPANY_NAME || 'FieldTech';
    const callbackNumber = process.env.VITE_SUPPORT_PHONE || process.env.SUPPORT_PHONE;
    
    const result = await triggerCustomerNotHomeCall({
      phoneNumber: job.customer.phone,
      customerName: `${job.customer.firstName} ${job.customer.lastName}`,
      technicianName: job.technician ? `${job.technician.firstName}` : 'your technician',
      serviceType: job.serviceType,
      companyName,
      jobNumber: job.jobNumber,
      callbackNumber
    });
    
    if (result.success) {
      console.log(`AI call initiated for job ${jobId}: ${result.callId}`);
      
      res.json({ 
        success: true, 
        callId: result.callId,
        message: "AI is calling the customer now"
      });
    } else {
      res.status(500).json({ 
        success: false, 
        message: result.error || "Failed to initiate call"
      });
    }
  });

  app.get("/api/calls/:callId", async (req, res) => {
    const { getCallDetails } = await import('./blandAiService');
    const details = await getCallDetails(req.params.callId);
    
    if (!details) {
      return res.status(404).json({ message: "Call not found" });
    }
    
    res.json(details);
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

  // --- Tenant Management (Multi-tenancy) ---
  
  // Get current tenant info
  app.get("/api/tenants/current", async (req, res) => {
    if (!req.tenant) {
      return res.status(404).json({ message: "No tenant context" });
    }
    res.json(req.tenant);
  });

  // Create new tenant (company signup)
  app.post("/api/tenants", async (req, res) => {
    const user = req.user as any;
    if (!user?.id) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const tenantSchema = z.object({
      companyName: z.string().min(1, "Company name is required"),
      slug: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and dashes only"),
      contactEmail: z.string().email(),
      contactPhone: z.string().optional(),
      timezone: z.string().default("America/New_York"),
      serviceTypes: z.array(z.string()).default(["hvac_repair", "plumbing_repair", "electrical_repair"])
    });

    try {
      const input = tenantSchema.parse(req.body);
      
      // Check if slug is already taken
      const { TenantService } = await import("./tenantStorage");
      const existingTenant = await TenantService.getTenantBySlug(input.slug);
      if (existingTenant) {
        return res.status(409).json({ message: "Company slug already exists. Please choose a different one." });
      }

      // Create new tenant
      const tenant = await TenantService.createTenant({
        companyName: input.companyName,
        slug: input.slug,
        email: input.contactEmail,
        phone: input.contactPhone || null,
        planTier: "free",
        status: "active",
        settings: {
          timezone: input.timezone,
          serviceTypes: input.serviceTypes
        }
      });

      // Update the user's tenant association
      const { db } = await import("./db");
      const { users } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(users)
        .set({ tenantId: tenant.id, role: "admin" })
        .where(eq(users.id, user.id));

      res.status(201).json({ 
        message: "Company created successfully",
        tenant 
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // Update tenant settings
  app.patch("/api/tenants/current", requireTenant, async (req, res) => {
    const updateSchema = z.object({
      companyName: z.string().min(1).optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      settings: z.record(z.any()).optional()
    });

    try {
      const input = updateSchema.parse(req.body);
      const { TenantService } = await import("./tenantStorage");
      const updated = await TenantService.updateTenant(req.tenantId!, input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
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
      tenantId: DEFAULT_TENANT_ID,
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
      tenantId: DEFAULT_TENANT_ID,
      email: "tech2@example.com",
      passwordHash: "5678",
      firstName: "Sarah",
      lastName: "Connor",
      phone: "555-0102",
      specialties: ["plumbing"],
    });

    // Customers
    const cust1 = await storage.createCustomer({
      tenantId: DEFAULT_TENANT_ID,
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
      tenantId: DEFAULT_TENANT_ID,
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
      tenantId: DEFAULT_TENANT_ID,
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
      tenantId: DEFAULT_TENANT_ID,
      customerId: cust2.id,
      technicianId: tech2.id,
      scheduledDate: new Date().toISOString().split('T')[0],
      scheduledTimeStart: "14:00:00",
      serviceType: "plumbing_leak",
      priority: "normal",
      description: "Leaky faucet in kitchen",
      status: "assigned"
    });
    
    // Service Checklists
    await storage.createServiceChecklist({
      tenantId: DEFAULT_TENANT_ID,
      serviceType: "hvac_repair",
      name: "HVAC Repair Checklist",
      items: [
        { step: 1, label: "Verify customer complaint", required: true },
        { step: 2, label: "Check thermostat settings", required: true },
        { step: 3, label: "Inspect air filter condition", required: true },
        { step: 4, label: "Check refrigerant levels", required: true },
        { step: 5, label: "Inspect condenser coils", required: false },
        { step: 6, label: "Test electrical connections", required: true },
        { step: 7, label: "Verify proper airflow", required: true },
        { step: 8, label: "Document work performed", required: true }
      ],
      isActive: true
    });

    await storage.createServiceChecklist({
      tenantId: DEFAULT_TENANT_ID,
      serviceType: "plumbing_leak",
      name: "Plumbing Leak Repair",
      items: [
        { step: 1, label: "Locate source of leak", required: true },
        { step: 2, label: "Shut off water supply", required: true },
        { step: 3, label: "Assess damage extent", required: true },
        { step: 4, label: "Repair or replace affected components", required: true },
        { step: 5, label: "Test for additional leaks", required: true },
        { step: 6, label: "Restore water supply", required: true },
        { step: 7, label: "Clean work area", required: false },
        { step: 8, label: "Document work performed", required: true }
      ],
      isActive: true
    });

    await storage.createServiceChecklist({
      tenantId: DEFAULT_TENANT_ID,
      serviceType: "hvac_maintenance",
      name: "HVAC Preventive Maintenance",
      items: [
        { step: 1, label: "Replace air filters", required: true },
        { step: 2, label: "Clean condenser coils", required: true },
        { step: 3, label: "Check refrigerant charge", required: true },
        { step: 4, label: "Inspect electrical connections", required: true },
        { step: 5, label: "Lubricate moving parts", required: false },
        { step: 6, label: "Check thermostat calibration", required: true },
        { step: 7, label: "Inspect ductwork", required: false },
        { step: 8, label: "Test system operation", required: true }
      ],
      isActive: true
    });

    // Parts
    await storage.createPart({
      tenantId: DEFAULT_TENANT_ID,
      partName: "HVAC Filter 20x20x1",
      quantityOnHand: 50,
      costPerUnit: "15.00"
    });
    
    console.log("Database seeded!");
  }
}
