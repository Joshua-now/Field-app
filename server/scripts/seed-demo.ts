/**
 * Demo seed script — run once to populate the DB with realistic contractor data.
 * Usage: npx tsx server/scripts/seed-demo.ts
 */
import { db } from "../db";
import { technicians, customers, jobs } from "@shared/schema";
import { tenants, users } from "@shared/models/auth";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function seed() {
  console.log("🌱 Starting demo seed...\n");

  // ── 1. Find the first tenant ──────────────────────────────────────────────
  const allTenants = await db.select().from(tenants).limit(1);
  if (allTenants.length === 0) {
    console.error("❌ No tenants found. Register an account first, then run this seed.");
    process.exit(1);
  }
  const tenant = allTenants[0];
  console.log(`✓ Using tenant: "${tenant.companyName}" (${tenant.id})\n`);

  // ── 2. Technicians ────────────────────────────────────────────────────────
  console.log("Creating technicians...");
  const pwHash = await bcrypt.hash("demo1234", 10);

  const [marcus, priya, darnell] = await Promise.all([
    db.insert(technicians).values({
      tenantId: tenant.id,
      email: "marcus.hayes@demo.com",
      passwordHash: pwHash,
      firstName: "Marcus",
      lastName: "Hayes",
      phone: "(813) 555-0142",
      employeeId: "TECH-001",
      specialties: ["HVAC", "Refrigeration"],
      certifications: ["EPA 608", "NATE Certified"],
      isActive: true,
    }).returning().then(r => r[0]),

    db.insert(technicians).values({
      tenantId: tenant.id,
      email: "priya.nguyen@demo.com",
      passwordHash: pwHash,
      firstName: "Priya",
      lastName: "Nguyen",
      phone: "(813) 555-0187",
      employeeId: "TECH-002",
      specialties: ["Plumbing", "Water Heaters"],
      certifications: ["Florida Plumbing License"],
      isActive: true,
    }).returning().then(r => r[0]),

    db.insert(technicians).values({
      tenantId: tenant.id,
      email: "darnell.brooks@demo.com",
      passwordHash: pwHash,
      firstName: "Darnell",
      lastName: "Brooks",
      phone: "(813) 555-0231",
      employeeId: "TECH-003",
      specialties: ["Electrical", "Generators"],
      certifications: ["Florida Electrical License"],
      isActive: true,
    }).returning().then(r => r[0]),
  ]);

  console.log(`  ✓ Marcus Hayes (TECH-001) — HVAC`);
  console.log(`  ✓ Priya Nguyen (TECH-002) — Plumbing`);
  console.log(`  ✓ Darnell Brooks (TECH-003) — Electrical\n`);

  // ── 3. Customers ──────────────────────────────────────────────────────────
  console.log("Creating customers...");
  const today = new Date().toISOString().split("T")[0];

  const [linda, bob, carol, james, patricia] = await Promise.all([
    db.insert(customers).values({
      tenantId: tenant.id,
      firstName: "Linda",
      lastName: "Carver",
      email: "linda.carver@gmail.com",
      phone: "(813) 555-1201",
      addressStreet: "4821 Palma Ceia Dr",
      addressCity: "Tampa",
      addressState: "FL",
      addressZip: "33629",
      preferredContactMethod: "phone",
      tags: ["VIP", "Repeat"],
      notes: "Has two AC units — always ask about the upstairs unit.",
      customerSince: "2023-03-15",
      totalJobsCompleted: 7,
      lifetimeValue: "2840.00",
    }).returning().then(r => r[0]),

    db.insert(customers).values({
      tenantId: tenant.id,
      firstName: "Bob",
      lastName: "Stanton",
      email: "bstanton@outlook.com",
      phone: "(813) 555-0934",
      addressStreet: "1102 Bayshore Blvd",
      addressCity: "Tampa",
      addressState: "FL",
      addressZip: "33606",
      gateCode: "#4421",
      preferredContactMethod: "email",
      tags: ["Commercial"],
      notes: "Condo unit 8B. Park in visitor spot, gate code #4421.",
      customerSince: "2024-01-08",
      totalJobsCompleted: 3,
      lifetimeValue: "1150.00",
    }).returning().then(r => r[0]),

    db.insert(customers).values({
      tenantId: tenant.id,
      firstName: "Carol",
      lastName: "Mendez",
      email: "carol.mendez@yahoo.com",
      phone: "(813) 555-2876",
      addressStreet: "7603 Gunn Hwy",
      addressCity: "Tampa",
      addressState: "FL",
      addressZip: "33625",
      preferredContactMethod: "text",
      tags: ["New Customer"],
      notes: "Referred by Linda Carver. Prefers text messages.",
      customerSince: today,
      totalJobsCompleted: 0,
      lifetimeValue: "0.00",
    }).returning().then(r => r[0]),

    db.insert(customers).values({
      tenantId: tenant.id,
      firstName: "James",
      lastName: "Whitfield",
      email: "jwhitfield@protonmail.com",
      phone: "(813) 555-3318",
      addressStreet: "2250 N Dale Mabry Hwy",
      addressCity: "Tampa",
      addressState: "FL",
      addressZip: "33607",
      accessNotes: "Dog in yard — call before entering gate.",
      preferredContactMethod: "phone",
      tags: ["Repeat"],
      notes: "Has a pit bull named Zeus. Call ahead.",
      customerSince: "2023-11-20",
      totalJobsCompleted: 4,
      lifetimeValue: "1890.00",
    }).returning().then(r => r[0]),

    db.insert(customers).values({
      tenantId: tenant.id,
      firstName: "Patricia",
      lastName: "Drummond",
      email: "pat.drummond@gmail.com",
      phone: "(813) 555-4502",
      addressStreet: "9312 Lazy Lane",
      addressCity: "Tampa",
      addressState: "FL",
      addressZip: "33614",
      preferredContactMethod: "phone",
      tags: ["Senior", "VIP"],
      notes: "Elderly customer, needs extra time for explanations. Always send an ETA.",
      customerSince: "2022-06-10",
      totalJobsCompleted: 12,
      lifetimeValue: "4200.00",
    }).returning().then(r => r[0]),
  ]);

  console.log(`  ✓ Linda Carver — VIP repeat customer`);
  console.log(`  ✓ Bob Stanton — Condo, gate code #4421`);
  console.log(`  ✓ Carol Mendez — New customer`);
  console.log(`  ✓ James Whitfield — Dog in yard, call ahead`);
  console.log(`  ✓ Patricia Drummond — Senior VIP\n`);

  // ── 4. Jobs ───────────────────────────────────────────────────────────────
  console.log("Creating jobs...");

  // Date helpers
  const d = (offsetDays: number) => {
    const dt = new Date();
    dt.setDate(dt.getDate() + offsetDays);
    return dt.toISOString().split("T")[0];
  };

  await Promise.all([
    // Today — in progress
    db.insert(jobs).values({
      tenantId: tenant.id,
      jobNumber: "JOB-2405-001",
      customerId: linda.id,
      technicianId: marcus.id,
      scheduledDate: d(0),
      scheduledTimeStart: "09:00:00",
      scheduledTimeEnd: "11:00:00",
      estimatedDurationMinutes: 120,
      serviceType: "HVAC Maintenance",
      priority: "normal",
      description: "Annual AC tune-up. Check refrigerant levels, clean coils, replace filter. Customer reports unit making a clicking noise on startup.",
      specialInstructions: "Check both units — upstairs and downstairs.",
      status: "in_progress",
      startedAt: new Date(),
      totalCost: "185.00",
      paymentStatus: "pending",
    }),

    // Today — en route
    db.insert(jobs).values({
      tenantId: tenant.id,
      jobNumber: "JOB-2405-002",
      customerId: bob.id,
      technicianId: priya.id,
      scheduledDate: d(0),
      scheduledTimeStart: "11:30:00",
      scheduledTimeEnd: "13:00:00",
      estimatedDurationMinutes: 90,
      serviceType: "Plumbing Repair",
      priority: "urgent",
      description: "Slow drain in master bath, possible partial blockage. Customer reports water pooling for 5+ minutes.",
      specialInstructions: "Condo 8B — gate code #4421, visitor parking.",
      status: "en_route",
      enRouteAt: new Date(),
      totalCost: "225.00",
      paymentStatus: "pending",
    }),

    // Today — scheduled (afternoon)
    db.insert(jobs).values({
      tenantId: tenant.id,
      jobNumber: "JOB-2405-003",
      customerId: carol.id,
      technicianId: marcus.id,
      scheduledDate: d(0),
      scheduledTimeStart: "14:00:00",
      scheduledTimeEnd: "15:30:00",
      estimatedDurationMinutes: 90,
      serviceType: "AC Installation",
      priority: "normal",
      description: "Install new Carrier 3-ton mini-split in living room. Unit is on-site. First-time customer.",
      status: "scheduled",
      totalCost: "1850.00",
      paymentStatus: "invoiced",
    }),

    // Tomorrow — scheduled
    db.insert(jobs).values({
      tenantId: tenant.id,
      jobNumber: "JOB-2405-004",
      customerId: james.id,
      technicianId: darnell.id,
      scheduledDate: d(1),
      scheduledTimeStart: "08:00:00",
      scheduledTimeEnd: "10:00:00",
      estimatedDurationMinutes: 120,
      serviceType: "Electrical Inspection",
      priority: "normal",
      description: "Annual electrical panel inspection. Customer is adding a hot tub and wants circuit capacity checked.",
      specialInstructions: "Dog in yard — call customer before entering gate.",
      status: "scheduled",
      totalCost: "350.00",
      paymentStatus: "pending",
    }),

    // Tomorrow — scheduled
    db.insert(jobs).values({
      tenantId: tenant.id,
      jobNumber: "JOB-2405-005",
      customerId: patricia.id,
      technicianId: priya.id,
      scheduledDate: d(1),
      scheduledTimeStart: "10:30:00",
      scheduledTimeEnd: "12:00:00",
      estimatedDurationMinutes: 90,
      serviceType: "Water Heater Replacement",
      priority: "urgent",
      description: "40-gallon water heater is leaking from the bottom. Unit is 11 years old, customer approved replacement.",
      specialInstructions: "Senior customer — send ETA text 30 min before arrival. Take extra time to explain everything.",
      status: "scheduled",
      totalCost: "1240.00",
      paymentStatus: "invoiced",
    }),

    // Day after tomorrow
    db.insert(jobs).values({
      tenantId: tenant.id,
      jobNumber: "JOB-2405-006",
      customerId: linda.id,
      technicianId: darnell.id,
      scheduledDate: d(2),
      scheduledTimeStart: "09:00:00",
      scheduledTimeEnd: "11:00:00",
      estimatedDurationMinutes: 120,
      serviceType: "Generator Installation",
      priority: "normal",
      description: "Install whole-home Generac 22kW standby generator. Generator delivered last week, on-site in garage.",
      status: "scheduled",
      totalCost: "3200.00",
      paymentStatus: "invoiced",
    }),

    // Completed yesterday
    db.insert(jobs).values({
      tenantId: tenant.id,
      jobNumber: "JOB-2405-007",
      customerId: james.id,
      technicianId: marcus.id,
      scheduledDate: d(-1),
      scheduledTimeStart: "10:00:00",
      scheduledTimeEnd: "12:00:00",
      estimatedDurationMinutes: 120,
      serviceType: "HVAC Repair",
      priority: "urgent",
      description: "AC not cooling — found refrigerant leak at evaporator coil. Repaired leak and recharged with R-410A.",
      status: "completed",
      completedAt: new Date(Date.now() - 86400000),
      actualDurationMinutes: 105,
      workPerformed: "Located refrigerant leak at evaporator coil fitting. Applied leak stop sealant, re-soldered joint, pressure tested, recharged with 2 lbs R-410A. System now cooling properly at 72°F.",
      totalCost: "485.00",
      paymentStatus: "paid",
      customerRating: 5,
      customerFeedback: "Marcus was awesome — on time, explained everything, and the AC is ice cold now!",
    }),

    // Completed 3 days ago
    db.insert(jobs).values({
      tenantId: tenant.id,
      jobNumber: "JOB-2405-008",
      customerId: patricia.id,
      technicianId: priya.id,
      scheduledDate: d(-3),
      scheduledTimeStart: "09:30:00",
      scheduledTimeEnd: "11:00:00",
      estimatedDurationMinutes: 90,
      serviceType: "Drain Cleaning",
      priority: "normal",
      description: "Main line slow drain. Hydro-jet service to clear buildup.",
      status: "completed",
      completedAt: new Date(Date.now() - 3 * 86400000),
      actualDurationMinutes: 80,
      workPerformed: "Ran camera — significant grease buildup at 35ft. Hydro-jet cleared the blockage. Advised customer on enzyme treatment monthly.",
      totalCost: "320.00",
      paymentStatus: "paid",
      customerRating: 4,
      customerFeedback: "Very professional. Priya explained exactly what she found.",
      requiresFollowup: true,
      followupDate: d(27),
      followupReason: "30-day drain check — per customer agreement after hydro-jet",
    }),
  ]);

  console.log(`  ✓ JOB-2405-001 — Linda Carver / Marcus / HVAC Maintenance [in_progress]`);
  console.log(`  ✓ JOB-2405-002 — Bob Stanton / Priya / Plumbing Repair [en_route]`);
  console.log(`  ✓ JOB-2405-003 — Carol Mendez / Marcus / AC Installation [scheduled today]`);
  console.log(`  ✓ JOB-2405-004 — James Whitfield / Darnell / Electrical Inspection [tomorrow]`);
  console.log(`  ✓ JOB-2405-005 — Patricia Drummond / Priya / Water Heater [tomorrow]`);
  console.log(`  ✓ JOB-2405-006 — Linda Carver / Darnell / Generator Install [day after]`);
  console.log(`  ✓ JOB-2405-007 — James Whitfield / Marcus / HVAC Repair [completed ★★★★★]`);
  console.log(`  ✓ JOB-2405-008 — Patricia Drummond / Priya / Drain Cleaning [completed ★★★★]`);

  console.log(`\n✅ Demo seed complete!`);
  console.log(`   3 technicians | 5 customers | 8 jobs`);
  console.log(`\nTechnician login PIN (all): demo1234`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
