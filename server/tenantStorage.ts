import { 
  technicians, customers, jobs, jobPhotos, jobNotes, technicianSchedule, partsInventory, serviceChecklists, jobChecklistItems, tenants,
  type InsertTechnician, type InsertCustomer, type InsertJob, type InsertJobPhoto, type InsertJobNote, type InsertSchedule, type InsertPart, type InsertServiceChecklist, type InsertJobChecklistItem,
  type Technician, type Customer, type Job, type JobPhoto, type JobNote, type TechnicianSchedule, type Part, type ServiceChecklist, type JobChecklistItem, type Tenant, type InsertTenant
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, ilike } from "drizzle-orm";
import { sanitizeString, sanitizeEmail, sanitizePhone, sanitizeNotes, normalizeZipCode } from "@shared/sanitize";

export interface ITenantStorage {
  tenantId: string;
  
  getTechnicians(): Promise<Technician[]>;
  getTechnician(id: number): Promise<Technician | undefined>;
  createTechnician(tech: Omit<InsertTechnician, 'tenantId'>): Promise<Technician>;
  updateTechnician(id: number, tech: Partial<Omit<InsertTechnician, 'tenantId'>>): Promise<Technician>;
  updateTechnicianLocation(id: number, lat: number, lng: number): Promise<Technician | undefined>;

  getCustomers(search?: string): Promise<Customer[]>;
  getCustomer(id: number): Promise<Customer | undefined>;
  createCustomer(customer: Omit<InsertCustomer, 'tenantId'>): Promise<Customer>;
  updateCustomer(id: number, customer: Partial<Omit<InsertCustomer, 'tenantId'>>): Promise<Customer>;
  deleteCustomer(id: number): Promise<boolean>;

  getJobs(filters?: { date?: string; technicianId?: number; status?: string; customerId?: number }): Promise<(Job & { customer: Customer | null; technician: Technician | null })[]>;
  getJob(id: number): Promise<(Job & { customer: Customer | null; technician: Technician | null }) | undefined>;
  createJob(job: Omit<InsertJob, 'tenantId'>): Promise<Job>;
  updateJob(id: number, job: Partial<Omit<InsertJob, 'tenantId'>>): Promise<Job>;
  deleteJob(id: number): Promise<boolean>;
  
  getParts(): Promise<Part[]>;
  createPart(part: Omit<InsertPart, 'tenantId'>): Promise<Part>;

  getJobPhotos(jobId: number): Promise<JobPhoto[]>;
  createJobPhoto(photo: Omit<InsertJobPhoto, 'tenantId'>): Promise<JobPhoto>;
  deleteJobPhoto(id: number): Promise<boolean>;

  getJobNotes(jobId: number): Promise<JobNote[]>;
  createJobNote(note: Omit<InsertJobNote, 'tenantId'>): Promise<JobNote>;

  getServiceChecklists(serviceType?: string): Promise<ServiceChecklist[]>;
  createServiceChecklist(checklist: Omit<InsertServiceChecklist, 'tenantId'>): Promise<ServiceChecklist>;
  getJobChecklistItems(jobId: number): Promise<JobChecklistItem[]>;
  createJobChecklistItem(item: Omit<InsertJobChecklistItem, 'tenantId'>): Promise<JobChecklistItem>;
  updateJobChecklistItem(id: number, updates: { isCompleted?: boolean; notes?: string }): Promise<JobChecklistItem>;
  initializeJobChecklist(jobId: number, serviceType: string): Promise<JobChecklistItem[]>;
}

export class TenantScopedStorage implements ITenantStorage {
  constructor(public readonly tenantId: string) {}

  async getTechnicians(): Promise<Technician[]> {
    return await db.select().from(technicians).where(eq(technicians.tenantId, this.tenantId));
  }

  async getTechnician(id: number): Promise<Technician | undefined> {
    const [tech] = await db.select().from(technicians)
      .where(and(eq(technicians.id, id), eq(technicians.tenantId, this.tenantId)));
    return tech;
  }

  async createTechnician(tech: Omit<InsertTechnician, 'tenantId'>): Promise<Technician> {
    const [newTech] = await db.insert(technicians)
      .values({ ...tech, tenantId: this.tenantId })
      .returning();
    return newTech;
  }

  async updateTechnician(id: number, tech: Partial<Omit<InsertTechnician, 'tenantId'>>): Promise<Technician> {
    const [updated] = await db.update(technicians)
      .set(tech)
      .where(and(eq(technicians.id, id), eq(technicians.tenantId, this.tenantId)))
      .returning();
    return updated;
  }

  async updateTechnicianLocation(id: number, lat: number, lng: number): Promise<Technician | undefined> {
    const [updated] = await db.update(technicians)
      .set({
        currentLocationLat: lat.toString(),
        currentLocationLng: lng.toString(),
        lastLocationUpdate: new Date(),
      })
      .where(and(eq(technicians.id, id), eq(technicians.tenantId, this.tenantId)))
      .returning();
    return updated;
  }

  async getCustomers(search?: string): Promise<Customer[]> {
    const tenantFilter = eq(customers.tenantId, this.tenantId);
    
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      return await db.select().from(customers).where(
        and(
          tenantFilter,
          or(
            ilike(customers.firstName, searchTerm),
            ilike(customers.lastName, searchTerm),
            ilike(customers.email, searchTerm),
            ilike(customers.phone, searchTerm)
          )
        )
      );
    }
    return await db.select().from(customers).where(tenantFilter);
  }

  async getCustomer(id: number): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers)
      .where(and(eq(customers.id, id), eq(customers.tenantId, this.tenantId)));
    return customer;
  }

  async createCustomer(customer: Omit<InsertCustomer, 'tenantId'>): Promise<Customer> {
    const sanitized = {
      ...customer,
      tenantId: this.tenantId,
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

  async updateCustomer(id: number, customer: Partial<Omit<InsertCustomer, 'tenantId'>>): Promise<Customer> {
    const sanitized: any = {};
    if (customer.firstName !== undefined) sanitized.firstName = sanitizeString(customer.firstName);
    if (customer.lastName !== undefined) sanitized.lastName = sanitizeString(customer.lastName);
    if (customer.email !== undefined) sanitized.email = sanitizeEmail(customer.email);
    if (customer.phone !== undefined) sanitized.phone = sanitizePhone(customer.phone);
    if (customer.addressZip !== undefined) sanitized.addressZip = normalizeZipCode(customer.addressZip);
    if (customer.notes !== undefined) sanitized.notes = sanitizeNotes(customer.notes);
    if (customer.accessNotes !== undefined) sanitized.accessNotes = sanitizeNotes(customer.accessNotes);
    
    const [updated] = await db.update(customers)
      .set({ ...customer, ...sanitized, updatedAt: new Date() })
      .where(and(eq(customers.id, id), eq(customers.tenantId, this.tenantId)))
      .returning();
    return updated;
  }

  async deleteCustomer(id: number): Promise<boolean> {
    const result = await db.delete(customers)
      .where(and(eq(customers.id, id), eq(customers.tenantId, this.tenantId)))
      .returning();
    return result.length > 0;
  }

  async getJobs(filters?: { date?: string; technicianId?: number; status?: string; customerId?: number }): Promise<(Job & { customer: Customer | null; technician: Technician | null })[]> {
    const conditions = [eq(jobs.tenantId, this.tenantId)];
    if (filters?.date) conditions.push(eq(jobs.scheduledDate, filters.date));
    if (filters?.technicianId) conditions.push(eq(jobs.technicianId, filters.technicianId));
    if (filters?.status) conditions.push(eq(jobs.status, filters.status));
    if (filters?.customerId) conditions.push(eq(jobs.customerId, filters.customerId));

    const result = await db.query.jobs.findMany({
      where: and(...conditions),
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
      where: and(eq(jobs.id, id), eq(jobs.tenantId, this.tenantId)),
      with: {
        customer: true,
        technician: true
      }
    });
    return result as (Job & { customer: Customer | null; technician: Technician | null }) | undefined;
  }

  async createJob(job: Omit<InsertJob, 'tenantId'>): Promise<Job> {
    const jobNumber = `JOB-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const [newJob] = await db.insert(jobs)
      .values({ ...job, tenantId: this.tenantId, jobNumber })
      .returning();
    return newJob;
  }

  async updateJob(id: number, job: Partial<Omit<InsertJob, 'tenantId'>>): Promise<Job> {
    const updates: any = { ...job, updatedAt: new Date() };
    
    if (job.status) {
      updates.statusUpdatedAt = new Date();
      switch (job.status) {
        case "assigned": updates.assignedAt = new Date(); break;
        case "en_route": updates.enRouteAt = new Date(); break;
        case "arrived": updates.arrivedAt = new Date(); break;
        case "in_progress": updates.startedAt = new Date(); break;
        case "completed": updates.completedAt = new Date(); break;
      }
    }
    
    const [updated] = await db.update(jobs)
      .set(updates)
      .where(and(eq(jobs.id, id), eq(jobs.tenantId, this.tenantId)))
      .returning();
    return updated;
  }

  async deleteJob(id: number): Promise<boolean> {
    await db.delete(jobPhotos).where(and(eq(jobPhotos.jobId, id), eq(jobPhotos.tenantId, this.tenantId)));
    await db.delete(jobNotes).where(and(eq(jobNotes.jobId, id), eq(jobNotes.tenantId, this.tenantId)));
    const result = await db.delete(jobs)
      .where(and(eq(jobs.id, id), eq(jobs.tenantId, this.tenantId)))
      .returning();
    return result.length > 0;
  }

  async getParts(): Promise<Part[]> {
    return await db.select().from(partsInventory).where(eq(partsInventory.tenantId, this.tenantId));
  }

  async createPart(part: Omit<InsertPart, 'tenantId'>): Promise<Part> {
    const [newPart] = await db.insert(partsInventory)
      .values({ ...part, tenantId: this.tenantId })
      .returning();
    return newPart;
  }

  async getJobPhotos(jobId: number): Promise<JobPhoto[]> {
    return await db.select().from(jobPhotos)
      .where(and(eq(jobPhotos.jobId, jobId), eq(jobPhotos.tenantId, this.tenantId)))
      .orderBy(desc(jobPhotos.uploadedAt));
  }

  async createJobPhoto(photo: Omit<InsertJobPhoto, 'tenantId'>): Promise<JobPhoto> {
    const [newPhoto] = await db.insert(jobPhotos)
      .values({ ...photo, tenantId: this.tenantId })
      .returning();
    return newPhoto;
  }

  async deleteJobPhoto(id: number): Promise<boolean> {
    const result = await db.delete(jobPhotos)
      .where(and(eq(jobPhotos.id, id), eq(jobPhotos.tenantId, this.tenantId)))
      .returning();
    return result.length > 0;
  }

  async getJobNotes(jobId: number): Promise<JobNote[]> {
    return await db.select().from(jobNotes)
      .where(and(eq(jobNotes.jobId, jobId), eq(jobNotes.tenantId, this.tenantId)))
      .orderBy(desc(jobNotes.createdAt));
  }

  async createJobNote(note: Omit<InsertJobNote, 'tenantId'>): Promise<JobNote> {
    const [newNote] = await db.insert(jobNotes)
      .values({ ...note, tenantId: this.tenantId })
      .returning();
    return newNote;
  }

  async getServiceChecklists(serviceType?: string): Promise<ServiceChecklist[]> {
    const conditions = [eq(serviceChecklists.tenantId, this.tenantId)];
    if (serviceType) conditions.push(eq(serviceChecklists.serviceType, serviceType));
    return await db.select().from(serviceChecklists).where(and(...conditions));
  }

  async createServiceChecklist(checklist: Omit<InsertServiceChecklist, 'tenantId'>): Promise<ServiceChecklist> {
    const [newChecklist] = await db.insert(serviceChecklists)
      .values({ ...checklist, tenantId: this.tenantId })
      .returning();
    return newChecklist;
  }

  async getJobChecklistItems(jobId: number): Promise<JobChecklistItem[]> {
    return await db.select().from(jobChecklistItems)
      .where(and(eq(jobChecklistItems.jobId, jobId), eq(jobChecklistItems.tenantId, this.tenantId)));
  }

  async createJobChecklistItem(item: Omit<InsertJobChecklistItem, 'tenantId'>): Promise<JobChecklistItem> {
    const [newItem] = await db.insert(jobChecklistItems)
      .values({ ...item, tenantId: this.tenantId })
      .returning();
    return newItem;
  }

  async updateJobChecklistItem(id: number, updates: { isCompleted?: boolean; notes?: string }): Promise<JobChecklistItem> {
    const updateData: any = { ...updates };
    if (updates.isCompleted) {
      updateData.completedAt = new Date();
    }
    const [updated] = await db.update(jobChecklistItems)
      .set(updateData)
      .where(and(eq(jobChecklistItems.id, id), eq(jobChecklistItems.tenantId, this.tenantId)))
      .returning();
    return updated;
  }

  async initializeJobChecklist(jobId: number, serviceType: string): Promise<JobChecklistItem[]> {
    const existingItems = await this.getJobChecklistItems(jobId);
    if (existingItems.length > 0) return existingItems;

    const checklists = await this.getServiceChecklists(serviceType);
    if (checklists.length === 0) return [];

    const checklist = checklists[0];
    const items = checklist.items as Array<{ step: number; label: string; required?: boolean }>;
    
    const newItems: JobChecklistItem[] = [];
    for (const item of items) {
      const newItem = await this.createJobChecklistItem({
        jobId,
        checklistId: checklist.id,
        stepNumber: item.step,
        label: item.label,
        isCompleted: false
      });
      newItems.push(newItem);
    }
    return newItems;
  }
}

export function createTenantStorage(tenantId: string): ITenantStorage {
  return new TenantScopedStorage(tenantId);
}

export class TenantService {
  static async createTenant(data: Omit<InsertTenant, 'id' | 'createdAt' | 'updatedAt'>): Promise<Tenant> {
    const [tenant] = await db.insert(tenants).values(data).returning();
    return tenant;
  }

  static async getTenant(id: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
    return tenant;
  }

  static async getTenantBySlug(slug: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug));
    return tenant;
  }

  static async updateTenant(id: string, data: Partial<InsertTenant>): Promise<Tenant> {
    const [updated] = await db.update(tenants)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tenants.id, id))
      .returning();
    return updated;
  }
}
