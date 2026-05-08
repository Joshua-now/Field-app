import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, timestamp, varchar, text, boolean } from "drizzle-orm/pg-core";

// ─── TENANTS ─────────────────────────────────────────────────────────────────
// Each contractor company is one tenant — fully isolated data
export const tenants = pgTable("tenants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyName: text("company_name").notNull(),
  slug: text("slug").unique().notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  addressStreet: text("address_street"),
  addressCity: text("address_city"),
  addressState: text("address_state"),
  addressZip: text("address_zip"),
  logoUrl: text("logo_url"),
  planTier: text("plan_tier").default("free"),       // free | starter | pro | enterprise
  status: text("status").default("active"),           // active | inactive | suspended
  bobEnabled: boolean("bob_enabled").default(false),
  briefingEnabled: boolean("briefing_enabled").default(false), // opt-in for morning/evening voice briefings
  telnyxPhone: text("telnyx_phone"),
  ghlLocationId: text("ghl_location_id"),
  n8nBaseUrl: text("n8n_base_url"),
  settings: jsonb("settings"),                        // { timezone, serviceTypes, branding }
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = typeof tenants.$inferInsert;

// ─── USERS (Office Staff / Dispatchers / Admins) ─────────────────────────────
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  email: varchar("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: text("role").default("staff"),               // owner | admin | dispatcher | staff
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_users_tenant").on(table.tenantId),
  index("idx_users_email").on(table.email),
]);

export type User = typeof users.$inferSelect;
export type UpsertUser = typeof users.$inferInsert;
