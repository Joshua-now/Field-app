/**
 * Bob — AI Field Operations Assistant
 * Audit Pass: Field-ready agent with real data access + safety guardrails
 *
 * Tool categories:
 *   FIELD READS  — safe, no confirmation: schedule, job detail, customer lookup
 *   FIELD WRITES — require confirmation before calling: SMS, status update, job note
 *   INFRA        — system status, n8n, Instantly, GHL
 */

import axios from "axios";
import { db } from "../db";
import {
  bobMessages, bobConversations, tenants, users,
  jobs, customers, technicians, jobNotes,
} from "@shared/schema";
import { eq, and, ilike, or } from "drizzle-orm";

// ─── MODEL ROUTING ────────────────────────────────────────────────────────────
const MODELS = {
  fast:   "openai/gpt-4o-mini",
  sonnet: "anthropic/claude-sonnet-4-5-20250929",
  opus:   "anthropic/claude-opus-4-5-20251101",
} as const;

const SIMPLE_KW = [
  "status","hi","hello","hey","yes","no","thanks","ok",
  "what","who","when","where","how many","check",
  "job","schedule","address","customer","next","today",
  "time","phone","note","text","send","update","complete",
];
const COMPLEX_KW = ["analyze","compare","strategy","plan","why is","root cause","recommend","invoice"];

function selectModel(input: string): string {
  const s = input.toLowerCase().trim();
  if (s.length < 150 && SIMPLE_KW.some(k => s.includes(k))) return MODELS.fast;
  if (COMPLEX_KW.some(k => s.includes(k))) return MODELS.opus;
  return MODELS.sonnet;
}

// ─── FIELD DATA TOOLS ─────────────────────────────────────────────────────────

async function getTodaySchedule(tenantId: string, technicianName?: string): Promise<any> {
  try {
    // Use local date in Eastern time (UTC-4/UTC-5) — railway runs UTC so we need offset
    const now = new Date();
    // Prefer TIMEZONE env var (e.g. "America/New_York"); fall back to UTC
    const tz = process.env.TENANT_TIMEZONE || "America/New_York";
    const today = now.toLocaleDateString("en-CA", { timeZone: tz }); // "YYYY-MM-DD" format
    const result = await db.query.jobs.findMany({
      where: and(eq(jobs.tenantId, tenantId), eq(jobs.scheduledDate, today)),
      with: { customer: true, technician: true },
      orderBy: (j: any, { asc }: any) => [asc(j.scheduledTimeStart)],
    }) as any[];

    let filtered = result;
    if (technicianName) {
      const name = technicianName.toLowerCase();
      filtered = filtered.filter((j: any) =>
        j.technician && (
          (j.technician.firstName || "").toLowerCase().includes(name) ||
          (j.technician.lastName  || "").toLowerCase().includes(name)
        )
      );
    }

    if (filtered.length === 0) {
      return { jobs: [], message: technicianName ? `No jobs today for ${technicianName}.` : "No jobs scheduled for today." };
    }

    return {
      date: today,
      totalJobs: filtered.length,
      active: filtered.filter((j: any) => ["in_progress","en_route","arrived"].includes(j.status || "")).length,
      jobs: filtered.map((j: any) => ({
        jobNumber: j.jobNumber,
        id: j.id,
        serviceType: j.serviceType,
        status: j.status || "scheduled",
        time: (j.scheduledTimeStart || "").slice(0, 5),
        customer: j.customer ? `${j.customer.firstName} ${j.customer.lastName}` : "Unknown",
        customerId: j.customer?.id,
        customerPhone: j.customer?.phone,
        address: j.customer
          ? `${j.customer.addressStreet || ""}, ${j.customer.addressCity || ""}`
          : "No address on file",
        technician: j.technician
          ? `${j.technician.firstName} ${j.technician.lastName}`
          : "Unassigned",
        priority: j.priority || "normal",
        specialInstructions: j.specialInstructions || null,
      })),
    };
  } catch (e: any) {
    return { error: `Failed to load schedule: ${e.message}` };
  }
}

async function getJobDetail(tenantId: string, jobNumber: string): Promise<any> {
  try {
    const result = await db.query.jobs.findFirst({
      where: and(eq(jobs.tenantId, tenantId), eq(jobs.jobNumber, jobNumber.toUpperCase())),
      with: { customer: true, technician: true },
    }) as any;

    if (!result) return { error: `Job ${jobNumber} not found.` };

    return {
      jobNumber: result.jobNumber,
      id: result.id,
      serviceType: result.serviceType,
      description: result.description || "No description.",
      status: result.status || "scheduled",
      priority: result.priority || "normal",
      scheduledDate: result.scheduledDate,
      scheduledTime: (result.scheduledTimeStart || "").slice(0, 5),
      estimatedDurationMinutes: result.estimatedDurationMinutes,
      specialInstructions: result.specialInstructions || null,
      requiresFollowup: result.requiresFollowup,
      followupDate: result.followupDate || null,
      totalCost: result.totalCost || "0.00",
      paymentStatus: result.paymentStatus || "pending",
      customer: result.customer ? {
        id: result.customer.id,
        name: `${result.customer.firstName} ${result.customer.lastName}`,
        phone: result.customer.phone,
        email: result.customer.email,
        address: [
          result.customer.addressStreet,
          result.customer.addressCity,
          result.customer.addressState,
          result.customer.addressZip,
        ].filter(Boolean).join(", "),
        gateCode: result.customer.gateCode || null,
        accessNotes: result.customer.accessNotes || null,
        notes: result.customer.notes || null,
        tags: result.customer.tags || [],
      } : null,
      technician: result.technician ? {
        id: result.technician.id,
        name: `${result.technician.firstName} ${result.technician.lastName}`,
        phone: result.technician.phone,
      } : null,
    };
  } catch (e: any) {
    return { error: `Failed to load job: ${e.message}` };
  }
}

async function findCustomer(tenantId: string, name: string): Promise<any> {
  try {
    const term = `%${name.trim()}%`;
    const results = await db.select().from(customers).where(
      and(
        eq(customers.tenantId, tenantId),
        or(
          ilike(customers.firstName, term),
          ilike(customers.lastName, term),
          ilike(customers.phone, term),
          ilike(customers.email, term),
        )
      )
    ).limit(5);

    if (results.length === 0) {
      return { customers: [], message: `No customer found matching "${name}".` };
    }

    return {
      customers: results.map(c => ({
        id: c.id,
        name: `${c.firstName} ${c.lastName}`,
        phone: c.phone,
        email: c.email || null,
        address: [c.addressStreet, c.addressCity, c.addressState, c.addressZip].filter(Boolean).join(", "),
        gateCode: c.gateCode || null,
        accessNotes: c.accessNotes || null,
        notes: c.notes || null,
        totalJobsCompleted: c.totalJobsCompleted || 0,
        lifetimeValue: c.lifetimeValue || "0",
        tags: c.tags || [],
      })),
    };
  } catch (e: any) {
    return { error: `Customer search failed: ${e.message}` };
  }
}

async function updateJobStatusFn(tenantId: string, jobNumber: string, newStatus: string): Promise<any> {
  const validStatuses = ["scheduled","assigned","en_route","arrived","in_progress","completed","cancelled"];
  if (!validStatuses.includes(newStatus)) {
    return { error: `Invalid status "${newStatus}". Valid: ${validStatuses.join(", ")}` };
  }

  try {
    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.tenantId, tenantId), eq(jobs.jobNumber, jobNumber.toUpperCase())),
    });
    if (!job) return { error: `Job ${jobNumber} not found.` };

    const updates: any = {
      status: newStatus,
      statusUpdatedAt: new Date(),
      updatedAt: new Date(),
    };
    if (newStatus === "en_route")    updates.enRouteAt   = new Date();
    if (newStatus === "arrived")     updates.arrivedAt   = new Date();
    if (newStatus === "in_progress") updates.startedAt   = new Date();
    if (newStatus === "completed")   updates.completedAt = new Date();

    await db.update(jobs).set(updates)
      .where(and(eq(jobs.id, job.id), eq(jobs.tenantId, tenantId)));

    return { ok: true, message: `✅ ${jobNumber} marked as "${newStatus}".`, jobNumber, newStatus };
  } catch (e: any) {
    return { error: `Status update failed: ${e.message}` };
  }
}

async function sendSMSToCustomer(
  tenantId: string,
  customerPhone: string,
  customerName: string,
  message: string
): Promise<any> {
  const from = process.env.TELNYX_PHONE_NUMBER;
  if (!from) return { error: "TELNYX_PHONE_NUMBER not configured." };
  if (!process.env.TELNYX_API_KEY) return { error: "TELNYX_API_KEY not configured." };

  // Validate + normalize phone
  const cleaned = customerPhone.replace(/\D/g, "");
  if (cleaned.length < 10) return { error: `Phone number too short: "${customerPhone}"` };
  const to = cleaned.length === 11 && cleaned.startsWith("1")
    ? `+${cleaned}`
    : `+1${cleaned.slice(-10)}`;

  try {
    await axios.post(
      "https://api.telnyx.com/v2/messages",
      { from, to, text: message.slice(0, 1600) },
      { headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}` }, timeout: 12000 }
    );
    return { ok: true, message: `✅ SMS sent to ${customerName} at ${to}.`, to, preview: message.slice(0, 100) };
  } catch (e: any) {
    const detail = e?.response?.data?.errors?.[0]?.detail || e.message;
    return { error: `SMS failed: ${detail}` };
  }
}

async function addJobNoteFn(tenantId: string, jobId: number, noteText: string): Promise<any> {
  try {
    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.tenantId, tenantId)),
    });
    if (!job) return { error: `Job ID ${jobId} not found.` };

    await db.insert(jobNotes).values({
      tenantId,
      jobId,
      noteType: "general",
      noteText: noteText.slice(0, 2000),
      isInternal: false,
    });

    return { ok: true, message: `✅ Note added to ${job.jobNumber}.`, jobNumber: job.jobNumber };
  } catch (e: any) {
    return { error: `Add note failed: ${e.message}` };
  }
}

// ─── EXTERNAL / INFRA TOOLS ───────────────────────────────────────────────────

async function getInstantlyCampaigns() {
  try {
    const r = await axios.get("https://api.instantly.ai/api/v2/campaigns", {
      headers: { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}` },
      params: { limit: 20, skip: 0 },
      timeout: 8000,
    });
    return { ok: true, campaigns: r.data?.campaigns || r.data || [] };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

async function getSwitchboardStatus() {
  const base = process.env.SWITCHBOARD_URL;
  if (!base) return { ok: false, error: "SWITCHBOARD_URL not set" };
  try {
    const r = await axios.get(`${base}/api/status`, {
      headers: { Authorization: `Bearer ${process.env.SWITCHBOARD_API_KEY}` },
      timeout: 8000,
    });
    return { ok: true, data: r.data };
  } catch {
    try {
      const r2 = await axios.get(`${base}/health`, { timeout: 5000 });
      return { ok: true, data: r2.data };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }
}

async function getN8nWorkflows() {
  const base = process.env.N8N_BASE_URL;
  const key  = process.env.N8N_API_KEY;
  if (!base || !key) return { ok: false, error: "N8N_BASE_URL or N8N_API_KEY not set" };
  try {
    const [wfR, exR] = await Promise.all([
      axios.get(`${base}/api/v1/workflows`, { headers: { "X-N8N-API-KEY": key }, params: { limit: 20 }, timeout: 8000 }),
      axios.get(`${base}/api/v1/executions`, { headers: { "X-N8N-API-KEY": key }, params: { limit: 10 }, timeout: 8000 })
        .catch(() => ({ data: { data: [] } })),
    ]);
    return {
      ok: true,
      workflows: (wfR.data?.data || []).map((w: any) => ({ name: w.name, active: w.active, id: w.id })),
      recentExecutions: (exR.data?.data || []).slice(0, 5).map((e: any) => ({
        workflow: e.workflowData?.name || e.workflowId,
        status: e.status,
        startedAt: e.startedAt,
      })),
    };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

async function triggerN8nWorkflow(workflowName: string, action = "restart") {
  const base = process.env.N8N_BASE_URL;
  const key  = process.env.N8N_API_KEY;
  if (!base || !key) return { ok: false, error: "N8N not configured" };
  const headers = { "X-N8N-API-KEY": key };
  const listR = await axios.get(`${base}/api/v1/workflows`, { headers, params: { limit: 50 }, timeout: 8000 });
  const match = (listR.data?.data || []).find((w: any) =>
    w.name.toLowerCase().includes(workflowName.toLowerCase())
  );
  if (!match) return { ok: false, error: `No workflow matching "${workflowName}"` };

  if (action === "activate") {
    await axios.patch(`${base}/api/v1/workflows/${match.id}`, { active: true }, { headers, timeout: 8000 });
    return { ok: true, message: `✅ "${match.name}" activated` };
  }
  if (action === "deactivate") {
    await axios.patch(`${base}/api/v1/workflows/${match.id}`, { active: false }, { headers, timeout: 8000 });
    return { ok: true, message: `⏸ "${match.name}" deactivated` };
  }
  await axios.patch(`${base}/api/v1/workflows/${match.id}`, { active: false }, { headers, timeout: 8000 });
  await new Promise(r => setTimeout(r, 600));
  await axios.patch(`${base}/api/v1/workflows/${match.id}`, { active: true }, { headers, timeout: 8000 });
  return { ok: true, message: `🔄 "${match.name}" restarted` };
}

async function checkRailwayServices() {
  const SERVICES = [
    { name: "n8n",         url: `${process.env.N8N_BASE_URL || "https://n8n-production-5955.up.railway.app"}/healthz` },
    { name: "Switchboard", url: process.env.SWITCHBOARD_URL ? `${process.env.SWITCHBOARD_URL}/health` : null },
    { name: "Field App",   url: `${process.env.SELF_URL || "https://field-app-production-d5c8.up.railway.app"}/api/health` },
  ].filter((s): s is { name: string; url: string } => !!s.url);

  return Promise.all(SERVICES.map(async ({ name, url }) => {
    const t0 = Date.now();
    try {
      const r = await axios.get(url, { timeout: 7000 });
      return { name, status: "online", latencyMs: Date.now() - t0, httpStatus: r.status };
    } catch (e: any) {
      if (e.response && [401, 403, 404].includes(e.response.status))
        return { name, status: "online", latencyMs: Date.now() - t0, httpStatus: e.response.status };
      return { name, status: "offline", latencyMs: Date.now() - t0, error: e.message };
    }
  }));
}

async function searchGHLContacts(name: string) {
  try {
    const r = await axios.get("https://services.leadconnectorhq.com/contacts/search", {
      headers: {
        Authorization: `Bearer ${process.env.GHL_PIT_TOKEN}`,
        "Content-Type": "application/json",
        Version: "2021-07-28",
      },
      params: { locationId: process.env.GHL_LOCATION_ID, query: name, limit: 5 },
      timeout: 8000,
    });
    return r.data?.contacts || [];
  } catch (e: any) {
    return { error: e.message };
  }
}

// ─── TOOL DEFINITIONS ─────────────────────────────────────────────────────────
const BOB_TOOLS = [
  // ── FIELD READS ──
  {
    type: "function",
    function: {
      name: "get_today_schedule",
      description: "Get today's full job schedule: time, customer name, address, status, technician. Use for: 'what's my schedule', 'what's next', 'how many jobs today', 'what jobs are active'.",
      parameters: {
        type: "object",
        properties: {
          technician_name: {
            type: "string",
            description: "Optional: filter schedule to a specific technician by name.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_job_detail",
      description: "Get full details for a specific job: customer address, phone, access notes, gate code, description, special instructions, cost. Use when asked for address, directions, customer contact, or job specifics.",
      parameters: {
        type: "object",
        properties: {
          job_number: {
            type: "string",
            description: "Job number, e.g. JOB-2405-001. If user says 'the job' or 'my job', use get_today_schedule first to find the right one.",
          },
        },
        required: ["job_number"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_customer",
      description: "Search for a customer in the field app by name or phone. Returns address, contact info, access notes, history.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Customer name or partial name to search." },
        },
        required: ["name"],
      },
    },
  },
  // ── FIELD WRITES (confirmation required before calling) ──
  {
    type: "function",
    function: {
      name: "update_job_status",
      description: "Update a job's status. CONFIRMATION REQUIRED: before calling this, state the job number, current status, and new status in your response, then end with 'Shall I update it?'. Only call this tool after the user says yes/confirm/proceed/do it.",
      parameters: {
        type: "object",
        properties: {
          job_number: { type: "string", description: "Job number like JOB-2405-001" },
          new_status: {
            type: "string",
            enum: ["scheduled","assigned","en_route","arrived","in_progress","completed","cancelled"],
          },
        },
        required: ["job_number", "new_status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_sms_to_customer",
      description: "Send an SMS to a customer. CONFIRMATION REQUIRED: before calling this, show the customer's name, phone number, and the exact message text, then ask 'Should I send this?'. Only call after explicit user confirmation.",
      parameters: {
        type: "object",
        properties: {
          customer_phone: { type: "string", description: "Customer phone number." },
          customer_name:  { type: "string", description: "Customer's full name (for confirmation display)." },
          message:        { type: "string", description: "The exact SMS text to send. Keep under 160 chars for a single message." },
        },
        required: ["customer_phone", "customer_name", "message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_job_note",
      description: "Add a note to a job. CONFIRMATION REQUIRED: show the note text and job number, ask 'Add this note?'. Only call after confirmation.",
      parameters: {
        type: "object",
        properties: {
          job_id:    { type: "number", description: "The numeric job ID (use get_job_detail or get_today_schedule to find it)." },
          note_text: { type: "string", description: "The note to record." },
        },
        required: ["job_id", "note_text"],
      },
    },
  },
  // ── INFRA TOOLS ──
  {
    type: "function",
    function: {
      name: "get_system_status",
      description: "Check health of all infrastructure: Railway services, n8n, Switchboard.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_instantly_campaigns",
      description: "List all Instantly.ai email campaigns and their status.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_n8n_workflows",
      description: "List n8n workflows and recent executions.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "restart_n8n_workflow",
      description: "Restart, activate, or deactivate an n8n workflow by name.",
      parameters: {
        type: "object",
        properties: {
          workflow_name: { type: "string" },
          action: { type: "string", enum: ["restart","activate","deactivate"] },
        },
        required: ["workflow_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_crm_contact",
      description: "Search the contractor's connected CRM (GoHighLevel, Jobber, or ServiceTitan) for a contact by name, phone, or email. Returns pipeline stage, notes, and opportunities. Falls back gracefully if no CRM is connected.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Name, phone number, or email to search for" },
        },
        required: ["query"],
      },
    },
  },
  // ── Marketing tools (owner/admin only — role enforced inside each function) ──
  {
    type: "function",
    function: {
      name: "get_lead_summary",
      description: "Get a summary of ad leads for the last N days — total, booked, cold, by platform. Owner/admin only.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "Number of days to look back (default 7)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_cold_leads",
      description: "List cold or uncontacted leads that need follow-up. Owner/admin only.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max leads to return (default 10)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_lead_status",
      description: "Update the status of a specific lead (e.g. mark as booked, cold, won). Owner/admin only.",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "number", description: "The lead ID" },
          status:  { type: "string", description: "new | contacted | follow_up | booked | cold | lost | won" },
          notes:   { type: "string", description: "Optional notes about the outcome" },
        },
        required: ["lead_id", "status"],
      },
    },
  },
];

// ─── TOOL EXECUTOR ────────────────────────────────────────────────────────────
async function executeTool(name: string, args: any, tenantId: string, userRole = "staff"): Promise<any> {
  console.log(`[Bob] tool: ${name} | role: ${userRole}`, JSON.stringify(args));
  try {
    switch (name) {
      // Field reads
      case "get_today_schedule":
        return await getTodaySchedule(tenantId, args.technician_name);
      case "get_job_detail":
        return await getJobDetail(tenantId, args.job_number);
      case "find_customer":
        return await findCustomer(tenantId, args.name);
      // Field writes
      case "update_job_status":
        return await updateJobStatusFn(tenantId, args.job_number, args.new_status);
      case "send_sms_to_customer":
        return await sendSMSToCustomer(tenantId, args.customer_phone, args.customer_name, args.message);
      case "add_job_note":
        return await addJobNoteFn(tenantId, Number(args.job_id), args.note_text);
      // Infra
      case "get_system_status": {
        const [railway, switchboard, n8n] = await Promise.all([
          checkRailwayServices(),
          getSwitchboardStatus(),
          getN8nWorkflows(),
        ]);
        return { railway, switchboard, n8n };
      }
      case "get_instantly_campaigns":
        return await getInstantlyCampaigns();
      case "get_n8n_workflows":
        return await getN8nWorkflows();
      case "restart_n8n_workflow":
        return await triggerN8nWorkflow(args.workflow_name, args.action || "restart");
      case "search_crm_contact": {
        const { getCrmAdapter } = await import("../crm/index");
        const { tenants } = await import("@shared/models/auth");
        const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
        if (!tenant) return { error: "Tenant not found." };
        const adapter = getCrmAdapter(tenant as any);
        if (!adapter) {
          return { error: "No CRM connected. Ask the owner to connect GoHighLevel, Jobber, or ServiceTitan in Settings → Integrations." };
        }
        return await adapter.searchContacts(args.query);
      }
      // ── Marketing tools (owner/admin only) ──────────────────────────────────
      case "get_lead_summary": {
        const { getLeadSummary } = await import("./marketing");
        return await getLeadSummary(tenantId, userRole, args.days ?? 7);
      }
      case "get_cold_leads": {
        const { getColdLeads } = await import("./marketing");
        return await getColdLeads(tenantId, userRole, args.limit ?? 10);
      }
      case "update_lead_status": {
        const { updateLeadStatus } = await import("./marketing");
        return await updateLeadStatus(tenantId, userRole, Number(args.lead_id), args.status, args.notes);
      }
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e: any) {
    // Return errors as strings so the model can relay them gracefully instead of crashing the loop
    const msg = e?.message || "An unexpected error occurred.";
    console.error(`[Bob] Tool "${name}" threw:`, msg);
    return { error: msg };
  }
}

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────
function buildSystemPrompt(tenant: any, user: any, userRole = "staff"): string {
  const tz = process.env.TENANT_TIMEZONE || "America/New_York";
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: tz });
  const companyName = tenant?.companyName || "this contractor business";
  const userName = user?.firstName || "there";
  const isOwnerOrAdmin = ["owner", "admin"].includes(userRole);

  const marketingSection = isOwnerOrAdmin ? `
- Pull ad lead summaries (get_lead_summary) — show total, booked, cold, by platform
- List cold leads needing follow-up (get_cold_leads)
- Update lead status (update_lead_status) after confirming

MARKETING EXAMPLES — call tools immediately for owners/admins:
- "How are my leads doing?" → get_lead_summary (7 days)
- "Who needs a follow-up?" → get_cold_leads
- "Mark lead 12 as booked" → confirm lead ID and status, then update_lead_status
` : "";

  return `You are Lexi, the AI field operations assistant for ${companyName}. Today is ${today}.

You work alongside ${userName} (role: ${userRole}) and have direct access to the job schedule, customer records, and all connected systems.

WHAT YOU CAN DO:
- Look up today's schedule, job details, customer info, addresses, gate codes, special instructions
- Update job statuses (en route, arrived, in progress, completed)
- Send SMS messages to customers
- Add notes to jobs
- Check system health (Railway, n8n, Switchboard)
- Manage n8n workflows
- Pull Instantly.ai campaign data
- Search the contractor's connected CRM (GoHighLevel, Jobber, or ServiceTitan) using search_crm_contact${marketingSection}

FIELD QUERY EXAMPLES — call tools immediately, no narration:
- "What's my next job?" → get_today_schedule, pick the next scheduled one
- "Give me Linda's address" → find_customer("Linda"), return the address
- "What's the gate code for JOB-2405-002?" → get_job_detail("JOB-2405-002"), return gateCode
- "Mark JOB-2405-001 complete" → confirm first, then update_job_status
- "Text the customer I'm running 20 min late" → ask which job, draft the message, confirm, then send

CONFIRMATION RULES (CRITICAL):
Before calling update_job_status, send_sms_to_customer, or add_job_note:
1. State exactly what you're about to do: job number, customer name, new status or message text
2. End your response with "Shall I proceed?" or "Should I send this?"
3. Only call the write tool after the user says yes / confirm / do it / go ahead

WRONG-CUSTOMER PREVENTION:
- Always name the customer and job number when discussing a job
- If the user says "the customer" without specifying, ask "Which job — I have [X] on the schedule today"

YOUR STYLE:
- Short and direct. 1-3 sentences unless detail is needed.
- Do the work first, then report the result. Never narrate what you're about to do.
- Talk like you've worked together for years.
- Never say "I don't have access to that" — use your tools.
- If a tool returns an error, report it plainly and suggest the fix.`;
}

// ─── MAIN AGENT LOOP ──────────────────────────────────────────────────────────
export async function runBobAgent(
  tenantId: string,
  conversationId: number,
  userMessage: string,
  callerRole = "staff"   // Role of the authenticated user making this request
): Promise<string> {
  console.log(`[Bob] Agent called — tenant: ${tenantId}, conv: ${conversationId}, role: ${callerRole}`);

  const rawKey = process.env.OPENROUTER_API_KEY || "";
  const apiKey = rawKey.trim().replace(/^Bearer\s+/i, "").replace(/^["'`]|["'`]$/g, "").trim();
  const keyDebug = `len=${apiKey.length} prefix="${apiKey.slice(0, 14)}" sk-or=${apiKey.startsWith("sk-or-")}`;
  console.log(`[Bob] Key info: ${keyDebug}`);
  if (!apiKey) {
    return "OPENROUTER_API_KEY is not configured — check Railway env vars.";
  }

  // Load tenant + user context
  let tenant: any = null;
  let user: any = null;
  try {
    [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    [user]   = await db.select().from(users).where(eq(users.tenantId, tenantId)).limit(1);
  } catch (e: any) {
    console.error("[Bob] DB lookup error:", e.message);
  }

  // Load conversation history (last 20 messages)
  let historyRows: any[] = [];
  try {
    historyRows = await db.select().from(bobMessages)
      .where(eq(bobMessages.conversationId, conversationId))
      .orderBy(bobMessages.createdAt)
      .limit(20);
  } catch (e: any) {
    console.error("[Bob] History load error:", e.message);
  }

  const messages: any[] = [
    ...historyRows.map((m: any) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  // Inject knowledge base context if available
  let knowledgeContext = "";
  try {
    const { buildKnowledgeContext } = await import("./knowledge");
    knowledgeContext = await buildKnowledgeContext(tenantId, userMessage);
  } catch { /* knowledge module optional */ }

  const systemPrompt = buildSystemPrompt(tenant, user, callerRole) + (knowledgeContext ? "\n\n" + knowledgeContext : "");
  const model = selectModel(userMessage);
  console.log(`[Bob] Using model: ${model}${knowledgeContext ? " (+knowledge)" : ""}`);

  // Agentic loop — up to 8 iterations
  for (let i = 0; i < 8; i++) {
    let response: any;
    try {
      response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model,
          messages: [{ role: "system", content: systemPrompt }, ...messages],
          tools: BOB_TOOLS,
          tool_choice: "auto",
          max_tokens: 1024,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": process.env.SELF_URL || "https://field-app-production-d5c8.up.railway.app",
          },
          timeout: 30000,
        }
      );
    } catch (e: any) {
      console.error("[Bob] OpenRouter error:", e?.response?.data || e.message);
      const orMsg = e?.response?.data?.error?.message || e?.response?.data?.message || e.message;
      return `OpenRouter error: ${orMsg}\n\nKey debug: ${keyDebug}`;
    }

    const choice = response.data.choices?.[0];
    const msg    = choice?.message;
    if (!msg) break;

    messages.push(msg);

    if (choice.finish_reason === "stop" || !msg.tool_calls?.length) {
      console.log(`[Bob] Done after ${i + 1} iteration(s)`);
      return msg.content || "Done.";
    }

    // Execute all tool calls in this iteration
    for (const tc of msg.tool_calls) {
      let args: any = {};
      try { args = JSON.parse(tc.function.arguments || "{}"); } catch {}
      const result = await executeTool(tc.function.name, args, tenantId, callerRole);
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }
  }

  return "Something went wrong — try again.";
}