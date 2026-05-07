/**
 * Bob Voice — Interactive Telnyx call handler
 *
 * Flow:
 *  1. heartbeat.ts dials Joshua → call answered
 *  2. Bob speaks morning/evening briefing
 *  3. Bob asks "Anything you need?" and LISTENS (Telnyx gather/speech)
 *  4. Contractor speaks → Telnyx transcribes → Bob processes with OpenRouter
 *  5. Bob responds and listens again — full back-and-forth conversation
 *  6. Ends when contractor says goodbye or goes silent
 */

import type { Request, Response } from "express";
import axios from "axios";
import { db } from "../db";
import { jobs } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const TELNYX_API = "https://api.telnyx.com/v2";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const VOICE_MODEL = "openai/gpt-4o-mini"; // Fast for voice — low latency

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
    voice: "male",
    language: "en-US",
    command_id: `speak-${Date.now()}`,
  });
}

async function listen(callControlId: string) {
  // After speaking, Telnyx listens for contractor's voice
  await telnyxAction(callControlId, "gather", {
    input: ["speech"],
    speech_timeout: 5,          // seconds of silence before capture ends
    speech_end_silence: 1.5,    // seconds of silence = end of utterance
    minimum_input_length: 1,
    language: "en-US",
    command_id: `gather-${Date.now()}`,
  });
}

async function hangup(callControlId: string) {
  await telnyxAction(callControlId, "hangup");
}

// ─── BOB VOICE BRAIN ─────────────────────────────────────────────────────────

const GOODBYE_PHRASES = [
  "goodbye", "bye", "bye bye", "that's all", "that's it", "nothing else",
  "no thanks", "i'm good", "we're good", "hang up", "end call", "thanks bob",
  "thank you bob", "nope", "no", "nothing"
];

function isGoodbye(text: string): boolean {
  const t = text.toLowerCase().trim();
  return GOODBYE_PHRASES.some(p => t.includes(p)) ||
    (t.length < 15 && ["no", "nope", "nah"].some(w => t === w));
}

async function getBriefingContext(tenantId: string, type: "morning" | "evening"): Promise<string> {
  const today = new Date().toISOString().split("T")[0];
  const todaysJobs = await db.select().from(jobs)
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.scheduledDate, today)));

  const completed = todaysJobs.filter(j => j.status === "completed");
  const active    = todaysJobs.filter(j => ["in_progress","en_route","arrived"].includes(j.status||""));
  const scheduled = todaysJobs.filter(j => j.status === "scheduled");
  const revenue   = completed.reduce((s, j) => s + parseFloat(String(j.totalCost||"0")), 0);

  if (type === "morning") {
    if (todaysJobs.length === 0) return "No jobs today.";
    const lines = todaysJobs.slice(0, 5).map(j =>
      `- ${j.jobNumber}: ${j.serviceType} at ${j.scheduledTimeStart?.slice(0,5)} [${j.status}]`
    );
    return `Today's jobs (${todaysJobs.length} total, ${active.length} active, ${scheduled.length} scheduled):\n${lines.join("\n")}`;
  } else {
    if (todaysJobs.length === 0) return "No jobs were scheduled today.";
    return `End of day: ${todaysJobs.length} jobs total. ${completed.length} completed. ${active.length} still open. Revenue: $${revenue.toFixed(0)}.`;
  }
}

async function bobThink(conversationHistory: {role:string, content:string}[], tenantId: string): Promise<string> {
  const apiKey = (process.env.OPENROUTER_API_KEY || "").trim().replace(/^Bearer\s+/i,"").replace(/^["'`]|["'`]$/g,"").trim();
  if (!apiKey) return "I'm having trouble thinking right now. Try again in a moment.";

  const systemPrompt = `You are Bob, an AI field operations assistant for a contractor company. 
You are on a PHONE CALL — respond in plain spoken English only. 
No bullet points, no markdown, no lists. Just natural conversational speech.
Keep responses SHORT — 2-3 sentences max unless the contractor asks for detail.
You know the contractor's schedule, jobs, and system status.
Be direct, friendly, and efficient. The contractor is busy on job sites.
If asked about jobs, schedules, or status — answer from context.
If asked to do something you can't do on a call, say so briefly and suggest they check the app.`;

  try {
    const r = await axios.post(
      OPENROUTER_URL,
      {
        model: VOICE_MODEL,
        messages: [{ role: "system", content: systemPrompt }, ...conversationHistory],
        max_tokens: 150,  // Keep voice responses short
        temperature: 0.7,
      },
      {
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        timeout: 15000,
      }
    );
    return r.data?.choices?.[0]?.message?.content || "Sorry, I didn't catch that. What do you need?";
  } catch (e: any) {
    console.error("[Voice] OpenRouter error:", e?.message);
    return "I had a hiccup. What did you need?";
  }
}

// ─── IN-MEMORY CALL STATE ─────────────────────────────────────────────────────
// Tracks conversation history per active call (cleared on hangup)

interface CallState {
  tenantId: string;
  briefingType: "morning" | "evening";
  history: { role: string; content: string }[];
  briefingDone: boolean;
}

const activeCalls = new Map<string, CallState>();

// ─── BRIEFING TEXT ────────────────────────────────────────────────────────────

async function buildBriefingText(tenantId: string, type: "morning" | "evening"): Promise<string> {
  const context = await getBriefingContext(tenantId, type);
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  if (type === "morning") {
    const lines = context.split("\n");
    const summary = lines[0];
    const hasJobs = !context.includes("No jobs");

    let text = `Good morning. This is Bob. `;
    if (!hasJobs) {
      text += `No jobs on the schedule today. Enjoy the day. Is there anything else you need?`;
    } else {
      text += `Here is your morning briefing for ${today}. `;
      text += summary.replace("Today's jobs", "You have") + ". ";
      // Read first 2 jobs
      const jobLines = lines.slice(1, 3);
      if (jobLines.length) {
        text += "First up: " + jobLines.map(l => l.replace("- ", "").replace(/\[.*\]/, "").trim()).join(". Then: ") + ". ";
      }
      text += "Anything you need before you head out?";
    }
    return text;
  } else {
    let text = `Good evening. Bob here with your wrap-up. `;
    text += context + " ";
    text += "Good work today. Anything you need before you call it a night?";
    return text;
  }
}

// ─── WEBHOOK HANDLER ──────────────────────────────────────────────────────────

export async function handleVoiceWebhook(req: Request, res: Response) {
  res.status(200).json({ received: true }); // Telnyx needs fast 200

  const event         = req.body;
  const eventType     = event?.data?.event_type;
  const payload       = event?.data?.payload;
  const callControlId = payload?.call_control_id;
  const clientState   = payload?.client_state;

  console.log(`[Voice] ${eventType} | call: ${callControlId?.slice(0,20)}...`);
  if (!callControlId) return;

  // Decode context from heartbeat
  let tenantId:     string = "default-tenant";
  let briefingType: "morning"|"evening" = "morning";
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
        break; // Nothing to do yet

      case "call.answered": {
        // Init call state
        const briefingContext = await getBriefingContext(tenantId, briefingType);
        activeCalls.set(callControlId, {
          tenantId,
          briefingType,
          history: [{ role: "system", content: `Current briefing context:\n${briefingContext}` }],
          briefingDone: false,
        });

        const briefingText = await buildBriefingText(tenantId, briefingType);
        const state = activeCalls.get(callControlId)!;
        state.history.push({ role: "assistant", content: briefingText });
        state.briefingDone = true;

        await speak(callControlId, briefingText);
        break;
      }

      case "call.speak.ended": {
        // Done speaking — now listen for contractor's response
        await listen(callControlId);
        break;
      }

      case "call.gather.ended": {
        const transcript = payload?.speech_result?.transcript || payload?.digits || "";
        console.log(`[Voice] Heard: "${transcript}"`);

        const state = activeCalls.get(callControlId);
        if (!state) { await hangup(callControlId); return; }

        if (!transcript || transcript.trim().length < 2) {
          // Silence — check one more time then wrap up
          await speak(callControlId, "I didn't catch that. Anything else you need, or should I let you go?");
          return;
        }

        // Check for goodbye
        if (isGoodbye(transcript)) {
          await speak(callControlId, "Sounds good. Have a great one. Bob out.");
          // Let call.speak.ended → listen → then they'll hang up naturally
          // Override: after goodbye speech just hang up
          setTimeout(async () => {
            try { await hangup(callControlId); } catch {}
            activeCalls.delete(callControlId);
          }, 5000);
          return;
        }

        // Add to conversation and get Bob's response
        state.history.push({ role: "user", content: transcript });
        const reply = await bobThink(state.history, state.tenantId);
        state.history.push({ role: "assistant", content: reply });

        // Keep history manageable (last 10 exchanges)
        if (state.history.length > 21) {
          state.history = [state.history[0], ...state.history.slice(-20)];
        }

        await speak(callControlId, reply);
        break;
      }

      case "call.hangup": {
        console.log(`[Voice] Call ended: ${callControlId?.slice(0,20)}`);
        activeCalls.delete(callControlId);
        break;
      }

      default:
        console.log(`[Voice] Unhandled: ${eventType}`);
    }
  } catch (e: any) {
    console.error(`[Voice] Error on ${eventType}:`, e?.message);
    try { await hangup(callControlId); } catch {}
    activeCalls.delete(callControlId);
  }
}
