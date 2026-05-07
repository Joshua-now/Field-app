/**
 * Bob — AI Field Operations Assistant
 * Phase 3: Real agent with OpenRouter + tool system
 */

import axios from "axios";
import { db } from "../db";
import { bobMessages, bobConversations, tenants, users } from "@shared/schema";
import { eq } from "drizzle-orm";

// ─── MODEL ROUTING ────────────────────────────────────────────────────────────
const MODELS = {
  fast:   "openai/gpt-4o-mini",
  sonnet: "anthropic/claude-sonnet-4-5-20250929",
  opus:   "anthropic/claude-opus-4-5-20251101",
} as const;

const SIMPLE_KW = ["status","hi","hello","hey","yes","no","thanks","ok","what","who","when","where","how many","check"];
const COMPLEX_KW = ["analyze","compare","strategy","plan","why is","root cause","recommend","should i"];

function selectModel(input: string): string {
  const s = input.toLowerCase().trim();
  if (s.length < 150 && SIMPLE_KW.some(k => s.includes(k))) return MODELS.fast;
  if (COMPLEX_KW.some(k => s.includes(k))) return MODELS.opus;
  return MODELS.sonnet;
}

// ─── EXTERNAL API HELPERS ─────────────────────────────────────────────────────
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
  try {
    const base = process.env.N8N_BASE_URL;
    const key  = process.env.N8N_API_KEY;
    if (!base || !key) return { ok: false, error: "N8N_BASE_URL or N8N_API_KEY not set" };
    const [wfR, exR] = await Promise.all([
      axios.get(`${base}/api/v1/workflows`, { headers: { "X-N8N-API-KEY": key }, params: { limit: 20 }, timeout: 8000 }),
      axios.get(`${base}/api/v1/executions`, { headers: { "X-N8N-API-KEY": key }, params: { limit: 10 }, timeout: 8000 }).catch(() => ({ data: { data: [] } })),
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
  const key = process.env.N8N_API_KEY;
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
    });
    return r.data?.contacts || [];
  } catch (e: any) {
    return { error: e.message };
  }
}

// ─── TOOL DEFINITIONS ─────────────────────────────────────────────────────────
const BOB_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_system_status",
      description: "Check health of all infrastructure: n8n, Switchboard, Railway services.",
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
      description: "Restart (or activate/deactivate) an n8n workflow by name.",
      parameters: {
        type: "object",
        properties: {
          workflow_name: { type: "string" },
          action: { type: "string", enum: ["restart", "activate", "deactivate"] },
        },
        required: ["workflow_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_ghl_contact",
      description: "Look up a contact in GoHighLevel CRM by name.",
      parameters: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
    },
  },
];

// ─── TOOL EXECUTOR ────────────────────────────────────────────────────────────
async function executeTool(name: string, args: any): Promise<any> {
  console.log(`[Bob] tool: ${name}`, JSON.stringify(args));
  switch (name) {
    case "get_system_status": {
      const [railway, switchboard, n8n] = await Promise.all([
        checkRailwayServices(),
        getSwitchboardStatus(),
        getN8nWorkflows(),
      ]);
      return { railway, switchboard, n8n };
    }
    case "get_instantly_campaigns":
      return getInstantlyCampaigns();
    case "get_n8n_workflows":
      return getN8nWorkflows();
    case "restart_n8n_workflow":
      return triggerN8nWorkflow(args.workflow_name, args.action || "restart");
    case "search_ghl_contact":
      return searchGHLContacts(args.name);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────
function buildSystemPrompt(tenant: any, user: any): string {
  return `You are Bob, the AI field operations assistant for ${tenant?.companyName || "this contractor business"}.

You work for ${user?.firstName || "Joshua"} ${user?.lastName || ""} and know the business inside out.

FLUID PRODUCTIONS — WHAT WE SELL:
- Tier 1: After Hours Receptionist — $397/mo (AI answers calls after hours)
- Tier 2: Speed to Lead — $997/mo (AI calls back ad leads within 60 seconds)
- Tier 3: Complete Package — $1,497/mo (full AI employee, handles everything)

YOUR SYSTEMS:
- Switchboard: AI call platform (Anna = Speed to Lead, Maya = After Hours)
- n8n: Automation workflows — you can restart broken ones
- Instantly: Cold email campaigns
- GHL (GoHighLevel): CRM, pipeline, contacts
- Railway: Infrastructure hosting

YOUR STYLE:
- Short and direct. 1-3 sentences max.
- Do the work, report the result. Don't narrate what you're about to do.
- Talk like you've worked together for years.
- When asked about system status — ALWAYS call get_system_status first.
- Never say "I don't have access" — use your tools.`;
}

// ─── MAIN AGENT LOOP ──────────────────────────────────────────────────────────
export async function runBobAgent(
  tenantId: string,
  conversationId: number,
  userMessage: string
): Promise<string> {
  console.log(`[Bob] Agent called — tenant: ${tenantId}, conv: ${conversationId}`);

  const rawKey = process.env.OPENROUTER_API_KEY || "";
  // Strip whitespace and any accidental "Bearer " prefix
  const apiKey = rawKey.trim().replace(/^Bearer\s+/i, "");
  console.log(`[Bob] Key prefix: ${apiKey.slice(0, 12)}... length: ${apiKey.length}`);
  if (!apiKey) {
    console.error("[Bob] OPENROUTER_API_KEY not set");
    return "OPENROUTER_API_KEY is not configured in Railway env vars.";
  }

  // Load tenant + user context
  let tenant: any = null;
  let user: any = null;
  try {
    tenant = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1).then(r => r[0]);
    user   = await db.select().from(users).where(eq(users.tenantId, tenantId)).limit(1).then(r => r[0]);
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
    ...historyRows.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
    { role: "user", content: userMessage },
  ];

  const systemPrompt = buildSystemPrompt(tenant, user);
  const model = selectModel(userMessage);
  console.log(`[Bob] Using model: ${model}`);

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
      return `OpenRouter error: ${e?.response?.data?.error?.message || e.message}`;
    }

    const choice = response.data.choices?.[0];
    const msg    = choice?.message;
    if (!msg) break;

    messages.push(msg);

    if (choice.finish_reason === "stop" || !msg.tool_calls?.length) {
      console.log(`[Bob] Done after ${i + 1} iteration(s)`);
      return msg.content || "Done.";
    }

    for (const tc of msg.tool_calls) {
      let args: any = {};
      try { args = JSON.parse(tc.function.arguments || "{}"); } catch {}
      const result = await executeTool(tc.function.name, args);
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }
  }

  return "Something went wrong — try again.";
}
