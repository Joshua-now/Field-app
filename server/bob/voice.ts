/**
 * Bob Voice — Interactive Telnyx call handler (Transcription API)
 *
 * Flow:
 *  1. heartbeat.ts dials contractor → call answered
 *  2. transcription_start() fires immediately — listens to contractor throughout the call
 *  3. Lexi speaks morning/evening briefing
 *  4. Contractor speaks → Telnyx fires call.transcription events → debounced into full utterances
 *  5. Lexi responds — full back-and-forth conversation
 *  6. Ends on goodbye phrase or 10s of inactivity
 */

import type { Request, Response } from "express";
import axios from "axios";
import { db } from "../db";
import { jobs, customers, technicians } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const TELNYX_API     = "https://api.telnyx.com/v2";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const VOICE_MODEL    = "openai/gpt-4o-mini";

// ─── TELNYX ACTIONS ───────────────────────────────────────────────────────────

async function telnyxAction(callControlId: string, action: string, body: object = {}) {
  await axios.post(
    `${TELNYX_API}/calls/${callControlId}/actions/${action}`,
    body,
    { headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}` }, timeout: 10000 }
  );
}

async function speak(callControlId: string, text: string) {
  await telnyxAction(callControlId, "speak", {
    payload: text,
    voice: "female",
    language: "en-US",
    command_id: `speak-${Date.now()}`,
  });
}

// Start Telnyx real-time transcription on the contractor's audio track
async function startTranscription(callControlId: string) {
  await telnyxAction(callControlId, "transcription_start", {
    transcription_tracks: "inbound",   // inbound = audio FROM the remote party (contractor)
    transcription_language: "en",
  });
}

async function hangup(callControlId: string) {
  await telnyxAction(callControlId, "hangup");
}

// ─── GOODBYE DETECTION ────────────────────────────────────────────────────────

const GOODBYE_PHRASES = [
  "goodbye", "good bye", "bye bye", "that's all", "that's it", "that is all",
  "nothing else", "no thanks", "no thank you", "i'm good", "we're good",
  "hang up", "end call", "end the call", "thanks lexi", "thank you lexi",
  "that's everything", "talk later", "talk to you later", "have a good one",
  "have a great one", "i'm done", "all done", "we're done", "i'm set",
];

function isGoodbye(text: string): boolean {
  const t = text.toLowerCase().trim().replace(/[.,!?]+$/, "");
  return GOODBYE_PHRASES.some(p => t === p || t.includes(p));
}

// ─── SCHEDULE CONTEXT ─────────────────────────────────────────────────────────

async function getBriefingContext(tenantId: string, type: "morning" | "evening"): Promise<string> {
  const tz = process.env.TENANT_TIMEZONE || "America/New_York";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const todaysJobs = await db.query.jobs.findMany({
    where: and(eq(jobs.tenantId, tenantId), eq(jobs.scheduledDate, today)),
    with: { customer: true, technician: true },
    orderBy: (j: any, { asc }: any) => [asc(j.scheduledTimeStart)],
  }) as any[];

  const completed = todaysJobs.filter(j => j.status === "completed");
  const active    = todaysJobs.filter(j => ["in_progress", "en_route", "arrived"].includes(j.status || ""));
  const scheduled = todaysJobs.filter(j => j.status === "scheduled");
  const revenue   = completed.reduce((s, j) => s + parseFloat(String(j.totalCost || "0")), 0);

  if (type === "morning") {
    if (todaysJobs.length === 0) return "No jobs today.";
    const lines = todaysJobs.slice(0, 6).map(j => {
      const customer = j.customer ? `${j.customer.firstName} ${j.customer.lastName}` : "Unknown customer";
      const addr = j.customer?.addressStreet || "no address";
      const time = (j.scheduledTimeStart || "").slice(0, 5);
      const tech = j.technician ? `${j.technician.firstName} ${j.technician.lastName}` : "unassigned";
      return `- ${j.jobNumber} at ${time}: ${j.serviceType} for ${customer} at ${addr} [${j.status}] — ${tech}`;
    });
    return `Today: ${todaysJobs.length} jobs total, ${active.length} active, ${scheduled.length} scheduled, ${completed.length} completed.\n${lines.join("\n")}`;
  } else {
    if (todaysJobs.length === 0) return "No jobs were scheduled today.";
    return `End of day: ${todaysJobs.length} jobs, ${completed.length} completed, ${active.length} still open. Revenue: $${revenue.toFixed(0)}.`;
  }
}

// ─── BOB VOICE BRAIN ──────────────────────────────────────────────────────────

async function bobThink(
  conversationHistory: { role: string; content: string }[],
  scheduleContext: string,
): Promise<string> {
  const apiKey = (process.env.OPENROUTER_API_KEY || "")
    .trim()
    .replace(/^Bearer\s+/i, "")
    .replace(/^["'`]|["'`]$/g, "")
    .trim();
  if (!apiKey) return "I'm having trouble connecting right now. Check the app.";

  const systemPrompt = `You are Lexi, an AI field operations assistant on a PHONE CALL with a contractor.

CURRENT SCHEDULE CONTEXT:
${scheduleContext}

RULES FOR VOICE:
- Respond in plain spoken English only — NO bullet points, markdown, lists, or formatting.
- Keep responses SHORT: 1-3 sentences unless the contractor asks for detail.
- Use natural, conversational speech. The contractor is busy.
- If asked for an address or customer name, pull it from the schedule context above.
- If asked to do something you can't do on a call (update status, send SMS), say "I can't do that on a call — do it in the app."
- Never say "I don't have access to that."
- Be direct and friendly. You've worked together for years.`;

  try {
    const r = await axios.post(
      OPENROUTER_URL,
      {
        model: VOICE_MODEL,
        messages: [{ role: "system", content: systemPrompt }, ...conversationHistory],
        max_tokens: 200,
        temperature: 0.7,
      },
      {
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        timeout: 15000,
      }
    );
    return r.data?.choices?.[0]?.message?.content || "Sorry, I didn't catch that. What did you need?";
  } catch (e: any) {
    console.error("[Voice] OpenRouter error:", e?.message);
    return "I hit a snag. What did you need?";
  }
}

// ─── IN-MEMORY CALL STATE ─────────────────────────────────────────────────────

const MAX_VOICE_TURNS = 12;

interface CallState {
  tenantId: string;
  briefingType: "morning" | "evening";
  scheduleContext: string;
  history: { role: string; content: string }[];
  briefingDone: boolean;
  silenceCount: number;
  ending: boolean;
  turnCount: number;
  speaking: boolean;                                       // true while Lexi is playing TTS
  pendingTranscript: string;                               // accumulates transcript chunks
  transcriptTimer: ReturnType<typeof setTimeout> | null;  // debounce: process after pause
  silenceTimer: ReturnType<typeof setTimeout> | null;     // inactivity: prompt if silent
}

const activeCalls = new Map<string, CallState>();

// ─── BRIEFING TEXT ────────────────────────────────────────────────────────────

async function buildBriefingText(tenantId: string, type: "morning" | "evening", context: string): Promise<string> {
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  if (type === "morning") {
    const hasJobs = !context.includes("No jobs today");
    let text = "Good morning. This is Lexi. ";
    if (!hasJobs) {
      text += "Nothing on the schedule today. Enjoy the day. Anything you need?";
    } else {
      const lines = context.split("\n");
      const summary = lines[0] || "";
      text += `Here is your morning briefing for ${today}. `;
      text += summary.replace("Today:", "You have") + ". ";
      const jobLines = lines.slice(1, 3);
      if (jobLines.length) {
        const readable = jobLines.map(l =>
          l.replace(/^- /, "").replace(/\[.*?\]/, "").trim()
        );
        text += "First up: " + readable.join(". Then: ") + ". ";
      }
      text += "What do you need before you head out?";
    }
    return text;
  } else {
    let text = "Good evening. Lexi here with your wrap-up. ";
    text += context + " ";
    text += "Good work today. Anything else before you call it a night?";
    return text;
  }
}

// ─── WEBHOOK HANDLER ──────────────────────────────────────────────────────────

export async function handleVoiceWebhook(req: Request, res: Response) {
  res.status(200).json({ received: true }); // Fast 200 to Telnyx

  const event         = req.body;
  const eventType     = event?.data?.event_type;
  const payload       = event?.data?.payload;
  const callControlId = payload?.call_control_id;
  const clientState   = payload?.client_state;

  console.log(`[Voice] ${eventType} | call: ${callControlId?.slice(0, 20)}...`);
  if (!callControlId) return;

  // Decode context sent by heartbeat
  let tenantId: string                    = "default-tenant";
  let briefingType: "morning" | "evening" = "morning";
  if (clientState) {
    try {
      const d = JSON.parse(Buffer.from(clientState, "base64").toString("utf8"));
      tenantId     = d.tenantId     || tenantId;
      briefingType = d.briefingType || briefingType;
    } catch {}
  }

  try {
    switch (eventType) {

      case "call.initiated":
      case "call.ringing":
        break;

      case "call.answered": {
        const scheduleContext = await getBriefingContext(tenantId, briefingType);
        activeCalls.set(callControlId, {
          tenantId,
          briefingType,
          scheduleContext,
          history: [],
          briefingDone: false,
          silenceCount: 0,
          ending: false,
          turnCount: 0,
          speaking: true,
          pendingTranscript: "",
          transcriptTimer: null,
          silenceTimer: null,
        });

        // Start continuous transcription on contractor's audio track
        try {
          await startTranscription(callControlId);
          console.log("[Voice] Transcription pipeline started");
        } catch (e: any) {
          console.error("[Voice] transcription_start failed:", e?.message, JSON.stringify(e?.response?.data));
        }

        const briefingText = await buildBriefingText(tenantId, briefingType, scheduleContext);
        const state = activeCalls.get(callControlId)!;
        state.history.push({ role: "assistant", content: briefingText });
        state.briefingDone = true;

        await speak(callControlId, briefingText);
        break;
      }

      case "call.speak.started": {
        // Lexi started talking — block transcript processing to avoid echo confusion
        const state = activeCalls.get(callControlId);
        if (state) {
          state.speaking = true;
          if (state.transcriptTimer) { clearTimeout(state.transcriptTimer); state.transcriptTimer = null; }
          if (state.silenceTimer)    { clearTimeout(state.silenceTimer);    state.silenceTimer    = null; }
          state.pendingTranscript = "";
        }
        break;
      }

      case "call.speak.ended": {
        // Lexi finished — contractor's turn
        const state = activeCalls.get(callControlId);
        if (state && !state.ending) {
          state.speaking = false;

          // Inactivity timer: if nothing heard for 10s, prompt
          if (state.silenceTimer) clearTimeout(state.silenceTimer);
          state.silenceTimer = setTimeout(async () => {
            try {
              if (state.ending || state.speaking) return;
              state.silenceCount = (state.silenceCount || 0) + 1;
              if (state.silenceCount >= 3) {
                state.ending = true;
                await speak(callControlId, "Sounds like we got cut off. I'll let you go. Lexi out.");
                setTimeout(async () => {
                  try { await hangup(callControlId); } catch {}
                  activeCalls.delete(callControlId);
                }, 4000);
              } else {
                state.speaking = true;
                await speak(callControlId, "Still there? What do you need?");
              }
            } catch (e: any) {
              console.error("[Voice] Silence timer error:", e?.message);
            }
          }, 10000);
        }
        break;
      }

      case "call.transcription": {
        // Telnyx has transcribed something the contractor said
        const state = activeCalls.get(callControlId);
        if (!state || state.ending || state.speaking) return;

        const data       = payload?.transcription_data;
        const transcript = (data?.transcript || "").trim();
        const isFinal    = data?.is_final === true;

        console.log(`[Voice] Transcript (final=${isFinal}): "${transcript}"`);

        if (!isFinal || !transcript) return;

        // Got real speech — reset inactivity timer
        if (state.silenceTimer) { clearTimeout(state.silenceTimer); state.silenceTimer = null; }
        state.silenceCount = 0;

        // Accumulate chunks
        state.pendingTranscript += (state.pendingTranscript ? " " : "") + transcript;

        // Debounce: 1.5s pause = contractor done speaking, process the full utterance
        if (state.transcriptTimer) clearTimeout(state.transcriptTimer);
        state.transcriptTimer = setTimeout(async () => {
          try {
            state.transcriptTimer = null;
            const fullTranscript = state.pendingTranscript.trim();
            state.pendingTranscript = "";

            if (!fullTranscript || fullTranscript.length < 2) return;

            console.log(`[Voice] Processing: "${fullTranscript}"`);
            state.turnCount = (state.turnCount || 0) + 1;

            if (isGoodbye(fullTranscript)) {
              state.ending = true;
              await speak(callControlId, "Sounds good. Have a great one. Lexi out.");
              setTimeout(async () => {
                try { await hangup(callControlId); } catch {}
                activeCalls.delete(callControlId);
              }, 4000);
              return;
            }

            if (state.turnCount >= MAX_VOICE_TURNS) {
              state.ending = true;
              await speak(callControlId, "We've been at it for a while — I'll let you get back to it. Check the app for anything else. Lexi out.");
              setTimeout(async () => {
                try { await hangup(callControlId); } catch {}
                activeCalls.delete(callControlId);
              }, 4000);
              return;
            }

            state.history.push({ role: "user", content: fullTranscript });
            const reply = await bobThink(state.history, state.scheduleContext);
            state.history.push({ role: "assistant", content: reply });

            if (state.history.length > 20) state.history = state.history.slice(-20);

            state.speaking = true;
            await speak(callControlId, reply);
          } catch (e: any) {
            console.error("[Voice] Transcript processing error:", e?.message);
          }
        }, 1500);

        break;
      }

      case "call.hangup": {
        console.log(`[Voice] Call ended: ${callControlId?.slice(0, 20)}`);
        const state = activeCalls.get(callControlId);
        if (state) {
          if (state.transcriptTimer) clearTimeout(state.transcriptTimer);
          if (state.silenceTimer)    clearTimeout(state.silenceTimer);
        }
        activeCalls.delete(callControlId);
        break;
      }

      default:
        console.log(`[Voice] Unhandled event: ${eventType}`);
    }
  } catch (e: any) {
    console.error(`[Voice] Error on ${eventType}:`, e?.message);
    try { await hangup(callControlId); } catch {}
    activeCalls.delete(callControlId);
  }
}
