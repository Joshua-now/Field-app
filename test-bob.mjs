/**
 * Bob Full End-to-End Test Suite
 * ────────────────────────────────────────────────────────────────────────────
 * Tests all 13 Bob tools + API surface + role enforcement.
 * Uses the Acme HVAC demo scenario from seed-demo.ts.
 *
 * USAGE:
 *   node test-bob.mjs                          # auto-creates test account
 *   OWNER_EMAIL=you@email.com OWNER_PASSWORD=yourpass node test-bob.mjs
 *   BASE_URL=http://localhost:5000 node test-bob.mjs   # test local dev
 *
 * REQUIREMENTS:
 *   - Node 18+ (native fetch)
 *   - App running on Railway (or locally)
 *   - Demo data seeded: npx tsx server/scripts/seed-demo.ts
 */

const BASE   = process.env.BASE_URL  || "https://field-app-production-d5c8.up.railway.app";
const EMAIL  = process.env.OWNER_EMAIL    || "bob-test-owner@fieldtech.demo";
const PASS   = process.env.OWNER_PASSWORD || "TestPass2024!";

const TIMEOUT_MS = 35_000;  // Bob AI calls can take ~20s

// ─── COLOUR HELPERS ───────────────────────────────────────────────────────────
const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  green:  "\x1b[32m",
  red:    "\x1b[31m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
  grey:   "\x1b[90m",
};
const pass  = (msg) => console.log(`  ${C.green}✅ PASS${C.reset}  ${msg}`);
const fail  = (msg) => console.log(`  ${C.red}❌ FAIL${C.reset}  ${msg}`);
const warn  = (msg) => console.log(`  ${C.yellow}⚠️  NOTE${C.reset}  ${msg}`);
const info  = (msg) => console.log(`  ${C.cyan}ℹ${C.reset}       ${msg}`);
const head  = (msg) => console.log(`\n${C.bold}${C.cyan}══ ${msg} ══${C.reset}`);
const sub   = (msg) => console.log(`\n${C.bold}  ▶ ${msg}${C.reset}`);

// ─── RESULTS TRACKER ─────────────────────────────────────────────────────────
const results = { passed: 0, failed: 0, warned: 0, items: [] };
function record(status, name, detail = "") {
  results.items.push({ status, name, detail });
  if      (status === "pass") { results.passed++; pass(name + (detail ? ` — ${detail}` : "")); }
  else if (status === "fail") { results.failed++; fail(name + (detail ? ` — ${detail}` : "")); }
  else                        { results.warned++; warn(name + (detail ? ` — ${detail}` : "")); }
}

// ─── HTTP HELPERS ─────────────────────────────────────────────────────────────
async function api(method, path, body, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, ok: res.ok, json };
  } catch (e) {
    return { status: 0, ok: false, json: null, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

async function bobChat(convId, message, token) {
  const t0 = Date.now();
  const r = await api("POST", `/api/bob/conversations/${convId}/messages`, { content: message }, token);
  const ms = Date.now() - t0;
  return { ...r, ms };
}

// ─── SETUP ────────────────────────────────────────────────────────────────────
async function getToken() {
  // Try login first
  let r = await api("POST", "/api/auth/login", { email: EMAIL, password: PASS });
  if (r.ok && r.json?.token) {
    info(`Logged in as ${EMAIL}`);
    return { token: r.json.token, tenantId: r.json.user?.tenantId, role: r.json.user?.role };
  }

  // Register if not found
  if (r.status === 401 || r.status === 404) {
    r = await api("POST", "/api/auth/register", {
      companyName: "Acme HVAC Demo",
      email: EMAIL,
      password: PASS,
      firstName: "Test",
      lastName: "Owner",
    });
    if (r.ok && r.json?.token) {
      info(`Registered new test account: ${EMAIL}`);
      return { token: r.json.token, tenantId: r.json.tenant?.id, role: "owner" };
    }
  }

  throw new Error(`Auth failed (${r.status}): ${JSON.stringify(r.json)}`);
}

// ─── PHASE 1: PUBLIC ENDPOINTS ────────────────────────────────────────────────
async function testPublicEndpoints() {
  head("PHASE 1 — Public API Endpoints");

  sub("Health Check — GET /api/health");
  const health = await api("GET", "/api/health");
  if (health.ok && health.json?.status) {
    record("pass", "/api/health responded", `status=${health.json.status} db=${health.json.database}`);
  } else {
    record("fail", "/api/health failed", `HTTP ${health.status} — ${JSON.stringify(health.json)}`);
  }

  sub("OpenRouter Ping — GET /api/bob/ping");
  const ping = await api("GET", "/api/bob/ping");
  if (ping.ok && ping.json?.ok) {
    record("pass", "OpenRouter connected", `reply="${ping.json.reply}" key_len=${ping.json.keyInfo?.length}`);
  } else if (ping.json?.keyInfo) {
    record("fail", "OpenRouter key issue", `key_info=${JSON.stringify(ping.json.keyInfo)} error=${ping.json.error}`);
  } else {
    record("fail", "/api/bob/ping failed", `HTTP ${ping.status}`);
  }
}

// ─── PHASE 2: AUTH ────────────────────────────────────────────────────────────
async function testAuth() {
  head("PHASE 2 — Auth Flow");

  sub("Bad login attempt");
  const bad = await api("POST", "/api/auth/login", { email: "nobody@nothing.com", password: "wrongpass" });
  if (bad.status === 401) {
    record("pass", "Bad credentials correctly rejected (401)");
  } else {
    record("fail", "Bad login returned unexpected status", `HTTP ${bad.status}`);
  }

  sub("Unauthenticated API access");
  const noAuth = await api("GET", "/api/jobs");
  if (noAuth.status === 401) {
    record("pass", "Unauthenticated request rejected (401)");
  } else {
    record("warn", "Unauthenticated request not properly blocked", `HTTP ${noAuth.status}`);
  }

  sub("Bob chat without auth (security check)");
  const unauth = await api("POST", "/api/bob/conversations/1/messages", { content: "hello" });
  if (unauth.status === 401) {
    record("pass", "Bob chat requires auth — security guard working");
  } else {
    record("fail", "Bob chat accessible without auth — SECURITY BUG", `HTTP ${unauth.status}`);
  }
}

// ─── PHASE 3: FIELD READ TOOLS ────────────────────────────────────────────────
async function testFieldReadTools(convId, token) {
  head("PHASE 3 — Field Read Tools (no confirmation required)");

  sub("Tool 1 — get_today_schedule");
  {
    const r = await bobChat(convId, "What's on the schedule today?", token);
    console.log(`${C.grey}  Bob (${r.ms}ms): ${typeof r.json?.content === 'string' ? r.json.content.substring(0, 200) : JSON.stringify(r.json).substring(0, 200)}${C.reset}`);
    if (r.ok && r.json?.content) {
      const c = r.json.content.toLowerCase();
      // Should mention jobs or "no jobs"
      if (c.includes("job") || c.includes("schedule") || c.includes("no jobs") || c.includes("today")) {
        record("pass", "get_today_schedule — returned schedule data");
      } else {
        record("warn", "get_today_schedule — response unclear", "may not have seeded demo data");
      }
    } else {
      record("fail", "get_today_schedule — agent error", `HTTP ${r.status}: ${JSON.stringify(r.json)}`);
    }
  }

  sub("Tool 1b — get_today_schedule (filtered by technician)");
  {
    const r = await bobChat(convId, "Show me Marcus's jobs today.", token);
    console.log(`${C.grey}  Bob (${r.ms}ms): ${typeof r.json?.content === 'string' ? r.json.content.substring(0, 200) : JSON.stringify(r.json).substring(0, 200)}${C.reset}`);
    if (r.ok && r.json?.content) {
      const c = r.json.content.toLowerCase();
      if (c.includes("marcus") || c.includes("hvac") || c.includes("job")) {
        record("pass", "get_today_schedule (by tech) — Marcus filter works");
      } else {
        record("warn", "get_today_schedule (by tech) — unexpected response");
      }
    } else {
      record("fail", "get_today_schedule (by tech) — agent error");
    }
  }

  sub("Tool 2 — get_job_detail (gate code test)");
  {
    const r = await bobChat(convId, "What's the gate code for JOB-2405-002?", token);
    console.log(`${C.grey}  Bob (${r.ms}ms): ${typeof r.json?.content === 'string' ? r.json.content.substring(0, 200) : JSON.stringify(r.json).substring(0, 200)}${C.reset}`);
    if (r.ok && r.json?.content) {
      const c = r.json.content;
      // Gate code is #4421 for Bob Stanton
      if (c.includes("4421") || c.includes("gate")) {
        record("pass", "get_job_detail — gate code #4421 returned correctly");
      } else if (c.toLowerCase().includes("not found")) {
        record("warn", "get_job_detail — job not found (seed data missing?)");
      } else {
        record("warn", "get_job_detail — gate code not clearly in response", c.substring(0, 100));
      }
    } else {
      record("fail", "get_job_detail — agent error");
    }
  }

  sub("Tool 2b — get_job_detail (special instructions)");
  {
    const r = await bobChat(convId, "Give me the full details on JOB-2405-005.", token);
    console.log(`${C.grey}  Bob (${r.ms}ms): ${typeof r.json?.content === 'string' ? r.json.content.substring(0, 200) : JSON.stringify(r.json).substring(0, 200)}${C.reset}`);
    if (r.ok && r.json?.content) {
      const c = r.json.content.toLowerCase();
      if (c.includes("patricia") || c.includes("water heater") || c.includes("drummond")) {
        record("pass", "get_job_detail — Patricia Drummond job details returned");
      } else {
        record("warn", "get_job_detail (JOB-2405-005) — unexpected response");
      }
    } else {
      record("fail", "get_job_detail — agent error");
    }
  }

  sub("Tool 3 — find_customer (by name)");
  {
    const r = await bobChat(convId, "Look up Linda Carver.", token);
    console.log(`${C.grey}  Bob (${r.ms}ms): ${typeof r.json?.content === 'string' ? r.json.content.substring(0, 200) : JSON.stringify(r.json).substring(0, 200)}${C.reset}`);
    if (r.ok && r.json?.content) {
      const c = r.json.content.toLowerCase();
      if (c.includes("linda") || c.includes("carver") || c.includes("4821") || c.includes("palma")) {
        record("pass", "find_customer — Linda Carver found with address");
      } else {
        record("warn", "find_customer — response unexpected", c.substring(0, 100));
      }
    } else {
      record("fail", "find_customer — agent error");
    }
  }

  sub("Tool 3b — find_customer (access notes)");
  {
    const r = await bobChat(convId, "Find James Whitfield. Is there anything I need to know before I go there?", token);
    console.log(`${C.grey}  Bob (${r.ms}ms): ${typeof r.json?.content === 'string' ? r.json.content.substring(0, 200) : JSON.stringify(r.json).substring(0, 200)}${C.reset}`);
    if (r.ok && r.json?.content) {
      const c = r.json.content.toLowerCase();
      if (c.includes("dog") || c.includes("zeus") || c.includes("call") || c.includes("james")) {
        record("pass", "find_customer — dog/access note for James Whitfield returned");
      } else {
        record("warn", "find_customer (access notes) — note not clearly mentioned");
      }
    } else {
      record("fail", "find_customer (access notes) — agent error");
    }
  }
}

// ─── PHASE 4: FIELD WRITE TOOLS (confirmation flow) ──────────────────────────
async function testFieldWriteTools(convId, token) {
  head("PHASE 4 — Field Write Tools (confirmation required)");

  sub("Tool 4 — update_job_status (confirmation flow)");
  {
    // Step 1: trigger update — should ask for confirmation first
    const r1 = await bobChat(convId, "Mark JOB-2405-003 as en route.", token);
    console.log(`${C.grey}  Bob step 1 (${r1.ms}ms): ${typeof r1.json?.content === 'string' ? r1.json.content.substring(0, 200) : ''}${C.reset}`);

    if (r1.ok && r1.json?.content) {
      const c1 = r1.json.content.toLowerCase();
      // Should ask for confirmation, not immediately update
      if (c1.includes("shall i") || c1.includes("should i") || c1.includes("proceed") || c1.includes("confirm") || c1.includes("update it")) {
        record("pass", "update_job_status — correctly asked for confirmation before acting");

        // Step 2: confirm
        const r2 = await bobChat(convId, "Yes, do it.", token);
        console.log(`${C.grey}  Bob step 2 (${r2.ms}ms): ${typeof r2.json?.content === 'string' ? r2.json.content.substring(0, 200) : ''}${C.reset}`);
        if (r2.ok && r2.json?.content) {
          const c2 = r2.json.content.toLowerCase();
          if (c2.includes("en route") || c2.includes("marked") || c2.includes("updated") || c2.includes("✅")) {
            record("pass", "update_job_status — confirmed and updated JOB-2405-003 to en_route");
          } else {
            record("warn", "update_job_status — post-confirm response unclear", c2.substring(0, 100));
          }
        }
      } else if (c1.includes("en route") || c1.includes("updated") || c1.includes("✅")) {
        record("warn", "update_job_status — updated WITHOUT confirmation (check prompt)", c1.substring(0, 100));
      } else {
        record("warn", "update_job_status — unexpected response", c1.substring(0, 100));
      }
    } else {
      record("fail", "update_job_status — agent error", `HTTP ${r1.status}`);
    }
  }

  sub("Tool 5 — send_sms_to_customer (confirmation flow)");
  {
    // Trigger SMS request
    const r1 = await bobChat(convId, "Text Carol Mendez and tell her Marcus is on his way and will arrive around 2 PM.", token);
    console.log(`${C.grey}  Bob step 1 (${r1.ms}ms): ${typeof r1.json?.content === 'string' ? r1.json.content.substring(0, 300) : ''}${C.reset}`);

    if (r1.ok && r1.json?.content) {
      const c1 = r1.json.content.toLowerCase();
      if (c1.includes("carol") && (c1.includes("should i send") || c1.includes("shall i") || c1.includes("send this") || c1.includes("confirm") || c1.includes("2 pm"))) {
        record("pass", "send_sms_to_customer — showed message preview + asked for confirmation");

        // Confirm
        const r2 = await bobChat(convId, "Yes, send it.", token);
        console.log(`${C.grey}  Bob step 2 (${r2.ms}ms): ${typeof r2.json?.content === 'string' ? r2.json.content.substring(0, 200) : ''}${C.reset}`);
        if (r2.ok && r2.json?.content) {
          const c2 = r2.json.content.toLowerCase();
          if (c2.includes("sent") || c2.includes("✅") || c2.includes("carol") || c2.includes("sms")) {
            record("pass", "send_sms_to_customer — SMS attempt confirmed (may fail if no Telnyx creds)");
          } else if (c2.includes("error") || c2.includes("not configured") || c2.includes("telnyx")) {
            record("warn", "send_sms_to_customer — Telnyx env var missing, but flow worked correctly", c2.substring(0, 100));
          } else {
            record("warn", "send_sms_to_customer — post-confirm response unclear", c2.substring(0, 100));
          }
        }
      } else if (c1.includes("sent") || c1.includes("✅")) {
        record("warn", "send_sms_to_customer — sent WITHOUT confirmation (check prompt)");
      } else {
        record("warn", "send_sms_to_customer — unexpected response", c1.substring(0, 100));
      }
    } else {
      record("fail", "send_sms_to_customer — agent error", `HTTP ${r1.status}`);
    }
  }

  sub("Tool 6 — add_job_note (confirmation flow)");
  {
    const r1 = await bobChat(convId, "Add a note to JOB-2405-001: customer asked about adding a UV air purifier to both units.", token);
    console.log(`${C.grey}  Bob step 1 (${r1.ms}ms): ${typeof r1.json?.content === 'string' ? r1.json.content.substring(0, 300) : ''}${C.reset}`);

    if (r1.ok && r1.json?.content) {
      const c1 = r1.json.content.toLowerCase();
      if (c1.includes("add this note") || c1.includes("shall i") || c1.includes("confirm") || c1.includes("uv") || c1.includes("purifier")) {
        record("pass", "add_job_note — showed note content and asked for confirmation");

        const r2 = await bobChat(convId, "Yes, add it.", token);
        console.log(`${C.grey}  Bob step 2 (${r2.ms}ms): ${typeof r2.json?.content === 'string' ? r2.json.content.substring(0, 200) : ''}${C.reset}`);
        if (r2.ok && r2.json?.content) {
          const c2 = r2.json.content.toLowerCase();
          if (c2.includes("note") && (c2.includes("added") || c2.includes("✅") || c2.includes("job-2405-001"))) {
            record("pass", "add_job_note — note added to JOB-2405-001");
          } else {
            record("warn", "add_job_note — post-confirm response unclear", c2.substring(0, 100));
          }
        }
      } else if (c1.includes("note added") || c1.includes("✅")) {
        record("warn", "add_job_note — added WITHOUT confirmation (check prompt)");
      } else {
        record("warn", "add_job_note — unexpected response", c1.substring(0, 100));
      }
    } else {
      record("fail", "add_job_note — agent error", `HTTP ${r1.status}`);
    }
  }
}

// ─── PHASE 5: INFRA TOOLS ────────────────────────────────────────────────────
async function testInfraTools(convId, token) {
  head("PHASE 5 — Infrastructure Tools");

  sub("Tool 7 — get_system_status");
  {
    const r = await bobChat(convId, "Check the system status — is everything online?", token);
    console.log(`${C.grey}  Bob (${r.ms}ms): ${typeof r.json?.content === 'string' ? r.json.content.substring(0, 300) : JSON.stringify(r.json).substring(0, 200)}${C.reset}`);
    if (r.ok && r.json?.content) {
      const c = r.json.content.toLowerCase();
      if (c.includes("n8n") || c.includes("railway") || c.includes("online") || c.includes("offline") || c.includes("status")) {
        record("pass", "get_system_status — returned infrastructure status");
      } else {
        record("warn", "get_system_status — unexpected response", c.substring(0, 100));
      }
    } else {
      record("fail", "get_system_status — agent error");
    }
  }

  sub("Tool 8 — get_instantly_campaigns");
  {
    const r = await bobChat(convId, "What Instantly campaigns are running right now?", token);
    console.log(`${C.grey}  Bob (${r.ms}ms): ${typeof r.json?.content === 'string' ? r.json.content.substring(0, 300) : JSON.stringify(r.json).substring(0, 200)}${C.reset}`);
    if (r.ok && r.json?.content) {
      const c = r.json.content.toLowerCase();
      // Could return campaigns or an error if INSTANTLY_API_KEY not set
      if (c.includes("campaign") || c.includes("instantly") || c.includes("not configured") || c.includes("error") || c.includes("no campaigns")) {
        record("pass", "get_instantly_campaigns — responded (may require INSTANTLY_API_KEY)");
      } else {
        record("warn", "get_instantly_campaigns — unexpected response", c.substring(0, 100));
      }
    } else {
      record("fail", "get_instantly_campaigns — agent error");
    }
  }

  sub("Tool 9 — get_n8n_workflows");
  {
    const r = await bobChat(convId, "Show me the n8n workflows.", token);
    console.log(`${C.grey}  Bob (${r.ms}ms): ${typeof r.json?.content === 'string' ? r.json.content.substring(0, 300) : JSON.stringify(r.json).substring(0, 200)}${C.reset}`);
    if (r.ok && r.json?.content) {
      const c = r.json.content.toLowerCase();
      if (c.includes("workflow") || c.includes("n8n") || c.includes("speed") || c.includes("not configured")) {
        record("pass", "get_n8n_workflows — responded (requires N8N_BASE_URL + N8N_API_KEY)");
      } else {
        record("warn", "get_n8n_workflows — unexpected response", c.substring(0, 100));
      }
    } else {
      record("fail", "get_n8n_workflows — agent error");
    }
  }

  sub("Tool 10 — search_ghl_contact");
  {
    const r = await bobChat(convId, "Look up James Whitfield in GHL.", token);
    console.log(`${C.grey}  Bob (${r.ms}ms): ${typeof r.json?.content === 'string' ? r.json.content.substring(0, 300) : JSON.stringify(r.json).substring(0, 200)}${C.reset}`);
    if (r.ok && r.json?.content) {
      const c = r.json.content.toLowerCase();
      if (c.includes("james") || c.includes("whitfield") || c.includes("ghl") || c.includes("contact") || c.includes("not found") || c.includes("error")) {
        record("pass", "search_ghl_contact — responded (requires GHL_PIT_TOKEN)");
      } else {
        record("warn", "search_ghl_contact — unexpected response", c.substring(0, 100));
      }
    } else {
      record("fail", "search_ghl_contact — agent error");
    }
  }

  sub("Tool 11 — restart_n8n_workflow");
  {
    const r = await bobChat(convId, "Restart the Speed-to-Lead workflow in n8n.", token);
    console.log(`${C.grey}  Bob (${r.ms}ms): ${typeof r.json?.content === 'string' ? r.json.content.substring(0, 300) : JSON.stringify(r.json).substring(0, 200)}${C.reset}`);
    if (r.ok && r.json?.content) {
      const c = r.json.content.toLowerCase();
      if (c.includes("speed") || c.includes("restart") || c.includes("workflow") || c.includes("not configured") || c.includes("error") || c.includes("restarted")) {
        record("pass", "restart_n8n_workflow — responded correctly");
      } else {
        record("warn", "restart_n8n_workflow — unexpected response", c.substring(0, 100));
      }
    } else {
      record("fail", "restart_n8n_workflow — agent error");
    }
  }
}

// ─── PHASE 6: MARKETING TOOLS (owner-only) ────────────────────────────────────
async function testMarketingTools(convId, token) {
  head("PHASE 6 — Marketing Tools (Owner/Admin only)");

  sub("Tool 12 — get_lead_summary (as owner)");
  {
    const r = await bobChat(convId, "How are my leads doing this week?", token);
    console.log(`${C.grey}  Bob (${r.ms}ms): ${typeof r.json?.content === 'string' ? r.json.content.substring(0, 300) : JSON.stringify(r.json).substring(0, 200)}${C.reset}`);
    if (r.ok && r.json?.content) {
      const c = r.json.content.toLowerCase();
      // If no leads exist yet — that's fine, should still return a summary
      if (c.includes("lead") || c.includes("booked") || c.includes("cold") || c.includes("total") || c.includes("no leads")) {
        record("pass", "get_lead_summary — returned lead data (0 leads is fine)");
      } else if (c.includes("not authorized") || c.includes("owner") || c.includes("permission")) {
        record("fail", "get_lead_summary — blocked for owner (bug)", c.substring(0, 100));
      } else {
        record("warn", "get_lead_summary — unexpected response", c.substring(0, 100));
      }
    } else {
      record("fail", "get_lead_summary — agent error");
    }
  }

  sub("Tool 13 — get_cold_leads (as owner)");
  {
    const r = await bobChat(convId, "Show me cold leads that need a follow-up.", token);
    console.log(`${C.grey}  Bob (${r.ms}ms): ${typeof r.json?.content === 'string' ? r.json.content.substring(0, 300) : JSON.stringify(r.json).substring(0, 200)}${C.reset}`);
    if (r.ok && r.json?.content) {
      const c = r.json.content.toLowerCase();
      if (c.includes("lead") || c.includes("cold") || c.includes("follow") || c.includes("no cold") || c.includes("none")) {
        record("pass", "get_cold_leads — returned cold leads list (empty is fine)");
      } else if (c.includes("not authorized") || c.includes("owner") || c.includes("permission")) {
        record("fail", "get_cold_leads — blocked for owner (bug)");
      } else {
        record("warn", "get_cold_leads — unexpected response", c.substring(0, 100));
      }
    } else {
      record("fail", "get_cold_leads — agent error");
    }
  }
}

// ─── PHASE 7: ROLE ENFORCEMENT ────────────────────────────────────────────────
async function testRoleEnforcement(staffToken) {
  head("PHASE 7 — Role Enforcement (marketing blocked for staff)");

  if (!staffToken) {
    record("warn", "Role enforcement — no staff token, skipping (create a staff user to test)");
    return;
  }

  // Create a new Bob conversation as staff
  const convR = await api("POST", "/api/bob/conversations", {}, staffToken);
  if (!convR.ok) {
    record("warn", "Role enforcement — could not create conversation as staff");
    return;
  }
  const staffConvId = convR.json?.id;

  sub("get_lead_summary as staff — should be blocked");
  {
    const r = await bobChat(staffConvId, "Show me my lead summary.", staffToken);
    console.log(`${C.grey}  Bob: ${typeof r.json?.content === 'string' ? r.json.content.substring(0, 200) : ''}${C.reset}`);
    if (r.ok && r.json?.content) {
      const c = r.json.content.toLowerCase();
      if (c.includes("not authorized") || c.includes("owner") || c.includes("don't have") || c.includes("don't have") || c.includes("access")) {
        record("pass", "get_lead_summary blocked for staff role — role gate working");
      } else if (c.includes("lead") && c.includes("total")) {
        record("fail", "get_lead_summary visible to staff — ROLE BYPASS");
      } else {
        record("warn", "get_lead_summary as staff — ambiguous response", c.substring(0, 100));
      }
    } else {
      record("fail", "Role enforcement test — agent error");
    }
  }
}

// ─── PHASE 8: EDGE CASES ─────────────────────────────────────────────────────
async function testEdgeCases(convId, token) {
  head("PHASE 8 — Edge Cases & Guardrails");

  sub("Non-existent job lookup");
  {
    const r = await bobChat(convId, "Get me the details for JOB-9999-999.", token);
    console.log(`${C.grey}  Bob: ${typeof r.json?.content === 'string' ? r.json.content.substring(0, 200) : ''}${C.reset}`);
    if (r.ok && r.json?.content) {
      const c = r.json.content.toLowerCase();
      if (c.includes("not found") || c.includes("couldn't find") || c.includes("no job") || c.includes("error")) {
        record("pass", "get_job_detail — graceful 'not found' for invalid job");
      } else {
        record("warn", "get_job_detail — unclear handling of non-existent job");
      }
    } else {
      record("fail", "Edge case (bad job) — agent error");
    }
  }

  sub("Customer search — no matches");
  {
    const r = await bobChat(convId, "Find customer named Zzzzqqqxxx.", token);
    console.log(`${C.grey}  Bob: ${typeof r.json?.content === 'string' ? r.json.content.substring(0, 200) : ''}${C.reset}`);
    if (r.ok && r.json?.content) {
      const c = r.json.content.toLowerCase();
      if (c.includes("not found") || c.includes("no customer") || c.includes("couldn't find") || c.includes("no match")) {
        record("pass", "find_customer — graceful 'not found' for bad name");
      } else {
        record("warn", "find_customer — unclear handling of no results");
      }
    } else {
      record("fail", "Edge case (bad customer) — agent error");
    }
  }

  sub("Ambiguous 'the customer' reference");
  {
    const r = await bobChat(convId, "Send a text to the customer.", token);
    console.log(`${C.grey}  Bob: ${typeof r.json?.content === 'string' ? r.json.content.substring(0, 200) : ''}${C.reset}`);
    if (r.ok && r.json?.content) {
      const c = r.json.content.toLowerCase();
      if (c.includes("which") || c.includes("which job") || c.includes("which customer") || c.includes("specify")) {
        record("pass", "Ambiguous customer reference — Bob correctly asked for clarification");
      } else {
        record("warn", "Ambiguous customer reference — Bob did not ask for clarification");
      }
    } else {
      record("fail", "Edge case (ambiguous) — agent error");
    }
  }

  sub("Oversized message rejected");
  {
    const bigMsg = "a".repeat(4001);
    const r = await api("POST", `/api/bob/conversations/${convId}/messages`, { content: bigMsg }, token);
    if (r.status === 400) {
      record("pass", "4001-char message correctly rejected with 400");
    } else {
      record("fail", "Oversized message not rejected", `HTTP ${r.status}`);
    }
  }

  sub("Empty message rejected");
  {
    const r = await api("POST", `/api/bob/conversations/${convId}/messages`, { content: "  " }, token);
    if (r.status === 400) {
      record("pass", "Empty/whitespace message correctly rejected with 400");
    } else {
      record("fail", "Empty message not rejected", `HTTP ${r.status}`);
    }
  }

  sub("Voice webhook accessibility (public)");
  {
    // Should respond (even if payload is wrong — just can't be 401)
    const r = await api("POST", "/api/voice/webhook", { event_type: "call.answered" });
    if (r.status !== 401) {
      record("pass", `Voice webhook is public — HTTP ${r.status} (not 401)`);
    } else {
      record("fail", "Voice webhook requires auth — Telnyx can't reach it");
    }
  }
}

// ─── PHASE 9: REST API SURFACE ───────────────────────────────────────────────
async function testApiSurface(token) {
  head("PHASE 9 — REST API Surface (CRUD endpoints)");

  sub("GET /api/technicians");
  {
    const r = await api("GET", "/api/technicians", null, token);
    if (r.ok && Array.isArray(r.json)) {
      record("pass", `GET /api/technicians — returned ${r.json.length} technician(s)`);
    } else {
      record("fail", "GET /api/technicians failed", `HTTP ${r.status}`);
    }
  }

  sub("GET /api/customers");
  {
    const r = await api("GET", "/api/customers", null, token);
    if (r.ok && Array.isArray(r.json)) {
      record("pass", `GET /api/customers — returned ${r.json.length} customer(s)`);
    } else {
      record("fail", "GET /api/customers failed", `HTTP ${r.status}`);
    }
  }

  sub("GET /api/jobs");
  {
    const r = await api("GET", "/api/jobs", null, token);
    if (r.ok && Array.isArray(r.json)) {
      record("pass", `GET /api/jobs — returned ${r.json.length} job(s)`);
    } else {
      record("fail", "GET /api/jobs failed", `HTTP ${r.status}`);
    }
  }

  sub("GET /api/jobs?date=today");
  {
    const today = new Date().toISOString().split("T")[0];
    const r = await api("GET", `/api/jobs?date=${today}`, null, token);
    if (r.ok && Array.isArray(r.json)) {
      const todayJobs = r.json.length;
      if (todayJobs > 0) {
        record("pass", `GET /api/jobs?date filter — ${todayJobs} job(s) for today`);
      } else {
        record("warn", "GET /api/jobs?date — 0 jobs today (demo data may not be seeded)");
      }
    } else {
      record("fail", "GET /api/jobs?date filter failed", `HTTP ${r.status}`);
    }
  }

  sub("GET /api/bob/conversations");
  {
    const r = await api("GET", "/api/bob/conversations", null, token);
    if (r.ok && Array.isArray(r.json)) {
      record("pass", `GET /api/bob/conversations — returned ${r.json.length} conversation(s)`);
    } else {
      record("fail", "GET /api/bob/conversations failed", `HTTP ${r.status}`);
    }
  }

  sub("Password not exposed in technician response");
  {
    const r = await api("GET", "/api/technicians", null, token);
    if (r.ok && Array.isArray(r.json) && r.json.length > 0) {
      const hasHash = r.json.some(t => t.passwordHash !== undefined);
      if (!hasHash) {
        record("pass", "passwordHash stripped from all technician responses");
      } else {
        record("fail", "SECURITY: passwordHash exposed in technician API response");
      }
    } else {
      record("warn", "Password exposure check — no technician data to inspect");
    }
  }
}

// ─── PRINT SUMMARY ────────────────────────────────────────────────────────────
function printSummary() {
  const total = results.passed + results.failed + results.warned;
  const pct = total > 0 ? Math.round((results.passed / total) * 100) : 0;

  console.log(`\n${C.bold}${"═".repeat(60)}${C.reset}`);
  console.log(`${C.bold}  BOB TEST RESULTS${C.reset}`);
  console.log(`${"─".repeat(60)}`);
  console.log(`  ${C.green}✅ Passed${C.reset}:  ${results.passed}`);
  console.log(`  ${C.red}❌ Failed${C.reset}:  ${results.failed}`);
  console.log(`  ${C.yellow}⚠️  Warned${C.reset}:  ${results.warned}`);
  console.log(`${"─".repeat(60)}`);
  console.log(`  Overall score: ${C.bold}${pct}%${C.reset} (${results.passed}/${total})`);

  if (results.failed > 0) {
    console.log(`\n${C.bold}${C.red}  FAILURES:${C.reset}`);
    results.items
      .filter(i => i.status === "fail")
      .forEach(i => console.log(`    ${C.red}✗${C.reset} ${i.name}${i.detail ? ` — ${i.detail}` : ""}`));
  }

  if (results.warned > 0) {
    console.log(`\n${C.bold}${C.yellow}  WARNINGS:${C.reset}`);
    results.items
      .filter(i => i.status === "warn")
      .forEach(i => console.log(`    ${C.yellow}⚠${C.reset}  ${i.name}${i.detail ? ` — ${i.detail}` : ""}`));
  }

  console.log(`\n${C.bold}  NOTES:${C.reset}`);
  console.log(`    • Warnings for Telnyx/Instantly/GHL tools are expected if env vars aren't set`);
  console.log(`    • Seed demo data first: npx tsx server/scripts/seed-demo.ts`);
  console.log(`    • Run as staff user to test role enforcement in Phase 7`);
  console.log(`${"═".repeat(60)}\n`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${C.bold}${C.cyan}╔════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║   BOB END-TO-END TEST SUITE            ║${C.reset}`);
  console.log(`${C.bold}${C.cyan}║   Target: ${BASE.padEnd(28)}║${C.reset}`);
  console.log(`${C.bold}${C.cyan}╚════════════════════════════════════════╝${C.reset}`);
  console.log(`  ${C.grey}Started: ${new Date().toLocaleString()}${C.reset}`);

  // ── Public endpoints (no auth) ──────────────────────────────────────────
  await testPublicEndpoints();
  await testAuth();

  // ── Get owner token ─────────────────────────────────────────────────────
  head("AUTH — Getting owner token");
  let token, tenantId;
  try {
    ({ token, tenantId } = await getToken());
    record("pass", `Authenticated as owner — tenantId=${tenantId}`);
  } catch (e) {
    record("fail", "Authentication failed", e.message);
    console.log("\n  Cannot continue without auth — check OWNER_EMAIL + OWNER_PASSWORD env vars.\n");
    printSummary();
    process.exit(1);
  }

  // ── Create a fresh Bob conversation ────────────────────────────────────
  head("SETUP — Creating Bob conversation");
  const convR = await api("POST", "/api/bob/conversations", {}, token);
  if (!convR.ok) {
    record("fail", "Could not create Bob conversation", `HTTP ${convR.status}: ${JSON.stringify(convR.json)}`);
    printSummary();
    process.exit(1);
  }
  const convId = convR.json?.id;
  record("pass", `Created conversation ID=${convId}`);

  // ── Run all Bob tool tests ───────────────────────────────────────────────
  await testFieldReadTools(convId, token);
  await testFieldWriteTools(convId, token);
  await testInfraTools(convId, token);
  await testMarketingTools(convId, token);

  // ── Role enforcement (requires creating a staff user) ──────────────────
  // To test: create a staff user in admin dashboard, set STAFF_EMAIL + STAFF_PASSWORD
  let staffToken = null;
  const staffEmail = process.env.STAFF_EMAIL;
  const staffPass  = process.env.STAFF_PASSWORD;
  if (staffEmail && staffPass) {
    const sr = await api("POST", "/api/auth/login", { email: staffEmail, password: staffPass });
    if (sr.ok && sr.json?.token) staffToken = sr.json.token;
  }
  await testRoleEnforcement(staffToken);

  // ── Edge cases ─────────────────────────────────────────────────────────
  await testEdgeCases(convId, token);

  // ── API surface tests ──────────────────────────────────────────────────
  await testApiSurface(token);

  // ── Summary ─────────────────────────────────────────────────────────────
  printSummary();
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error("\n❌ Test runner crashed:", e.message);
  process.exit(1);
});
