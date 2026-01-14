import { pgTable, text, serial, integer, boolean, timestamp, jsonb, decimal, date, time, varchar, point } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";
export * from "./models/chat";

// --- Users (Office Staff) ---
// Note: 'users' table is already defined in ./models/auth.ts, but we need to extend it or ensure it has necessary fields.
// The auth module defines: id, email, firstName, lastName, profileImageUrl, createdAt, updatedAt.
// The prompt asks for: role, phone, is_active, last_login.
// Since we can't easily redefine 'users' here without conflict if I import it, I will assume the auth module's user table is the base.
// However, the auth module's table is fixed. I might need to add a separate table for extra user details OR just accept the auth module's fields for now and maybe add a 'role' column if I could, but I can't modify the auth integration's schema easily.
// Actually, I can just define the extra tables and use the auth user id.
// BUT, for simplicity in this generated app, I will stick to the auth user for login and maybe add a 'user_roles' table if needed, OR just use the 'users' table from auth and assume I can add columns later if I were doing migrations manually.
// For now, I'll rely on the auth module's users table and maybe add a 'role' to it via a separate relation or just assume all logged in users are office staff for the dashboard.
// The prompt says "Office Staff login/authentication".

// --- Technicians ---
export const technicians = pgTable("technicians", {
  id: serial("id").primaryKey(),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(), // For simple PIN/password login on mobile
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone").notNull(),
  employeeId: text("employee_id"),
  specialties: text("specialties").array(), // ['hvac', 'plumbing']
  certifications: text("certifications").array(),
  isActive: boolean("is_active").default(true),
  currentLocationLat: decimal("current_location_lat", { precision: 10, scale: 8 }),
  currentLocationLng: decimal("current_location_lng", { precision: 11, scale: 8 }),
  lastLocationUpdate: timestamp("last_location_update"),
  profilePhotoUrl: text("profile_photo_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const techniciansRelations = relations(technicians, ({ many }) => ({
  jobs: many(jobs),
  schedule: many(technicianSchedule),
}));

// --- Customers ---
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone").notNull(),
  addressStreet: text("address_street"),
  addressCity: text("address_city"),
  addressState: text("address_state"),
  addressZip: text("address_zip"),
  // PostGIS point not strictly supported in standard drizzle-orm/pg-core without extensions, using lat/lng columns for simplicity or jsonb
  addressLat: decimal("address_lat", { precision: 10, scale: 8 }),
  addressLng: decimal("address_lng", { precision: 11, scale: 8 }),
  gateCode: text("gate_code"),
  accessNotes: text("access_notes"),
  preferredContactMethod: text("preferred_contact_method").default("phone"),
  customerSince: date("customer_since"),
  totalJobsCompleted: integer("total_jobs_completed").default(0),
  lifetimeValue: decimal("lifetime_value", { precision: 10, scale: 2 }).default("0"),
  averageRating: decimal("average_rating", { precision: 3, scale: 2 }),
  tags: text("tags").array(),
  notes: text("notes"),
  gohighlevelId: text("gohighlevel_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const customersRelations = relations(customers, ({ many }) => ({
  jobs: many(jobs),
}));

// --- Jobs ---
export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  jobNumber: text("job_number").unique().notNull(),
  customerId: integer("customer_id").references(() => customers.id),
  technicianId: integer("technician_id").references(() => technicians.id),
  
  scheduledDate: date("scheduled_date").notNull(),
  scheduledTimeStart: time("scheduled_time_start").notNull(),
  scheduledTimeEnd: time("scheduled_time_end"),
  estimatedDurationMinutes: integer("estimated_duration_minutes").default(60),
  
  serviceType: text("service_type").notNull(), // hvac_repair, etc
  priority: text("priority").default("normal"), // urgent, normal, routine
  description: text("description"),
  specialInstructions: text("special_instructions"),
  
  status: text("status").default("scheduled"), // scheduled, assigned, en_route, arrived, in_progress, completed, cancelled, no_show
  statusUpdatedAt: timestamp("status_updated_at"),
  
  assignedAt: timestamp("assigned_at"),
  enRouteAt: timestamp("en_route_at"),
  arrivedAt: timestamp("arrived_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  
  actualDurationMinutes: integer("actual_duration_minutes"),
  workPerformed: text("work_performed"),
  partsUsed: jsonb("parts_used"), // [{"part_id": 1, "qty": 2}]
  totalCost: decimal("total_cost", { precision: 10, scale: 2 }),
  customerSignatureUrl: text("customer_signature_url"),
  customerRating: integer("customer_rating"),
  customerFeedback: text("customer_feedback"),
  
  requiresFollowup: boolean("requires_followup").default(false),
  followupDate: date("followup_date"),
  followupReason: text("followup_reason"),
  
  gohighlevelAppointmentId: text("gohighlevel_appointment_id"),
  invoiceId: text("invoice_id"),
  paymentStatus: text("payment_status").default("pending"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  customer: one(customers, {
    fields: [jobs.customerId],
    references: [customers.id],
  }),
  technician: one(technicians, {
    fields: [jobs.technicianId],
    references: [technicians.id],
  }),
  photos: many(jobPhotos),
  notes: many(jobNotes),
}));

// --- Job Photos ---
export const jobPhotos = pgTable("job_photos", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").references(() => jobs.id),
  technicianId: integer("technician_id").references(() => technicians.id),
  photoUrl: text("photo_url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  category: text("category").default("during"), // before, during, after
  caption: text("caption"),
  gpsLatitude: decimal("gps_latitude", { precision: 10, scale: 8 }),
  gpsLongitude: decimal("gps_longitude", { precision: 11, scale: 8 }),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

export const jobPhotosRelations = relations(jobPhotos, ({ one }) => ({
  job: one(jobs, {
    fields: [jobPhotos.jobId],
    references: [jobs.id],
  }),
}));

// --- Job Notes ---
export const jobNotes = pgTable("job_notes", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").references(() => jobs.id),
  // userId: integer("user_id"), // Refers to office user (string ID in auth table)
  technicianId: integer("technician_id").references(() => technicians.id),
  noteType: text("note_type").default("general"),
  noteText: text("note_text").notNull(),
  isInternal: boolean("is_internal").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const jobNotesRelations = relations(jobNotes, ({ one }) => ({
  job: one(jobs, {
    fields: [jobNotes.jobId],
    references: [jobs.id],
  }),
}));

// --- Technician Schedule ---
export const technicianSchedule = pgTable("technician_schedule", {
  id: serial("id").primaryKey(),
  technicianId: integer("technician_id").references(() => technicians.id),
  scheduleDate: date("schedule_date").notNull(),
  isAvailable: boolean("is_available").default(true),
  startTime: time("start_time").default("08:00:00"),
  endTime: time("end_time").default("17:00:00"),
  unavailableReason: text("unavailable_reason"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const technicianScheduleRelations = relations(technicianSchedule, ({ one }) => ({
  technician: one(technicians, {
    fields: [technicianSchedule.technicianId],
    references: [technicians.id],
  }),
}));

// --- Parts Inventory ---
export const partsInventory = pgTable("parts_inventory", {
  id: serial("id").primaryKey(),
  partNumber: text("part_number").unique(),
  partName: text("part_name").notNull(),
  description: text("description"),
  category: text("category"),
  quantityOnHand: integer("quantity_on_hand").default(0),
  reorderPoint: integer("reorder_point").default(10),
  costPerUnit: decimal("cost_per_unit", { precision: 10, scale: 2 }),
  supplier: text("supplier"),
  isActive: boolean("is_active").default(true),
});

// --- Schemas ---
export const insertTechnicianSchema = createInsertSchema(technicians).omit({ id: true, createdAt: true, lastLocationUpdate: true });
export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true, updatedAt: true, totalJobsCompleted: true, lifetimeValue: true, averageRating: true });
export const insertJobSchema = createInsertSchema(jobs).omit({ 
  id: true, 
  jobNumber: true, 
  createdAt: true, 
  updatedAt: true,
  statusUpdatedAt: true,
  assignedAt: true,
  enRouteAt: true,
  arrivedAt: true,
  startedAt: true,
  completedAt: true,
  actualDurationMinutes: true,
  workPerformed: true,
  totalCost: true,
  customerSignatureUrl: true,
  customerRating: true,
  customerFeedback: true
});
export const insertJobPhotoSchema = createInsertSchema(jobPhotos).omit({ id: true, uploadedAt: true }).extend({
  technicianId: z.number().optional().nullable(),
});
export const insertJobNoteSchema = createInsertSchema(jobNotes).omit({ id: true, createdAt: true });
export const insertScheduleSchema = createInsertSchema(technicianSchedule).omit({ id: true, createdAt: true });
export const insertPartSchema = createInsertSchema(partsInventory).omit({ id: true });

// --- Types ---
export type Technician = typeof technicians.$inferSelect;
export type InsertTechnician = z.infer<typeof insertTechnicianSchema>;

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;

export type Job = typeof jobs.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;

export type JobPhoto = typeof jobPhotos.$inferSelect;
export type InsertJobPhoto = z.infer<typeof insertJobPhotoSchema>;

export type JobNote = typeof jobNotes.$inferSelect;
export type InsertJobNote = z.infer<typeof insertJobNoteSchema>;

export type TechnicianSchedule = typeof technicianSchedule.$inferSelect;
export type InsertSchedule = z.infer<typeof insertScheduleSchema>;

export type Part = typeof partsInventory.$inferSelect;
export type InsertPart = z.infer<typeof insertPartSchema>;
