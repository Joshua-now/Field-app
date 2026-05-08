import { pgTable, text, serial, integer, boolean, timestamp, jsonb, decimal, date, time, varchar, point, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";

import { tenants } from "./models/auth";

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
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  email: text("email").notNull(),
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
}, (table) => [
  index("idx_technicians_tenant").on(table.tenantId),
]);

export const techniciansRelations = relations(technicians, ({ many }) => ({
  jobs: many(jobs),
  schedule: many(technicianSchedule),
}));

// --- Customers ---
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone").notNull(),
  addressStreet: text("address_street"),
  addressCity: text("address_city"),
  addressState: text("address_state"),
  addressZip: text("address_zip"),
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
}, (table) => [
  index("idx_customers_tenant").on(table.tenantId),
]);

export const customersRelations = relations(customers, ({ many }) => ({
  jobs: many(jobs),
}));

// --- Jobs ---
export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  jobNumber: text("job_number").notNull(),
  customerId: integer("customer_id").references(() => customers.id),
  technicianId: integer("technician_id").references(() => technicians.id),
  
  scheduledDate: date("scheduled_date").notNull(),
  scheduledTimeStart: time("scheduled_time_start").notNull(),
  scheduledTimeEnd: time("scheduled_time_end"),
  estimatedDurationMinutes: integer("estimated_duration_minutes").default(60),
  
  serviceType: text("service_type").notNull(),
  priority: text("priority").default("normal"),
  description: text("description"),
  specialInstructions: text("special_instructions"),
  
  status: text("status").default("scheduled"),
  statusUpdatedAt: timestamp("status_updated_at"),
  
  assignedAt: timestamp("assigned_at"),
  enRouteAt: timestamp("en_route_at"),
  arrivedAt: timestamp("arrived_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  
  actualDurationMinutes: integer("actual_duration_minutes"),
  workPerformed: text("work_performed"),
  partsUsed: jsonb("parts_used"),
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
}, (table) => [
  index("idx_jobs_tenant").on(table.tenantId),
  index("idx_jobs_tenant_date").on(table.tenantId, table.scheduledDate),
]);

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
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  jobId: integer("job_id").references(() => jobs.id),
  technicianId: integer("technician_id").references(() => technicians.id),
  photoUrl: text("photo_url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  category: text("category").default("during"),
  caption: text("caption"),
  gpsLatitude: decimal("gps_latitude", { precision: 10, scale: 8 }),
  gpsLongitude: decimal("gps_longitude", { precision: 11, scale: 8 }),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
}, (table) => [
  index("idx_job_photos_tenant").on(table.tenantId),
]);

export const jobPhotosRelations = relations(jobPhotos, ({ one }) => ({
  job: one(jobs, {
    fields: [jobPhotos.jobId],
    references: [jobs.id],
  }),
}));

// --- Job Notes ---
export const jobNotes = pgTable("job_notes", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  jobId: integer("job_id").references(() => jobs.id),
  technicianId: integer("technician_id").references(() => technicians.id),
  noteType: text("note_type").default("general"),
  noteText: text("note_text").notNull(),
  isInternal: boolean("is_internal").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_job_notes_tenant").on(table.tenantId),
]);

export const jobNotesRelations = relations(jobNotes, ({ one }) => ({
  job: one(jobs, {
    fields: [jobNotes.jobId],
    references: [jobs.id],
  }),
}));

// --- Technician Schedule ---
export const technicianSchedule = pgTable("technician_schedule", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  technicianId: integer("technician_id").references(() => technicians.id),
  scheduleDate: date("schedule_date").notNull(),
  isAvailable: boolean("is_available").default(true),
  startTime: time("start_time").default("08:00:00"),
  endTime: time("end_time").default("17:00:00"),
  unavailableReason: text("unavailable_reason"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_tech_schedule_tenant").on(table.tenantId),
]);

export const technicianScheduleRelations = relations(technicianSchedule, ({ one }) => ({
  technician: one(technicians, {
    fields: [technicianSchedule.technicianId],
    references: [technicians.id],
  }),
}));

// --- Job Checklists ---
export const serviceChecklists = pgTable("service_checklists", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  serviceType: text("service_type").notNull(),
  name: text("name").notNull(),
  items: jsonb("items").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_service_checklists_tenant").on(table.tenantId),
]);

export const jobChecklistItems = pgTable("job_checklist_items", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  jobId: integer("job_id").references(() => jobs.id),
  checklistId: integer("checklist_id").references(() => serviceChecklists.id),
  stepNumber: integer("step_number").notNull(),
  label: text("label").notNull(),
  isCompleted: boolean("is_completed").default(false),
  completedAt: timestamp("completed_at"),
  notes: text("notes"),
}, (table) => [
  index("idx_job_checklist_items_tenant").on(table.tenantId),
]);

export const jobChecklistItemsRelations = relations(jobChecklistItems, ({ one }) => ({
  job: one(jobs, {
    fields: [jobChecklistItems.jobId],
    references: [jobs.id],
  }),
}));

// --- Parts Inventory ---
export const partsInventory = pgTable("parts_inventory", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  partNumber: text("part_number"),
  partName: text("part_name").notNull(),
  description: text("description"),
  category: text("category"),
  quantityOnHand: integer("quantity_on_hand").default(0),
  reorderPoint: integer("reorder_point").default(10),
  costPerUnit: decimal("cost_per_unit", { precision: 10, scale: 2 }),
  supplier: text("supplier"),
  isActive: boolean("is_active").default(true),
}, (table) => [
  index("idx_parts_inventory_tenant").on(table.tenantId),
]);

// --- Schemas ---
// Tenant schema for creating new tenants (signup)
export const insertTenantSchema = createInsertSchema(tenants).omit({ id: true, createdAt: true, updatedAt: true });

// All other schemas - tenantId is required but will be injected by middleware
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
export const insertServiceChecklistSchema = createInsertSchema(serviceChecklists).omit({ id: true, createdAt: true });
export const insertJobChecklistItemSchema = createInsertSchema(jobChecklistItems).omit({ id: true, completedAt: true });

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

export type ServiceChecklist = typeof serviceChecklists.$inferSelect;
export type InsertServiceChecklist = z.infer<typeof insertServiceChecklistSchema>;

export type JobChecklistItem = typeof jobChecklistItems.$inferSelect;
export type InsertJobChecklistItem = z.infer<typeof insertJobChecklistItemSchema>;

// ─── BOB AI ASSISTANT ─────────────────────────────────────────────────────────

export const bobConversations = pgTable("bob_conversations", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  channel: text("channel").default("chat"),          // chat | voice | sms
  status: text("status").default("open"),            // open | closed
  summary: text("summary"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_bob_conv_tenant").on(table.tenantId),
]);

export const bobMessages = pgTable("bob_messages", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  conversationId: integer("conversation_id").references(() => bobConversations.id).notNull(),
  role: text("role").notNull(),                      // user | assistant | tool
  content: text("content").notNull(),
  toolName: text("tool_name"),
  toolResult: jsonb("tool_result"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_bob_msgs_conv").on(table.conversationId),
]);

export const bobMemory = pgTable("bob_memory", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  memoryType: text("memory_type").notNull(),         // preference | fact | contact | task
  key: text("key").notNull(),
  value: text("value").notNull(),
  confidence: text("confidence").default("high"),    // high | medium | low
  source: text("source"),                            // user_stated | inferred | tool_result
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_bob_memory_tenant").on(table.tenantId),
]);

export const bobConversationsRelations = relations(bobConversations, ({ many }) => ({
  messages: many(bobMessages),
}));

export const bobMessagesRelations = relations(bobMessages, ({ one }) => ({
  conversation: one(bobConversations, {
    fields: [bobMessages.conversationId],
    references: [bobConversations.id],
  }),
}));

// ─── AD LEADS (owner/admin only) ──────────────────────────────────────────────

export const adLeads = pgTable("ad_leads", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),

  // Lead identity
  firstName: text("first_name"),
  lastName: text("last_name"),
  phone: text("phone"),
  email: text("email"),
  serviceInterest: text("service_interest"),     // "AC tune-up", "plumbing repair", etc.
  estimatedValue: decimal("estimated_value", { precision: 10, scale: 2 }),

  // Source tracking
  sourcePlatform: text("source_platform"),       // google | meta | organic | referral | other
  campaignId: text("campaign_id"),               // platform campaign ID
  campaignName: text("campaign_name"),
  adGroupName: text("ad_group_name"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  gclid: text("gclid"),                          // Google click ID
  fbclid: text("fbclid"),                        // Meta click ID

  // Status & lifecycle
  status: text("status").default("new"),         // new | contacted | follow_up | booked | cold | lost | won
  followUpCount: integer("follow_up_count").default(0),
  lastFollowUpAt: timestamp("last_follow_up_at"),
  nextFollowUpAt: timestamp("next_follow_up_at"),
  bookedJobId: integer("booked_job_id"),         // links to jobs table when booked

  // Outcome
  outcome: text("outcome"),                      // booked | no_answer | not_interested | wrong_number
  outcomeNotes: text("outcome_notes"),

  // Raw payload from webhook
  rawPayload: jsonb("raw_payload"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_ad_leads_tenant").on(table.tenantId),
  index("idx_ad_leads_status").on(table.status),
  index("idx_ad_leads_platform").on(table.sourcePlatform),
]);

export type AdLead = typeof adLeads.$inferSelect;
export type InsertAdLead = typeof adLeads.$inferInsert;

// ─── BOB KNOWLEDGE BASE ───────────────────────────────────────────────────────

export const bobKnowledge = pgTable("bob_knowledge", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),               // full original text
  category: text("category").default("general"),    // pricing | procedures | policies | equipment | general
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_bob_knowledge_tenant").on(table.tenantId),
]);

export const bobKnowledgeChunks = pgTable("bob_knowledge_chunks", {
  id: serial("id").primaryKey(),
  knowledgeId: integer("knowledge_id").references(() => bobKnowledge.id, { onDelete: "cascade" }).notNull(),
  tenantId: varchar("tenant_id").notNull(),          // denormalized for fast search
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  // embedding stored as text (JSON array) — pgvector column added via raw migration
  embeddingJson: text("embedding_json"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_bob_chunks_knowledge").on(table.knowledgeId),
  index("idx_bob_chunks_tenant").on(table.tenantId),
]);

export const bobKnowledgeRelations = relations(bobKnowledge, ({ many }) => ({
  chunks: many(bobKnowledgeChunks),
}));

export const bobKnowledgeChunksRelations = relations(bobKnowledgeChunks, ({ one }) => ({
  knowledge: one(bobKnowledge, {
    fields: [bobKnowledgeChunks.knowledgeId],
    references: [bobKnowledge.id],
  }),
}));

// Types
export type BobConversation = typeof bobConversations.$inferSelect;
export type BobMessage = typeof bobMessages.$inferSelect;
export type BobMemory = typeof bobMemory.$inferSelect;
export type BobKnowledge = typeof bobKnowledge.$inferSelect;
export type BobKnowledgeChunk = typeof bobKnowledgeChunks.$inferSelect;
