import { 
  technicians, customers, jobs, jobPhotos, jobNotes, technicianSchedule, partsInventory, serviceChecklists, jobChecklistItems,
  type InsertTechnician, type InsertCustomer, type InsertJob, type InsertJobPhoto, type InsertJobNote, type InsertSchedule, type InsertPart, type InsertServiceChecklist, type InsertJobChecklistItem,
  type Technician, type Customer, type Job, type JobPhoto, type JobNote, type TechnicianSchedule, type Part, type ServiceChecklist, type JobChecklistItem
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, ilike } from "drizzle-orm";
import { authStorage, type IAuthStorage } from "./replit_integrations/auth/storage";
import { sanitizeString, sanitizeEmail, sanitizePhone, sanitizeNotes, normalizeZipCode } from "@shared/sanitize";

export interface IStorage extends IAuthStorage {
  // Technicians
  getTechnicians(): Promise<Technician[]>;
  getTechnician(id: number): Promise<Technician | undefined>;
  createTechnician(tech: InsertTechnician): Promise<Technician>;
  updateTechnician(id: number, tech: Partial<InsertTechnician>): Promise<Technician>;
  updateTechnicianLocation(id: number, lat: number, lng: number): Promise<Technician | undefined>;

  // Customers
  getCustomers(search?: string): Promise<Customer[]>;
  getCustomer(id: number): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: number, customer: Partial<InsertCustomer>): Promise<Customer>;
  deleteCustomer(id: number): Promise<boolean>;

  // Jobs
  getJobs(filters?: { date?: string; technicianId?: number; status?: string; customerId?: number; tenantId?: string }): Promise<(Job & { customer: Customer | null; technician: Technician | null })[]>;
  getJob(id: number): Promise<(Job & { customer: Customer | null; technician: Technician | null }) | undefined>;
  createJob(job: InsertJob): Promise<Job>;
  updateJob(id: number, job: Partial<InsertJob>): Promise<Job>;
  deleteJob(id: number): Promise<boolean>;
  
  // Parts
  getParts(): Promise<Part[]>;
  createPart(part: InsertPart): Promise<Part>;

  // Job Photos
  getJobPhotos(jobId: number): Promise<JobPhoto[]>;
  createJobPhoto(photo: InsertJobPhoto): Promise<JobPhoto>;
  deleteJobPhoto(id: number): Promise<boolean>;

  // Checklists
  getServiceChecklists(serviceType?: string): Promise<ServiceChecklist[]>;
  createServiceChecklist(checklist: InsertServiceChecklist): Promise<ServiceChecklist>;
  getJobChecklistItems(jobId: number): Promise<JobChecklistItem[]>;
  createJobChecklistItem(item: InsertJobChecklistItem): Promise<JobChecklistItem>;
  updateJobChecklistItem(id: number, updates: { isCompleted?: boolean; notes?: string }): Promise<JobChecklistItem>;
  initializeJobChecklist(jobId: number, serviceType: string): Promise<JobChecklistItem[]>;

  // System
  healthCheck(): Promise<boolean>;
  cleanupOrphans(): Promise<{ orphanedPhotos: number; orphanedNotes: number }>;
}

export class DatabaseStorage implements IStorage {
  // Inherit auth storage methods by delegation or mixin if strictly needed, 
  // but here I'll just implement the interface and use the imported authStorage for the auth parts if I needed to merge them.
  // Actually, typescript might complain if I claim to implement IAuthStorage but don't have the methods.
  // I will just implement them by calling authStorage.
  getUser(id: string) { return authStorage.getUser(id); }
  upsertUser(user: any) { return authStorage.upsertUser(user); }

  // Technicians
  async getTechnicians(): Promise<Technician[]> {
    return await db.select().from(technicians);
  }

  async getTechnician(id: number): Promise<Technician | undefined> {
    const [tech] = await db.select().from(technicians).where(eq(technicians.id, id));
    return tech;
  }

  async createTechnician(tech: InsertTechnician): Promise<Technician> {
    const [newTech] = await db.insert(technicians).values(tech).returning();
    return newTech;
  }

  async updateTechnician(id: number, tech: Partial<InsertTechnician>): Promise<Technician> {
    const [updated] = await db.update(technicians).set(tech).where(eq(technicians.id, id)).returning();
    return updated;
  }

  async updateTechnicianLocation(id: number, lat: number, lng: number): Promise<Technician | undefined> {
    const [updated] = await db.update(technicians)
      .set({
        currentLocationLat: lat.toString(),
        currentLocationLng: lng.toString(),
        lastLocationUpdate: new Date(),
      })
      .where(eq(technicians.id, id))
      .returning();
    return updated;
  }

  // Customers
  async getCustomers(search?: string): Promise<Customer[]> {
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      return await db.select().from(customers).where(
        or(
          ilike(customers.firstName, searchTerm),
          ilike(customers.lastName, searchTerm),
          ilike(customers.email, searchTerm),
          ilike(customers.phone, searchTerm)
        )
      );
    }
    return await db.select().from(customers);
  }

  async getCustomer(id: number): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer;
  }

  async createCustomer(customer: InsertCustomer): Promise<Customer> {
    const sanitized = {
      ...customer,
      firstName: sanitizeString(customer.firstName),
      lastName: sanitizeString(customer.lastName),
      email: sanitizeEmail(customer.email),
      phone: sanitizePhone(customer.phone),
      addressZip: normalizeZipCode(customer.addressZip),
      notes: customer.notes ? sanitizeNotes(customer.notes) : customer.notes,
      accessNotes: customer.accessNotes ? sanitizeNotes(customer.accessNotes) : customer.accessNotes
    };
    const [newCustomer] = await db.insert(customers).values(sanitized).returning();
    return newCustomer;
  }

  async updateCustomer(id: number, customer: Partial<InsertCustomer>): Promise<Customer> {
    const sanitized: Partial<InsertCustomer> = { ...customer };
    if (customer.firstName !== undefined) sanitized.firstName = sanitizeString(customer.firstName);
    if (customer.lastName !== undefined) sanitized.lastName = sanitizeString(customer.lastName);
    if (customer.email !== undefined) sanitized.email = sanitizeEmail(customer.email);
    if (customer.phone !== undefined) sanitized.phone = sanitizePhone(customer.phone);
    if (customer.addressZip !== undefined) sanitized.addressZip = normalizeZipCode(customer.addressZip);
    if (customer.notes !== undefined) sanitized.notes = sanitizeNotes(customer.notes);
    if (customer.accessNotes !== undefined) sanitized.accessNotes = sanitizeNotes(customer.accessNotes);
    
    const [updated] = await db.update(customers).set({ ...sanitized, updatedAt: new Date() }).where(eq(customers.id, id)).returning();
    return updated;
  }

  async deleteCustomer(id: number): Promise<boolean> {
    const result = await db.delete(customers).where(eq(customers.id, id)).returning();
    return result.length > 0;
  }

  // Jobs
  async getJobs(filters?: { date?: string; technicianId?: number; status?: string; customerId?: number; tenantId?: string }): Promise<(Job & { customer: Customer | null; technician: Technician | null })[]> {
    const conditions = [];
    if (filters?.date) conditions.push(eq(jobs.scheduledDate, filters.date));
    if (filters?.technicianId) conditions.push(eq(jobs.technicianId, filters.technicianId));
    if (filters?.status) conditions.push(eq(jobs.status, filters.status));
    if (filters?.customerId) conditions.push(eq(jobs.customerId, filters.customerId));
    if (filters?.tenantId) conditions.push(eq(jobs.tenantId, filters.tenantId));

    const result = await db.query.jobs.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      with: {
        customer: true,
        technician: true
      },
      orderBy: [desc(jobs.scheduledDate), desc(jobs.scheduledTimeStart)]
    });
    return result as (Job & { customer: Customer | null; technician: Technician | null })[];
  }

  async getJob(id: number): Promise<(Job & { customer: Customer | null; technician: Technician | null }) | undefined> {
    const result = await db.query.jobs.findFirst({
      where: eq(jobs.id, id),
      with: {
        customer: true,
        technician: true
      }
    });
    return result as (Job & { customer: Customer | null; technician: Technician | null }) | undefined;
  }

  async createJob(job: InsertJob): Promise<Job> {
    // Generate job number
    const jobNumber = `JOB-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const [newJob] = await db.insert(jobs).values({ ...job, jobNumber }).returning();
    return newJob;
  }

  async updateJob(id: number, job: Partial<InsertJob>): Promise<Job> {
    const updates: any = { ...job, updatedAt: new Date() };
    
    // Record status change timestamps
    if (job.status) {
      updates.statusUpdatedAt = new Date();
      switch (job.status) {
        case "assigned":
          updates.assignedAt = new Date();
          break;
        case "en_route":
          updates.enRouteAt = new Date();
          break;
        case "arrived":
          updates.arrivedAt = new Date();
          break;
        case "in_progress":
          updates.startedAt = new Date();
          break;
        case "completed":
          updates.completedAt = new Date();
          break;
      }
    }
    
    const [updated] = await db.update(jobs).set(updates).where(eq(jobs.id, id)).returning();
    return updated;
  }

  async deleteJob(id: number): Promise<boolean> {
    // First delete related photos
    await db.delete(jobPhotos).where(eq(jobPhotos.jobId, id));
    // Then delete the job
    const result = await db.delete(jobs).where(eq(jobs.id, id)).returning();
    return result.length > 0;
  }

  // Parts
  async getParts(): Promise<Part[]> {
    return await db.select().from(partsInventory);
  }

  async createPart(part: InsertPart): Promise<Part> {
    const [newPart] = await db.insert(partsInventory).values(part).returning();
    return newPart;
  }

  // Job Photos
  async getJobPhotos(jobId: number): Promise<JobPhoto[]> {
    return await db.select().from(jobPhotos).where(eq(jobPhotos.jobId, jobId)).orderBy(desc(jobPhotos.uploadedAt));
  }

  async createJobPhoto(photo: InsertJobPhoto): Promise<JobPhoto> {
    const [newPhoto] = await db.insert(jobPhotos).values(photo).returning();
    return newPhoto;
  }

  async deleteJobPhoto(id: number): Promise<boolean> {
    const result = await db.delete(jobPhotos).where(eq(jobPhotos.id, id)).returning();
    return result.length > 0;
  }

  // Checklists
  async getServiceChecklists(serviceType?: string): Promise<ServiceChecklist[]> {
    if (serviceType) {
      return await db.select().from(serviceChecklists)
        .where(and(eq(serviceChecklists.serviceType, serviceType), eq(serviceChecklists.isActive, true)));
    }
    return await db.select().from(serviceChecklists).where(eq(serviceChecklists.isActive, true));
  }

  async createServiceChecklist(checklist: InsertServiceChecklist): Promise<ServiceChecklist> {
    const [newChecklist] = await db.insert(serviceChecklists).values(checklist).returning();
    return newChecklist;
  }

  async getJobChecklistItems(jobId: number): Promise<JobChecklistItem[]> {
    return await db.select().from(jobChecklistItems)
      .where(eq(jobChecklistItems.jobId, jobId))
      .orderBy(jobChecklistItems.stepNumber);
  }

  async createJobChecklistItem(item: InsertJobChecklistItem): Promise<JobChecklistItem> {
    const [newItem] = await db.insert(jobChecklistItems).values(item).returning();
    return newItem;
  }

  async updateJobChecklistItem(id: number, updates: { isCompleted?: boolean; notes?: string }): Promise<JobChecklistItem> {
    const updateData: any = { ...updates };
    if (updates.isCompleted) {
      updateData.completedAt = new Date();
    }
    const [updated] = await db.update(jobChecklistItems).set(updateData).where(eq(jobChecklistItems.id, id)).returning();
    return updated;
  }

  async initializeJobChecklist(jobId: number, serviceType: string): Promise<JobChecklistItem[]> {
    // Get the checklist template for this service type
    const [template] = await db.select().from(serviceChecklists)
      .where(and(eq(serviceChecklists.serviceType, serviceType), eq(serviceChecklists.isActive, true)))
      .limit(1);
    
    if (!template) {
      return [];
    }
    
    // Check if already initialized
    const existing = await this.getJobChecklistItems(jobId);
    if (existing.length > 0) {
      return existing;
    }
    
    // Create checklist items from template
    const items = template.items as Array<{ step: number; label: string; required?: boolean }>;
    const createdItems: JobChecklistItem[] = [];
    
    for (const item of items) {
      const newItem = await this.createJobChecklistItem({
        tenantId: template.tenantId,
        jobId,
        checklistId: template.id,
        stepNumber: item.step,
        label: item.label,
        isCompleted: false
      });
      createdItems.push(newItem);
    }
    
    return createdItems;
  }

  // System - Health Check
  async healthCheck(): Promise<boolean> {
    try {
      await db.select().from(technicians).limit(1);
      return true;
    } catch {
      return false;
    }
  }

  // System - Cleanup orphaned records
  async cleanupOrphans(): Promise<{ orphanedPhotos: number; orphanedNotes: number }> {
    const allJobs = await db.select({ id: jobs.id }).from(jobs);
    const jobIds = new Set(allJobs.map(j => j.id));
    
    const allPhotos = await db.select().from(jobPhotos);
    const orphanedPhotoIds = allPhotos.filter(p => p.jobId === null || !jobIds.has(p.jobId)).map(p => p.id);
    
    const allNotes = await db.select().from(jobNotes);
    const orphanedNoteIds = allNotes.filter(n => n.jobId === null || !jobIds.has(n.jobId)).map(n => n.id);
    
    for (const id of orphanedPhotoIds) {
      await db.delete(jobPhotos).where(eq(jobPhotos.id, id));
    }
    
    for (const id of orphanedNoteIds) {
      await db.delete(jobNotes).where(eq(jobNotes.id, id));
    }
    
    console.log(`[Cleanup] Removed ${orphanedPhotoIds.length} orphaned photos, ${orphanedNoteIds.length} orphaned notes`);
    
    return { 
      orphanedPhotos: orphanedPhotoIds.length, 
      orphanedNotes: orphanedNoteIds.length 
    };
  }
}

export const storage = new DatabaseStorage();
