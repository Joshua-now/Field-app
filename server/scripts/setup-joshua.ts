/**
 * server/scripts/setup-joshua.ts
 * One-time script to create the Fluid Productions tenant + Joshua's owner account.
 * Run with: railway run npx tsx server/scripts/setup-joshua.ts
 */

import { db } from "../db";
import { tenants, users } from "@shared/models/auth";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const OWNER_EMAIL    = "jbbrown09@gmail.com";
const OWNER_PASSWORD = "FluidAI2024!";   // Joshua can change this in Settings
const COMPANY_NAME   = "Fluid Productions";
const COMPANY_PHONE  = "";
const PLAN_TIER      = "pro";

async function setup() {
  console.log("🚀 Setting up Fluid Productions tenant...\n");

  // ── Check if already exists ───────────────────────────────────────────────
  const [existing] = await db.select().from(users).where(eq(users.email, OWNER_EMAIL));
  if (existing) {
    console.log(`✓ Account already exists for ${OWNER_EMAIL}`);
    console.log(`  Tenant ID : ${existing.tenantId}`);
    console.log(`  User ID   : ${existing.id}`);
    console.log(`  Role      : ${existing.role}`);
    console.log("\n✅ Nothing to do — login at your app URL with:");
    console.log(`   Email   : ${OWNER_EMAIL}`);
    console.log(`   Password: ${OWNER_PASSWORD}  (if this is a fresh install)`);
    process.exit(0);
  }

  // ── Create tenant ─────────────────────────────────────────────────────────
  const slug = "fluid-productions-" + Date.now().toString(36);

  const [tenant] = await db.insert(tenants).values({
    companyName:          COMPANY_NAME,
    slug,
    email:                OWNER_EMAIL,
    phone:                COMPANY_PHONE,
    planTier:             PLAN_TIER,
    status:               "active",
    onboardingCompleted:  true,   // skip wizard — you ARE the wizard
    bobEnabled:           true,
    briefingEnabled:      true,
  } as any).returning();

  console.log(`✓ Tenant created: "${COMPANY_NAME}"`);
  console.log(`  ID   : ${tenant.id}`);
  console.log(`  Slug : ${tenant.slug}`);

  // ── Create owner user ─────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash(OWNER_PASSWORD, 10);

  const [user] = await db.insert(users).values({
    tenantId:     tenant.id,
    email:        OWNER_EMAIL,
    passwordHash,
    firstName:    "Joshua",
    lastName:     "Brown",
    role:         "owner",
    isActive:     true,
  }).returning();

  console.log(`✓ Owner account created`);
  console.log(`  Email : ${user.email}`);
  console.log(`  Role  : ${user.role}`);

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log("\n✅ Fluid Productions is live!\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Email    : ${OWNER_EMAIL}`);
  console.log(`  Password : ${OWNER_PASSWORD}`);
  console.log(`  Tenant   : ${tenant.id}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\nNext steps:");
  console.log("  1. Log in at your Railway app URL");
  console.log("  2. Run: railway run npx tsx server/scripts/seed-demo.ts");
  console.log("     (adds demo customers, techs, and jobs to your dashboard)");

  process.exit(0);
}

setup().catch((err) => {
  console.error("❌ Setup failed:", err.message);
  process.exit(1);
});
