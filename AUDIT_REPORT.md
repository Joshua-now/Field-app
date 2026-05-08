# Contractor OS — Full Audit Report
**Date:** May 7, 2026  
**Auditor:** Bob (AI Field Operations Assistant)  
**Scope:** End-to-end audit of Field App + Bob AI system  

---

## Executive Summary

The Contractor OS field app is structurally sound — multi-tenant JWT auth, Drizzle ORM with proper tenant scoping, Telnyx voice integration, and a working Bob agent. However, a **critical authentication bug** silently broke all data loading pages, Bob had **zero access to field data**, and the backend had **no error boundaries** on any route. All critical issues have been identified and fixed in this audit pass.

**Verdict: Ship-ready after this audit commit + one-time demo seed.**

---

## Phase 1 — System Map

| Layer | Technology | Status |
|-------|-----------|--------|
| Backend | Express + TypeScript, Railway | ✅ Online |
| Database | PostgreSQL + Drizzle ORM | ✅ Tenanted |
| Auth | JWT (jsonwebtoken), localStorage | ✅ Works |
| Frontend | React + Vite + Tailwind + shadcn/ui | ✅ Builds |
| Bob AI | OpenRouter (gpt-4o-mini / Claude) | ✅ Working |
| Voice | Telnyx Call Control + interactive loop | ✅ Wired |
| Briefings | node-cron 6AM/6PM EDT | ✅ Running |
| Photos | Cloudinary unsigned upload | ✅ Works |

---

## Phase 2 — Bob Agent Rebuild

### What Was Wrong
Bob had **5 tools**, all pointing at external infra (n8n, Instantly, Switchboard, GHL).  
A contractor asking "what's my next job?" got nothing. "Give me the address" — nothing.  
The voice brain (`bobThink`) was a completely separate function with no tool access.

### What Was Fixed

**6 new field-ready tools added to `server/bob/agent.ts`:**

| Tool | Type | What It Does |
|------|------|-------------|
| `get_today_schedule` | Read | Full day's jobs — time, customer, address, status, tech |
| `get_job_detail` | Read | All details for a job: address, gate code, access notes, cost |
| `find_customer` | Read | Search field app DB by name or phone |
| `update_job_status` | Write ⚠ | Change job status — **requires confirmation before calling** |
| `send_sms_to_customer` | Write ⚠ | Send Telnyx SMS — **requires confirmation** |
| `add_job_note` | Write ⚠ | Log a note on a job — **requires confirmation** |

**Confirmation guardrails** built into system prompt and tool descriptions:  
Write tools require Bob to state the exact action + "Shall I proceed?" before calling them.  
Bob will never send an SMS or change a job status without the user saying yes first.

**System prompt rebuilt** — contractor-field focused, not Fluid Productions infra focused.  
Example queries that now work:
- "What's my schedule today?" → `get_today_schedule`
- "Give me Linda's address" → `find_customer("Linda")` → returns full address  
- "What's the gate code for JOB-2405-002?" → `get_job_detail` → returns gateCode
- "Text the customer I'm 20 min late" → Bob drafts, confirms, then `send_sms_to_customer`
- "Mark JOB-2405-001 complete" → Bob confirms, then `update_job_status`

**Voice system (`server/bob/voice.ts`) improved:**
- Full schedule context (all today's jobs with addresses) loaded at call start
- Goodbye detection fixed — "no" alone no longer ends calls; requires explicit phrases
- Silence counter: 2+ silences → polite wrap-up instead of hanging abruptly
- `bobThink` now receives schedule context so voice Bob can answer field questions

---

## Phase 3 — Backend API Hardening

### What Was Wrong
- **Zero try/catch** on any of the 20+ route handlers — a single DB error = empty 500 response
- `POST /api/admin/seed-demo` — any authenticated user could seed (no role check)
- `POST /api/technicians`, `POST /api/customers`, `POST /api/jobs` — no body validation
- ID parameters parsed with `Number(req.params.id)` with no NaN check
- Fallback error handler in `server/index.ts` re-threw errors **after** responding, crashing the process

### What Was Fixed
- All routes wrapped in `asyncHandler()` — errors flow to the centralized `errorHandler`
- `POST /api/admin/seed-demo` now requires `requireRole("owner", "admin")`
- `POST /api/technicians` validates with Zod `insertTechnicianSchema`
- `POST /api/customers` validates with Zod `insertCustomerSchema`
- `POST /api/jobs` validates with Zod `insertJobSchema`
- All ID params checked with `isNaN()` → `ValidationError` (not a crash)
- `server/index.ts` fallback handler: removed `throw err` — no more process crashes
- Note/photo routes validate required fields before DB write

---

## Phase 4 — Field App UI

### Critical Bug: Auth Header Missing on All Data Fetches
**Every API hook** used `credentials: "include"` (cookie auth).  
The `isAuthenticated` middleware checks **only** the `Authorization: Bearer` header.  
**Result:** `/api/jobs`, `/api/customers`, `/api/technicians` all returned 401 silently.  
The dashboard showed empty ("Load Demo Data") even after seeding because the data never loaded.

**Fix:** Updated 5 hooks to use `authHeaders()` from `use-auth.ts`:
- `use-jobs.ts`
- `use-customers.ts`  
- `use-technicians.ts`
- `use-job-photos.ts`
- `use-parts.ts`

**New:** `use-job-notes.ts` hook created (was missing entirely).

### JobDetail.tsx Improvements
- Notes tab was dead (showed "No notes yet." with no input)  
  → Now has a Textarea + Save Note button, renders saved notes with timestamps
- Customer address is now a **tappable Google Maps link** (mobile-critical)
- Access notes (gate codes, dog warnings) surfaced in a blue callout card
- Billing card added showing total cost + payment status
- Mobile layout improved — header wraps gracefully, buttons stay accessible
- Status action buttons show loading spinner during mutation
- Error state handles 404/network failure instead of blank screen
- Photo grid uses `loading="lazy"` for performance

### Bob.tsx
- Removed stale "Phase 2 — Agent coming in Phase 3" badge → replaced with green "Online" badge

---

## Phase 5 — Monitoring & Hardening

### Heartbeat Fixes
- `user?.phone` referenced a field that **does not exist** in the users schema  
  → Fixed to use `tenant.phone` (correct field)
- `BRIEFING_PHONE` env var now overrides tenant phone for direct-to-Joshua calls

### Startup Validation
`server/index.ts` now logs on startup:
- ⛔ `MISSING REQUIRED env var:` for JWT_SECRET, DATABASE_URL in production  
- ⚠  `Missing recommended env var:` for OPENROUTER_API_KEY, TELNYX_* keys

### Voice Error Recovery  
- Call state properly cleaned from `activeCalls` Map on any error
- `call.speak.ended` → `listen()` only fires if call still in state (prevents ghost listeners)
- 2-silence timeout wraps up gracefully instead of hanging forever

---

## Scorecard

| Area | Before | After | Grade |
|------|--------|-------|-------|
| Bob field tools | 0 of 6 | 6 of 6 | F → A |
| Bob confirmation guardrails | None | All write tools | F → A |
| Bob voice context | Job count only | Full schedule + addresses | D → B |
| API auth on data fetches | Broken (401 silently) | Fixed on all 5 hooks | F → A |
| Route error handling | None | asyncHandler on all routes | F → A |
| Body validation on POST | None | Zod schemas on all creates | F → B |
| Role check on admin routes | None | requireRole on seed-demo | D → A |
| JobDetail Notes tab | Dead placeholder | Working input + history | F → A |
| JobDetail address | Plain text | Tappable Maps link | C → A |
| Heartbeat phone lookup | Wrong field (user.phone) | Correct (tenant.phone) | D → A |
| Startup monitoring | Silent | Env var warnings at boot | D → B |

---

## What's NOT Done (Next Sprint)

| Item | Priority | Notes |
|------|----------|-------|
| Invoice creation | High | No endpoint exists yet; needs Stripe or manual |
| Contractor onboarding wizard | High | New tenants land on empty dashboard |
| CRM adapter (GHL/ServiceTitan) | Medium | Bob can search GHL contacts but not pull real job data |
| Bob memory persistence | Medium | `bob_memory` table exists but nothing writes to it |
| Heartbeat opt-in flag | Medium | `bobEnabled` works; need per-tenant phone in tenant record |
| Kill mystery 9AM n8n call | Medium | Female-voice call from old n8n workflow, not heartbeat.ts |
| Technician mobile login | Medium | Separate tech PIN auth flow (different from office staff JWT) |
| Customer signature capture | Low | Schema field exists, no UI |
| Parts used on job | Low | Tab removed from JobDetail (was empty) |

---

## Operator Verdict

**Ship it.** The core loop is solid:  
1. Contractor logs in → sees today's jobs ✅  
2. Taps a job → gets address, customer phone, instructions ✅  
3. Moves status along (en route → arrived → in progress → complete) ✅  
4. Takes job photos (Cloudinary, camera-direct) ✅  
5. Adds notes ✅  
6. Asks Bob anything → Bob pulls real data ✅  
7. 6 AM call brief with full schedule ✅  

The three highest-value features for a contractor are all working. Load the demo data, walk through one full job, and show it to your first customer.
