CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text NOT NULL,
	"address_street" text,
	"address_city" text,
	"address_state" text,
	"address_zip" text,
	"address_lat" numeric(10, 8),
	"address_lng" numeric(11, 8),
	"gate_code" text,
	"access_notes" text,
	"preferred_contact_method" text DEFAULT 'phone',
	"customer_since" date,
	"total_jobs_completed" integer DEFAULT 0,
	"lifetime_value" numeric(10, 2) DEFAULT '0',
	"average_rating" numeric(3, 2),
	"tags" text[],
	"notes" text,
	"gohighlevel_id" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "job_checklist_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar NOT NULL,
	"job_id" integer,
	"checklist_id" integer,
	"step_number" integer NOT NULL,
	"label" text NOT NULL,
	"is_completed" boolean DEFAULT false,
	"completed_at" timestamp,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "job_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar NOT NULL,
	"job_id" integer,
	"technician_id" integer,
	"note_type" text DEFAULT 'general',
	"note_text" text NOT NULL,
	"is_internal" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "job_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar NOT NULL,
	"job_id" integer,
	"technician_id" integer,
	"photo_url" text NOT NULL,
	"thumbnail_url" text,
	"category" text DEFAULT 'during',
	"caption" text,
	"gps_latitude" numeric(10, 8),
	"gps_longitude" numeric(11, 8),
	"uploaded_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar NOT NULL,
	"job_number" text NOT NULL,
	"customer_id" integer,
	"technician_id" integer,
	"scheduled_date" date NOT NULL,
	"scheduled_time_start" time NOT NULL,
	"scheduled_time_end" time,
	"estimated_duration_minutes" integer DEFAULT 60,
	"service_type" text NOT NULL,
	"priority" text DEFAULT 'normal',
	"description" text,
	"special_instructions" text,
	"status" text DEFAULT 'scheduled',
	"status_updated_at" timestamp,
	"assigned_at" timestamp,
	"en_route_at" timestamp,
	"arrived_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"actual_duration_minutes" integer,
	"work_performed" text,
	"parts_used" jsonb,
	"total_cost" numeric(10, 2),
	"customer_signature_url" text,
	"customer_rating" integer,
	"customer_feedback" text,
	"requires_followup" boolean DEFAULT false,
	"followup_date" date,
	"followup_reason" text,
	"gohighlevel_appointment_id" text,
	"invoice_id" text,
	"payment_status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "parts_inventory" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar NOT NULL,
	"part_number" text,
	"part_name" text NOT NULL,
	"description" text,
	"category" text,
	"quantity_on_hand" integer DEFAULT 0,
	"reorder_point" integer DEFAULT 10,
	"cost_per_unit" numeric(10, 2),
	"supplier" text,
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "service_checklists" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar NOT NULL,
	"service_type" text NOT NULL,
	"name" text NOT NULL,
	"items" jsonb NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "technician_schedule" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar NOT NULL,
	"technician_id" integer,
	"schedule_date" date NOT NULL,
	"is_available" boolean DEFAULT true,
	"start_time" time DEFAULT '08:00:00',
	"end_time" time DEFAULT '17:00:00',
	"unavailable_reason" text,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "technicians" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone" text NOT NULL,
	"employee_id" text,
	"specialties" text[],
	"certifications" text[],
	"is_active" boolean DEFAULT true,
	"current_location_lat" numeric(10, 8),
	"current_location_lng" numeric(11, 8),
	"last_location_update" timestamp,
	"profile_photo_url" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" text NOT NULL,
	"slug" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"address_street" text,
	"address_city" text,
	"address_state" text,
	"address_zip" text,
	"logo_url" text,
	"plan_tier" text DEFAULT 'free',
	"status" text DEFAULT 'active',
	"settings" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"tenant_id" varchar,
	"role" text DEFAULT 'staff',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_checklist_items" ADD CONSTRAINT "job_checklist_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_checklist_items" ADD CONSTRAINT "job_checklist_items_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_checklist_items" ADD CONSTRAINT "job_checklist_items_checklist_id_service_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."service_checklists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_notes" ADD CONSTRAINT "job_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_notes" ADD CONSTRAINT "job_notes_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_notes" ADD CONSTRAINT "job_notes_technician_id_technicians_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."technicians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_photos" ADD CONSTRAINT "job_photos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_photos" ADD CONSTRAINT "job_photos_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_photos" ADD CONSTRAINT "job_photos_technician_id_technicians_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."technicians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_technician_id_technicians_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."technicians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parts_inventory" ADD CONSTRAINT "parts_inventory_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_checklists" ADD CONSTRAINT "service_checklists_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technician_schedule" ADD CONSTRAINT "technician_schedule_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technician_schedule" ADD CONSTRAINT "technician_schedule_technician_id_technicians_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."technicians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technicians" ADD CONSTRAINT "technicians_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_customers_tenant" ON "customers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_job_checklist_items_tenant" ON "job_checklist_items" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_job_notes_tenant" ON "job_notes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_job_photos_tenant" ON "job_photos" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_jobs_tenant" ON "jobs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_jobs_tenant_date" ON "jobs" USING btree ("tenant_id","scheduled_date");--> statement-breakpoint
CREATE INDEX "idx_parts_inventory_tenant" ON "parts_inventory" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_service_checklists_tenant" ON "service_checklists" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_tech_schedule_tenant" ON "technician_schedule" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_technicians_tenant" ON "technicians" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");